// Momtaz Veille : lit les données des publicités que la page Ad Library reçoit déjà.
// Aucune requête supplémentaire n'est envoyée à Facebook.
(() => {
  if (window.__momtazHook) return;
  window.__momtazHook = true;

  const vus = new Set();

  const texte = v => (typeof v === "string" ? v : (v && typeof v.text === "string" ? v.text : ""));

  function slim(o) {
    const s = o.snapshot || {};
    const c = (s.cards && s.cards[0]) || {};
    const v = (s.videos && s.videos[0]) || {};
    const img = (s.images && s.images[0]) || {};
    const video = v.video_hd_url || v.video_sd_url || c.video_hd_url || c.video_sd_url || null;
    return {
      id: String(o.ad_archive_id),
      cid: String(o.collation_id || o.ad_archive_id),
      n: o.collation_count || 1,
      page_id: String(o.page_id || s.page_id || ""),
      page_name: s.page_name || o.page_name || "",
      start: o.start_date || null,
      active: o.is_active !== false,
      imp: (o.impressions_with_index && o.impressions_with_index.impressions_text) || "",
      url: s.link_url || c.link_url || null,
      video,
      image: img.original_image_url || c.original_image_url || null,
      thumb: v.video_preview_image_url || img.resized_image_url || c.video_preview_image_url || c.resized_image_url || null,
      text: (texte(s.body) || texte(c.body) || "").slice(0, 600),
      title: texte(s.title) || texte(c.title) || "",
      caption: s.caption || "",
      cats: s.page_categories || o.page_categories || null,
    };
  }

  function walk(o, out, meta) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { for (const x of o) walk(x, out, meta); return; }
    if (o.ad_archive_id && o.snapshot) { out.push(o); return; }
    if (o.search_results_connection && typeof o.search_results_connection.count === "number") meta.total = o.search_results_connection.count;
    if (o.xfb_ad_library_is_captcha_required === true) meta.captcha = true;
    for (const k in o) walk(o[k], out, meta);
  }

  function lire(txt) {
    if (!txt || (txt.indexOf("ad_archive_id") < 0 && txt.indexOf("search_results_connection") < 0 && txt.indexOf("captcha_required\":true") < 0)) return;
    const out = [];
    const meta = {};
    for (let ligne of txt.split("\n")) {
      ligne = ligne.trim().replace(/^for \(;;\);/, "");
      if (!ligne || ligne[0] !== "{") continue;
      try { walk(JSON.parse(ligne), out, meta); } catch (e) { /* ligne non JSON */ }
    }
    const nouvelles = [];
    for (const o of out) {
      const a = slim(o);
      if (vus.has(a.cid)) continue;
      vus.add(a.cid);
      nouvelles.push(a);
    }
    if (nouvelles.length || meta.total != null || meta.captcha) {
      window.postMessage({ __momtaz: "ads", ads: nouvelles, total: meta.total ?? null, captcha: !!meta.captcha }, "*");
    }
  }

  // Réponses reçues pendant le défilement
  const fetchOrig = window.fetch;
  window.fetch = function (...args) {
    const p = fetchOrig.apply(this, args);
    try {
      const url = String((args[0] && args[0].url) || args[0] || "");
      if (url.includes("/api/graphql")) p.then(r => r.clone().text().then(lire)).catch(() => {});
    } catch (e) { /* rien */ }
    return p;
  };
  const openOrig = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__momtazUrl = String(url || "");
    return openOrig.call(this, method, url, ...rest);
  };
  const sendOrig = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__momtazUrl && this.__momtazUrl.includes("/api/graphql")) {
      this.addEventListener("load", () => {
        try { if (this.responseType === "" || this.responseType === "text") lire(this.responseText); } catch (e) { /* rien */ }
      });
    }
    return sendOrig.apply(this, args);
  };

  // Premières publicités, déjà intégrées dans la page
  function scanScripts() {
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      if (s.__momtazLu) continue;
      s.__momtazLu = true;
      lire(s.textContent);
    }
  }
  document.addEventListener("DOMContentLoaded", scanScripts);
  window.addEventListener("load", scanScripts);
  setInterval(scanScripts, 3000);
})();
