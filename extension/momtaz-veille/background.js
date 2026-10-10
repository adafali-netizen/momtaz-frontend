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
      return document.body.scrollHeight;
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
  }
});

chrome.windows.onRemoved.addListener(async winId => {
  const { winId: w } = await chrome.storage.session.get("winId");
  if (w === winId) await chrome.storage.session.remove("winId");
});
