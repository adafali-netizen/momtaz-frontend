import { useEffect, useState } from "react";
import { compareReleves } from "./veilleLib";
import { loadComparaison, deleteReleve } from "./veilleData";

const fmtDate = d => new Date(d).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const BLOCS = [
  { id: "nouveaux", titre: "Nouveaux produits", sous: "Apparus depuis le relevé précédent", couleur: "var(--blue)", val: x => `${x.apres} pubs` },
  { id: "hausse",   titre: "En hausse",         sous: "Le concurrent ajoute des pubs : il gagne de l'argent", couleur: "var(--green)", val: x => `${x.avant} → ${x.apres}` },
  { id: "baisse",   titre: "En baisse",         sous: "Pubs coupées : le produit s'essouffle", couleur: "var(--orange)", val: x => `${x.avant} → ${x.apres}` },
  { id: "disparus", titre: "Disparus",          sous: "Plus aucune pub active", couleur: "var(--red)", val: x => `${x.avant} → 0` },
];

function Bloc({ b, items }) {
  const [tout, setTout] = useState(false);
  const liste = tout ? items : items.slice(0, 10);
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: `3px solid ${b.couleur}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <div style={{ fontWeight: 700, color: b.couleur }}>{b.titre} ({items.length})</div>
        <div className="col-muted">{b.sous}</div>
      </div>
      {liste.map(x => (
        <div key={x.nom} style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 7 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{x.nom}</div>
            <div className="col-muted">{x.pages}</div>
          </div>
          <span className="col-mono" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{b.val(x)}</span>
        </div>
      ))}
      {items.length > 10 && <button className="btn btn-sm btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setTout(!tout)}>{tout ? "Réduire" : `Voir les ${items.length}`}</button>}
      {!items.length && <div className="col-muted">Rien</div>}
    </div>
  );
}

export default function Historique({ releves, relevePages, produits, pageInfo, onReload }) {
  const [sel,     setSel]     = useState(releves[0]?.id || null);
  const [comp,    setComp]    = useState(null);
  const [charge,  setCharge]  = useState(false);
  const [erreur,  setErreur]  = useState("");

  useEffect(() => {
    if (!releves.some(r => r.id === sel)) setSel(releves[0]?.id || null);
  }, [releves, sel]);

  useEffect(() => {
    if (!sel) return;
    let annule = false;
    setCharge(true); setErreur("");
    loadComparaison(sel, relevePages)
      .then(({ apres, avant, sansPrecedent }) => {
        if (annule) return;
        setComp({ ...compareReleves(apres, avant, produits, id => pageInfo(id).nom), sansPrecedent });
      })
      .catch(e => !annule && setErreur(String(e.message || e)))
      .finally(() => !annule && setCharge(false));
    return () => { annule = true; };
  }, [sel, relevePages, produits, pageInfo]);

  if (!releves.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🗂️</div>
        <div className="empty-title">Aucun relevé</div>
        <div className="empty-sub">L'historique se remplit à chaque import. La comparaison commence au deuxième relevé d'une même page.</div>
      </div>
    );
  }

  const releveSel = releves.find(r => r.id === sel);
  const supprimer = async () => {
    if (!window.confirm("Supprimer ce relevé et toutes ses publicités ? Les pages et les produits restent.")) return;
    await deleteReleve(sel);
    setSel(null);
    await onReload();
  };

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 260px", maxWidth: 340, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Relevés</div>
        {releves.map(r => {
          const actif = r.id === sel;
          return (
            <button key={r.id} onClick={() => setSel(r.id)} style={{ textAlign: "left", background: actif ? "var(--blue-lt)" : "var(--surface)", border: `1px solid ${actif ? "#93C5FD" : "var(--border)"}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontWeight: 700 }}>{fmtDate(r.created_at)}</span>
              <div className="col-muted">{r.nb_pages} pages · {r.nb_pubs} pubs · {r.nb_cartes} créatives</div>
            </button>
          );
        })}
      </div>

      <div style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {releveSel && (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 700 }}>Ce qui a changé au relevé du {fmtDate(releveSel.created_at)}</div>
            <button className="btn btn-sm btn-danger" onClick={supprimer}>Supprimer ce relevé</button>
          </div>
        )}
        {charge && <div className="col-muted"><span className="loading-dot" /> Comparaison…</div>}
        {erreur && <div style={{ color: "var(--red)", fontWeight: 600 }}>{erreur}</div>}
        {comp && !charge && (
          <>
            {comp.sansPrecedent.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--orange)", background: "var(--orange-lt)", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px" }}>
                {comp.sansPrecedent.length} page{comp.sansPrecedent.length > 1 ? "s" : ""} relevée{comp.sansPrecedent.length > 1 ? "s" : ""} pour la première fois : pas encore de comparaison possible
                ({comp.sansPrecedent.slice(0, 6).map(id => pageInfo(id).nom).join(", ")}{comp.sansPrecedent.length > 6 ? "…" : ""}).
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              {BLOCS.map(b => <Bloc key={b.id} b={b} items={comp[b.id]} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
