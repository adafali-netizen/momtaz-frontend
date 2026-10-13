import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildGroups } from "./veille/veilleLib";
import { loadVeille, updateProduits, updatePage } from "./veille/veilleData";
import { detecterExtension, arreterExtension } from "./veille/veilleExt";
import { lancerRecherche, lancerReleve, lancerEtude, reessayerEnregistrement, pagesARelever, lancerCapturePrix } from "./veille/veilleRunner";
import ImportModal from "./veille/ImportModal";
import Classement from "./veille/Classement";
import PagesSuivies from "./veille/PagesSuivies";
import Historique from "./veille/Historique";
import Recherche from "./veille/Recherche";
import EtudeMarche, { etudeEtat, telechargerEtude } from "./veille/EtudeMarche";

// Bilan affiché à la fin d'un relevé : pages enregistrées, pages sans pub, pages que Facebook n'a pas affichées
function bilanReleve(res) {
  if (res.total == null) return `Relevé terminé : ${res.nbPages} pages enregistrées.`;
  let m = `Relevé ${res.arrete ? "arrêté" : "terminé"} : ${res.nbPages} page${res.nbPages > 1 ? "s" : ""} enregistrée${res.nbPages > 1 ? "s" : ""} sur ${res.total}.`;
  if (res.sansPub.length) m += ` Plus aucune pub active (confirmé par Facebook) : ${res.sansPub.join(", ")}.`;
  if (res.nonLues.length) m += ` NON enregistrées, Facebook n'a rien affiché : ${res.nonLues.join(", ")}.`;
  if (res.nbNouveaux) m += ` ${res.nbNouveaux} nouveau${res.nbNouveaux > 1 ? "x" : ""} produit${res.nbNouveaux > 1 ? "s" : ""}, ${res.prixNouveaux || 0} prix trouvé${res.prixNouveaux > 1 ? "s" : ""} automatiquement.`;
  return m;
}

const TITRES_JOURNAL = { releve: "du dernier relevé", recherche: "de la dernière recherche", etude: "de la dernière étude", prix: "de la dernière capture de prix" };

const fmtDate = d => d ? new Date(d).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "—";

export default function Veille() {
  const [data,     setData]     = useState(null);
  const [erreur,   setErreur]   = useState("");
  const [onglet,   setOnglet]   = useState("classement");
  const [importer, setImporter] = useState(false);
  const [message,  setMessage]  = useState("");
  const [ext,      setExt]      = useState(null);
  const [run,      setRun]      = useState(null);   // { type, status, logs }
  const [version,  setVersion]  = useState(0);
  const [journal,  setJournal]  = useState(null);   // { type, lignes, fin } : gardé après la fin de la tâche
  const [journalOuvert, setJournalOuvert] = useState(true);
  const [dernierType, setDernierType] = useState(null);   // type de la dernière tâche lancée
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

  const groups = useMemo(() => data ? buildGroups(data.pubs, data.refDates, data.produits, id => pageInfo(id).nom, data.presence) : [], [data, pageInfo]);

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
        ? `Capture ${res.arrete ? "arrêtée" : "terminée"} : ${res.remplis} prix remplis, ${res.ecarts} écart${res.ecarts > 1 ? "s" : ""} avec tes prix, ${res.introuvables} introuvable${res.introuvables > 1 ? "s" : ""}, ${res.erreurs} erreur${res.erreurs > 1 ? "s" : ""}, sur ${res.total} pages produit. Détail dans le journal.`
        : `Recherche terminée : ${res.nb_trouvees} pages trouvées, ${res.nb_gardees} gardées, ${res.nb_a_valider} à valider, ${res.nb_eliminees} éliminées.`);
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

  const lancerUneRecherche = (rech, rechargerRecherche) => lancer("recherche", async ctl => {
    const res = await lancerRecherche({
      pages, produits: data.produits, candidats: rech.candidats, motscles: rech.motscles, criteres: rech.criteres, groupes: groups,
    }, ctl);
    await rechargerRecherche();
    return res;
  });

  const lancerUneEtude = (mots, opts) => lancer("etude", ctl => lancerEtude(mots, opts, etudeEtat, ctl, () => setVersion(v => v + 1)));

  const lancerUnReleve = () => lancer("releve", ctl => lancerReleve({ pages, produits: data.produits, latest: data.latest, max: Number(maxReleve) || 0 }, ctl));
  const capturerLesPrix = items => lancer("prix", ctl => lancerCapturePrix(items, ctl));
  const releverSelection = ids => lancer("releve", ctl => lancerReleve({ pages, produits: data.produits, latest: data.latest, ids }, ctl));

  if (!data && !erreur) return <div className="loading-screen"><span className="loading-dot" />Chargement de la veille…</div>;

  const releves = data?.releves || [];
  const actives = pages.filter(p => p.actif).length;
  const aRelever = data ? pagesARelever(pages, data.latest, Number(maxReleve) || 0) : [];
  const jamais = data ? pages.filter(p => p.actif && !data.latest[p.fb_page_id]).length : 0;
  const pubsActives = groups.reduce((s, g) => s + g.pubs, 0);
  const enScale = groups.filter(g => g.pubs >= 20 && g.recent > 0).length;
  const nbCreas = groups.reduce((s, g) => s + g.crea, 0);

  // Téléchargement de l'étude depuis n'importe quel onglet
  const boutonExcel = (
    <button className="btn btn-sm btn-primary" onClick={() => telechargerEtude().catch(e => setErreur("Téléchargement impossible : " + (e.message || e)))}>
      Télécharger le fichier Excel
    </button>
  );

  const ONGLETS = [
    { id: "classement", label: "Classement produits" },
    { id: "pages",      label: `Pages suivies (${actives})` },
    { id: "historique", label: "Historique des relevés" },
    { id: "recherche",  label: "Recherche de pages" },
    { id: "etude",      label: "Étude de marché" },
  ];

  return (
    <>
      <div className="module-header">
        <div className="module-title-row" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="module-title">Veille concurrentielle</div>
            <div className="module-subtitle">
              Dernier relevé : {fmtDate(releves[0]?.created_at)}{releves[1] ? ` · précédent : ${fmtDate(releves[1].created_at)}` : ""}
              {" · "}
              <span style={{ color: ext ? "var(--green)" : "var(--muted2)", fontWeight: 600 }}>{ext ? `Extension connectée (v${ext.version})` : "Extension non détectée"}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={() => setImporter(true)} disabled={!data || !!run}>Importer des fichiers .mhtml</button>
            {run?.type === "releve"
              ? <button className="btn btn-danger" onClick={arreter}>Arrêter le relevé</button>
              : <>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }} title={`Les pages jamais relevées passent en premier (${jamais}), puis celles dont le dernier relevé est le plus ancien. Vide = toutes les pages.`}>
                    Pages
                    <input type="number" min={1} max={actives || 1} className="form-input" style={{ width: 70, padding: "6px 8px" }}
                      placeholder={String(actives)} value={maxReleve} onChange={e => setMaxReleve(e.target.value.replace(/[^0-9]/g, ""))} disabled={!!run} />
                  </label>
                  <button className="btn btn-primary" onClick={lancerUnReleve} disabled={!data || !ext || !!run || !actives} title={ext ? "Les pages en retard passent en premier" : "Ouvre l'ERP dans le Chrome où l'extension est installée"}>
                    Lancer un relevé ({aRelever.length} page{aRelever.length > 1 ? "s" : ""})
                  </button>
                </>}
          </div>
        </div>
        <div className="filter-tabs" style={{ paddingBottom: 12 }}>
          {ONGLETS.map(o => (
            <button key={o.id} className={`filter-tab${onglet === o.id ? " active" : ""}`} onClick={() => setOnglet(o.id)}>{o.label}</button>
          ))}
        </div>
      </div>

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

      {data && onglet === "classement" && (
        <>
          <div className="kpi-row" style={{ paddingTop: 16 }}>
            <div className="kpi-card"><div className="kpi-value">{actives}</div><div className="kpi-label">Pages suivies</div></div>
            <div className="kpi-card"><div className="kpi-value">{pubsActives.toLocaleString("fr-FR")}</div><div className="kpi-label">Pubs actives</div></div>
            <div className="kpi-card"><div className="kpi-value">{groups.length}</div><div className="kpi-label">Produits · {nbCreas} créatives</div></div>
            <div className="kpi-card kpi-success"><div className="kpi-value">{enScale}</div><div className="kpi-label">En scale (20 pubs et ajouts récents)</div></div>
          </div>
          <Classement groups={groups} pages={pages} pageInfo={pageInfo} onPatch={patchProduits} dateReleve={releves[0]?.created_at}
            ext={ext} run={run} onCapturerPrix={capturerLesPrix} />
        </>
      )}
      {data && onglet === "pages" && (
        <PagesSuivies pages={pages} groups={groups} latest={data.latest} pageInfo={pageInfo} homonymes={homonymes} onReload={charger} onPatchPage={patchPage}
          ext={ext} run={run} onRelever={releverSelection} />
      )}
      {data && onglet === "historique" && (
        <Historique releves={releves} relevePages={data.relevePages} produits={data.produits} pageInfo={pageInfo} onReload={charger} />
      )}
      {data && onglet === "recherche" && (
        <Recherche ext={ext} run={run} onLancer={lancerUneRecherche} onStop={arreter}
          pages={pages} produits={data.produits} onReloadVeille={charger} version={version} />
      )}

      {data && onglet === "etude" && (
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
