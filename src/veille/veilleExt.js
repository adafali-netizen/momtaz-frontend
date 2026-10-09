// Module Veille : dialogue entre l'ERP et l'extension Chrome « Momtaz Veille ».

let seq = 0;
const enAttente = new Map();
let version = null;

window.addEventListener("message", e => {
  if (e.source !== window || !e.data || e.data.src !== "momtaz-ext") return;
  const { type, id, data } = e.data;
  if (type === "ready") { version = data && data.version; return; }
  const p = enAttente.get(id);
  if (!p) return;
  if (type === "progress") { p.onProgress && p.onProgress(data); p.relancer(); return; }
  clearTimeout(p.timer);
  enAttente.delete(id);
  if (type === "error") p.reject(new Error(data));
  else p.resolve(data);
});

function envoyer(cmd, payload, { onProgress, delai = 120000 } = {}) {
  const id = "m" + (++seq) + "_" + Date.now();
  return new Promise((resolve, reject) => {
    const p = { resolve, reject, onProgress };
    // Le délai repart à chaque signe de vie de l'extension
    p.relancer = () => {
      clearTimeout(p.timer);
      p.timer = setTimeout(() => { enAttente.delete(id); reject(new Error("L'extension ne répond plus.")); }, delai);
    };
    p.relancer();
    enAttente.set(id, p);
    window.postMessage({ src: "momtaz-erp", cmd, id, payload }, "*");
  });
}

// Renvoie { version } si l'extension est installée dans ce navigateur, sinon null
export async function detecterExtension() {
  try { return await envoyer("ping", null, { delai: 2500 }); }
  catch { return version ? { version } : null; }
}

export function releverUrl(url, opts, onProgress) {
  return envoyer("scrape", { url, ...opts }, { onProgress, delai: 120000 });
}

export function arreterExtension() {
  return envoyer("stop", null, { delai: 5000 }).catch(() => {});
}
