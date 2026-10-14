import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildGroups, suggestionsRegroupement, tachesAFaire, pagesALire, candidatTest } from "./veille/veilleLib";
import { loadVeille, loadRecherche, updateProduits, updatePage, saveConfig, CLE_REFUS } from "./veille/veilleData";
import { detecterExtension, arreterExtension } from "./veille/veilleExt";
import { lancerRecherche, lancerReleve, lancerEtude, reessayerEnregistrement, pagesARelever, lancerCapturePrix } from "./veille/veilleRunner";
import ImportModal from "./veille/ImportModal";
import Classement from "./veille/Classement";
import PagesSuivies from "./veille/PagesSuivies";
import Historique from "./veille/Historique";
import Recherche from "./veille/Recherche";
import Regroupements from "./veille/Regroupements";
import AFaire from "./veille/AFaire";
import Decision from "./veille/Decision";
import { CLE_PARAMS, CLE_DECISIONS } from "./veille/decisionLib";
import EtudeMarche, { etudeEtat, telechargerEtude } from "./veille/EtudeMarche";
import Synthese from "./veille/Synthese";
import { nichesPages, CLE_NICHES } from "./veille/nichesLib";
import { PAGES_PAR_SESSION } from "./veille/motsLib";

// 4 onglets, chacun avec ses vues. Les anciens noms d'onglet mènent à la bonne vue.
const VUES = {
  classement: ["produits", "classement"], top: ["produits", "top"], regroupements: ["produits", "regroupements"],
  decision: ["decision", "decision"],
  pages: ["pages", "suivies"], suivies: ["pages", "suivies"], recherche: ["pages", "trouver"], trouver: ["pages", "trouver"],
  historique: ["outils", "historique"], etude: ["outils", "etude"],
};

// Bilan affiché à la fin d'un relevé : pages enregistrées, pages sans pub, pages que Facebook n'a pas affichées
function bilanReleve(res) {
  if (res.total == null) return `Relevé terminé : ${res.nbPages} pages enregistrées.`;
  let m = `Relevé ${res.arrete ? "arrêté" : "terminé"} : ${res.nbPages} page${res.nbPages > 1 ? "s" : ""} enregistrée${res.nbPages > 1 ? "s" : ""} sur ${res.total}.`;
  if (res.sansPub.length) m += ` Plus aucune pub active (confirmé par Facebook) : ${res.sansPub.join(", ")}.`;
  if (res.nonLues.length) m += ` NON enregistrées, Facebook n'a rien affiché : ${res.nonLues.join(", ")}.`;
  if (res.nbNouveaux) m += ` ${res.nbNouveaux} nouveau${res.nbNouveaux > 1 ? "x" : ""} produit${res.nbNouveaux > 1 ? "s" : ""}.`;
  if (res.prixALire) m += ` Pages produit lues : ${res.prixALire}, ${res.prixTrouves} prix trouvé${res.prixTrouves > 1 ? "s" : ""} (les autres restent vides), ${res.photos} avec photo.`;
  return m;
}

const TITRES_JOURNAL = { releve: "du dernier relevé", recherche: "de la dernière recherche", etude: "de la dernière étude", prix: "de la dernière capture de prix" };

const fmtDate = d => d ? new Date(d).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "—";

export default function Veille() {
  const [data,     setData]     = useState(null);
  const [erreur,   setErreur]   = useState("");
  const [vue,      setVue]      = useState(() => { try { return VUES[localStorage.getItem("momtaz_veille_vue")] ? localStorage.getItem("momtaz_veille_vue") : "classement"; } catch { return "classement"; } });
  const setOnglet = v => { setVue(v); try { localStorage.setItem("momtaz_veille_vue", v); } catch { /* stockage indisponible */ } };
  const [onglet, sousVue] = VUES[vue] || VUES.classement;
  const [menu,     setMenu]     = useState(false);   // menu « Mettre à jour »
  const [importer, setImporter] = useState(false);
  const [message,  setMessage]  = useState("");
  const [ext,      setExt]      = useState(null);
  const [run,      setRun]      = useState(null);   // { type, status, logs }
  const [version,  setVersion]  = useState(0);
  const [journal,  setJournal]  = useState(null);   // { type, lignes, fin } : gardé après la fin de la tâche
  const [journalOuvert, setJournalOuvert] = useState(true);
  const [dernierType, setDernierType] = useState(null);   // type de la dernière tâche lancée
  const [preset, setPreset] = useState(null);   // filtre imposé au Classement par le bandeau « À faire »
  // Nombre de pages par relevé (vide = toutes), mémorisé dans ce navigateur
  const [maxReleve, setMaxReleve] = useState(() => { try { return localStorage.getItem("momtaz_releve_max") || ""; } catch { return ""; } });
  useEffect(() => { try { localStorage.setItem("momtaz_releve_max", maxReleve); } catch { /* stockage indisponible */ } }, [maxReleve]);
  const ctlRef = useRef(null);

  const charger = useCallback(async () => {
    try { setData(await loadVeille()); setErreur(""); }
    catch (e) { setErreur("Impossible de charger la veille : " + (e.message || e) + ". As-tu lancé le SQL du module Veille dans Supabase ?"); }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Détection de l'extension Chrome (navigateur sans compte Facebook)
  useEffect(() => {
    let actif = true;
    const verifier = () => detecterExtension().then(r => actif && setExt(r));
    verifier();
    const t = setInterval(verifier, 15000);
    return () => { actif = false; clearInterval(t); };
  }, []);

  // Empêche de fermer l'onglet par erreur pendant une tâche
  useEffect(() => {
    if (!run) return;
    const f = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [run]);

  const pages = data?.pages || [];

  const pageInfo = useCallback(id => {
    const p = pages.find(x => x.fb_page_id === id);
    return { nom: p?.nom_interne || p?.nom || "Page " + id, page: p };
  }, [pages]);

  const homonymes = useMemo(() => {
    const parNom = {};
    for (const p of pages) if (p.nom) (parNom[p.nom.toLowerCase()] = parNom[p.nom.toLowerCase()] || []).push(p);
    const s = new Set();
    for (const liste of Object.values(parNom)) if (liste.length > 1) for (const p of liste) if (!p.nom_interne) s.add(p.fb_page_id);
    return s;
  }, [pages]);

  const groups = useMemo(() => data ? buildGroups(data.pubs, data.refDates, data.produits, id => pageInfo(id).nom, data.presence, data.fiches) : [], [data, pageInfo]);

  // Regroupements proposés (même photo produit ou mots communs), sans les paires refusées
  const refuses = useMemo(() => new Set(data?.refuses || []), [data]);
  const suggestions = useMemo(() => suggestionsRegroupement(groups, { refuses }), [groups, refuses]);

  // Réglages, décisions, niches corrigées et commandes test : gardés dans veille_config
  const sauverConfigVeille = useCallback(async (cle, champ, valeur) => {
    setData(d => ({ ...d, [champ]: valeur }));
    try { await saveConfig(cle, valeur); }
    catch (e) { setErreur("Modification non enregistrée : " + (e.message || e)); }
  }, []);

  // Niche de chaque page : calculée sur ses produits, corrigée à la main si besoin
  const nichesAuto = useMemo(() => nichesPages(groups), [groups]);
  const niches = useMemo(() => ({ ...nichesAuto, ...(data?.nichesPages || {}) }), [nichesAuto, data]);
  const corrigerNiche = (pageId, n) => {
    const m = { ...(data?.nichesPages || {}) };
    if (n) m[pageId] = n; else delete m[pageId];
    sauverConfigVeille(CLE_NICHES, "nichesPages", m);
  };

  const refuserPaire = useCallback(async cle => {
    const liste = [...new Set([...(data?.refuses || []), cle])];
    setData(d => ({ ...d, refuses: liste }));
    try { await saveConfig(CLE_REFUS, liste); }
    catch (e) { setErreur("Refus non enregistré : " + (e.message || e)); }
  }, [data]);

  const patchProduits = useCallback(async (ids, champs) => {
    try {
      await updateProduits(ids, champs);
      setData(d => ({ ...d, produits: d.produits.map(p => ids.includes(p.id) ? { ...p, ...champs } : p) }));
    } catch (e) { setErreur("Modification non enregistrée : " + (e.message || e)); }
  }, []);

  const patchPage = useCallback(async (id, champs) => {
    try {
      await updatePage(id, champs);
      setData(d => ({ ...d, pages: d.pages.map(p => p.fb_page_id === id ? { ...p, ...champs } : p) }));
    } catch (e) { setErreur("Modification non enregistrée : " + (e.message || e)); }
  }, []);

  // Lance une tâche longue (recherche ou relevé) et suit son avancement
  const lancer = async (type, fn) => {
    if (run) return;
    const lignes = [];   // journal complet, gardé à l'écran après la fin
    const ctl = {
      stop: false,
      status: t => setRun(r => r && { ...r, status: t }),
      log: t => {
        const l = `${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${t}`;
        lignes.push(l);
        setRun(r => r && { ...r, logs: [l, ...r.logs].slice(0, 30) });
      },
    };
    ctlRef.current = ctl;
    setRun({ type, status: "Démarrage…", logs: [] });
    setErreur("");
    setMessage("");
    setJournal(null);
    setDernierType(type);
    try {
      const res = await fn(ctl);
      setMessage(type === "etude"
        ? `Étude terminée : ${res.nbMots} mot${res.nbMots > 1 ? "s" : ""}-clé${res.nbMots > 1 ? "s" : ""}, ${res.nbPubs} pubs.`
        : type === "releve"
        ? bilanReleve(res)
        : type === "prix"
        ? `Capture ${res.arrete ? "arrêtée" : "terminée"} : ${res.remplis} prix remplis, ${res.ecarts} écart${res.ecarts > 1 ? "s" : ""} avec tes prix, ${res.introuvables + res.erreurs} laissé${res.introuvables + res.erreurs > 1 ? "s" : ""} vide${res.introuvables + res.erreurs > 1 ? "s" : ""}, ${res.photos} avec photo, sur ${res.total} pages produit. Détail dans le journal.`
        : `${res.collecte ? "Collecte" : "Recherche"} terminée : ${res.nb_trouvees} pages trouvées, ${res.nb_gardees} gardées, ${res.nb_a_valider} à valider, ${res.nb_eliminees} éliminées.${res.file ? ` ${res.file} pages restent dans la file d'attente : relance une recherche pour les analyser.` : ""}`);
    } catch (e) {
      setErreur((type === "etude" ? "Étude interrompue (les résultats déjà relevés sont gardés) : " : type === "releve" ? "Relevé interrompu : " : type === "prix" ? "Capture des prix interrompue (les prix déjà trouvés sont enregistrés) : " : "Recherche interrompue : ") + (e.message || e));
    } finally {
      ctlRef.current = null;
      if (lignes.length) { setJournal({ type, lignes: [...lignes], fin: new Date() }); setJournalOuvert(true); }
      setRun(null);
      await charger();
      setVersion(v => v + 1);
    }
  };

  const arreter = () => {
    if (ctlRef.current) ctlRef.current.stop = true;
    arreterExtension();
    setRun(r => r && { ...r, status: "Arrêt en cours, enregistrement de ce qui a déjà été relevé…" });
  };

  const lancerUneRecherche = (rech, rechargerRecherche, options = {}) => lancer("recherche", async ctl => {
    const res = await lancerRecherche({
      ...options,
      pages, produits: data.produits, candidats: rech.candidats, motscles: rech.motscles, criteres: rech.criteres, groupes: groups, stats: rech.stats, file: rech.file,
    }, ctl);
    await rechargerRecherche();
    return res;
  });

  // Depuis le menu « Mettre à jour » : collecte de nouvelles pages ou analyse de la file, sans passer par l'onglet Pages
  const rechercheDepuisMenu = async mode => {
    setMenu(false);
    try {
      const rech = await loadRecherche();
      let maxPages = PAGES_PAR_SESSION;
      try { maxPages = Number(localStorage.getItem("momtaz_pages_session")) || PAGES_PAR_SESSION; } catch { /* stockage indisponible */ }
      lancerUneRecherche(rech, async () => {}, mode === "collecte" ? { mode: "collecte" } : { maxPages });
    } catch (e) { setErreur("Recherche impossible : " + (e.message || e)); }
  };

  const lancerUneEtude = (mots, opts) => lancer("etude", ctl => lancerEtude(mots, opts, etudeEtat, ctl, () => setVersion(v => v + 1)));

  const lancerUnReleve = () => lancer("releve", ctl => lancerReleve({ pages, produits: data.produits, latest: data.latest, fiches: { ...data.fiches }, max: Number(maxReleve) || 0 }, ctl));
  const capturerLesPrix = items => lancer("prix", ctl => lancerCapturePrix(items, ctl, { fiches: { ...data.fiches }, ecarts: { ...data.ecarts }, titre: "Prix et photos" }));
  const releverSelection = ids => lancer("releve", ctl => lancerReleve({ pages, produits: data.produits, latest: data.latest, fiches: { ...data.fiches }, ids }, ctl));

  if (!data && !erreur) return <div className="loading-screen"><span className="loading-dot" />Chargement de la veille…</div>;

  const releves = data?.releves || [];
  const actives = pages.filter(p => p.actif).length;
  const aRelever = data ? pagesARelever(pages, data.latest, Number(maxReleve) || 0) : [];
  const jamais = data ? pages.filter(p => p.actif && !data.latest[p.fb_page_id]).length : 0;
  const pubsActives = groups.reduce((s, g) => s + g.pubs, 0);

  // Bandeau « À faire »
  const { taches, prochaine } = data ? tachesAFaire({ groupes: groups, suggestions, ecarts: data.ecarts, pages, latest: data.latest, ext, homonymes }) : { taches: [], prochaine: null };
  const agir = t => {
    if (t.id === "releve") {
      if (window.confirm(`Relever ${t.ids.length} page${t.ids.length > 1 ? "s" : ""} maintenant ? Une page toutes les 30 à 60 secondes, puis lecture des prix et photos.`)) releverSelection(t.ids);
    } else if (t.id === "lire") {
      const items = pagesALire(groups);
      const minutes = Math.ceil(items.length * 6 / 60);
      if (window.confirm(`Lire le prix et les photos de ${items.length} pages produit ? Environ ${minutes} minute${minutes > 1 ? "s" : ""} au plus. Les prix introuvables restent vides.`)) capturerLesPrix(items);
    } else if (t.id === "ecarts" || t.id === "saisir") {
      setPreset({ prix: t.id, n: Date.now() });
      setOnglet("classement");
    } else if (t.id === "regroupements") setOnglet("regroupements");
    else if (t.id === "homonymes") setOnglet("suivies");
  };
  const enScale = groups.filter(g => g.pubs >= 20 && g.recent > 0).length;
  const nbCreas = groups.reduce((s, g) => s + g.crea, 0);
  const nbCandidats = groups.filter(candidatTest).length;
  const nbALire = pagesALire(groups).length;

  // Téléchargement de l'étude depuis n'importe quel onglet
  const boutonExcel = (
    <button className="btn btn-sm btn-primary" onClick={() => telechargerEtude().catch(e => setErreur("Téléchargement impossible : " + (e.message || e)))}>
      Télécharger le fichier Excel
    </button>
  );

  const ONGLETS = [
    { id: "produits", vue: "classement", label: "Produits" },
    { id: "decision", vue: "decision", label: "Décision" },
    { id: "pages", vue: "suivies", label: `Pages (${actives})` },
    { id: "outils", vue: "historique", label: "Outils" },
  ];
  const SOUS = {
    produits: [["classement", "Classement"], ["top", "Top marché et vendeurs"], ["regroupements", `Regroupements à valider (${suggestions.length})`]],
    pages: [["suivies", `Pages suivies (${actives})`], ["trouver", "Trouver de nouvelles pages"]],
    outils: [["historique", "Historique des relevés"], ["etude", "Étude de marché"]],
  };
  const action = (label, detail, fn, actif = true) => (
    <button className="btn btn-secondary" style={{ justifyContent: "flex-start", textAlign: "left", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, width: "100%" }}
      disabled={!actif} onClick={fn}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span className="col-muted" style={{ fontSize: 11, fontWeight: 400 }}>{detail}</span>
    </button>
  );

  return (
    <>
      <div className="module-header">
        <div className="module-title-row" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="module-title">Veille concurrentielle</div>
            <div className="module-subtitle">
              {actives} pages · {pubsActives.toLocaleString("fr-FR")} pubs actives · {groups.length} produits · {nbCreas} créatives · {enScale} en scale · <b>{nbCandidats} candidats au test</b>
              {" · "}relevé : {fmtDate(releves[0]?.created_at)}
              {" · "}
              <span style={{ color: ext ? "var(--green)" : "var(--muted2)", fontWeight: 600 }}>{ext ? `extension v${ext.version}` : "extension non détectée"}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", position: "relative" }}>
            {run
              ? <button className="btn btn-danger" onClick={arreter}>Arrêter</button>
              : <button className="btn btn-primary" onClick={() => setMenu(m => !m)} disabled={!data}>Mettre à jour ▾</button>}
            {menu && !run && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, width: 340, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {!ext && <div style={{ fontSize: 12, color: "var(--orange)" }}>Extension non détectée : ouvre l'ERP dans le Chrome où elle est installée.</div>}
                <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                  {action(`Relever les pages suivies (${aRelever.length})`, "Pubs des pages suivies, puis prix et photos des nouveaux produits", () => { setMenu(false); lancerUnReleve(); }, !!ext && !!actives)}
                  <input type="number" min={1} max={actives || 1} className="form-input" style={{ width: 64, padding: "6px 8px" }} title={`Nombre de pages (vide = toutes). Les pages jamais relevées (${jamais}) passent en premier.`}
                    placeholder={String(actives)} value={maxReleve} onChange={e => setMaxReleve(e.target.value.replace(/[^0-9]/g, ""))} />
                </div>
                {action(`Lire prix et photos (${nbALire})`, "Pages produit pas encore lues", () => {
                  setMenu(false);
                  const items = pagesALire(groups);
                  const minutes = Math.ceil(items.length * 6 / 60);
                  if (window.confirm(`Lire le prix et les photos de ${items.length} pages produit ? Environ ${minutes} minute${minutes > 1 ? "s" : ""} au plus.`)) capturerLesPrix(items);
                }, !!ext && nbALire > 0)}
                {action("Collecter de nouvelles pages", "Tous tes mots-clés actifs, pages mises dans la file sans analyse", () => rechercheDepuisMenu("collecte"), !!ext)}
                {action("Analyser la file", "Nouveaux mots-clés puis pages de la file, celles vues le plus souvent d'abord", () => rechercheDepuisMenu("analyse"), !!ext)}
                <button className="btn btn-sm btn-secondary" onClick={() => { setMenu(false); setImporter(true); }}>Importer des fichiers .mhtml</button>
              </div>
            )}
          </div>
        </div>
        <div className="filter-tabs" style={{ paddingBottom: SOUS[onglet] ? 6 : 12 }}>
          {ONGLETS.map(o => (
            <button key={o.id} className={`filter-tab${onglet === o.id ? " active" : ""}`} onClick={() => setOnglet(o.vue)}>{o.label}</button>
          ))}
        </div>
        {SOUS[onglet] && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 10 }}>
            {SOUS[onglet].map(([id, l]) => (
              <button key={id} onClick={() => setOnglet(id)}
                style={{ border: "1px solid var(--border)", borderRadius: 99, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontWeight: sousVue === id ? 700 : 500,
                  background: sousVue === id ? "var(--blue-lt)" : "var(--surface)", color: sousVue === id ? "var(--blue)" : "var(--text)" }}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {data && !run && <AFaire taches={taches} prochaine={prochaine} onAction={agir} occupe={!!run || !ext} />}

      {run && (
        <div className="alert-banner" style={{ background: "var(--blue-lt)", color: "var(--blue)", border: "1px solid #BFDBFE", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <span style={{ fontWeight: 700 }}><span className="loading-dot" /> {run.type === "etude" ? "Étude en cours" : run.type === "releve" ? "Relevé en cours" : run.type === "prix" ? "Capture des prix en cours" : "Recherche en cours"} : {run.status}</span>
            <button className="btn btn-sm btn-danger" onClick={arreter}>Arrêter</button>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Laisse cet onglet ouvert et ne réduis pas la fenêtre de l'extension.</div>
          {run.logs.slice(0, 5).map((l, i) => <div key={i} style={{ fontSize: 12, color: "var(--text)" }}>{l}</div>)}
        </div>
      )}
      {erreur && <div className="alert-banner" style={{ background: "var(--red-lt)", color: "var(--red)", border: "1px solid #FECACA", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span>{erreur}</span>
        {dernierType === "etude" && !run && etudeEtat.resultats.length > 0 && boutonExcel}
        {window.__momtazReleveNonEnregistre && !run && (
          <button className="btn btn-sm btn-danger" onClick={() => lancer("releve", () => reessayerEnregistrement({ pages, produits: data.produits }))}>Réessayer l'enregistrement</button>
        )}
      </div>}
      {message && !run && <div className="alert-banner" style={{ background: "var(--green-lt)", color: "var(--green)", border: "1px solid #BBF7D0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {message}
          {dernierType === "etude" && etudeEtat.resultats.length > 0 && boutonExcel}
        </span>
        <button className="btn-close" onClick={() => setMessage("")}>×</button>
      </div>}

      {journal && !run && (
        <div style={{ margin: "12px 24px 0", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px" }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              Journal {TITRES_JOURNAL[journal.type] || ""} · {journal.lignes.length} ligne{journal.lignes.length > 1 ? "s" : ""} · fini à {journal.fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard?.writeText(journal.lignes.join("\n")).catch(() => {})}>Copier</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setJournalOuvert(o => !o)}>{journalOuvert ? "Réduire" : "Afficher"}</button>
              <button className="btn-close" title="Fermer le journal" onClick={() => setJournal(null)}>×</button>
            </span>
          </div>
          {journalOuvert && (
            <div style={{ maxHeight: 260, overflowY: "auto", borderTop: "1px solid var(--border)", padding: "8px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
              {journal.lignes.map((l, i) => (
                <div key={i} style={{ fontSize: 12, color: /non enregistr|impossible|aucune pub lue/i.test(l) ? "var(--red)" : "var(--text)", fontWeight: /non enregistr|impossible|aucune pub lue/i.test(l) ? 600 : 400 }}>{l}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {data && sousVue === "classement" && (
        <Classement groups={groups} pages={pages} pageInfo={pageInfo} onPatch={patchProduits} dateReleve={releves[0]?.created_at}
          ext={ext} run={run} onCapturerPrix={capturerLesPrix} ecarts={data.ecarts} preset={preset} />
      )}
      {data && sousVue === "top" && (
        <Synthese groups={groups} nichesPages={niches} nichesAuto={nichesAuto} nichesManuelles={data.nichesPages || {}} commandes={data.commandesTest || {}}
          onSaveConfig={sauverConfigVeille}
          onVoirProduit={nom => { setPreset({ q: nom, ouvrir: nom.toLowerCase(), n: Date.now() }); setOnglet("classement"); }} />
      )}
      {data && sousVue === "regroupements" && (
        <Regroupements suggestions={suggestions} ext={ext} onPatch={patchProduits} onRefuser={refuserPaire}
          nbPhotos={Object.values(data.fiches || {}).filter(f => f.h && f.h.length).length} nbProduits={data.produits.length} />
      )}
      {data && sousVue === "decision" && (
        <Decision groups={groups} parametres={data.decisionParams} decisions={data.decisions || {}} onPatch={patchProduits}
          onSaveParams={v => sauverConfigVeille(CLE_PARAMS, "decisionParams", v)}
          onSaveDecisions={v => sauverConfigVeille(CLE_DECISIONS, "decisions", v)} />
      )}
      {data && sousVue === "suivies" && (
        <PagesSuivies pages={pages} groups={groups} latest={data.latest} pageInfo={pageInfo} homonymes={homonymes} onReload={charger} onPatchPage={patchPage}
          ext={ext} run={run} onRelever={releverSelection}
          niches={niches} nichesAuto={nichesAuto} nichesManuelles={data.nichesPages || {}} onNiche={corrigerNiche}
          onVoirProduit={(pageId, nom) => { setPreset({ page: pageId, q: nom, ouvrir: nom.toLowerCase(), n: Date.now() }); setOnglet("classement"); }} />
      )}
      {data && sousVue === "historique" && (
        <Historique releves={releves} relevePages={data.relevePages} produits={data.produits} pageInfo={pageInfo} onReload={charger} />
      )}
      {data && sousVue === "trouver" && (
        <Recherche ext={ext} run={run} onLancer={lancerUneRecherche} onStop={arreter}
          pages={pages} produits={data.produits} onReloadVeille={charger} version={version} />
      )}
      {data && sousVue === "etude" && (
        <EtudeMarche ext={ext} run={run} onLancer={lancerUneEtude} onStop={arreter} version={version} />
      )}

      {importer && data && (
        <ImportModal
          pages={pages}
          produits={data.produits}
          onClose={() => setImporter(false)}
          onSaved={async res => {
            setImporter(false);
            setMessage(`Relevé enregistré : ${res.nbCartes} créatives, ${res.nbPubs} pubs, ${res.nbNouveauxProduits} nouveaux produits.`);
            await charger();
          }}
        />
      )}
    </>
  );
}
