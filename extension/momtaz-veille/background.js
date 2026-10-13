// Momtaz Veille : ouvre une page Ad Library, la fait défiler doucement et renvoie ses publicités à l'ERP.

const ERP_HOSTS = [/^momtaz-frontend-xg57(-[a-z0-9-]+)?\.vercel\.app$/, /^localhost$/];
const FB_LIBRARY = /^https:\/\/(www|web)\.facebook\.com\/ads\/library\//;

const sessions = new Map(); // tabId -> { ads: Map, total, captcha, login }
let erpTabId = null;
let stop = false;
let occupe = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hasard = (min, max) => min + Math.random() * (max - min);

function versErp(type, id, data) {
  if (erpTabId == null) return;
  chrome.tabs.sendMessage(erpTabId, { kind: "ext", type, id, data }).catch(() => {});
}

async function setEtat(t) {
  try { await chrome.storage.session.set({ etat: t }); } catch (e) { /* rien */ }
}

async function fenetre() {
  const { winId } = await chrome.storage.session.get("winId");
  if (winId) {
    try { await chrome.windows.get(winId); return winId; } catch (e) { /* fermée */ }
  }
  const w = await chrome.windows.create({ url: "about:blank", focused: false, width: 1200, height: 900, state: "normal" });
  await chrome.storage.session.set({ winId: w.id });
  return w.id;
}

async function attendreChargement(tabId, maxMs) {
  const debut = Date.now();
  while (Date.now() - debut < maxMs) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) return false;
    if (t.status === "complete") return true;
    await sleep(500);
  }
  return true;
}

async function defiler(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      window.scrollBy(0, Math.round(window.innerHeight * (0.8 + Math.random() * 0.6)));
      if (Math.random() < 0.5) window.scrollTo(0, document.body.scrollHeight);

      // Sans compte Facebook, la suite des résultats ne se charge pas toute seule :
      // il faut cliquer sur la barre « Voir plus » en bas de la liste.
      const LIBELLE = /^(voir plus|afficher plus|see more|show more|ver más|ver mais|mehr anzeigen|mostra altro|عرض المزيد)$/i;
      let cible = null;
      for (const el of document.querySelectorAll('a, button, span, div[role="button"]')) {
        const t = (el.textContent || "").trim();
        if (!t || t.length > 20 || !LIBELLE.test(t)) continue;
        // La barre occupe toute la largeur ; les « Voir plus » à l'intérieur d'une pub sont étroits, on les ignore
        let large = false;
        for (let p = el, n = 0; p && n < 5; p = p.parentElement, n++) {
          if (p.getBoundingClientRect().width > window.innerWidth * 0.5) { large = true; break; }
        }
        if (large) cible = el;   // on garde le dernier : le plus bas dans la page
      }
      if (cible) { cible.scrollIntoView({ block: "center" }); cible.click(); }
      return !!cible;
    },
  }).catch(() => {});
}

// opts : { url, maxAds, maxScrolls, idleRounds }
async function scrape(id, opts) {
  if (!FB_LIBRARY.test(opts.url || "")) throw new Error("Adresse refusée : seules les pages Ad Library sont autorisées.");
  const maxAds = opts.maxAds || 5000;
  const maxScrolls = opts.maxScrolls || 80;
  const idleRounds = Math.max(opts.idleRounds || 4, 5);

  const winId = await fenetre();
  const tab = await chrome.tabs.create({ windowId: winId, url: "about:blank", active: true });
  const s = { ads: new Map(), total: null, captcha: false, login: false };
  sessions.set(tab.id, s);
  try {
    await chrome.tabs.update(tab.id, { url: opts.url });
    await attendreChargement(tab.id, 45000);
    await sleep(hasard(2500, 4000));

    // On attend les premières pubs (jusqu'à 40 s) avant de compter les tours sans nouveauté
    const debut = Date.now();
    while (s.ads.size === 0 && s.total !== 0 && !s.captcha && !s.login && !stop && Date.now() - debut < 40000) {
      await sleep(2000);
      await defiler(tab.id);
    }

    let sansNouveau = 0;
    let avant = s.ads.size;
    for (let i = 0; i < maxScrolls; i++) {
      if (stop) break;
      if (s.captcha || s.login) break;
      if (s.ads.size >= maxAds) break;
      if (s.total === 0 && s.ads.size === 0) break;
      await defiler(tab.id);
      await sleep(hasard(2500, 4000));
      if (s.ads.size === avant) sansNouveau++; else { sansNouveau = 0; avant = s.ads.size; }
      versErp("progress", id, { pubs: s.ads.size, total: s.total, tour: i + 1 });
      // Facebook charge parfois lentement la suite : on patiente plus longtemps s'il reste des pubs à venir
      const patience = s.total != null && s.ads.size < s.total ? idleRounds + 4 : idleRounds;
      if (sansNouveau >= patience) break;
    }
    return {
      ads: [...s.ads.values()],
      total: s.total,
      bloque: s.captcha ? "captcha" : s.login ? "connexion" : null,
      arrete: stop,
    };
  } finally {
    sessions.delete(tab.id);
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// ─── Capture du prix sur la page produit d'un concurrent ─────────────────
// Lue dans l'onglet ouvert : 1) boutique Shopify (fichier produit .js), 2) données structurées,
// 3) balises meta, 4) prix affiché le plus visible, hors prix barré.
function lirePrixDansLaPage() {
  const nombre = s => {
    let t = String(s).replace(/[\s  ]/g, "");
    const virgule = t.lastIndexOf(","), point = t.lastIndexOf(".");
    const dec = Math.max(virgule, point);
    if (dec >= 0 && t.length - dec - 1 <= 2) t = t.slice(0, dec).replace(/[.,]/g, "") + "." + t.slice(dec + 1);
    else t = t.replace(/[.,]/g, "");
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  };
  const plausible = n => n != null && n >= 10 && n <= 50000;
  const resultat = (prix, source, barre) => ({ prix: Math.round(prix * 100) / 100, source, barre: barre && plausible(barre) && barre > prix ? Math.round(barre * 100) / 100 : null });

  return (async () => {
    // 1. Shopify : /products/xxx.js donne le prix de la variante la moins chère (prix d'une unité, pas des packs)
    const m = location.pathname.match(/^(.*\/products\/[^/?#]+)/);
    if (m) {
      try {
        const r = await fetch(m[1] + ".js", { credentials: "omit" });
        if (r.ok) {
          const j = await r.json();
          const v = (j.variants || []).filter(x => x.available !== false);
          const prix = (v.length ? Math.min(...v.map(x => x.price)) : j.price) / 100;
          const barre = (j.compare_at_price || 0) / 100;
          if (plausible(prix)) return resultat(prix, "Shopify", barre);
        }
      } catch (e) { /* pas Shopify */ }
    }
    // 2. Données structurées (schema.org)
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const pile = [JSON.parse(s.textContent)];
        while (pile.length) {
          const o = pile.pop();
          if (!o || typeof o !== "object") continue;
          if (Array.isArray(o)) { pile.push(...o); continue; }
          const offre = o.offers || (o["@type"] === "Offer" || o["@type"] === "AggregateOffer" ? o : null);
          if (offre) {
            const liste = Array.isArray(offre) ? offre : [offre];
            const prix = liste.map(x => nombre(x.lowPrice ?? x.price)).filter(plausible);
            if (prix.length) return resultat(Math.min(...prix), "données structurées");
          }
          for (const k in o) if (o[k] && typeof o[k] === "object") pile.push(o[k]);
        }
      } catch (e) { /* bloc illisible */ }
    }
    // 3. Balises meta
    const meta = document.querySelector('meta[property="product:price:amount"], meta[property="og:price:amount"], meta[itemprop="price"], [itemprop="price"][content]');
    if (meta) { const n = nombre(meta.getAttribute("content")); if (plausible(n)) return resultat(n, "balise meta"); }

    // 4. Prix affiché : le plus gros prix visible en haut de page, en ignorant les prix barrés
    const RE = /(?:\b(?:mad|dhs?)\s*|درهم\s*|د\.م\.?\s*)?(\d{1,3}(?:[\s  .]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:mad\b|dhs?\b|درهم|دراهم|د\.م)?/i;
    const DEVISE = /(?:mad|dhs?)\s*\d|\d\s*(?:mad|dhs?)(?![a-z])|درهم|دراهم|د\.م/i;
    const barre = el => {
      for (let p = el, n = 0; p && n < 4; p = p.parentElement, n++) {
        if (/^(DEL|S|STRIKE)$/.test(p.tagName)) return true;
        if ((getComputedStyle(p).textDecorationLine || "").includes("line-through")) return true;
        if (/compare|old-?price|price-?old|barr|was-?price|price-?was/i.test(typeof p.className === "string" ? p.className : "")) return true;
      }
      return false;
    };
    const candidats = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length > 2) continue;
      const t = (el.textContent || "").trim();
      if (!t || t.length > 40 || !DEVISE.test(t)) continue;
      const mm = t.match(RE);
      if (!mm) continue;
      const n = nombre(mm[1]);
      if (!plausible(n)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.top > 1800) continue;
      candidats.push({ n, barre: barre(el), taille: parseFloat(getComputedStyle(el).fontSize) || 0, haut: r.top });
    }
    const valides = candidats.filter(c => !c.barre).sort((a, b) => b.taille - a.taille || a.haut - b.haut);
    if (valides.length) {
      // Prix barré retenu seulement s'il est affiché à côté du prix principal (taille proche), pas celui d'un pack
      const b = candidats.filter(c => c.barre && c.taille >= valides[0].taille * 0.8).sort((a, b2) => b2.taille - a.taille)[0];
      return resultat(valides[0].n, "prix affiché", b && b.n);
    }
    return { prix: null, source: null };
  })();
}

async function prixShopifyDirect(url) {
  const delai = ms => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  let finale = url;
  if (!/\/products\/[^/?#]+/.test(new URL(url).pathname)) {
    const r = await fetch(url, { redirect: "follow", credentials: "omit", signal: delai(8000) });
    finale = r.url || url;
  }
  const u = new URL(finale);
  const m = u.pathname.match(/^(.*\/products\/[^/?#]+)/);
  if (!m) return null;
  const r = await fetch(u.origin + m[1] + ".js", { credentials: "omit", signal: delai(8000) });
  if (!r.ok) return null;
  const j = await r.json();
  const v = (j.variants || []).filter(x => x.available !== false);
  const prix = (v.length ? Math.min(...v.map(x => x.price)) : j.price) / 100;
  if (!(prix >= 10 && prix <= 50000)) return null;
  const barre = (j.compare_at_price || 0) / 100;
  return { prix: Math.round(prix * 100) / 100, source: "Shopify (direct)", barre: barre > prix ? Math.round(barre * 100) / 100 : null, urlFinale: finale };
}

async function capturerPrix(opts) {
  const url = String(opts.url || "");
  if (!/^https?:\/\//i.test(url) || /facebook\.com|fb\.com|fb\.me|instagram\.com|wa\.me|whatsapp\.com|m\.me|messenger\.com|t\.me|tiktok\.com/i.test(url)) {
    throw new Error("Adresse refusée : pas une page produit.");
  }
  // 1. Voie rapide, sans ouvrir d'onglet : boutique Shopify (fichier produit .js).
  //    Un lien court est d'abord suivi pour connaître l'adresse finale.
  const direct = await prixShopifyDirect(url).catch(() => null);
  if (direct) return direct;

  // 2. Sinon : ouverture de la page et lecture du prix affiché
  const winId = await fenetre();
  const tab = await chrome.tabs.create({ windowId: winId, url, active: true });
  try {
    await attendreChargement(tab.id, 30000);
    await sleep(hasard(1500, 2500));   // laisse le temps aux prix chargés après coup
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: lirePrixDansLaPage });
    const t = await chrome.tabs.get(tab.id).catch(() => null);
    return { ...(r && r.result ? r.result : { prix: null }), urlFinale: t ? t.url : url };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;

  if (msg.kind === "fb" && sender.tab) {
    const s = sessions.get(sender.tab.id);
    if (!s) return;
    if (msg.total != null) s.total = msg.total;
    if (msg.captcha) s.captcha = true;
    if (msg.login) s.login = true;
    for (const a of msg.ads || []) if (!s.ads.has(a.cid)) s.ads.set(a.cid, a);
    return;
  }

  if (msg.kind === "erp" && sender.tab) {
    let host = "";
    try { host = new URL(sender.url || sender.tab.url).hostname; } catch (e) { /* rien */ }
    if (!ERP_HOSTS.some(r => r.test(host))) return;
    erpTabId = sender.tab.id;

    if (msg.cmd === "ping") { versErp("pong", msg.id, { version: chrome.runtime.getManifest().version, occupe }); return; }
    if (msg.cmd === "stop") { stop = true; versErp("stopped", msg.id, {}); return; }
    if (msg.cmd === "scrape") {
      if (occupe) { versErp("error", msg.id, "L'extension est déjà en train de relever une page."); return; }
      occupe = true; stop = false;
      setEtat("Relevé en cours : " + (msg.payload && msg.payload.label || ""));
      scrape(msg.id, msg.payload || {})
        .then(res => versErp("result", msg.id, res))
        .catch(err => versErp("error", msg.id, String(err && err.message || err)))
        .finally(() => { occupe = false; setEtat("Dernière tâche terminée à " + new Date().toLocaleTimeString("fr-FR")); });
    }
    if (msg.cmd === "prix") {
      if (occupe) { versErp("error", msg.id, "L'extension est déjà occupée."); return; }
      occupe = true;
      setEtat("Capture de prix : " + (msg.payload && msg.payload.url || ""));
      capturerPrix(msg.payload || {})
        .then(res => versErp("result", msg.id, res))
        .catch(err => versErp("error", msg.id, String(err && err.message || err)))
        .finally(() => { occupe = false; setEtat("Dernière tâche terminée à " + new Date().toLocaleTimeString("fr-FR")); });
    }
  }
});

chrome.windows.onRemoved.addListener(async winId => {
  const { winId: w } = await chrome.storage.session.get("winId");
  if (w === winId) await chrome.storage.session.remove("winId");
});
