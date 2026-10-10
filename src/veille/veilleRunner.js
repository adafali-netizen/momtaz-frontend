// Module Veille : déroulement d'une recherche de pages et d'un relevé automatique, piloté depuis l'ERP.
import { adsToCartes, evaluatePage, libraryPageUrl, librarySearchUrl } from "./veilleLib";
import { releverUrl } from "./veilleExt";
import {
  saveReleve, startReleve, addPageReleve, finishReleve, addMotCle, updateMotCle, createRecherche, updateRecherche, saveCandidat,
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

function verifierBlocage(res) {
  if (res.bloque === "captcha") throw new Error("Facebook demande une vérification (captcha). Recherche arrêtée : réessaie dans quelques heures.");
  if (res.bloque === "connexion") throw new Error("Facebook affiche une page de connexion. Recherche arrêtée : vérifie que le profil Chrome n'est pas connecté à Facebook et réessaie plus tard.");
}

// ctl : { stop, status(texte), log(texte) }
// ctx : { pages, produits, candidats, motscles, criteres, groupes }
export async function lancerRecherche(ctx, ctl) {
  // 1. Mots-clés : les manuels actifs + les noms de tes meilleurs produits
  const dejaMots = new Set(ctx.motscles.map(m => m.mot.toLowerCase()));
  const auto = ctx.groupes.filter(g => g.pubs >= 5).slice(0, 20).map(g => g.nom.toLowerCase().trim()).filter(m => m.length >= 4 && !dejaMots.has(m));
  for (const mot of auto) await addMotCle(mot, "produit");
  const mots = [
    ...ctx.motscles.filter(m => m.actif).map(m => ({ id: m.id, mot: m.mot })),
    ...auto.map(mot => ({ id: null, mot })),
  ];
  if (!mots.length) throw new Error("Aucun mot-clé actif.");

  const rech = await createRecherche(mots.length);
  const compte = { nb_trouvees: 0, nb_gardees: 0, nb_a_valider: 0, nb_eliminees: 0 };
  const gardees = [];
  let statut = "terminée";
  try {
    // 2. Recherche par mot-clé : on note les pages qui font de la pub
    const trouvees = new Map();
    for (let i = 0; i < mots.length && !ctl.stop; i++) {
      const { id, mot } = mots[i];
      const label = `Mot-clé ${i + 1}/${mots.length} « ${mot} »`;
      ctl.status(label);
      const res = await releverUrl(librarySearchUrl(mot), { maxAds: 150, maxScrolls: 15, idleRounds: 3, label: mot },
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
      ctl.log(`« ${mot} » : ${pagesMot.size} pages`);
      if (id) await updateMotCle(id, { nb_pages: pagesMot.size, derniere_recherche: new Date().toISOString() }).catch(() => {});
      if (i < mots.length - 1) await pause(ctl, label);
    }

    // 3. Pages jamais vues : on relève toutes leurs pubs et on applique tes critères
    const connues = new Set([...ctx.pages.map(p => p.fb_page_id), ...ctx.candidats.map(c => c.fb_page_id)]);
    const nouvelles = [...trouvees.values()].filter(t => !connues.has(t.id)).sort((a, b) => b.pubs - a.pubs);
    compte.nb_trouvees = trouvees.size;
    await updateRecherche(rech.id, compte);
    ctl.log(`${trouvees.size} pages trouvées, dont ${nouvelles.length} nouvelles à analyser`);

    for (let i = 0; i < nouvelles.length && !ctl.stop; i++) {
      await pause(ctl, `Analyse des pages ${i}/${nouvelles.length}`);
      if (ctl.stop) break;
      const t = nouvelles[i];
      const label = `Page ${i + 1}/${nouvelles.length} « ${t.nom} »`;
      ctl.status(label);
      const res = await releverUrl(libraryPageUrl(t.id), { maxScrolls: 100, idleRounds: 4, label: t.nom },
        p => ctl.status(`${label} : ${p.pubs} créatives lues`));
      verifierBlocage(res);
      const ev = evaluatePage(res.ads, ctx.criteres);
      const nom = (res.ads[0] && res.ads[0].page_name) || t.nom;
      await saveCandidat({
        fb_page_id: t.id, nom, sites: ev.sites, nb_pubs: ev.pubs, nb_produits: ev.produits,
        site_ecom: ev.siteEcom, cod: ev.cod, categorie: ev.categorie, decision: ev.decision, raison: ev.raison,
        mots_cles: [...t.mots].join(", "), apercus: ev.apercus,
        cartes: ev.decision === "eliminee" ? null : ev.cartes,
        recherche_id: rech.id, created_at: new Date().toISOString(), decide_le: null,
      });
      if (ev.decision === "gardee") { compte.nb_gardees++; gardees.push({ pageId: t.id, pageNom: nom, cartes: ev.cartes, date: new Date() }); }
      else if (ev.decision === "a_valider") compte.nb_a_valider++;
      else compte.nb_eliminees++;
      ctl.log(`${nom} : ${ev.decision === "gardee" ? "gardée" : ev.decision === "a_valider" ? "à valider" : "éliminée"} (${ev.raison})`);
      await updateRecherche(rech.id, compte);
    }
    if (ctl.stop) statut = "arrêtée";
  } catch (e) {
    statut = "erreur";
    ctl.log(e.message || String(e));
    throw e;
  } finally {
    // 4. Les pages gardées rejoignent tes pages suivies avec leurs pubs
    if (gardees.length) {
      ctl.status(`Enregistrement de ${gardees.length} pages gardées…`);
      await saveReleve(gardees, ctx.pages, ctx.produits, "extension").catch(e => ctl.log("Enregistrement des pages gardées impossible : " + e.message));
    }
    await updateRecherche(rech.id, { ...compte, statut, fin: new Date().toISOString() }).catch(() => {});
  }
  return compte;
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
export async function lancerReleve(ctx, ctl) {
  const pages = ctx.pages.filter(p => p.actif);
  const pagesConnues = new Set(ctx.pages.map(p => p.fb_page_id));
  const produitsConnus = new Set(ctx.produits.map(p => p.fb_page_id + "|" + p.produit_key));
  const totaux = { nb_pages: 0, nb_cartes: 0, nb_pubs: 0 };
  const echecs = [];
  let rel = null;
  try {
    for (let i = 0; i < pages.length && !ctl.stop; i++) {
      if (i > 0) await pause(ctl, `Relevé ${i}/${pages.length}`);
      if (ctl.stop) break;
      const p = pages[i];
      const nom = p.nom_interne || p.nom || p.fb_page_id;
      const label = `Relevé ${i + 1}/${pages.length} « ${nom} »`;
      ctl.status(label);
      const res = await releverUrl(libraryPageUrl(p.fb_page_id), { maxScrolls: 120, idleRounds: 4, label: nom },
        x => ctl.status(`${label} : ${x.pubs} créatives lues`));
      verifierBlocage(res);
      const cartes = adsToCartes(res.ads);
      if (!cartes.length) { ctl.log(`${nom} : aucune pub trouvée`); continue; }
      const f = { pageId: p.fb_page_id, pageNom: (res.ads[0] && res.ads[0].page_name) || p.nom, cartes, date: new Date() };
      try {
        if (!rel) rel = await startReleve("extension");
        const r = await addPageReleve(rel.id, f, pagesConnues, produitsConnus);
        totaux.nb_pages++; totaux.nb_cartes += r.nbCartes; totaux.nb_pubs += r.nbPubs;
        await finishReleve(rel.id, totaux).catch(() => {});
        ctl.log(`${nom} : ${cartes.length} créatives enregistrées`);
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
  return { nbPages: totaux.nb_pages };
}
