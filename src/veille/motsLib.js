// Mots-clés de la recherche de pages : type, rendement cumulé, nettoyage automatique.
// Les statistiques sont gardées dans veille_config (clé « motscles_stats ») : pas de nouvelle table.
//
// stats : { "<mot en minuscules>": { type, recherches, trouvees, nouvelles, analysees, gardees, desactive } }
//   type        : "produit" (recherche large, mots dans n'importe quel ordre) ou "phrase" (expression exacte)
//   recherches  : nombre de recherches où le mot-clé a été utilisé
//   trouvees    : pages qui avaient des pubs avec ce mot-clé (cumul)
//   nouvelles   : pages encore inconnues de ta veille (cumul)
//   analysees   : pages trouvées grâce à ce mot-clé et réellement analysées (cumul)
//   gardees     : pages ajoutées à tes pages suivies, par le module ou par toi depuis « À valider » (cumul)
//   desactive   : { le, raison } quand le nettoyage automatique a désactivé le mot-clé

export const CLE_MOTS = "motscles_stats";
export const RECHERCHES_AVANT_NETTOYAGE = 2;   // aucune nouvelle page en 2 recherches : désactivé
export const ANALYSEES_AVANT_NETTOYAGE = 10;   // 10 pages analysées sans aucune gardée : désactivé
export const MOTS_PAR_SESSION = 40;            // mots-clés interrogés par recherche
export const PAGES_PAR_SESSION = 60;           // pages analysées par recherche
export const NB_MOTS_PRODUITS = 20;            // mots-clés produits ajoutés automatiquement à chaque recherche
export const PRIX_MIN_MOTS = 230;

export const cleMot = m => String(m || "").trim().toLowerCase();

// Liste collée : un mot-clé par ligne, sans doublons ni lignes vides
export function lireListe(texte) {
  const vus = new Set(), out = [];
  for (const l of String(texte || "").split(/\r?\n/)) {
    const m = l.replace(/\s+/g, " ").trim();
    if (!m || m.length < 2 || vus.has(cleMot(m))) continue;
    vus.add(cleMot(m));
    out.push(m);
  }
  return out;
}

// Type d'un mot-clé. Avant cette version, le réglage « expression exacte » valait pour tous les mots-clés manuels.
export function typeDe(m, stats, exactGlobal = false) {
  const s = stats && stats[cleMot(m.mot)];
  if (s && s.type) return s.type;
  return exactGlobal && m.source === "manuel" ? "phrase" : "produit";
}

const vide = type => ({ type, recherches: 0, trouvees: 0, nouvelles: 0, analysees: 0, gardees: 0, desactive: null });

// Statistiques après une recherche.
// interroges : { "<mot>": { type, trouvees, nouvelles } } mots-clés interrogés pendant cette recherche
// analyse    : { "<mot>": { analysees, gardees } } pages analysées pendant cette recherche, par mot-clé qui les a trouvées
//              (y compris des pages trouvées lors d'une recherche précédente et restées dans la file)
export function bilanRecherche(stats, interroges, analyse = {}) {
  const out = { ...(stats || {}) };
  for (const [mot, r] of Object.entries(interroges || {})) {
    const k = cleMot(mot);
    const s = { ...vide(r.type || "produit"), ...(out[k] || {}) };
    if (r.type) s.type = r.type;
    s.recherches += 1;
    s.trouvees += r.trouvees || 0;
    s.nouvelles += r.nouvelles || 0;
    out[k] = s;
  }
  for (const [mot, r] of Object.entries(analyse || {})) {
    const k = cleMot(mot);
    const s = { ...vide("produit"), ...(out[k] || {}) };
    s.analysees = (s.analysees || 0) + (r.analysees || 0);
    s.gardees += r.gardees || 0;
    out[k] = s;
  }
  return out;
}

// Raison de désactiver un mot-clé, ou null. Un mot-clé n'est jugé que sur ses pages réellement analysées.
export function raisonDesactivation(s) {
  if (!s || s.desactive || s.gardees) return null;
  if ((s.analysees || 0) >= ANALYSEES_AVANT_NETTOYAGE) return `aucune page gardée sur ${s.analysees} pages analysées`;
  if (s.recherches >= RECHERCHES_AVANT_NETTOYAGE && !s.nouvelles) return `aucune nouvelle page en ${s.recherches} recherches`;
  return null;
}

export function aDesactiver(stats) {
  return Object.entries(stats || {}).filter(([, s]) => raisonDesactivation(s)).map(([k]) => k);
}

export function marquerDesactives(stats, cles, le = new Date().toISOString()) {
  const out = { ...stats };
  for (const k of cles) out[k] = { ...out[k], desactive: { le, raison: raisonDesactivation(out[k]) } };
  return out;
}

// Mots-clés interrogés cette fois : jamais utilisés d'abord, puis les plus rentables, puis les moins récemment utilisés
export function choisirMots(mots, stats, max = MOTS_PAR_SESSION) {
  const s = m => (stats || {})[cleMot(m.mot)] || vide("produit");
  return [...mots].sort((a, b) =>
    (s(a).recherches ? 1 : 0) - (s(b).recherches ? 1 : 0)
    || s(b).gardees - s(a).gardees
    || (s(b).nouvelles / Math.max(1, s(b).recherches)) - (s(a).nouvelles / Math.max(1, s(a).recherches))
    || s(a).recherches - s(b).recherches).slice(0, max);
}

// ─── File d'attente des pages à analyser (veille_config « recherche_file ») ─────────────
// file : { "<page_id>": { nom, mots: [...], pubs, le } }
export const CLE_FILE = "recherche_file";

export function ajouterAFile(file, trouvees, connues, le = new Date().toISOString()) {
  const out = { ...(file || {}) };
  for (const t of trouvees) {
    if (connues.has(t.id)) continue;
    const x = out[t.id] || { nom: t.nom, mots: [], pubs: 0, le };
    out[t.id] = { ...x, nom: t.nom || x.nom, mots: [...new Set([...x.mots, ...t.mots])], pubs: x.pubs + (t.pubs || 0) };
  }
  for (const id of Object.keys(out)) if (connues.has(id)) delete out[id];
  return out;
}

// Ordre d'analyse : pages vues avec le plus de mots-clés différents, puis le plus de pubs
export function prochainesPages(file, max = PAGES_PAR_SESSION) {
  return Object.entries(file || {})
    .map(([id, x]) => ({ id, ...x }))
    .sort((a, b) => b.mots.length - a.mots.length || b.pubs - a.pubs)
    .slice(0, max);
}

// Réactivation à la main : le mot-clé a de nouveau 2 recherches pour faire ses preuves
export function reactiver(stats, mot) {
  const k = cleMot(mot);
  if (!stats || !stats[k]) return stats || {};
  return { ...stats, [k]: { ...stats[k], recherches: 0, desactive: null } };
}

// Page gardée par toi depuis « À valider » : comptée pour chaque mot-clé qui l'a fait trouver (« a, b, c »)
export function ajouterGardee(stats, motsCles) {
  const out = { ...(stats || {}) };
  for (const mot of String(motsCles || "").split(",").map(x => x.trim()).filter(Boolean)) {
    const k = cleMot(mot);
    out[k] = { ...vide("produit"), ...(out[k] || {}) };
    out[k].gardees += 1;
  }
  return out;
}

export function changerType(stats, mot, type) {
  const k = cleMot(mot);
  return { ...(stats || {}), [k]: { ...vide(type), ...((stats || {})[k] || {}), type } };
}

// Mots-clés produits automatiques : produits à 230 DH et plus qui reçoivent le plus de pubs sur 7 jours
export function motsProduitsAuto(groupes, deja = new Set()) {
  return groupes
    .filter(g => g.prixMax && g.prixMax >= PRIX_MIN_MOTS && g.recent > 0)
    .sort((a, b) => b.recent - a.recent || b.pubs - a.pubs)
    .map(g => g.nom.trim())
    .filter(n => n.length >= 4 && !/produit sans nom|\(regroupé\)$/i.test(n) && !deja.has(cleMot(n)))
    .filter((n, i, t) => t.findIndex(x => cleMot(x) === cleMot(n)) === i)
    .slice(0, NB_MOTS_PRODUITS);
}

// Classement des mots-clés à l'écran : actifs d'abord, puis par pages gardées, nouvelles pages, pages trouvées
export function trierMots(motscles, stats) {
  const s = m => (stats || {})[cleMot(m.mot)] || vide("produit");
  return [...motscles].sort((a, b) =>
    (b.actif - a.actif) || (s(b).gardees - s(a).gardees) || (s(b).nouvelles - s(a).nouvelles) || (s(b).trouvees - s(a).trouvees) || a.mot.localeCompare(b.mot));
}

// ─── Mots-clés tirés des textes de pub ─────────────────────────────────────
// Expressions de 2 à 4 mots présentes dans les pubs d'au moins 3 pages différentes, absentes de tes mots-clés.
// Ajoutées après chaque recherche (10 au plus), puis jugées par le rendement comme les autres.
export const MOTS_AUTO_PAR_RECHERCHE = 10;
const VIDES = new Set(("de du des la le les a au aux et en pour avec un une l d à ce cette ces est vous votre vos nous notre qui que sur dans par plus ou pas ne se sa son ses il elle on y "
  + "the and to of for with is in it this your you our "
  + "في من على و او أو ما لا مع هذا هاد هادي ديال لي اللي باش عن الى إلى كل ب ل غير هو هي "
  + "لجميع جميع حتى فقط ليك ليها راه غادي بلا شي أي نفس كيف درهم dh dhs mad").split(" "));
const normaliserTexte = t => String(t || "").replace(/\{\{[^}]*\}\}|product[ ._](name|brand)/gi, " ").normalize("NFKC")
  .replace(/[ً-ْـ]/g, "").replace(/(.)\1{2,}/g, "$1")
  .replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();

// textesParPage : { page_id: [textes de pub] } ; existants : Set des mots-clés (minuscules)
export function expressionsFrequentes(textesParPage, existants = new Set(), max = MOTS_AUTO_PAR_RECHERCHE, minPages = 3) {
  const pages = new Map();
  for (const [page, textes] of Object.entries(textesParPage)) {
    const vus = new Set();
    for (const t of textes) {
      const m = normaliserTexte(t).split(" ").filter(Boolean);
      for (let n = 2; n <= 4; n++) for (let i = 0; i + n <= m.length; i++) {
        const g = m.slice(i, i + n);
        if (VIDES.has(g[0]) || VIDES.has(g[n - 1]) || g.some(w => /\d/.test(w)) || g.some(w => w.length < 2)) continue;
        const e = g.join(" ");
        if (e.length < 6 || vus.has(e)) continue;
        vus.add(e);
        if (!pages.has(e)) pages.set(e, new Set());
        pages.get(e).add(page);
      }
    }
  }
  const deja = [...existants].map(cleMot);
  const res = [...pages.entries()].map(([e, p]) => ({ e, n: p.size }))
    .filter(x => x.n >= minPages && !deja.some(d => d === x.e || d.includes(x.e) || x.e.includes(d)))
    .sort((a, b) => b.n - a.n || b.e.length - a.e.length);
  // Une expression contenue dans une plus longue trouvée chez autant de pages est redondante
  const out = [];
  for (const x of res) {
    if (out.some(y => y.e.includes(x.e) && y.n >= x.n)) continue;
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}
