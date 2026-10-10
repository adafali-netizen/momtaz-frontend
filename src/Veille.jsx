import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildGroups } from "./veille/veilleLib";
import { loadVeille, updateProduits, updatePage } from "./veille/veilleData";
import { detecterExtension, arreterExtension } from "./veille/veilleExt";
import { lancerRecherche, lancerReleve, reessayerEnregistrement } from "./veille/veilleRunner";
import ImportModal from "./veille/ImportModal";
import Classement from "./veille/Classement";
import PagesSuivies from "./veille/PagesSuivies";
import Historique from "./veille/Historique";
import Recherche from "./veille/Recherche";

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

  const groups = useMemo(() => data ? buildGroups(data.pubs, data.refDates, data.produits, id => pageInfo(id).nom) : [], [data, pageInfo]);

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
    const ctl = {
      stop: false,
      status: t => setRun(r => r && { ...r, status: t }),
      log: t => setRun(r => r && { ...r, logs: [`${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${t}`, ...r.logs].slice(0, 30) }),
    };
    ctlRef.current = ctl;
    setRun({ type, status: "Démarrage…", logs: [] });
    setErreur("");
    try {
      const res = await fn(ctl);
      setMessage(type === "releve"
        ? `Relevé terminé : ${res.nbPages} pages relevées.`
        : `Recherche terminée : ${res.nb_trouvees} pages trouvées, ${res.nb_gardees} gardées, ${res.nb_a_valider} à valider, ${res.nb_eliminees} éliminées.`);
    } catch (e) {
      setErreur((type === "releve" ? "Relevé interrompu : " : "Recherche interrompue : ") + (e.message || e));
    } finally {
      ctlRef.current = null;
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

  const lancerUnReleve = () => lancer("releve", ctl => lancerReleve({ pages, produits: data.produits }, ctl));

  if (!data && !erreur) return <div className="loading-screen"><span className="loading-dot" />Chargement de la veille…</div>;

  const releves = data?.releves || [];
  const actives = pages.filter(p => p.actif).length;
  const pubsActives = groups.reduce((s, g) => s + g.pubs, 0);
  const enScale = groups.filter(g => g.pubs >= 20 && g.recent > 0).length;
  const nbCreas = groups.reduce((s, g) => s + g.crea, 0);

  const ONGLETS = [
    { id: "classement", label: "Classement produits" },
    { id: "pages",      label: `Pages suivies (${actives})` },
    { id: "historique", label: "Historique des relevés" },
    { id: "recherche",  label: "Recherche de pages" },
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
              : <button className="btn btn-primary" onClick={lancerUnReleve} disabled={!data || !ext || !!run || !actives} title={ext ? "" : "Ouvre l'ERP dans le Chrome où l'extension est installée"}>Lancer un relevé (extension)</button>}
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
            <span style={{ fontWeight: 700 }}><span className="loading-dot" /> {run.type === "releve" ? "Relevé en cours" : "Recherche en cours"} : {run.status}</span>
            <button className="btn btn-sm btn-danger" onClick={arreter}>Arrêter</button>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Laisse cet onglet ouvert et ne réduis pas la fenêtre de l'extension.</div>
          {run.logs.slice(0, 5).map((l, i) => <div key={i} style={{ fontSize: 12, color: "var(--text)" }}>{l}</div>)}
        </div>
      )}
      {erreur && <div className="alert-banner" style={{ background: "var(--red-lt)", color: "var(--red)", border: "1px solid #FECACA", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span>{erreur}</span>
        {window.__momtazReleveNonEnregistre && !run && (
          <button className="btn btn-sm btn-danger" onClick={() => lancer("releve", () => reessayerEnregistrement({ pages, produits: data.produits }))}>Réessayer l'enregistrement</button>
        )}
      </div>}
      {message && !run && <div className="alert-banner" style={{ background: "var(--green-lt)", color: "var(--green)", border: "1px solid #BBF7D0", display: "flex", justifyContent: "space-between" }}>
        <span>{message}</span><button className="btn-close" onClick={() => setMessage("")}>×</button>
      </div>}

      {data && onglet === "classement" && (
        <>
          <div className="kpi-row" style={{ paddingTop: 16 }}>
            <div className="kpi-card"><div className="kpi-value">{actives}</div><div className="kpi-label">Pages suivies</div></div>
            <div className="kpi-card"><div className="kpi-value">{pubsActives.toLocaleString("fr-FR")}</div><div className="kpi-label">Pubs actives</div></div>
            <div className="kpi-card"><div className="kpi-value">{groups.length}</div><div className="kpi-label">Produits · {nbCreas} créatives</div></div>
            <div className="kpi-card kpi-success"><div className="kpi-value">{enScale}</div><div className="kpi-label">En scale (20 pubs et ajouts récents)</div></div>
          </div>
          <Classement groups={groups} pages={pages} pageInfo={pageInfo} onPatch={patchProduits} dateReleve={releves[0]?.created_at} />
        </>
      )}
      {data && onglet === "pages" && (
        <PagesSuivies pages={pages} groups={groups} latest={data.latest} pageInfo={pageInfo} homonymes={homonymes} onReload={charger} onPatchPage={patchPage} />
      )}
      {data && onglet === "historique" && (
        <Historique releves={releves} relevePages={data.relevePages} produits={data.produits} pageInfo={pageInfo} onReload={charger} />
      )}
      {data && onglet === "recherche" && (
        <Recherche ext={ext} run={run} onLancer={lancerUneRecherche} onStop={arreter}
          pages={pages} produits={data.produits} onReloadVeille={charger} version={version} />
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
