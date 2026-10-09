import { useCallback, useEffect, useMemo, useState } from "react";
import { buildGroups } from "./veille/veilleLib";
import { loadVeille, updateProduits, updatePage } from "./veille/veilleData";
import ImportModal from "./veille/ImportModal";
import Classement from "./veille/Classement";
import PagesSuivies from "./veille/PagesSuivies";
import Historique from "./veille/Historique";

const fmtDate = d => d ? new Date(d).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "—";

export default function Veille() {
  const [data,    setData]    = useState(null);
  const [erreur,  setErreur]  = useState("");
  const [onglet,  setOnglet]  = useState("classement");
  const [importer, setImporter] = useState(false);
  const [message, setMessage] = useState("");

  const charger = useCallback(async () => {
    try { setData(await loadVeille()); setErreur(""); }
    catch (e) { setErreur("Impossible de charger la veille : " + (e.message || e) + ". As-tu lancé le SQL du module Veille dans Supabase ?"); }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const pages = data?.pages || [];

  const pageInfo = useCallback(id => {
    const p = pages.find(x => x.fb_page_id === id);
    return { nom: p?.nom_interne || p?.nom || "Page " + id, page: p };
  }, [pages]);

  // Pages qui portent le même nom qu'une autre sans nom interne pour les distinguer
  const homonymes = useMemo(() => {
    const parNom = {};
    for (const p of pages) if (p.nom) (parNom[p.nom.toLowerCase()] = parNom[p.nom.toLowerCase()] || []).push(p);
    const s = new Set();
    for (const liste of Object.values(parNom)) if (liste.length > 1) for (const p of liste) if (!p.nom_interne) s.add(p.fb_page_id);
    return s;
  }, [pages]);

  const groups = useMemo(() => data ? buildGroups(data.pubs, data.refDates, data.produits, id => pageInfo(id).nom) : [], [data, pageInfo]);

  // Modifie des produits en base puis dans l'écran, sans tout recharger
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
  ];

  return (
    <>
      <div className="module-header">
        <div className="module-title-row" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="module-title">Veille concurrentielle</div>
            <div className="module-subtitle">
              Dernier relevé : {fmtDate(releves[0]?.created_at)}{releves[1] ? ` · précédent : ${fmtDate(releves[1].created_at)}` : ""}
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setImporter(true)} disabled={!data}>Importer des fichiers .mhtml</button>
        </div>
        <div className="filter-tabs" style={{ paddingBottom: 12 }}>
          {ONGLETS.map(o => (
            <button key={o.id} className={`filter-tab${onglet === o.id ? " active" : ""}`} onClick={() => setOnglet(o.id)}>{o.label}</button>
          ))}
        </div>
      </div>

      {erreur && <div className="alert-banner" style={{ background: "var(--red-lt)", color: "var(--red)", border: "1px solid #FECACA" }}>{erreur}</div>}
      {message && <div className="alert-banner" style={{ background: "var(--green-lt)", color: "var(--green)", border: "1px solid #BBF7D0" }}>{message}</div>}

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

      {importer && data && (
        <ImportModal
          pages={pages}
          produits={data.produits}
          onClose={() => setImporter(false)}
          onSaved={async res => {
            setImporter(false);
            setMessage(`Relevé enregistré : ${res.nbCartes} créatives, ${res.nbPubs} pubs, ${res.nbNouveauxProduits} nouveaux produits.`);
            setTimeout(() => setMessage(""), 8000);
            await charger();
          }}
        />
      )}
    </>
  );
}
