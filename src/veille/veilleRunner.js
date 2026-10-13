// Module Veille : déroulement d'une recherche de pages et d'un relevé automatique, piloté depuis l'ERP.
import { adsToCartes, evaluatePage, libraryPageUrl, librarySearchUrl, CRITERES_DEFAUT, lienPrixPossible, defaultName, productKey, couper } from "./veilleLib";
import { releverUrl, capturerPrix, attendreExtensionLibre } from "./veilleExt";
import { sauverResultat } from "./etudeStore";
import { CLE_MOTS, CLE_FILE, cleMot, typeDe, bilanRecherche, aDesactiver, marquerDesactives, motsProduitsAuto, choisirMots, ajouterAFile, prochainesPages, PAGES_PAR_SESSION, MOTS_PAR_SESSION } from "./motsLib";
import {
  saveReleve, startReleve, addPageReleve, finishReleve, addMotCle, updateMotCle, createRecherche, updateRecherche, saveCandidat,
  updateProduits, remplirPrixVide, saveConfig, CLE_FICHES, CLE_ECARTS,
} from "./veilleData";

// Pause entre deux pages Facebook (30 à 60 s) pour relever à un rythme humain
const PAUSE_MIN = typeof window !== "undefined" && window.__momtazPauseMs != null ? window.__momtazPauseMs : 30000;
const PAUSE_MAX = typeof window !== "undefined" && window.__momtazPauseMs != null ? window.__momtazPauseMs : 60000;

async function pause(ctl, label) {
  const fin = Date.now() + PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN);
  while (Date.now() < fin) {
    if (ctl.stop) return;
    ctl.status(`${label} · prochaine page dans ${Math.ceil((fin - Date.now()) / 1000)} s`);
    await new Promise(r => setTimeout(r, 1000));
  }
}

// Relève une page : d'abord pays Maroc, puis tous les pays si rien ne s'affiche.
// zeroConfirme = Facebook annonce lui-même 0 résultat (page qui a coupé ses pubs).
async function releverPage(ctl, id, label, opts) {
  const onProgress = x => ctl.status(`${label} : ${x.pubs} créatives lues`);
  let res = await releverUrl(libraryPageUrl(id, "MA"), { ...opts, label }, onProgress);
  verifierBlocage(res);
  if (res.ads.length || ctl.stop) return { ...res, zeroConfirme: false };
  const zeroMA = res.total === 0;
  // Facebook annonce 0 résultat au Maroc : la page a coupé ses pubs, inutile d'essayer tous les pays
  if (zeroMA) return { ...res, zeroConfirme: true };
  ctl.status(`${label} : rien avec le pays Maroc, essai avec tous les pays…`);
  await new Promise(r => setTimeout(r, 8000));
  res = await releverUrl(libraryPageUrl(id, "ALL"), { ...opts, label }, onProgress);
  verifierBlocage(res);
  return { ...res, zeroConfirme: !res.ads.length && (zeroMA || res.total === 0) };
}

function verifierBlocage(res) {
  if (res.bloque === "captcha") throw new Error("Facebook demande une vérification (captcha). Recherche arrêtée : réessaie dans quelques heures.");
  if (res.bloque === "connexion") throw new Error("Facebook affiche une page de connexion. Recherche arrêtée : vérifie que le profil Chrome n'est pas connecté à Facebook et réessaie plus tard.");
}

// ctl : { stop, status(texte), log(texte) }
// ctx : { pages, produits, candidats, motscles, criteres, groupes, stats, file }
// stats : rendement cumulé de chaque mot-clé (motsLib) · file : pages trouvées pas encore analysées (motsLib)
// Une recherche = au plus 40 mots-clés, puis au plus 60 pages analysées. S'il reste au moins 60 pages dans la file,
// on reprend la file sans interroger de mots-clés. Tout est enregistré au fur et à mesure.
export async function lancerRecherche(ctx, ctl) {
  const connuesAvant = new Set([...ctx.pages.map(p => p.fb_page_id), ...ctx.candidats.map(c => c.fb_page_id)]);
  let file = ajouterAFile(ctx.file || {}, [], connuesAvant);
  const repriseSeule = Object.keys(file).length >= PAGES_PAR_SESSION;

  // 1. Mots-clés : produits à 230 DH et plus qui reçoivent le plus de pubs sur 7 jours, puis tes mots-clés actifs,
  //    jamais utilisés d'abord, puis les plus rentables (40 au plus)
  let mots = [];
  if (!repriseSeule) {
    const dejaMots = new Set(ctx.motscles.map(m => cleMot(m.mot)));
    const auto = motsProduitsAuto(ctx.groupes, dejaMots);
    for (const mot of auto) await addMotCle(mot, "produit");
    const exacteGlobal = !!{ ...CRITERES_DEFAUT, ...(ctx.criteres || {}) }.expressionExacte;
    const actifs = ctx.motscles.filter(m => m.actif).map(m => ({ id: m.id, mot: m.mot, exact: typeDe(m, ctx.stats, exacteGlobal) === "phrase" }));
    mots = [...auto.map(mot => ({ id: null, mot, exact: false })), ...choisirMots(actifs, ctx.stats, Math.max(0, MOTS_PAR_SESSION - auto.length))];
    if (!mots.length && !Object.keys(file).length) throw new Error("Aucun mot-clé actif.");
  }
  const interroges = {};
  const analyse = {};
  const noter = (mot, champ) => { analyse[mot] = analyse[mot] || { analysees: 0, gardees: 0 }; analyse[mot][champ]++; };

  const rech = await createRecherche(mots.length);
  const compte = { nb_trouvees: 0, nb_gardees: 0, nb_a_valider: 0, nb_eliminees: 0 };
  const gardees = [];
  let statut = "terminée";
  const sauverFile = () => saveConfig(CLE_FILE, file).catch(e => ctl.log("File d'attente non enregistrée : " + (e.message || e)));
  try {
    // 2. Recherche par mot-clé : les pages trouvées rejoignent la file d'attente
    if (repriseSeule) ctl.log(`Reprise de la file d'attente : ${Object.keys(file).length} pages à analyser, pas de nouveaux mots-clés cette fois`);
    const trouvees = new Map();
    for (let i = 0; i < mots.length && !ctl.stop; i++) {
      const { id, mot, exact } = mots[i];
      const label = `Mot-clé ${i + 1}/${mots.length} « ${mot} »${exact ? " (exacte)" : ""}`;
      ctl.status(label);
      const res = await releverUrl(librarySearchUrl(mot, "active", "MA", exact), { maxAds: 150, maxScrolls: 15, idleRounds: 3, label: mot },
        p => ctl.status(`${label} : ${p.pubs} pubs lues`));
      verifierBlocage(res);
      const pagesMot = new Set();
      for (const a of res.ads) {
        if (!a.page_id) continue;
        pagesMot.add(a.page_id);
        const t = trouvees.get(a.page_id) || { id: a.page_id, nom: a.page_name, mots: new Set(), pubs: 0 };
        t.mots.add(mot);
        t.pubs += a.n || 1;
        trouvees.set(a.page_id, t);
      }
      const nouv = [...pagesMot].filter(p => !connuesAvant.has(p)).length;
      interroges[mot] = { type: exact ? "phrase" : "produit", trouvees: pagesMot.size, nouvelles: nouv };
      ctl.log(`« ${mot} »${exact ? " (exacte)" : ""} : ${pagesMot.size} pages, dont ${nouv} nouvelles`);
      if (id) await updateMotCle(id, { nb_pages: pagesMot.size, derniere_recherche: new Date().toISOString() }).catch(() => {});
      if (i < mots.length - 1) await pause(ctl, label);
    }
    if (mots.length) {
      file = ajouterAFile(file, [...trouvees.values()].map(t => ({ ...t, mots: [...t.mots] })), connuesAvant);
      await sauverFile();
    }
    compte.nb_trouvees = trouvees.size;
    await updateRecherche(rech.id, compte);

    // 3. Analyse des pages de la file : celles vues avec le plus de mots-clés et de pubs d'abord, 60 au plus
    const aAnalyser = ctl.stop ? [] : prochainesPages(file, PAGES_PAR_SESSION);
    ctl.log(`${trouvees.size} pages trouvées · file d'attente : ${Object.keys(file).length} pages · ${aAnalyser.length} analysées cette fois`);
    for (let i = 0; i < aAnalyser.length && !ctl.stop; i++) {
      await pause(ctl, `Analyse des pages ${i}/${aAnalyser.length}`);
      if (ctl.stop) break;
      const t = aAnalyser[i];
      const label = `Page ${i + 1}/${aAnalyser.length} « ${t.nom} »`;
      ctl.status(label);
      // 150 pubs suffisent pour juger une page
      const res = await releverPage(ctl, t.id, label, { maxAds: 150, maxScrolls: 30, idleRounds: 4 });
      if (ctl.stop && !res.ads.length) break;
      const ev = evaluatePage(res.ads, ctx.criteres);
      const nom = (res.ads[0] && res.ads[0].page_name) || t.nom;
      await saveCandidat({
        fb_page_id: t.id, nom, sites: ev.sites, nb_pubs: ev.pubs, nb_produits: ev.produits,
        site_ecom: ev.siteEcom, cod: ev.cod, categorie: ev.categorie, decision: ev.decision, raison: ev.raison,
        mots_cles: t.mots.join(", "), apercus: ev.apercus,
        cartes: ev.decision === "eliminee" ? null : ev.cartes,
        recherche_id: rech.id, created_at: new Date().toISOString(), decide_le: null,
      });
      for (const m of t.mots) noter(m, "analysees");
      if (ev.decision === "gardee") {
        compte.nb_gardees++;
        gardees.push({ pageId: t.id, pageNom: nom, cartes: ev.cartes, date: new Date() });
        for (const m of t.mots) noter(m, "gardees");
      }
      else if (ev.decision === "a_valider") compte.nb_a_valider++;
      else compte.nb_eliminees++;
      delete file[t.id];
      ctl.log(`${nom} : ${ev.decision === "gardee" ? "gardée" : ev.decision === "a_valider" ? "à valider" : "éliminée"} (${ev.raison})`);
      await updateRecherche(rech.id, compte);
      if ((i + 1) % 10 === 0) await sauverFile();
    }
    if (ctl.stop) statut = "arrêtée";
    const reste = Object.keys(file).length;
    if (reste) ctl.log(`Il reste ${reste} pages dans la file d'attente : elles seront analysées aux prochaines recherches`);
  } catch (e) {
    statut = "erreur";
    ctl.log(e.message || String(e));
    throw e;
  } finally {
    await sauverFile();
    // 4. Les pages gardées rejoignent tes pages suivies avec leurs pubs
    if (gardees.length) {
      ctl.status(`Enregistrement de ${gardees.length} pages gardées…`);
      await saveReleve(gardees, ctx.pages, ctx.produits, "extension").catch(e => ctl.log("Enregistrement des pages gardées impossible : " + e.message));
    }
    await updateRecherche(rech.id, { ...compte, statut, fin: new Date().toISOString() }).catch(() => {});
    // 5. Rendement des mots-clés et nettoyage : chaque mot-clé est jugé sur ses pages réellement analysées
    let stats = bilanRecherche(ctx.stats || {}, interroges, analyse);
    const aCouper = aDesactiver(stats);
    if (aCouper.length) {
      stats = marquerDesactives(stats, aCouper);
      const ids = new Map([...ctx.motscles.map(m => [cleMot(m.mot), m.id])]);
      for (const k of aCouper) if (ids.get(k)) await updateMotCle(ids.get(k), { actif: false }).catch(() => {});
      ctl.log(`Nettoyage : ${aCouper.length} mot${aCouper.length > 1 ? "s" : ""}-clé${aCouper.length > 1 ? "s" : ""} désactivé${aCouper.length > 1 ? "s" : ""} : ${aCouper.map(k => `${k} (${stats[k].desactive.raison})`).join(", ")}`);
    }
    await saveConfig(CLE_MOTS, stats).catch(e => ctl.log("Rendement des mots-clés non enregistré : " + (e.message || e)));
  }
  return { ...compte, file: Object.keys(file).length };
}

// Réessaie d'enregistrer les pages relevées dont l'enregistrement a échoué
export async function reessayerEnregistrement(ctx) {
  const fichiers = window.__momtazReleveNonEnregistre;
  if (!fichiers || !fichiers.length) return { nbPages: 0 };
  await saveReleve(fichiers, ctx.pages, ctx.produits, "extension");
  window.__momtazReleveNonEnregistre = null;
  return { nbPages: fichiers.length };
}

// Relève toutes les pages suivies. Chaque page est enregistrée dès qu'elle est relevée :
// rien n'est perdu si le relevé s'arrête en route.
// ctx : { pages, produits, latest, max } · latest = dernier relevé enregistré de chaque page
// Ordre : pages jamais relevées (ou dont le relevé a échoué), puis dernier relevé le plus ancien.
// max : nombre de pages pour cette session (vide = toutes)
export function pagesARelever(pages, latest, max) {
  const date = p => (latest && latest[p.fb_page_id] ? new Date(latest[p.fb_page_id].capture_le).getTime() : 0);
  const triees = pages.filter(p => p.actif)
    .map((p, i) => ({ p, i, d: date(p) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(x => x.p);
  return max > 0 ? triees.slice(0, max) : triees;
}

// ctx.ids (facultatif) : relever seulement ces pages (cases cochées dans Pages suivies)
export async function lancerReleve(ctx, ctl) {
  const pages = ctx.ids
    ? pagesARelever(ctx.pages, ctx.latest, 0).filter(p => ctx.ids.includes(p.fb_page_id))
    : pagesARelever(ctx.pages, ctx.latest, ctx.max);
  const pagesConnues = new Set(ctx.pages.map(p => p.fb_page_id));
  const produitsConnus = new Set(ctx.produits.map(p => p.fb_page_id + "|" + p.produit_key));
  const totaux = { nb_pages: 0, nb_cartes: 0, nb_pubs: 0 };
  const echecs = [];
  const nonLues = [];   // Facebook n'a rien affiché : page non enregistrée
  const sansPub = [];   // Facebook confirme 0 résultat : page enregistrée à 0 pub
  const relevees = [];   // pages enregistrées : prix et photos de leurs produits lus à la fin
  let rel = null;
  try {
    for (let i = 0; i < pages.length && !ctl.stop; i++) {
      if (i > 0) await pause(ctl, `Relevé ${i}/${pages.length}`);
      if (ctl.stop) break;
      const p = pages[i];
      const nom = p.nom_interne || p.nom || p.fb_page_id;
      const label = `Relevé ${i + 1}/${pages.length} « ${nom} »`;
      ctl.status(label);
      const res = await releverPage(ctl, p.fb_page_id, label, { maxScrolls: 120, idleRounds: 4 });
      if (ctl.stop && !res.ads.length) break;
      const cartes = adsToCartes(res.ads);
      if (!cartes.length && !res.zeroConfirme) { nonLues.push(nom); ctl.log(`${nom} : aucune pub lue, page non enregistrée (Facebook n'a rien affiché)`); continue; }
      const f = { pageId: p.fb_page_id, pageNom: (res.ads[0] && res.ads[0].page_name) || p.nom, cartes, date: new Date() };
      try {
        if (!rel) rel = await startReleve("extension");
        const r = await addPageReleve(rel.id, f, pagesConnues, produitsConnus);
        relevees.push({ f, nom, nouveaux: r.nouveaux || [] });
        totaux.nb_pages++; totaux.nb_cartes += r.nbCartes; totaux.nb_pubs += r.nbPubs;
        await finishReleve(rel.id, totaux).catch(() => {});
        if (!cartes.length) sansPub.push(nom);
        ctl.log(cartes.length ? `${nom} : ${cartes.length} créatives enregistrées` : `${nom} : plus aucune pub active (confirmé par Facebook)`);
      } catch (e) {
        echecs.push(f);
        ctl.log(`${nom} : ${cartes.length} créatives relevées mais NON enregistrées (${e.message || e})`);
      }
    }
  } finally {
    if (rel) await finishReleve(rel.id, totaux).catch(() => {});
    if (echecs.length) window.__momtazReleveNonEnregistre = echecs;
  }
  if (echecs.length) {
    throw new Error(`${echecs.length} page(s) relevée(s) mais non enregistrée(s) : ${echecs.map(f => f.pageNom).join(", ")}. Clique sur « Réessayer l'enregistrement ». Détail : voir le journal.`);
  }
  // Prix et photos des produits des pages relevées : produits sans prix, ou dont la page produit n'a jamais été lue.
  // Un prix saisi n'est jamais écrasé ; un prix introuvable reste vide (nouvel essai au relevé suivant, 6 jours plus tard au plus tôt).
  const items = aLireApresReleve(relevees, ctx.produits, ctx.fiches || {});
  const nbNouveaux = relevees.reduce((s, x) => s + x.nouveaux.length, 0);
  let bilanFiches = null;
  if (items.length && !ctl.stop) {
    ctl.log(`Prix et photos : ${items.length} pages produit à lire`);
    bilanFiches = await lancerCapturePrix(items, ctl, { fiches: ctx.fiches || {}, titre: "Prix et photos" });
  }
  return {
    nbPages: totaux.nb_pages, total: pages.length, nonLues, sansPub, arrete: !!ctl.stop, nbNouveaux,
    prixALire: items.length, prixTrouves: bilanFiches ? bilanFiches.remplis : 0, photos: bilanFiches ? bilanFiches.photos : 0,
  };
}

const SIX_JOURS = 6 * 86400000;

// Produits à lire après un relevé : un par page et par clé produit
export function aLireApresReleve(relevees, produits, fiches) {
  const rows = new Map(produits.map(p => [p.fb_page_id + "|" + p.produit_key, p]));
  const out = new Map();
  for (const { f, nom } of relevees) {
    for (const c of f.cartes) {
      if (!c.url) continue;
      const cle = f.pageId + "|" + productKey(c.url);
      if (out.has(cle)) continue;
      const row = rows.get(cle);
      const fiche = fiches[cle];
      const prixVide = !(row && row.prix != null && row.prix !== "");
      const dejaLue = fiche && fiche.le && Date.now() - new Date(fiche.le).getTime() < SIX_JOURS;
      if (fiche && (!prixVide || dejaLue)) continue;   // déjà lue : on ne revient que pour un prix encore vide, après 6 jours
      const url = row && row.url && lienPrixPossible(row.url) ? row.url : c.url;
      if (!lienPrixPossible(url)) continue;
      out.set(cle, {
        cles: [{ fb_page_id: f.pageId, produit_key: productKey(c.url) }], ids: row ? [row.id] : [],
        url, prix: prixVide ? null : row.prix, nom: (row && row.nom) || defaultName(c.url, c.texte), page: nom,
      });
    }
  }
  return [...out.values()];
}

// Étude de marché : relève toutes les pubs des mots-clés donnés.
// etat : objet partagé avec l'écran ({ resultats: [{ mot, ads, exact }] }), rempli au fil de l'eau
// opts : { statut, pays, maxPubs, exact }
export async function lancerEtude(mots, opts, etat, ctl, onMot) {
  for (let i = 0; i < mots.length && !ctl.stop; i++) {
    const mot = mots[i];
    const pays = opts.pays || "MA";
    if (etat.resultats.some(r => r.mot === mot && (r.pays || "MA") === pays)) { ctl.log(`« ${mot} » : déjà relevé pour ce pays, ignoré`); continue; }
    if (i > 0) await pause(ctl, `Étude ${i}/${mots.length}`);
    if (ctl.stop) break;
    const label = `Étude ${i + 1}/${mots.length} « ${mot} »`;
    ctl.status(label);
    const res = await releverUrl(librarySearchUrl(mot, opts.statut, pays, !!opts.exact),
      { maxAds: opts.maxPubs, maxScrolls: Math.ceil(opts.maxPubs / 8) + 10, idleRounds: 4, label: mot },
      p => ctl.status(`${label} : ${p.pubs} pubs lues`));
    verifierBlocage(res);
    const resultat = { mot, pays, ads: res.ads, exact: !!opts.exact };
    etat.resultats.push(resultat);
    // Sauvegarde dans le navigateur : l'étude survit à un rechargement ou à une fermeture de l'onglet
    let sauve = true;
    try { await sauverResultat(resultat); } catch (e) { sauve = false; etat.nonSauve = true; ctl.log(`« ${mot} » : sauvegarde impossible (${e.message || e}). Télécharge l'Excel avant de fermer l'onglet.`); }
    ctl.log(`« ${mot} » : ${res.ads.length} pubs, ${new Set(res.ads.map(a => a.page_id)).size} pages${sauve ? " · sauvegardé" : ""}`);
    onMot && onMot();
  }
  return { nbMots: etat.resultats.length, nbPubs: etat.resultats.reduce((s, r) => s + r.ads.length, 0) };
}

// Capture des prix et des photos sur les pages produit des concurrents.
// items : [{ cles: [{ fb_page_id, produit_key }], ids, url, prix, nom, page }]
// Seuls les prix vides sont enregistrés ; un prix saisi différent est signalé dans le journal.
// opts.fiches : photos déjà connues (complétées et enregistrées dans veille_config au fil de l'eau)
// opts.ecarts : écarts déjà connus entre ton prix et celui du site (mis à jour pour les produits relus)
export async function lancerCapturePrix(items, ctl, opts = {}) {
  const fiches = opts.fiches || {};
  const ecarts = opts.ecarts || null;
  let ecartsModifies = false;
  const titre = opts.titre || "Prix";
  const bilan = { total: items.length, remplis: 0, ecarts: 0, introuvables: 0, erreurs: 0, photos: 0 };
  let aSauver = 0;
  const sauverFiches = async () => {
    if (!aSauver) return;
    aSauver = 0;
    try { await saveConfig(CLE_FICHES, fiches); }
    catch (e) { ctl.log(`Photos non enregistrées (${e.message || e}) : les prix restent enregistrés.`); }
  };
  for (let i = 0; i < items.length && !ctl.stop; i++) {
    const it = items[i];
    const label = `${titre} ${i + 1}/${items.length} « ${it.nom} » (${it.page})`;
    ctl.status(label);
    try {
      let r;
      try { r = await capturerPrix(it.url); }
      catch (e) {
        // Page trop lente : l'extension finit son travail ; on attend qu'elle soit libre, puis on réessaie une fois
        if (!/ne répond plus|occupée/i.test(e.message || "")) throw e;
        ctl.status(`${label} · page lente, attente de l'extension…`);
        if (!(await attendreExtensionLibre())) throw new Error("l'extension reste occupée");
        r = await capturerPrix(it.url);
      }
      // Photos : gardées même sans prix (elles servent aux regroupements)
      const cles = it.cles || [];
      if (r && Array.isArray(r.hashes)) {
        const fiche = { i: (r.images || []).slice(0, 1), h: r.hashes.slice(0, 2), t: couper(r.titre || "", 80), le: new Date().toISOString() };
        for (const c of cles) fiches[c.fb_page_id + "|" + c.produit_key] = fiche;
        if (cles.length) aSauver++;
        if (fiche.h.length) bilan.photos++;
      }
      if (!r || !r.prix) { bilan.introuvables++; ctl.log(`${it.nom} (${it.page}) : prix introuvable, laissé vide · ${it.url}`); }
      else if (it.prix == null || it.prix === "") {
        let fait = 0;
        if (it.ids && it.ids.length) { await updateProduits(it.ids, { prix: r.prix }); fait = 1; }
        else for (const c of cles) fait += await remplirPrixVide(c.fb_page_id, c.produit_key, r.prix);
        if (fait) {
          bilan.remplis++;
          ctl.log(`${it.nom} (${it.page}) : ${r.prix} DH${r.barre ? ` (barré ${r.barre} DH)` : ""} · ${r.source}`);
        }
      } else if (Math.abs(Number(it.prix) - r.prix) >= 1) {
        bilan.ecarts++;
        ctl.log(`${it.nom} (${it.page}) : ÉCART, prix saisi ${it.prix} DH, prix sur le site ${r.prix} DH (non modifié)`);
        if (ecarts) { for (const c of cles) ecarts[c.fb_page_id + "|" + c.produit_key] = { site: r.prix, saisi: Number(it.prix), le: new Date().toISOString() }; ecartsModifies = true; }
      } else if (ecarts) {
        for (const c of cles) { const k = c.fb_page_id + "|" + c.produit_key; if (ecarts[k]) { delete ecarts[k]; ecartsModifies = true; } }
      }
    } catch (e) {
      bilan.erreurs++;
      ctl.log(`${it.nom} (${it.page}) : lecture impossible, prix laissé vide (${e.message || e})`);
    }
    if (aSauver >= 20) await sauverFiches();
    if (i < items.length - 1 && !ctl.stop) {
      const fin = Date.now() + 1000 + Math.random() * 1000;
      while (Date.now() < fin && !ctl.stop) { ctl.status(`${label} · suivant dans ${Math.ceil((fin - Date.now()) / 1000)} s`); await new Promise(r => setTimeout(r, 500)); }
    }
  }
  await sauverFiches();
  if (ecartsModifies) {
    try { await saveConfig(CLE_ECARTS, ecarts); }
    catch (e) { ctl.log(`Écarts de prix non enregistrés (${e.message || e}).`); }
  }
  ctl.log(`${titre} : ${bilan.remplis} prix trouvé${bilan.remplis > 1 ? "s" : ""}, ${bilan.introuvables + bilan.erreurs} laissé${bilan.introuvables + bilan.erreurs > 1 ? "s" : ""} vide${bilan.introuvables + bilan.erreurs > 1 ? "s" : ""}, ${bilan.photos} produit${bilan.photos > 1 ? "s" : ""} avec photo, sur ${items.length}`);
  bilan.arrete = !!ctl.stop;
  return bilan;
}
