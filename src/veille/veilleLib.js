// Module Veille : lecture des pages Ad Library enregistrées (.mhtml) et calcul du classement.
// Aucune dépendance au navigateur : ce fichier est aussi testable avec Node.

// ─── 0. Textes acceptés par Supabase et Excel ─────────────────────────────

// Retire les moitiés d'émojis et les caractères de contrôle (Supabase refuse la page entière sinon)
export function texteSur(v) {
  if (typeof v !== "string") return v;
  return v
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
}

// Coupe à n caractères sans couper un émoji en deux
export function couper(s, n) {
  const c = Array.from(String(s || ""));
  return texteSur(c.length > n ? c.slice(0, n).join("") : c.join(""));
}

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
      texte: body ? couper(body[1].replace(/\d+:\d+ \/ \d+:\d+/g, "").replace(/(\s*Download)+/g, " ").trim(), 300) : "",
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

// Ancienne règle de nommage (gardée pour reconnaître les noms donnés automatiquement avant la correction)
function defaultNameV1(url, texte) {
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

// Appels à l'action et offres : jamais un nom de produit (« لطلب المنتوج إضغط هنا », « 215 درهم التوصيل فابور »…)
const APPEL = /(لطلب|للطلب|اطلب|أطلب|إطلب|اضغط|إضغط|أضغط|هنا|سارع|الكمية|محدودة|commande[rz]?|cliquez|cliquer|clique|shop now|order now|achetez|acheter|livraison|التوصيل|توصيل|مجان|فابور|بالمجان|درهم|\bdhs?\b|\bmad\b|prix|promo|عرض|تخفيض|خصم|واتساب|whatsapp|chat|contact|contactez|envoyez|message|messenger|راسلنا|راسلونا|تواصل|اتصل|en savoir plus|learn more|voir plus|see more)/i;

function nomDepuisTexte(texte) {
  const segments = String(texte || "").split(/\s*(?:·|\||\n|[.!?؟:]|—)\s*/).map(s => s.trim()).filter(Boolean);
  for (const s of segments) {
    const mots = s.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
    if (mots.length < 2) continue;
    if (mots.length <= 8 && APPEL.test(s)) continue;          // phrase courte d'appel à l'action ou d'offre
    const utiles = mots.filter(m => !APPEL.test(m) && !/^\d+$/.test(m));
    if (utiles.length >= 2) return utiles.slice(0, 5).join(" ");
  }
  return null;
}

// Adresses qui ne sont pas une fiche produit : messagerie, contact, pages d'information, catégories
const PAS_PRODUIT = /(^|\.)(wa\.me|whatsapp\.com|m\.me|messenger\.com|instagram\.com|facebook\.com|fb\.me|fb\.com|t\.me|tiktok\.com|bit\.ly)(\/|$)|\/(pages|collections|blogs|policies|cart|checkout|account|contact)(\/|$)/i;
const SLUG_GENERIQUE = /^(chat|chat-with-us|contact|contact-us|contactez-nous|home|index|accueil|shop|store|boutique|all|send|order|commande|commander|whatsapp|products?|catalog|catalogue|merci|thank-you|thanks|promo|offre|offres)$/i;

// Nom de la fiche dans l'adresse. Pages de vente « /lp1/<produit>/fcb/<numéro> » : c'est le segment après /lp1/
// (imrashoping.com, brandmaall.com, storebigmall.com… : même produit, domaines et numéros différents)
export function slugProduit(cle) {
  const seg = String(cle || "").split("/");
  const i = seg.findIndex((s, k) => k > 0 && /^lp\d*$/i.test(s));
  if (i > 0 && seg[i + 1]) return seg[i + 1];
  return seg.pop() || "";
}

// Nom de fiche produit comparable d'un site à l'autre : sans accents, sans suffixe « -1 », « -copie », « -copy »
export function slugNormalise(url) {
  const cle = safeDecode(safeDecode(productKey(url)));
  return slugProduit(cle).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[-_ ]+(copie|copy|\d{1,2})$/g, "")
    .replace(/[-_ ]+(copie|copy|\d{1,2})$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

// ─── Empreinte des photos produit (dHash 64 bits, calculée par l'extension) ──
// Deux photos identiques, même redimensionnées ou recompressées par deux boutiques, ont des empreintes proches.
export const SEUIL_PHOTO = 6;   // bits différents sur 64, au maximum, pour « même photo »

const bits32 = n => { n -= (n >>> 1) & 0x55555555; n = (n & 0x33333333) + ((n >>> 2) & 0x33333333); return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
const empreinte = h => (/^[0-9a-f]{16}$/i.test(h || "") ? [parseInt(h.slice(0, 8), 16) >>> 0, parseInt(h.slice(8), 16) >>> 0] : null);
export function distancePhoto(h1, h2) {
  const a = empreinte(h1), b = empreinte(h2);
  if (!a || !b) return 64;
  return bits32((a[0] ^ b[0]) >>> 0) + bits32((a[1] ^ b[1]) >>> 0);
}
// Image unie (fond blanc, page vide) : empreinte sans information, jamais comparée
const empreinteUtile = h => { const e = empreinte(h); if (!e) return false; const n = bits32(e[0]) + bits32(e[1]); return n >= 4 && n <= 60; };

// Nom donné au groupe quand tu valides un regroupement : celui du produit qui a le plus de pubs.
// Si les deux produits portent déjà le même nom (souvent tiré du texte de la pub), ce nom passe pour automatique
// et ne regrouperait rien : on ajoute « (regroupé) » pour qu'il compte comme un nom saisi.
export function nomRegroupement(a, b) {
  const garde = a.pubs >= b.pubs ? a : b;
  return norm(a.nom) === norm(b.nom) ? `${garde.nom} (regroupé)` : garde.nom;
}

// Paire de groupes, dans un ordre fixe (sert à mémoriser les refus)
export const clePaire = (a, b) => [a.cle, b.cle].sort().join(" ⇄ ");

// Produits probablement identiques, vendus par des pages différentes.
// Deux indices : même photo sur la page produit (marche entre un nom français et un nom arabe), ou mots communs dans le nom.
// refuses : Set des paires refusées (clePaire). Renvoie [{ a, b, raison, photo, force }], à confirmer par l'utilisateur.
const motsDe = s => new Set(String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .split(/[^\p{L}\p{N}]+/u).filter(m => m.length >= 3 && !STOP.has(m) && !/^\d+$/.test(m)));
const SANS_NOM = /^\s*produit sans nom\s*$/i;
export function suggestionsRegroupement(groupes, { refuses = new Set(), max = 60 } = {}) {
  const liste = groupes.map(g => ({ g, mots: motsDe(g.nom), pages: new Set(g.vendors.map(v => v.fb_page_id)), hashes: (g.hashes || []).filter(empreinteUtile) }));

  // Une photo retrouvée dans plus de 4 produits (logo, photo de stock) n'est pas un indice
  const frequence = new Map();
  for (const x of liste) for (const h of new Set(x.hashes)) frequence.set(h, (frequence.get(h) || 0) + 1);
  for (const x of liste) x.hashes = x.hashes.filter(h => frequence.get(h) <= 4);

  const out = [];
  for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) {
    const A = liste[i], B = liste[j];
    if ([...A.pages].some(p => B.pages.has(p))) continue;              // même page : pas un recoupement
    if (refuses.has(clePaire(A.g, B.g))) continue;

    let photo = 64;
    for (const ha of A.hashes) for (const hb of B.hashes) photo = Math.min(photo, distancePhoto(ha, hb));
    const memePhoto = photo <= SEUIL_PHOTO;

    const communs = [...A.mots].filter(m => B.mots.has(m));
    const jaccard = communs.length ? communs.length / new Set([...A.mots, ...B.mots]).size : 0;
    const prixEcart = A.g.prixMax && B.g.prixMax ? Math.abs(A.g.prixMax - B.g.prixMax) / Math.max(A.g.prixMax, B.g.prixMax) : null;
    // Nom par défaut (« Produit sans nom ») : ses mots ne prouvent rien
    const sansNom = SANS_NOM.test(A.g.nom) || SANS_NOM.test(B.g.nom);
    const memesMots = !sansNom && communs.length >= 2 && jaccard >= 0.4 && !(prixEcart != null && prixEcart > 0.35);
    if (!memePhoto && !memesMots) continue;

    const raisons = [];
    if (memePhoto) raisons.push(photo === 0 ? "même photo produit" : `même photo produit (${photo} bits d'écart sur 64)`);
    if (memesMots) raisons.push("mots communs : " + communs.join(", "));
    if (prixEcart != null) raisons.push(prixEcart === 0 ? "même prix" : `prix ${A.g.prixMax} et ${B.g.prixMax} DH`);
    out.push({ a: A.g, b: B.g, raison: raisons.join(" · "), photo: memePhoto, force: (memePhoto ? 2 - photo / 32 : 0) + jaccard });
  }
  return out.sort((x, y) => y.force - x.force || (y.a.pubs + y.b.pubs) - (x.a.pubs + x.b.pubs)).slice(0, max);
}

// L'adresse mène-t-elle à une fiche produit (et pas à WhatsApp, une page de contact, une catégorie) ?
export function estFicheProduit(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const cle = safeDecode(safeDecode(productKey(url)));
  return !PAS_PRODUIT.test(cle) && !SLUG_GENERIQUE.test(slugProduit(cle));
}

// Lien court (bit.ly…) : l'extension le suit jusqu'à la page produit
const LIEN_COURT = /^https?:\/\/(www\.)?(bit\.ly|tinyurl\.com|cutt\.ly|rb\.gy|shorturl\.at|is\.gd|t\.ly|rebrand\.ly)\/[^/?#]+/i;
export const estLienCourt = url => LIEN_COURT.test(String(url || ""));

// Peut-on lire le prix et les photos de ce lien ?
export function lienPrixPossible(url) {
  return estFicheProduit(url) || estLienCourt(url);
}

// Nom automatique d'un produit. source = "lien" (nom lu dans l'adresse d'une fiche produit) ou "texte" (adresse illisible ou pas une fiche produit)
export function nomAuto(url, texte) {
  const key = productKey(url);
  const cle = safeDecode(safeDecode(key));
  const slug = slugProduit(cle);
  const words = slug.split(/[-_ ]+/).filter(w => w && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  const lienCourt = /^[a-z0-9]{4,9}$/i.test(slug) || key === "sans-lien" || cle.split("/").length < 2;
  const pasProduit = PAS_PRODUIT.test(cle) || SLUG_GENERIQUE.test(slug);
  if (words.length && !lienCourt && !pasProduit) return { nom: words.slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "), source: "lien" };
  return { nom: nomDepuisTexte(texte) || "Produit sans nom", source: "texte" };
}

export function defaultName(url, texte) {
  return nomAuto(url, texte).nom;
}

const norm = s => (s || "").trim().toLowerCase();

// Identité d'un produit pour le regroupement.
// - Nom ou groupe saisi par toi : il fait foi (c'est ainsi que tu regroupes le même produit vendu par plusieurs pages).
// - Nom lu dans l'adresse de la page produit : les produits de même nom sont regroupés, comme avant.
// - Adresse illisible (lien court) : le produit reste seul, identifié par son lien. Avant, il prenait le texte
//   de la pub (souvent « لطلب المنتوج إضغط هنا ») et se mélangeait à tous les produits ayant la même accroche.
export function identiteProduit(row, cartes, produitKey) {
  const liste = (cartes || []).length ? cartes : [{}];
  // Noms donnés automatiquement, ancienne et nouvelle règle (y compris le nom tiré du texte de la pub)
  const autos = new Set(liste.flatMap(c => [defaultNameV1(c.url, c.texte), defaultName(c.url, c.texte), nomDepuisTexte(c.texte)]).filter(Boolean).map(norm));
  autos.add(norm("Produit sans nom"));
  if (row) autos.add(norm(defaultNameV1(row.url, "")));
  const groupeManuel = row?.groupe && !autos.has(norm(row.groupe)) ? row.groupe.trim() : null;
  const nomManuel = row?.nom && !autos.has(norm(row.nom)) ? row.nom.trim() : null;
  let auto = nomAuto(liste[0].url, liste[0].texte);
  if (auto.source === "texte") {
    for (const c of liste) { const n = nomDepuisTexte(c.texte); if (n) { auto = { nom: n, source: "texte" }; break; } }
  }
  const nom = nomManuel || auto.nom;
  if (groupeManuel) return { nom, groupe: groupeManuel, cle: "g:" + norm(groupeManuel) };
  if (nomManuel) return { nom, groupe: nom, cle: "g:" + norm(nom) };
  // Fiche produit lisible : même nom de fiche = même produit, même sur deux sites différents
  // (« console-decorative-3-niveaux » chez La zone360 et chez Darinnova)
  if (auto.source === "lien") return { nom, groupe: nom, cle: "s:" + slugNormalise(liste[0].url) };
  // produitKey reçu sous la forme « page|clé » : un produit sans fiche lisible reste propre à sa page
  return { nom, groupe: nom, cle: "p:" + (produitKey || "") };
}

// Un groupe saisi à la main peut porter exactement le nom automatique d'un autre produit
// (« Machine Fitness Pliable » tapé sur la ligne de Reno Shop 3, nom automatique chez Boston).
// Les produits dont le nom automatique est identique à un groupe saisi rejoignent ce groupe.
// identites : [{ nom, groupe, cle }], modifiées sur place
export function unifierIdentites(identites) {
  const manuels = new Set(identites.filter(i => i.cle.startsWith("g:")).map(i => i.cle));
  if (!manuels.size) return identites;
  for (const i of identites) {
    if (i.cle.startsWith("g:")) continue;
    const k = "g:" + norm(i.groupe);
    if (manuels.has(k)) i.cle = k;
  }
  return identites;
}

// Ancienne liste (sert à reconnaître une case « santé » cochée automatiquement à la création du produit)
const SANTE_V1 = ["attelle", "compression", "chauffant", "masseur", "masseuse", "bonnet", "patch", "canne", "genou", "étireur", "etireur", "migraine", "douleur", "arthrite"];
const risqueSanteV1 = nom => { const n = (nom || "").toLowerCase(); return SANTE_V1.some(w => n.includes(w)); };

// Promesse santé, minceur ou anti-âge : refusées par nos règles et risquées chez Meta.
// Cherchée dans le nom du produit et dans le texte des pubs, en français, anglais et arabe.
const SANTE = new RegExp([
  // santé, douleur, soin
  "attelle", "genouill", "orthop", "posture", "correcteur de posture", "douleurs?", "soulag", "arthr", "articulation", "rhumatism",
  "sciatique", "migraine", "varices?", "diab[eè]t", "cholest[eé]rol", "tension art[eé]rielle", "insomnie", "gu[eé]ri", "th[eé]rapeuti", "m[eé]dical",
  "masseur", "massage", "compression", "canne", "pain relief",
  // minceur
  "minceur", "mincir", "maigrir", "perte de poids", "perdre du poids", "kilos?", "graisse", "cellulite", "br[uû]le", "ventre plat", "slim",
  // anti-âge
  "anti-?rides", "rides", "lifting", "rajeun", "anti-?[aâ]ge",
  // arabe
  "تنحيف", "التنحيف", "الكرش", "الكرشة", "الدهون", "الذهون", "السيلوليت", "التجاعيد", "تجاعيد", "آلام", "الألم", "ألم", "المفاصل", "الركبة", "الركبتين",
  "الروماتيزم", "السكري", "الدوالي", "علاج", "يعالج", "الشقيقة", "البواسير", "الوزن", "رجعي سنين", "شد الوجه",
].join("|"), "i");

export function risqueSante(...textes) {
  return textes.some(t => t && SANTE.test(String(t)));
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
// Ordre d'importance : réinvestissement, demande, recoupement, persistance, puis faisabilité (prix et santé).
// L'âge des pubs ne compte pas : une vieille pub relancée fausserait la mesure.
const progressif = (n, plein) => Math.min(1, Math.log1p(Math.max(0, n)) / Math.log1p(plein));

export function detailScore({ pubs, recent, nbPages, persistance, prixMax, sante }) {
  return {
    reinvestissement: Math.round(30 * progressif(recent, 20)),        // pubs lancées dans les 7 jours avant le relevé
    demande:          Math.round(25 * progressif(pubs, 60)),          // pubs actives (hors impressions faibles)
    recoupement:      nbPages >= 3 ? 20 : nbPages === 2 ? 12 : 0,     // nombre de pages qui vendent le produit
    persistance:      persistance >= 4 ? 15 : persistance === 3 ? 10 : persistance === 2 ? 5 : 0, // relevés espacés de 7 jours ou plus
    faisabilite:      10 - (sante ? 5 : 0) - (prixMax && prixMax < 200 ? 5 : 0), // promesse santé, prix sous 200 DH
  };
}

export function scoreGroup(x) {
  const d = detailScore(x);
  return d.reinvestissement + d.demande + d.recoupement + d.persistance + d.faisabilite;
}

// Nombre de relevés où le produit avait des pubs actives, en ne comptant que des relevés espacés d'au moins 7 jours
export function relevesEspaces(dates) {
  const tri = [...new Set(dates)].map(d => new Date(d).getTime()).filter(x => !Number.isNaN(x)).sort((x, y) => x - y);
  let n = 0, dernier = -Infinity;
  for (const x of tri) if (x - dernier >= 7 * 86400000) { n++; dernier = x; }
  return n;
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

// ─── 4. Phase d'un produit : vagues de créatives ──────────────────────────
// Méthode : les créatives les plus anciennes sont celles du test, la 2e vague le mid-scaling, les suivantes le scaling.
// Le même comportement chez au moins 2 pages = big winner.
export const ECART_VAGUE = 5;    // plus de 5 jours entre deux lancements : nouvelle vague
export const MIN_CREAS = 3;      // en dessous de 3 créatives : trop tôt pour juger
export const JOURS_ACTIF = 7;    // dernière créative lancée dans les 7 jours avant le relevé : scaling actif
export const PHASES = ["Trop tôt", "Test", "Mid-scaling", "Scaling", "Big winner"];
export const PHASE_COULEURS = {
  "Trop tôt":    ["#667085", "#F2F4F7"],
  "Test":        ["#175CD3", "#EFF8FF"],
  "Mid-scaling": ["#B54708", "#FFFAEB"],
  "Scaling":     ["#027A48", "#ECFDF3"],
  "Big winner":  ["#6927DA", "#F4F3FF"],
};

const JOUR = 86400000;
const jourDe = s => { const t = Date.parse(String(s).slice(0, 10) + "T00:00:00Z"); return Number.isNaN(t) ? null : t; };

// Vagues de lancement d'une page pour un produit. cartes : [{ started_on, nb }]
export function vaguesDe(cartes) {
  const parJour = new Map();
  for (const c of cartes) {
    const t = c.started_on ? jourDe(c.started_on) : null;
    if (t == null) continue;
    const x = parJour.get(t) || { crea: 0, pubs: 0 };
    x.crea++; x.pubs += c.nb || 1;
    parJour.set(t, x);
  }
  const vagues = [];
  let dernier = null;
  for (const t of [...parJour.keys()].sort((a, b) => a - b)) {
    if (dernier == null || (t - dernier) / JOUR > ECART_VAGUE) vagues.push({ debut: t, fin: t, crea: 0, pubs: 0 });
    const v = vagues[vagues.length - 1];
    v.fin = t; v.crea += parJour.get(t).crea; v.pubs += parJour.get(t).pubs;
    dernier = t;
  }
  return vagues.map(v => ({ ...v, debut: new Date(v.debut).toISOString().slice(0, 10), fin: new Date(v.fin).toISOString().slice(0, 10) }));
}

// Phase d'une page vendeuse. ref : date du relevé de la page
export function phaseVendeur(cartes, ref) {
  const vagues = vaguesDe(cartes);
  const dupliquees = cartes.some(c => (c.nb || 1) >= 2);
  const derniere = vagues.length ? jourDe(vagues[vagues.length - 1].fin) : null;
  const refT = ref ? new Date(ref).getTime() : Date.now();
  const actif = derniere != null && refT - derniere <= JOURS_ACTIF * JOUR;
  const phase = cartes.length < MIN_CREAS ? "Trop tôt" : vagues.length >= 3 ? "Scaling" : vagues.length === 2 ? "Mid-scaling" : "Test";
  return { phase, vagues, actif, dupliquees, nbCreas: cartes.length };
}

// Phase du produit : big winner si au moins 2 pages sont en mid-scaling ou plus, sinon la meilleure phase d'une page
export function phaseGroupe(vendeurs) {
  const enScale = vendeurs.filter(v => v.phase && (v.phase.phase === "Mid-scaling" || v.phase.phase === "Scaling"));
  if (enScale.length >= 2) return { phase: "Big winner", actif: enScale.some(v => v.phase.actif), dupliquees: enScale.some(v => v.phase.dupliquees) };
  const meilleur = [...vendeurs].sort((a, b) => PHASES.indexOf(b.phase.phase) - PHASES.indexOf(a.phase.phase) || (b.phase.actif - a.phase.actif))[0];
  return meilleur ? { phase: meilleur.phase.phase, actif: meilleur.phase.actif, dupliquees: meilleur.phase.dupliquees } : { phase: "Trop tôt", actif: false, dupliquees: false };
}

// ─── 5. Classement : le même produit vendu par plusieurs pages ────────────


export function vendorUrl(row, cartes) {
  if (row?.url) return row.url;
  const c = cartes.find(x => x.url && !/bit\.ly/i.test(x.url)) || cartes.find(x => x.url);
  return c ? c.url : null;
}

// pubs : publicités du dernier relevé de chaque page · produits : lignes veille_produits
// pageName(fb_page_id) : nom affiché de la page
// presence (facultatif) : { "page|clé produit": [dates des relevés où le produit avait des pubs actives] }
// fiches (facultatif) : { "page|clé produit": { i: [photos], h: [empreintes], t: titre, le } } lues sur les pages produit
export function buildGroups(pubs, refDates, produits, pageName, presence, fiches) {
  const prodMap = new Map(produits.map(p => [p.fb_page_id + "|" + p.produit_key, p]));
  const groups = new Map();
  const agreges = aggregateProducts(pubs, refDates).map(it => {
    const row = prodMap.get(it.fb_page_id + "|" + it.produit_key) || null;
    return { it, row, id: identiteProduit(row, it.cartes, it.fb_page_id + "|" + it.produit_key) };
  });
  unifierIdentites(agreges.map(x => x.id));
  for (const { it, row, id } of agreges) {
    const nom = id.nom;
    const groupe = id.groupe;
    const vendor = {
      ...it, row, nom, groupe,
      page: pageName(it.fb_page_id),
      prix: row?.prix != null && row.prix !== "" ? Number(row.prix) : null,
      url: vendorUrl(row, it.cartes),
      // Case cochée à la main (pas par l'ancienne règle automatique) : toujours respectée ; sinon détection sur le nom et le texte des pubs
      sante: (row && row.risque_sante && !risqueSanteV1(row.nom)) || risqueSante(nom, row?.nom, ...it.cartes.map(c => c.texte)),
      fiche: (fiches && fiches[it.fb_page_id + "|" + it.produit_key]) || null,
    };
    const k = id.cle;
    if (!groups.has(k)) groups.set(k, { cle: k, nom: groupe, vendors: [] });
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
        phase: phaseVendeur(p.cartes, refDates[p.fb_page_id]),
        ref: refDates[p.fb_page_id] || null,
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
    const fichesG = items.map(x => x.fiche).filter(Boolean);
    out.push({
      cle: G.cle,
      phase: phaseGroupe(v),
      images: [...new Set(fichesG.flatMap(f => f.i || []))].slice(0, 4),
      hashes: [...new Set(fichesG.flatMap(f => f.h || []))],
      nom: G.nom, vendors: v, items, pubs, recent, age, nbPages, prixMax, prixMin, sante, cartes, statut,
      crea: cartes.length,
      ids: items.map(x => x.row?.id).filter(Boolean),
      persistance: relevesEspaces(items.flatMap(x => (presence && presence[x.fb_page_id + "|" + x.produit_key]) || [])),
      score: 0,
      tier: tierOf(prixMax),
      thumb: (cartes.find(c => c.thumb) || {}).thumb || null,
    });
  }
  for (const g of out) {
    g.detail = detailScore(g);
    g.score = scoreGroup(g);
  }
  // Comme avant : produits à 250 DH et plus d'abord, puis sans prix, puis moins de 250 DH ; ensuite le score
  out.sort((a, b) => a.tier - b.tier || b.score - a.score || b.pubs - a.pubs);
  return out;
}

// ─── 6. Historique : ce qui a changé entre deux relevés ───────────────────

// avant / apres : publicités des mêmes pages, à deux dates
export function compareReleves(apres, avant, produits, pageName) {
  const prodMap = new Map(produits.map(p => [p.fb_page_id + "|" + p.produit_key, p]));
  // Identité de chaque produit calculée une fois, sur les pubs des deux relevés, puis unifiée comme dans le classement
  const cartesPar = new Map();
  for (const p of [...apres, ...avant]) {
    const pk = p.fb_page_id + "|" + p.produit_key;
    if (!cartesPar.has(pk)) cartesPar.set(pk, []);
    cartesPar.get(pk).push(p);
  }
  const ident = new Map([...cartesPar].map(([pk, cartes]) => [pk, identiteProduit(prodMap.get(pk), cartes, pk)]));
  unifierIdentites([...ident.values()]);
  const sumBy = list => {
    const m = new Map();
    for (const p of list) {
      if (p.low) continue;
      const id = ident.get(p.fb_page_id + "|" + p.produit_key);
      const nom = id.groupe;
      const k = id.cle;
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

// ─── 7. Export vers le Google Sheet (colonnes M et suivantes = créatives) ─

export function toSheetTsv(groups, pageInfo, dateLabel) {
  const q = s => String(s ?? "").replace(/"/g, '""').replace(/[\t\r\n]+/g, " ");
  const marge = '=IF(INDIRECT("H"&ROW())="";"";INDIRECT("G"&ROW())-INDIRECT("H"&ROW()))';
  const rows = [];
  let maxC = 0;
  groups.forEach((g, rang) => {
    for (const v of g.vendors) {
      const info = pageInfo(v.fb_page_id);
      const d = g.detail || {};
      const c0 = v.cartes[0] || {};
      const lib = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=MA&view_all_page_id=" + v.fb_page_id;
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
        rang + 1,
        g.score ?? "",
        d.reinvestissement ?? "", d.demande ?? "", d.recoupement ?? "", d.persistance ?? "", d.faisabilite ?? "",
        g.pubs,
        g.recent,
        g.nbPages,
        g.sante ? "Oui" : "",
        g.phase ? g.phase.phase : "",
        v.phase ? v.phase.vagues.length : "",
        g.phase ? (g.phase.actif ? "Oui" : "Non") : "",
        ...crea,
      ].join("\t"));
    }
  });
  const head = ["Date", "Page", "ID", "Produit", "Lien de publicité", "Page produit", "Prix de vente", "Prix achat", "Marge brute", "Status", "Nombre de créatives", "Nombre de pub",
    "Rang", "Score /100", "Réinvestissement /30", "Demande /25", "Recoupement /20", "Persistance /15", "Faisabilité /10",
    "Pubs du produit (toutes pages)", "Pubs lancées sur 7 jours", "Pages vendeuses", "Promesse santé",
    "Phase du produit", "Vagues de la page", "Scaling actif"];
  for (let i = 1; i <= maxC; i++) head.push("Créative " + i);
  return head.join("\t") + "\n" + rows.join("\n") + "\n";
}

// ─── 8. Relevé automatique (extension) et recherche de pages ──────────────

// Pays Maroc par défaut : sans compte Facebook, certaines pages n'affichent rien avec « Tous les pays »
export const libraryPageUrl = (id, pays = "MA") =>
  "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=" + pays + "&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=" + id;

// exact = true : Facebook ne renvoie que les pubs qui contiennent l'expression entière (moins de hors-sujet)
export const librarySearchUrl = (mot, statut = "active", pays = "MA", exact = false) =>
  "https://www.facebook.com/ads/library/?active_status=" + statut + "&ad_type=all&country=" + pays + "&is_targeted_country=false&media_type=all"
  + (exact
    ? "&search_type=keyword_exact_phrase&q=" + encodeURIComponent('"' + String(mot).replace(/"/g, "").trim() + '"')
    : "&search_type=keyword_unordered&q=" + encodeURIComponent(mot));

function cleanUrl(u) {
  if (!u) return null;
  return safeDecode(safeDecode(u)).split("?")[0].replace(/\/+$/, "");
}

// Publicités renvoyées par l'extension → même format que l'import .mhtml
export function adsToCartes(ads) {
  const vus = new Set();
  const out = [];
  for (const a of ads || []) {
    if (vus.has(a.cid)) continue;
    vus.add(a.cid);
    out.push({
      library_id: String(a.id),
      started_on: a.start ? new Date(a.start * 1000).toISOString().slice(0, 10) : null,
      nb: a.n || 1,
      low: /low/i.test(a.imp || ""),
      url: cleanUrl(a.url),
      format: a.video ? "Vidéo" : "Image",
      media: a.video || a.image || null,
      thumb: a.thumb || a.image || null,
      texte: couper([a.title, a.text].filter(Boolean).join(" · ").replace(/\s+/g, " "), 300),
    });
  }
  return out;
}

const MESSAGERIE = /(^|\.)(wa\.me|whatsapp\.com|m\.me|messenger\.com|instagram\.com|facebook\.com|fb\.me|fb\.com|t\.me|tiktok\.com)$/i;
const COD = /الدفع\s*عند\s*(الاستلام|التسليم|التوصل)|الخلاص\s*عند|livraison\s+gratuite|paiement\s+(à|a)\s+la\s+livraison|payez\s+(à|a)\s+la\s+livraison|cash\s+on\s+delivery|توصيل\s*(مجاني|بالمجان|فابور)|التوصيل\s*(مجاني|بالمجان|فابور)|\d+\s*(dh|dhs|mad|درهم)\b/i;

export const CATEGORIES = {
  vetements:   { label: "Vêtements",   re: /\b(robe|jellaba|djellaba|caftan|kaftan|abaya|t-?shirt|pantalon|chemise|hoodie|sweat|jupe|survêtement|pyjama|lingerie|jean|veste|manteau|hijab)s?\b|ملابس|جلابة|جلابية|قفطان|عباية|سروال|قميص|فستان|كسوة|بيجامة|حجاب/i },
  cosmetiques: { label: "Cosmétiques", re: /\b(crème|creme|sérum|serum|cosmétique|cosmetique|maquillage|rouge à lèvres|mascara|parfum|shampo?oing|soin du visage|anti-?rides|blanchissant|skincare)s?\b|كريم|سيروم|مكياج|عطر|العناية بالبشرة|تبييض|شامبو/i },
  immobilier:  { label: "Immobilier",  re: /\b(appartement|villa|terrain|immobilier|immobilière|lotissement|duplex|studio à vendre|à louer)s?\b|شقة|شقق|عقار|أرض للبيع|فيلا|للكراء|للبيع شقة/i },
  services:    { label: "Services",    re: /\b(clinique|cabinet|dentiste|agence|nettoyage à domicile|plombier|déménagement|assurance|avocat|visa|location de voiture)s?\b|عيادة|طبيب|وكالة|تأمين|محامي|كراء السيارات/i },
  restaurants: { label: "Restaurants", re: /\b(restaurant|pizza|burger|tacos|snack|menu du jour|livraison de repas)s?\b|مطعم|بيتزا|وجبة|وجبات/i },
  formations:  { label: "Formations",  re: /\b(formation|cours|école|ecole|inscription|diplôme|certificat|coaching|webinaire|masterclass)s?\b|تكوين|دورة|دورات|مدرسة|تسجيل|شهادة|كوتشينغ/i },
  auto:        { label: "Auto",        re: /\b(voiture d'occasion|concessionnaire|véhicule neuf|crédit auto|essai routier)s?\b|سيارة للبيع|سيارات مستعملة/i },
};

function categorie(ads) {
  const scores = {};
  for (const a of ads) {
    const t = [a.title, a.text, a.caption, a.url].filter(Boolean).join(" ");
    for (const [k, c] of Object.entries(CATEGORIES)) if (c.re.test(t)) scores[k] = (scores[k] || 0) + (a.n || 1);
  }
  const total = ads.reduce((s, a) => s + (a.n || 1), 0) || 1;
  const best = Object.entries(scores).sort((x, y) => y[1] - x[1])[0];
  // Catégorie retenue seulement si elle concerne au moins 40 % des pubs
  return best && best[1] / total >= 0.4 ? best[0] : null;
}

// expressionExacte : la recherche de pages cherche tes mots-clés manuels tels quels (mots dans le même ordre)
export const CRITERES_DEFAUT = { expressionExacte: false, minPubs: 10, minProduits: 3, siteObligatoire: true, codObligatoire: true, vetementsMinPubs: 20, exclues: ["cosmetiques", "immobilier", "services", "restaurants", "formations", "auto"] };

// Décide si une page découverte ressemble aux tiennes : gardee, a_valider ou eliminee
export function evaluatePage(ads, crit0) {
  const crit = { ...CRITERES_DEFAUT, ...(crit0 || {}) };
  const cartes = adsToCartes(ads);
  const actives = cartes.filter(c => !c.low);
  const pubs = actives.reduce((s, c) => s + c.nb, 0);
  const produits = new Set(cartes.filter(c => c.url).map(c => productKey(c.url))).size;
  const avecLien = cartes.filter(c => c.url);
  const ecom = avecLien.filter(c => { const s = siteOf(c.url); return s && !MESSAGERIE.test(s); });
  const siteEcom = ecom.length > 0 && ecom.length >= avecLien.length / 2;
  const cod = (ads || []).some(a => COD.test([a.title, a.text, a.caption].filter(Boolean).join(" ")));
  const cat = categorie(ads || []);
  const sites = [...new Set(ecom.map(c => siteOf(c.url)).filter(s => s !== "bit.ly"))].slice(0, 3).join(", ") || null;

  const echecs = [];
  let dur = false;
  if (cat && cat !== "vetements" && crit.exclues.includes(cat)) { echecs.push("Catégorie exclue : " + CATEGORIES[cat].label); dur = true; }
  const seuilPubs = cat === "vetements" ? crit.vetementsMinPubs : crit.minPubs;
  if (pubs < seuilPubs) {
    echecs.push(cat === "vetements" ? `Vêtements, ${pubs} pubs (moins de ${seuilPubs})` : `Seulement ${pubs} pubs actives (minimum ${seuilPubs})`);
    if (pubs < Math.ceil(seuilPubs / 2)) dur = true;
  }
  if (produits < crit.minProduits) {
    echecs.push(produits <= 1 ? "1 seul produit" : `${produits} produits seulement (minimum ${crit.minProduits})`);
    if (produits <= 1) dur = true;
  }
  if (crit.siteObligatoire && !siteEcom) echecs.push(avecLien.length ? "Pas de site e-commerce, commandes par messagerie" : "Aucun lien dans les pubs");
  if (crit.codObligatoire && !cod) echecs.push("Pas de signe de paiement à la livraison");

  const decision = echecs.length === 0 ? "gardee" : (!dur && echecs.length === 1) ? "a_valider" : "eliminee";
  const apercus = cartes.filter(c => c.thumb).sort((a, b) => b.nb - a.nb).slice(0, 3).map(c => ({ thumb: c.thumb, id: c.library_id }));
  return { cartes, pubs, produits, siteEcom, cod, categorie: cat, sites, decision, raison: echecs.join(" · ") || "Tous les critères sont remplis", apercus };
}

// ─── 9. Tâches manuelles : bandeau « À faire » ────────────────────────────

// Version de l'extension qu'attend l'ERP
export const EXTENSION_REQUISE = "1.0.9";
export function versionAuMoins(v, min) {
  const a = String(v || "0").split(".").map(Number), b = String(min).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
}

const clesVendeur = v => v.items.map(x => x.fb_page_id + "|" + x.produit_key);

// Page produit à lire : jamais lue, ou lue sans prix trouvé il y a 6 jours ou plus (même règle qu'au relevé).
// verifier : relire aussi les produits déjà chiffrés (les écarts sont signalés, ton prix n'est pas modifié)
export function vendeurALire(v, verifier, maintenant = Date.now()) {
  if (!v.url || !v.ids.length || !lienPrixPossible(v.url) || v.prixDifferents) return false;
  if (verifier || v.items.some(x => !x.fiche)) return true;
  return !v.prix && v.items.every(x => !x.fiche.le || maintenant - new Date(x.fiche.le).getTime() >= 6 * JOUR);
}
export function pagesALire(groupes, verifier = false) {
  const out = [];
  for (const g of groupes) for (const v of g.vendors) {
    if (!vendeurALire(v, verifier)) continue;
    out.push({ ids: v.ids, cles: v.items.map(x => ({ fb_page_id: x.fb_page_id, produit_key: x.produit_key })), url: v.url, prix: v.prix, nom: g.nom, page: v.page });
  }
  return out;
}

// Prix à saisir à la main : page déjà lue sans prix trouvé, ou lien illisible (WhatsApp, sans lien)
export function vendeurASaisir(v) {
  if (v.prix || v.prixDifferents || !v.ids.length) return false;
  if (!v.url || !lienPrixPossible(v.url)) return true;
  return v.items.every(x => x.fiche) && !vendeurALire(v, false);
}

// Écart entre ton prix et le prix lu sur le site. ecarts : { "page|clé": { site, saisi, le } }
// L'écart ne compte plus dès que tu as modifié le prix.
export function ecartVendeur(v, ecarts) {
  if (!ecarts || !v.prix) return null;
  for (const k of clesVendeur(v)) {
    const e = ecarts[k];
    if (e && Number(e.saisi) === Number(v.prix) && Number(e.site) !== Number(v.prix)) return e;
  }
  return null;
}

// Pages à relever : jamais relevées, ou dernier relevé il y a 7 jours ou plus (pour la persistance)
export function pagesDues(pages, latest, maintenant = Date.now()) {
  const actives = pages.filter(p => p.actif);
  const dues = [], prochaines = [];
  for (const p of actives) {
    const d = latest && latest[p.fb_page_id] ? new Date(latest[p.fb_page_id].capture_le).getTime() : null;
    if (d == null || maintenant - d >= 7 * JOUR) dues.push(p);
    else prochaines.push(d + 7 * JOUR);
  }
  return { dues, prochaine: prochaines.length ? Math.min(...prochaines) : null };
}

// Liste des tâches du bandeau. ctx : { groupes, suggestions, ecarts, pages, latest, ext, homonymes }
export function tachesAFaire(ctx) {
  const t = [];
  const { groupes = [], ext } = ctx;
  if (!ext) t.push({ id: "extension", niveau: "rouge", texte: "Extension Momtaz Veille non détectée : ouvre l'ERP dans le profil Chrome où elle est installée." });
  else if (!versionAuMoins(ext.version, EXTENSION_REQUISE)) t.push({ id: "extension", niveau: "rouge", texte: `Extension en v${ext.version} : installe la v${EXTENSION_REQUISE} (prix « دم », photos des pages produit).` });

  const { dues, prochaine } = pagesDues(ctx.pages || [], ctx.latest || {});
  if (dues.length) t.push({ id: "releve", niveau: "orange", nb: dues.length, ids: dues.map(p => p.fb_page_id), texte: `${dues.length} page${dues.length > 1 ? "s" : ""} à relever : jamais relevée${dues.length > 1 ? "s" : ""} ou dernier relevé il y a 7 jours ou plus.` });

  let aSaisir = 0, ecarts = 0;
  for (const g of groupes) for (const v of g.vendors) {
    if (vendeurASaisir(v)) aSaisir++;
    if (ecartVendeur(v, ctx.ecarts)) ecarts++;
  }
  const aLire = pagesALire(groupes).length;
  if (ecarts) t.push({ id: "ecarts", niveau: "orange", nb: ecarts, texte: `${ecarts} prix différent${ecarts > 1 ? "s" : ""} de celui affiché sur le site du concurrent : garde le tien ou prends celui du site.` });
  if ((ctx.suggestions || []).length) t.push({ id: "regroupements", niveau: "orange", nb: ctx.suggestions.length, texte: `${ctx.suggestions.length} regroupement${ctx.suggestions.length > 1 ? "s" : ""} de produits à valider ou refuser.` });
  if (aSaisir) t.push({ id: "saisir", niveau: "bleu", nb: aSaisir, texte: `${aSaisir} prix à saisir à la main : page produit lue sans prix trouvé, ou lien WhatsApp ou sans lien.` });
  if (aLire) t.push({ id: "lire", niveau: "bleu", nb: aLire, texte: `${aLire} page${aLire > 1 ? "s" : ""} produit pas encore lue${aLire > 1 ? "s" : ""} (prix ou photo manquant).` });
  if (ctx.homonymes && ctx.homonymes.size) t.push({ id: "homonymes", niveau: "bleu", nb: ctx.homonymes.size, texte: `${ctx.homonymes.size} pages portent le même nom : donne-leur un nom interne.` });
  return { taches: t, prochaine };
}
