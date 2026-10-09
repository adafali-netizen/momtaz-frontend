// Momtaz Veille : transmet au service de l'extension les publicités lues par hook.js.
window.addEventListener("message", e => {
  if (e.source !== window || !e.data || e.data.__momtaz !== "ads") return;
  chrome.runtime.sendMessage({ kind: "fb", ads: e.data.ads, total: e.data.total, captcha: e.data.captcha, href: location.href }).catch(() => {});
});

// Page de connexion ou de vérification : on prévient
function verifier() {
  const login = /\/login|checkpoint/.test(location.pathname) || !!document.querySelector('form[action*="login"] input[name="pass"]');
  if (login) chrome.runtime.sendMessage({ kind: "fb", ads: [], login: true, href: location.href }).catch(() => {});
}
window.addEventListener("load", verifier);
