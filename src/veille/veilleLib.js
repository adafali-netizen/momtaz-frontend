// Module Veille : lecture des pages Ad Library enregistrées (.mhtml) et calcul du classement.
// Aucune dépendance au navigateur : ce fichier est aussi testable avec Node.

// ─── 1. Lecture du fichier .mhtml ─────────────────────────────────────────

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function decodeQuotedPrintable(body) {
  const s = body.replace(/=\r?\n/g, "");
  const bytes = new Uint8Array(s.length);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 61 && i + 2 < s.length) {
      const h = parseInt(s.substr(i + 1, 2), 16);
      if (!Number.isNaN(h)) { bytes[n++] = h; i += 2; continue; }
    }
    bytes[n++] = c & 0xff;
  }
  return new TextDecoder("utf-8").decode(bytes.subarray(0, n));
}

function decodeBase64(body) {
  const bin = atob(body.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

// Reçoit le contenu texte brut du fichier .mhtml, renvoie { html, url, date }.
export function readMhtml(raw) {
  const headEnd = raw.search(/\r?\n\r?\n/);
  const head = raw.slice(0, headEnd);
  const url = (head.match(/Snapshot-Content-Location:\s*(\S+)/i) || [])[1] || "";
  const dateStr = (head.match(/^Date:\s*(.+)$/im) || [])[1];
  const date = dateStr ? new Date(dateStr) : new Date();
  const boundary = (head.match(/boundary="?([^";\r\n]+)"?/i) || [])[1];
  if (!boundary) {
    // Fichier « HTML uniquement » enregistré sous un autre nom
    return { html: raw, url, date, incomplet: true };
  }
  const parts = raw.split("--" + boundary);
  for (const part of parts) {
    const sep = part.search(/\r?\n\r?\n/);
    if (sep < 0) continue;
    const ph = part.slice(0, sep);
    if (!/Content-Type:\s*text\/html/i.test(ph)) continue;
    const body = part.slice(sep).replace(/^\r?\n\r?\n/, "");
    const enc = ((ph.match(/Content-Transfer-Encoding:\s*(\S+)/i) || [])[1] || "").toLowerCase();
    const html = enc === "quoted-printable" ? decodeQuotedPrintable(body)
      : enc === "base64" ? decodeBase64(body) : body;
    return { html, url, date, incomplet: false };
  }
  return { html: "", url, date, incomplet: true };
}

// ─── 2. Extraction des publicités ─────────────────────────────────────────

const MOIS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

function cleanText(seg) {
  return decodeEntities(seg.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}

export function pageIdFrom(text) {
  const m = String(text || "").match(/view_all_page_id=(\d+)/);
  return m ? m[1] : null;
}

// Renvoie { pageId, pageNom, cartes: [...] }
export function extractAds(html, url, fallbackName) {
  const pageId = pageIdFrom(url) || pageIdFrom(html.slice(0, 200000));
  const idx = [];
  const re = /Library ID:/g;
  let m;
  while ((m = re.exec(html))) idx.push(m.index);
  const seen = new Set();
  const cartes = [];
  let pageNom = null;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const seg = html.slice(i, k + 1 < idx.length ? idx[k + 1] : i + 80000);
    const txt = cleanText(seg);
    const lid = (txt.match(/Library ID:\s*(\d+)/) || [])[1];
    if (!lid || seen.has(lid)) continue;
    seen.add(lid);
    if (!pageNom) {
      const pn = txt.match(/See (?:ad|summary) details\s+(.+?)\s+Sponsored/);
      if (pn && pn[1].length < 80) pageNom = pn[1].trim();
    }
    const d = txt.match(/Started running on ([A-Za-z]{3})[a-z]* (\d+), (\d{4})/);
    const start = d ? `${d[3]}-${String(MOIS[d[1]] || 1).padStart(2, "0")}-${String(d[2]).padStart(2, "0")}` : null;
    const nm = txt.match(/(\d+) ads? use this creative/);
    const u = seg.match(/l\.php\?u=([^"&]+)/);
    const lien = u ? safeDecode(safeDecode(decodeEntities(u[1]))).split("?")[0].replace(/\/+$/, "") : null;
    const vid = seg.match(/<video[^>]*src="([^"]+)"/);
    const imgs = [];
    const imgRe = /<img[^>]*src="(https:\/\/scontent[^"]+)"/g;
    let im;
    while ((im = imgRe.exec(seg))) {
      if (!/[sp]60x60/.test(im[1])) imgs.push(decodeEntities(im[1]));
    }
    const body = txt.match(/Sponsored (.*)/);
    cartes.push({
      library_id: lid,
      started_on: start,
      nb: nm ? parseInt(nm[1], 10) : 1,
      low: txt.slice(0, 400).includes("Low impression count"),
      url: lien,
      format: vid ? "Vidéo" : "Image",
      media: vid ? decodeEntities(vid[1]) : (imgs[0] || null),
      thumb: imgs[0] || null,
      texte: body ? body[1].replace(/\d+:\d+ \/ \d+:\d+/g, "").replace(/(\s*Download)+/g, " ").trim().slice(0, 300) : "",
    });
  }
  return { pageId, pageNom: pageNom || fallbackName || null, cartes };
}

// ─── 3. Produits ──────────────────────────────────────────────────────────

// Même produit = même lien de page produit (sans www, sans paramètres).
export function productKey(url) {
  if (!url) return "sans-lien";
  const u = url.toLowerCase().replace("http://", "https://").replace("://www.", "://").replace("/en/products/", "/products/");
  return u.split("://").pop();
}

export function siteOf(url) {
  if (!url) return null;
  const m = url.match(/^https?:\/\/(?:www\.)?([^/]+)/i);
  return m ? m[1].toLowerCase() : null;
}

const STOP = new Set(["de", "du", "des", "la", "le", "les", "a", "au", "aux", "et", "en", "pour", "avec", "sans", "un", "une", "l", "d", "pack", "offre", "speciale", "premium", "qui", "va", "ta", "te", "vous", "dont", "maroc", "products", "product", "pages"]);

export function defaultName(url, texte) {
  const key = productKey(url);
  const slug = safeDecode(key.split("/").pop() || "");
  const words = slug.split(/[-_ ]+/).filter(w => w && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  const shortLink = /^[a-z0-9]{4,9}$/i.test(slug) || key === "sans-lien" || key.split("/").length < 2;
  if (!words.length || shortLink) {
    const t = (texte || "").replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
    return t.slice(0, 4).join(" ") || "Produit sans nom";
  }
  return words.slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const SANTE = ["attelle", "compression", "chauffant", "masseur", "masseuse", "bonnet", "patch", "canne", "genou", "étireur", "etireur", "migraine", "douleur", "arthrite"];
export function risqueSante(nom) {
  const n = (nom || "").toLowerCase();
  return SANTE.some(w => n.includes(w));
}

// Regroupe les publicités d'un relevé par (page, produit).
// pubs : [{ fb_page_id, produit_key, nb, low, started_on, ... }], refDate : date du relevé de la page
export function aggregateProducts(pubs, refDates) {
  const map = new Map();
  for (const p of pubs) {
    const k = p.fb_page_id + "|" + p.produit_key;
    if (!map.has(k)) map.set(k, { fb_page_id: p.fb_page_id, produit_key: p.produit_key, cartes: [], pubs: 0, recent: 0, oldest: null });
    const g = map.get(k);
    g.cartes.push(p);
    const ref = refDates[p.fb_page_id] ? new Date(refDates[p.fb_page_id]) : new Date();
    if (!p.low) {
      g.pubs += p.nb;
      if (p.started_on && (ref - new Date(p.started_on)) / 86400000 <= 7) g.recent += p.nb;
    }
    if (p.started_on && (!g.oldest || p.started_on < g.oldest)) g.oldest = p.started_on;
  }
  for (const g of map.values()) {
    const ref = refDates[g.fb_page_id] ? new Date(refDates[g.fb_page_id]) : new Date();
    g.age = g.oldest ? Math.max(0, Math.floor((ref - new Date(g.oldest)) / 86400000)) : 0;
    g.cartes.sort((a, b) => b.nb - a.nb || String(a.started_on).localeCompare(String(b.started_on)));
  }
  return [...map.values()];
}

// Score sur 100 d'un groupe de produits (le même produit vendu par une ou plusieurs pages).
export function scoreGroup({ pubs, age, recent, nbPages, prixMax, sante }) {
  const demande = Math.min(40, 40 * Math.log1p(pubs) / Math.log1p(60));
  const duree = age >= 60 ? 25 : age >= 30 ? 18 : age >= 14 ? 10 : 3;
  const reinv = recent > 0 && age > 14 ? 15 : recent > 0 ? 5 : age >= 60 ? 8 : 0;
  const recoup = nbPages >= 2 ? 10 : 0;
  let faisab = 10;
  if (sante) faisab -= 5;
  if (prixMax && prixMax < 200) faisab -= 5;
  return Math.round(demande + duree + reinv + recoup + Math.max(0, faisab));
}

export function tierOf(prixMax) {
  if (prixMax && prixMax >= 250) return 0;
  if (!prixMax) return 1;
  return 2;
}

export const STATUTS = ["Nouveau", "À tester", "Test lancé", "En production", "Testé, abandonné"];
export const STATUT_COULEURS = {
  "Nouveau":          ["#475467", "#F2F4F7"],
  "À tester":         ["#B54708", "#FFFAEB"],
  "Test lancé":       ["#175CD3", "#EFF8FF"],
  "En production":    ["#027A48", "#ECFDF3"],
  "Testé, abandonné": ["#B42318", "#FEF3F2"],
};

// ─── 4. Classement : le même produit vendu par plusieurs pages ────────────

const groupKeyOf = s => (s || "").trim().toLowerCase();

export function vendorUrl(row, cartes) {
  if (row?.url) return row.url;
  const c = cartes.find(x => x.url && !/bit\.ly/i.test(x.url)) || cartes.find(x => x.url);
  return c ? c.url : null;
}

// pubs : publicités du dernier relevé de chaque page · produits : lignes veille_produits
// pageName(fb_page_id) : nom affiché de la page
export function buildGroups(pubs, refDates, produits, pageName) {
  const prodMap = new Map(produits.map(p => [p.fb_page_id + "|" + p.produit_key, p]));
  const groups = new Map();
  for (const it of aggregateProducts(pubs, refDates)) {
    const row = prodMap.get(it.fb_page_id + "|" + it.produit_key) || null;
    const c0 = it.cartes[0] || {};
    const nom = row?.nom || defaultName(c0.url, c0.texte);
    const groupe = (row?.groupe || nom).trim();
    const vendor = {
      ...it, row, nom, groupe,
      page: pageName(it.fb_page_id),
      prix: row?.prix != null && row.prix !== "" ? Number(row.prix) : null,
      url: vendorUrl(row, it.cartes),
      sante: row ? !!row.risque_sante : risqueSante(nom),
    };
    const k = groupKeyOf(groupe);
    if (!groups.has(k)) groups.set(k, { nom: groupe, vendors: [] });
    groups.get(k).vendors.push(vendor);
  }
  const out = [];
  for (const G of groups.values()) {
    const items = G.vendors.sort((a, b) => b.pubs - a.pubs || b.cartes.length - a.cartes.length);
    // Une ligne par page : une page peut avoir plusieurs liens pour le même produit (couleurs, liens courts…)
    const parPage = new Map();
    for (const x of items) {
      if (!parPage.has(x.fb_page_id)) parPage.set(x.fb_page_id, { fb_page_id: x.fb_page_id, page: x.page, items: [], pubs: 0, recent: 0, age: 0, cartes: [], urls: [] });
      const v = parPage.get(x.fb_page_id);
      v.items.push(x);
      v.pubs += x.pubs; v.recent += x.recent; v.age = Math.max(v.age, x.age);
      v.cartes.push(...x.cartes);
      if (x.url && !v.urls.includes(x.url)) v.urls.push(x.url);
    }
    const v = [...parPage.values()].map(p => {
      const prixListe = p.items.map(x => x.prix).filter(x => x);
      return {
        ...p,
        cartes: p.cartes.sort((a, b) => b.nb - a.nb),
        url: p.urls[0] || null,
        prix: prixListe.length ? Math.max(...prixListe) : null,
        prixMin: prixListe.length ? Math.min(...prixListe) : null,
        prixDifferents: new Set(prixListe).size > 1,
        ids: p.items.map(x => x.row?.id).filter(Boolean),
        sante: p.items.some(x => x.sante),
      };
    }).sort((a, b) => b.pubs - a.pubs);
    const pubs = v.reduce((s, x) => s + x.pubs, 0);
    const recent = v.reduce((s, x) => s + x.recent, 0);
    const age = Math.max(...v.map(x => x.age));
    const nbPages = v.length;
    const prix = items.map(x => x.prix).filter(x => x);
    const prixMax = prix.length ? Math.max(...prix) : null;
    const prixMin = prix.length ? Math.min(...prix) : null;
    const sante = v.some(x => x.sante);
    const cartes = v.flatMap(x => x.cartes.map(c => ({ ...c, page: x.page }))).sort((a, b) => b.nb - a.nb);
    const statut = (items.find(x => x.row?.statut && x.row.statut !== "Nouveau")?.row.statut) || "Nouveau";
    out.push({
      nom: G.nom, vendors: v, items, pubs, recent, age, nbPages, prixMax, prixMin, sante, cartes, statut,
      crea: cartes.length,
      ids: items.map(x => x.row?.id).filter(Boolean),
      score: scoreGroup({ pubs, age, recent, nbPages, prixMax, sante }),
      tier: tierOf(prixMax),
      thumb: (cartes.find(c => c.thumb) || {}).thumb || null,
    });
  }
  out.sort((a, b) => a.tier - b.tier || b.score - a.score || b.pubs - a.pubs);
  return out;
}

// ─── 5. Historique : ce qui a changé entre deux relevés ───────────────────

// avant / apres : publicités des mêmes pages, à deux dates
export function compareReleves(apres, avant, produits, pageName) {
  const prodMap = new Map(produits.map(p => [p.fb_page_id + "|" + p.produit_key, p]));
  const sumBy = list => {
    const m = new Map();
    for (const p of list) {
      if (p.low) continue;
      const row = prodMap.get(p.fb_page_id + "|" + p.produit_key);
      const nom = (row?.groupe || row?.nom || defaultName(p.url, p.texte)).trim();
      const k = groupKeyOf(nom);
      if (!m.has(k)) m.set(k, { nom, pubs: 0, pages: new Set() });
      const g = m.get(k);
      g.pubs += p.nb;
      g.pages.add(pageName(p.fb_page_id));
    }
    return m;
  };
  const A = sumBy(apres), B = sumBy(avant);
  const keys = new Set([...A.keys(), ...B.keys()]);
  const nouveaux = [], hausse = [], baisse = [], disparus = [];
  for (const k of keys) {
    const a = A.get(k), b = B.get(k);
    const apresN = a ? a.pubs : 0, avantN = b ? b.pubs : 0;
    const item = { nom: (a || b).nom, pages: [...(a || b).pages].join(", "), avant: avantN, apres: apresN, delta: apresN - avantN };
    if (!b || avantN === 0) { if (apresN > 0) nouveaux.push(item); }
    else if (apresN === 0) disparus.push(item);
    else if (apresN > avantN) hausse.push(item);
    else if (apresN < avantN) baisse.push(item);
  }
  nouveaux.sort((x, y) => y.apres - x.apres);
  hausse.sort((x, y) => y.delta - x.delta);
  baisse.sort((x, y) => x.delta - y.delta);
  disparus.sort((x, y) => y.avant - x.avant);
  return { nouveaux, hausse, baisse, disparus };
}

// ─── 6. Export vers le Google Sheet (colonnes M et suivantes = créatives) ─

export function toSheetTsv(groups, pageInfo, dateLabel) {
  const q = s => String(s ?? "").replace(/"/g, '""').replace(/[\t\r\n]+/g, " ");
  const marge = '=IF(INDIRECT("H"&ROW())="";"";INDIRECT("G"&ROW())-INDIRECT("H"&ROW()))';
  const rows = [];
  let maxC = 0;
  for (const g of groups) {
    for (const v of g.vendors) {
      const info = pageInfo(v.fb_page_id);
      const c0 = v.cartes[0] || {};
      const lib = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=" + v.fb_page_id;
      const crea = v.cartes.filter(c => c.media).map((c, i) => `=HYPERLINK("${q(c.media)}";"${q(c.format || "Créa")} ${i + 1}")`);
      maxC = Math.max(maxC, crea.length);
      rows.push([
        dateLabel,
        `=HYPERLINK("${lib}";"${q(info.nom)}")`,
        c0.library_id ? `="${c0.library_id}"` : "",
        c0.thumb ? `=IMAGE("${q(c0.thumb)}")` : "",
        c0.library_id ? "https://www.facebook.com/ads/library/?id=" + c0.library_id : "",
        v.url ? `=HYPERLINK("${q(v.url)}";"${q(g.nom)}")` : q(g.nom),
        v.prix ?? "",
        "",
        marge,
        g.statut,
        v.cartes.length,
        v.pubs,
        ...crea,
      ].join("\t"));
    }
  }
  const head = ["Date", "Page", "ID", "Produit", "Lien de publicité", "Page produit", "Prix de vente", "Prix achat", "Marge brute", "Status", "Nombre de créatives", "Nombre de pub"];
  for (let i = 1; i <= maxC; i++) head.push("Créative " + i);
  return head.join("\t") + "\n" + rows.join("\n") + "\n";
}
