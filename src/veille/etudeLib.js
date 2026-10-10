// Étude de marché : transforme les publicités relevées par mot-clé en tableau (une ligne par pub).

const PLATEFORMES = {
  FACEBOOK: "Facebook", INSTAGRAM: "Instagram", MESSENGER: "Messenger", WHATSAPP: "WhatsApp",
  AUDIENCE_NETWORK: "Audience Network", THREADS: "Threads", OCULUS: "Oculus",
};

const FORMATS = {
  VIDEO: "Vidéo", IMAGE: "Image", CAROUSEL: "Carrousel", DCO: "Dynamique (plusieurs versions)",
  DPA: "Catalogue", MULTI_IMAGES: "Plusieurs images", TEXT: "Texte",
};

const CTA = {
  WHATSAPP_MESSAGE: "WhatsApp", SEND_WHATSAPP_MESSAGE: "WhatsApp",
  MESSAGE_PAGE: "Messenger", SEND_MESSAGE: "Messenger", INSTAGRAM_MESSAGE: "Instagram Direct",
  SHOP_NOW: "Site : Acheter", ORDER_NOW: "Site : Commander", BUY_NOW: "Site : Acheter", LEARN_MORE: "Site : En savoir plus",
  GET_OFFER: "Site : Profiter de l'offre", SEE_MORE: "Site : Voir plus", BOOK_TRAVEL: "Site : Réserver", BOOK_NOW: "Site : Réserver",
  SIGN_UP: "Formulaire : S'inscrire", APPLY_NOW: "Formulaire : Postuler", GET_QUOTE: "Formulaire : Devis", SUBSCRIBE: "Formulaire : S'abonner",
  CONTACT_US: "Formulaire : Nous contacter", REQUEST_TIME: "Formulaire : Rendez-vous",
  CALL_NOW: "Appel", INSTALL_MOBILE_APP: "Application", DOWNLOAD: "Téléchargement", WATCH_MORE: "Vidéo : Voir plus", NO_BUTTON: "Aucun",
};

// Retire ce qu'Excel refuse : moitiés d'émojis coupés et caractères de contrôle (sinon le fichier est corrompu)
export function propre(v) {
  if (typeof v !== "string") return v;
  return v
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .slice(0, 32000);
}

function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

function cleanUrl(u) {
  if (!u) return "";
  return safeDecode(safeDecode(u));
}

export function plateformes(p) {
  if (!Array.isArray(p) || !p.length) return "";
  return p.map(x => PLATEFORMES[x] || x).join(", ");
}

export function format(a) {
  if (a.format && FORMATS[a.format]) return FORMATS[a.format];
  if (a.nbCartes > 1) return "Carrousel";
  return a.video ? "Vidéo" : "Image";
}

export function bouton(a) {
  const url = a.url || "";
  if (/wa\.me|whatsapp\.com/i.test(url)) return "WhatsApp";
  if (/m\.me|messenger\.com/i.test(url)) return "Messenger";
  if (a.cta && CTA[a.cta]) return CTA[a.cta];
  if (a.ctaText) return a.ctaText;
  return url ? "Site" : "";
}

// Prix repérés dans le texte : « 199 DH », « 199dh », « 199 درهم », « MAD 199 »
export function prix(texte) {
  const t = String(texte || "");
  const vus = [];
  const re1 = /(\d{2,6}(?:[.,]\d{1,2})?)\s*(dhs?|mad|dirhams?|درهم|دراهم|د\.م)/gi;
  const re2 = /(?:mad|dh|prix|السعر|الثمن|ب)\s*[:]?\s*(\d{2,6})(?!\d)/gi;
  let m;
  while ((m = re1.exec(t))) vus.push(m[1].replace(",", "."));
  if (!vus.length) while ((m = re2.exec(t))) vus.push(m[1]);
  return [...new Set(vus)].slice(0, 4).map(v => v + " DH").join(" / ");
}

// Français : mots entiers (compatibles avec les accents). Arabe : n'importe où, les préfixes (ل، ب، و) sont collés au mot.
const mot = (fr, ar) => new RegExp("(?<![\\p{L}])(" + fr + ")(?![\\p{L}])|(" + ar + ")", "iu");
const PUBLICS = [
  ["Bébés", mot("bébés?|bebes?|nourrissons?|naissance", "رضيع|الرضع|بيبي|المواليد")],
  ["Enfants", mot("enfants?|kids?|garçons?|garcons?|fillettes?|scolaire", "أطفال|طفل|ولادك|دراري|صغار")],
  ["Femmes", mot("femmes?|madame|mesdames|lalla|maman|mamans|filles?", "نساء|المرأة|لالة|مدام|سيدتي|عيالات|ماما")],
  ["Hommes", mot("hommes?|monsieur|messieurs|papa|barbe", "رجال|الرجل|بابا")],
];

export function publicVise(texte) {
  const t = String(texte || "");
  const res = PUBLICS.filter(([, re]) => re.test(t)).map(([nom]) => nom);
  return res.length ? res.join(", ") : "Tous";
}

const libPage = id => "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=MA&view_all_page_id=" + id;
const fmtDate = s => (s ? new Date(s * 1000).toISOString().slice(0, 10) : "");

// parMot : [{ mot, ads }] → lignes du tableau (pubs dédoublonnées, mots-clés regroupés)
export function construireEtude(parMot) {
  const pubs = new Map();
  for (const { mot, ads } of parMot) {
    for (const a of ads || []) {
      const k = a.cid || a.id;
      if (pubs.has(k)) { pubs.get(k).mots.add(mot); continue; }
      pubs.set(k, { a, mots: new Set([mot]) });
    }
  }
  // Pubs actives par page, comptées parmi tous les résultats de l'étude
  const actives = {};
  for (const { a } of pubs.values()) if (a.active) actives[a.page_id] = (actives[a.page_id] || 0) + (a.n || 1);

  const lignes = [];
  for (const { a, mots } of pubs.values()) {
    const texte = [a.title, a.text].filter(Boolean).join("\n");
    lignes.push({
      "Mots-clés": [...mots].join(", "),
      "Nom de la page": a.page_name || "",
      "Lien de la page": a.page_id ? libPage(a.page_id) : (a.pageUri || ""),
      "Date de début de diffusion": fmtDate(a.start),
      "Statut": a.active ? "Active" : "Inactive",
      "Pubs actives de la page": actives[a.page_id] || 0,
      "Pubs utilisant cette créative": a.n || 1,
      "Plateformes": plateformes(a.platforms),
      "Format": format(a),
      "Texte complet de la pub": texte,
      "Bouton d'action": bouton(a),
      "Prix mentionné": prix(texte + " " + (a.caption || "")),
      "Public visé (estimé)": publicVise(texte),
      "Lien de destination": cleanUrl(a.url),
      "Lien de la pub": "https://www.facebook.com/ads/library/?id=" + a.id,
      "Lien vidéo ou image": a.video || a.image || "",
    });
  }
  for (const l of lignes) for (const k of Object.keys(l)) l[k] = propre(l[k]);
  lignes.sort((x, y) => y["Pubs actives de la page"] - x["Pubs actives de la page"] || x["Nom de la page"].localeCompare(y["Nom de la page"]) || (y["Date de début de diffusion"] || "").localeCompare(x["Date de début de diffusion"] || ""));
  return lignes;
}

// Une ligne par page : vue d'ensemble du marché
export function resumePages(lignes) {
  const m = new Map();
  for (const l of lignes) {
    const k = l["Lien de la page"];
    if (!m.has(k)) m.set(k, { "Nom de la page": l["Nom de la page"], "Lien de la page": k, "Pubs actives": l["Pubs actives de la page"], "Pubs relevées": 0, "Première diffusion": l["Date de début de diffusion"], "Prix vus": new Set(), "Boutons": new Set(), "Mots-clés": new Set() });
    const p = m.get(k);
    p["Pubs relevées"]++;
    if (l["Date de début de diffusion"] && (!p["Première diffusion"] || l["Date de début de diffusion"] < p["Première diffusion"])) p["Première diffusion"] = l["Date de début de diffusion"];
    if (l["Prix mentionné"]) l["Prix mentionné"].split(" / ").forEach(x => p["Prix vus"].add(x));
    if (l["Bouton d'action"]) p["Boutons"].add(l["Bouton d'action"]);
    l["Mots-clés"].split(", ").forEach(x => p["Mots-clés"].add(x));
  }
  return [...m.values()].map(p => ({ ...p, "Prix vus": [...p["Prix vus"]].join(" / "), "Boutons": [...p["Boutons"]].join(", "), "Mots-clés": [...p["Mots-clés"]].join(", ") }))
    .sort((a, b) => b["Pubs actives"] - a["Pubs actives"]);
}
