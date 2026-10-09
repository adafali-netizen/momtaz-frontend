// Momtaz Veille : relie la page de l'ERP à l'extension.
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  window.addEventListener("message", e => {
    if (e.source !== window || !e.data || e.data.src !== "momtaz-erp") return;
    chrome.runtime.sendMessage({ kind: "erp", cmd: e.data.cmd, id: e.data.id, payload: e.data.payload }).catch(err => {
      window.postMessage({ src: "momtaz-ext", type: "error", id: e.data.id, data: String(err && err.message || err) }, "*");
    });
  });
  chrome.runtime.onMessage.addListener(m => {
    if (m && m.kind === "ext") window.postMessage({ src: "momtaz-ext", type: m.type, id: m.id, data: m.data }, "*");
  });
  window.postMessage({ src: "momtaz-ext", type: "ready", data: { version: VERSION } }, "*");
})();
