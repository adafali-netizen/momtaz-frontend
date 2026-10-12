// Momtaz Veille : transmet au service de l'extension les publicités lues par hook.js.
window.addEventListener("message", e => {
  if (e.source !== window || !e.data || e.data.__momtaz !== "ads") return;
  chrome.runtime.sendMessage({ kind: "fb", ads: e.data.ads, total: e.data.total, captcha: e.data.captcha, href: location.href }).catch(() => {});
});

// Facebook affiche « Aucune publicité ne correspond… » sans donner de compteur :
// on le signale comme 0 résultat, pour enregistrer la page à 0 pub au lieu de la laisser « jamais relevée ».
const AUCUNE = /Aucune publicité ne correspond|No ads match|لا توجد إعلانات/i;
let zeroEnvoye = false;
setInterval(() => {
  if (zeroEnvoye || !/\/ads\/library\//.test(location.pathname) || !document.body) return;
  if (AUCUNE.test(document.body.innerText || "")) {
    zeroEnvoye = true;
    chrome.runtime.sendMessage({ kind: "fb", ads: [], total: 0, href: location.href }).catch(() => {});
  }
}, 2000);

// Page de connexion ou de vérification : on prévient
function verifier() {
  const login = /\/login|checkpoint/.test(location.pathname) || !!document.querySelector('form[action*="login"] input[name="pass"]');
  if (login) chrome.runtime.sendMessage({ kind: "fb", ads: [], login: true, href: location.href }).catch(() => {});
}
window.addEventListener("load", verifier);
