// Mots-clés de la recherche de pages : type, rendement cumulé, nettoyage automatique.
// Les statistiques sont gardées dans veille_config (clé « motscles_stats ») : pas de nouvelle table.
//
// stats : { "<mot en minuscules>": { type, recherches, trouvees, nouvelles, gardees, desactive } }
//   type        : "produit" (recherche large, mots dans n'importe quel ordre) ou "phrase" (expression exacte)
//   recherches  : nombre de recherches où le mot-clé a été utilisé
//   trouvees    : pages qui avaient des pubs avec ce mot-clé (cumul)
//   nouvelles   : pages encore inconnues de ta veille (cumul)
//   gardees     : pages ajoutées à tes pages suivies, par le module ou par toi depuis « À valider » (cumul)
//   desactive   : { le, raison } quand le nettoyage automatique a désactivé le mot-clé

export const CLE_MOTS = "motscles_stats";
export const RECHERCHES_AVANT_NETTOYAGE = 2;   // sans page gardée après 2 recherches : désactivé
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

const vide = type => ({ type, recherches: 0, trouvees: 0, nouvelles: 0, gardees: 0, desactive: null });

// Statistiques après une recherche.
// parMot : { "<mot>": { type, trouvees, nouvelles, gardees } } pour chaque mot-clé utilisé
export function bilanRecherche(stats, parMot) {
  const out = { ...(stats || {}) };
  for (const [mot, r] of Object.entries(parMot)) {
    const k = cleMot(mot);
    const s = { ...vide(r.type || "produit"), ...(out[k] || {}) };
    if (r.type) s.type = r.type;
    s.recherches += 1;
    s.trouvees += r.trouvees || 0;
    s.nouvelles += r.nouvelles || 0;
    s.gardees += r.gardees || 0;
    out[k] = s;
  }
  return out;
}

// Mots-clés à désactiver : utilisés au moins 2 fois, aucune page gardée, pas déjà désactivés
export function aDesactiver(stats) {
  return Object.entries(stats || {})
    .filter(([, s]) => !s.desactive && s.recherches >= RECHERCHES_AVANT_NETTOYAGE && !s.gardees)
    .map(([k]) => k);
}

export function marquerDesactives(stats, cles, le = new Date().toISOString()) {
  const out = { ...stats };
  for (const k of cles) out[k] = { ...out[k], desactive: { le, raison: `aucune page gardée en ${out[k].recherches} recherches` } };
  return out;
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
