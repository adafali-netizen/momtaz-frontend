// Module Décision de test : compte par colis livré, verdict GO / STOP, coût d'un test.
// Classement des charges :
//   Prix de vente
//   − Prix d'achat livré (produit rendu dans ton stock)            = MARGE BRUTE
//   − Frais variables par colis livré : livraison, emballage et stockage, confirmation et suivi, sécurité
//                                                                    = MARGE SUR COÛTS DIRECTS
//   − Publicité par colis livré (CPL ÷ taux de confirmation ÷ taux de livraison)
//                                                                    = MARGE NETTE PAR COLIS LIVRÉ
// Les frais fixes du mois (abonnements, recharges…) ne jugent pas un produit : ils donnent le nombre de colis
// livrés par mois nécessaire pour les couvrir. Les créatives sont le coût d'entrée d'un test.

export const CLE_PARAMS = "decision_params";
export const CLE_DECISIONS = "decisions";

export const PARAMS_DEFAUT = {
  livraison: 35,          // DH par colis livré (grands produits : à préciser produit par produit)
  emballage: 5,           // stockage et emballage
  confirmation: 10,       // confirmation et suivi
  securite: 10,           // casse et imprévus
  tauxConfirmation: 65,   // %
  tauxLivraison: 65,      // %
  cplReference: 25,       // DH : CPL de référence pour juger un produit avant le test
  netMinimum: 10,         // DH : marge nette minimum par colis livré pendant le test
  creativesParTest: 3,    // décidé par le media buyer
  prixCreative: 200,      // DH
  leadsTest: 20,          // un produit est jugé à 20 leads
  budgetTest: 20000,      // DH, hors salaire
  fraisFixes: [],         // [{ nom, montant }] par mois
};

export const params = p => ({ ...PARAMS_DEFAUT, ...(p || {}) });
const n = v => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const arrondi = v => (v == null ? null : Math.round(v * 100) / 100);

// Compte d'un produit. d : { achat, prixVente, livraison } saisis dans le module ; prixConcurrent : prix lu chez le concurrent
export function compteProduit(d, prixConcurrent, p0) {
  const p = params(p0);
  const prix = n(d && d.prixVente) ?? n(prixConcurrent);
  const achat = n(d && d.achat);
  const livraison = n(d && d.livraison) ?? p.livraison;
  const taux = (p.tauxConfirmation / 100) * (p.tauxLivraison / 100);
  const fraisColis = livraison + p.emballage + p.confirmation + p.securite;
  const pubParColis = p.cplReference / taux;
  const c = { prix, achat, livraison, taux, fraisColis, pubParColis: arrondi(pubParColis) };
  if (prix == null) return { ...c, verdict: "prix", raison: "Prix de vente à saisir" };

  // Prix d'achat maximum pour rester GO au CPL de référence
  c.achatMax = Math.floor(prix - fraisColis - pubParColis - p.netMinimum);
  if (achat == null) return { ...c, verdict: "achat", raison: `Prix d'achat livré à saisir (GO si ${c.achatMax} DH au plus)` };

  c.margeBrute = prix - achat;
  c.margeDirecte = c.margeBrute - fraisColis;                         // avant publicité
  c.netAuCplReference = arrondi(c.margeDirecte - pubParColis);
  c.cplPlafond = arrondi((c.margeDirecte - p.netMinimum) * taux);     // CPL au-delà duquel il reste moins du minimum
  c.cplPointMort = arrondi(c.margeDirecte * taux);                    // CPL au-delà duquel chaque colis perd de l'argent

  // Coût d'un test : créatives + 20 leads au CPL de référence, moins la marge des colis livrés pendant le test
  const pub = p.leadsTest * p.cplReference;
  const creatives = p.creativesParTest * p.prixCreative;
  const colis = p.leadsTest * taux;
  c.test = {
    creatives, pub, colis: arrondi(colis),
    recupere: arrondi(Math.max(0, colis * c.margeDirecte)),
    pire: creatives + pub,                                             // aucun colis livré
    probable: arrondi(creatives + pub - Math.max(0, colis * c.margeDirecte)),
  };

  // Colis livrés par mois pour couvrir les frais fixes
  const fixes = (p.fraisFixes || []).reduce((s, f) => s + (n(f.montant) || 0), 0);
  c.fraisFixes = fixes;
  c.colisPourFixes = fixes && c.netAuCplReference > 0 ? Math.ceil(fixes / c.netAuCplReference) : null;

  if (c.netAuCplReference >= p.netMinimum) {
    c.verdict = "go";
    c.raison = `Il reste ${c.netAuCplReference} DH nets par colis livré à ${p.cplReference} DH de CPL (minimum ${p.netMinimum} DH). CPL plafond : ${c.cplPlafond} DH.`;
  } else {
    c.verdict = "stop";
    c.raison = c.netAuCplReference < 0
      ? `Perte de ${Math.abs(c.netAuCplReference)} DH par colis livré à ${p.cplReference} DH de CPL. Achat maximum pour passer : ${c.achatMax} DH.`
      : `Seulement ${c.netAuCplReference} DH nets par colis livré à ${p.cplReference} DH de CPL (minimum ${p.netMinimum} DH). Achat maximum pour passer : ${c.achatMax} DH.`;
  }
  return c;
}

// Lignes du compte par colis livré, pour l'affichage
export function lignesCompte(c, p0) {
  const p = params(p0);
  if (c.achat == null || c.prix == null) return [];
  return [
    { label: "Prix de vente", v: c.prix, fort: true },
    { label: "Prix d'achat livré", v: -c.achat },
    { label: "Marge brute", v: c.margeBrute, total: true },
    { label: "Livraison", v: -c.livraison },
    { label: "Emballage et stockage", v: -p.emballage },
    { label: "Confirmation et suivi", v: -p.confirmation },
    { label: "Sécurité (casse, imprévus)", v: -p.securite },
    { label: "Marge sur coûts directs", v: c.margeDirecte, total: true },
    { label: `Publicité (CPL ${p.cplReference} DH ÷ ${p.tauxConfirmation} % ÷ ${p.tauxLivraison} %)`, v: -c.pubParColis },
    { label: "Marge nette par colis livré", v: c.netAuCplReference, total: true, fort: true },
  ];
}

// Fiche courte à coller dans la discussion avec Claude (étape 1 : étude produit)
export function ficheTexte(g, d, c, p0) {
  const p = params(p0);
  const lignes = [
    `PRODUIT : ${g.nom}`,
    `Pages vendeuses : ${g.vendors.map(v => `${v.page} (${v.pubs} pubs, ${v.prix ? v.prix + " DH" : "prix ?"})`).join(" · ")}`,
    `Créatives : ${g.crea} · pubs actives : ${g.pubs} · lancées sur 7 jours : ${g.recent} · plus ancienne : ${g.age} jours`,
    `Prix de vente visé : ${c.prix ?? "à vérifier"} DH · prix d'achat livré : ${c.achat ?? "à vérifier"} DH`,
    c.verdict === "go" || c.verdict === "stop"
      ? `Compte par colis livré : marge brute ${c.margeBrute} DH, marge sur coûts directs ${c.margeDirecte} DH, nette ${c.netAuCplReference} DH à ${p.cplReference} DH de CPL, CPL plafond ${c.cplPlafond} DH`
      : `Compte : ${c.raison}`,
    `Verdict du module : ${c.verdict === "go" ? "GO" : c.verdict === "stop" ? "STOP" : "incomplet"} · ${c.raison}`,
    g.sante ? "Attention : angle santé chez le concurrent, angle à changer." : "",
    `Pages produit : ${g.vendors.flatMap(v => v.urls || []).slice(0, 4).join(" · ") || "à vérifier"}`,
    `Textes des pubs : ${g.cartes.slice(0, 3).map(x => `« ${String(x.texte || "").slice(0, 160)} »`).join(" / ")}`,
    `Vidéos : ${g.cartes.filter(x => x.media).slice(0, 3).map(x => x.media).join(" · ") || "à vérifier"} (les liens expirent après 2 à 4 jours)`,
    d && d.note ? `Note : ${d.note}` : "",
  ];
  return lignes.filter(Boolean).join("\n");
}

export const ETATS = {
  "": "À étudier",
  file: "Dans la file de test",
  test: "En test",
  gagnant: "Gagnant",
  abandon: "Abandonné",
};
