// Synthèse marché : top des produits dans une fourchette de prix et fiche de chaque page qui les vend.
// Aucune dépendance au navigateur : testable avec Node.
import { NICHE_LABEL } from "./nichesLib";
import { signalFort } from "./veilleLib";

export const CLE_COMMANDES = "commandes_test";   // { page_id: { le, produit, prixPaye, confirmation, livraison, livreur, emballage, remarque } }

// Prix dans la fourchette : au moins un prix vu chez les concurrents entre min et max
export const dansFourchette = (g, min, max) => {
  const bas = g.prixMin ?? g.prixMax, haut = g.prixMax ?? g.prixMin;
  if (bas == null) return false;
  return haut >= (Number(min) || 0) && bas <= (Number(max) || Infinity);
};

// Ajouts sur 7 jours, puis créatives, puis pages vendeuses, puis ancienneté
export const ordreMarche = (a, b) => b.recent - a.recent || b.crea - a.crea || b.nbPages - a.nbPages || b.age - a.age;

export function topProduits(groupes, { min = 300, max = 600, niche = "", n = 20 } = {}) {
  return groupes
    .filter(g => dansFourchette(g, min, max) && (!niche || g.niche === niche))
    .sort(ordreMarche)
    .slice(0, n);
}

const PROMESSES = [
  ["Livraison gratuite", /livraison\s+gratuite|free\s+delivery|(ال)?توصيل\s*(مجاني|مجانا|بالمجان|فابور)/i],
  ["Paiement à la livraison", /paiement\s+(à|a)\s+la\s+livraison|الدفع\s*عند\s*(الاستلام|التسليم|التوصل)|الخلاص\s*عند/i],
  ["Livraison 24 à 48 h", /\b(24|48)\s*(h|heures?|ساعة|س)\b|(24|48)\s*ساعة/i],
  ["Garantie ou échange", /garantie|échange|remboursement|ضمان|استبدال|الاسترجاع/i],
  ["Promo ou quantité limitée", /promo|réduction|stock\s+limit|quantité\s+limit|تخفيض|كمية\s+محدودة|عرض\s+خاص|-\s*\d{2}\s*%/i],
  ["Cadeau offert", /cadeau|offert|هدية|مجانا\s+مع/i],
];

const plateformeDe = url => {
  const u = String(url || "").toLowerCase();
  if (/wa\.me|whatsapp/.test(u)) return "WhatsApp";
  if (/m\.me|messenger/.test(u)) return "Messenger";
  if (/youcan/.test(u)) return "YouCan";
  if (/lightfunnels/.test(u)) return "LightFunnels";
  if (/storeep/.test(u)) return "Storeep";
  if (/myshopify|\/products\//.test(u)) return "Shopify (probable)";
  if (/\/lp\d*\//.test(u)) return "Page d'atterrissage (à vérifier)";
  if (/^https?:/.test(u)) return "Site (plateforme à vérifier)";
  return "Sans lien";
};

const accroche = t => String(t || "").split(/\s*(?:·|\||\n|[.!?؟]|—)\s*/).map(s => s.trim()).find(s => s.length >= 8) || "";

// Fiche d'une page vendeuse, calculée sur tous ses produits du classement
export function ficheVendeur(pageId, groupes, nichesPages = {}) {
  const produits = [], prix = [], cartes = [], urls = [];
  let pubs = 0, recent = 0, nom = null;
  for (const g of groupes) {
    const v = g.vendors.find(x => x.fb_page_id === pageId);
    if (!v) continue;
    nom = nom || v.page;
    produits.push({ nom: g.nom, pubs: v.pubs, recent: v.recent, prix: v.prix, signal: signalFort(g) });
    if (v.prix) prix.push(v.prix);
    cartes.push(...v.cartes);
    urls.push(...(v.urls || []));
    pubs += v.pubs; recent += v.recent;
  }
  const textes = cartes.map(c => c.texte || "");
  const videos = cartes.filter(c => c.format === "Vidéo" || (c.media && /\.mp4|video/i.test(c.media))).length;
  const plateformes = {};
  for (const u of urls.length ? urls : [null]) { const p = plateformeDe(u); plateformes[p] = (plateformes[p] || 0) + 1; }
  const promesses = PROMESSES.map(([l, re]) => [l, textes.filter(t => re.test(t)).length]).filter(([, n]) => n);
  const acc = {};
  for (const c of cartes) { const a = accroche(c.texte); if (a) acc[a] = (acc[a] || 0) + (c.nb || 1); }
  return {
    pageId, nom: nom || "Page " + pageId,
    niche: nichesPages[pageId] || null,
    produits: produits.sort((a, b) => b.recent - a.recent || b.pubs - a.pubs),
    nbProduits: produits.length,
    creatives: cartes.length, pubs, recent,
    prixMoyen: prix.length ? Math.round(prix.reduce((s, x) => s + x, 0) / prix.length) : null,
    partVideo: cartes.length ? Math.round(100 * videos / cartes.length) : null,
    plateformes: Object.entries(plateformes).sort((a, b) => b[1] - a[1]).map(([p]) => p),
    whatsapp: urls.some(u => /wa\.me|whatsapp/i.test(u)),
    promesses: promesses.sort((a, b) => b[1] - a[1]).map(([l, n]) => ({ l, part: Math.round(100 * n / Math.max(1, textes.length)) })),
    accroches: Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a.slice(0, 120)),
  };
}

// Pages qui vendent les produits du top, de celle qui en vend le plus à celle qui en vend le moins
export function vendeursDuTop(top) {
  const m = new Map();
  for (const g of top) for (const v of g.vendors) {
    const x = m.get(v.fb_page_id) || { pageId: v.fb_page_id, nom: v.page, nb: 0, pubs: 0 };
    x.nb++; x.pubs += v.pubs;
    m.set(v.fb_page_id, x);
  }
  return [...m.values()].sort((a, b) => b.nb - a.nb || b.pubs - a.pubs);
}

const v = x => (x == null || x === "" ? "à vérifier" : x);

// Texte à coller dans la discussion avec Claude
export function texteSynthese(top, fiches, commandes = {}, { min, max, niche } = {}) {
  const l = [`SYNTHÈSE MARCHÉ · produits entre ${min} et ${max} DH${niche ? ` · niche ${NICHE_LABEL[niche] || niche}` : ""} · classés par ajouts sur 7 jours, puis créatives, pages, ancienneté`, ""];
  top.forEach((g, i) => l.push(`${i + 1}. ${g.nom} · ${g.prixMin === g.prixMax ? `${v(g.prixMin)} DH` : `${g.prixMin} à ${g.prixMax} DH`} · +${g.recent} pubs sur 7 j · ${g.crea} créatives · ${g.nbPages} page${g.nbPages > 1 ? "s" : ""} · ${g.age} jours · ${g.phase?.phase || ""}${signalFort(g) ? " · signal fort" : ""}${g.sante ? " · angle santé chez le concurrent" : ""} · ${NICHE_LABEL[g.niche] || ""}`));
  l.push("", "PAGES VENDEUSES");
  for (const f of fiches) {
    const c = commandes[f.pageId];
    l.push(`- ${f.nom} (${NICHE_LABEL[f.niche] || "niche à vérifier"}) : ${f.nbProduits} produits, ${f.creatives} créatives, ${f.pubs} pubs (+${f.recent} sur 7 j), prix moyen ${v(f.prixMoyen)} DH, vidéo ${v(f.partVideo)} %, ${f.plateformes.join(" / ")}`
      + `${f.promesses.length ? `, promesses : ${f.promesses.map(p => `${p.l} ${p.part} %`).join(", ")}` : ""}`
      + `${f.accroches.length ? `, accroches : ${f.accroches.map(a => `« ${a} »`).join(" / ")}` : ""}`);
    if (c) l.push(`  Commande test du ${v(c.le)} : ${v(c.produit)}, payé ${v(c.prixPaye)} DH, appel de confirmation ${v(c.confirmation)}, livré en ${v(c.livraison)}, livreur ${v(c.livreur)}, emballage ${v(c.emballage)}${c.remarque ? `, ${c.remarque}` : ""}`);
  }
  l.push("", "Achat, confirmation et logistique des concurrents : à vérifier par une commande test (non visibles dans les pubs).");
  return l.join("\n");
}
