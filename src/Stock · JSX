import { useState } from "react";

function getStatut(dispo, seuil) {
  if (dispo === 0)      return { label: "Rupture",  color: "#DC2626", bg: "#FEF2F2", emoji: "🔴" };
  if (dispo < seuil)    return { label: "Critique", color: "#D97706", bg: "#FFFBEB", emoji: "🟠" };
  return                       { label: "OK",       color: "#16A34A", bg: "#F0FDF4", emoji: "🟢" };
}

function ModalEntree({ produits, onClose, onAdd }) {
  const [form, setForm] = useState({ produitId: produits[0]?.id || "", qte: "", note: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => { if (!form.produitId || !form.qte) return; onAdd(+form.produitId, +form.qte, form.note); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">+ Entrée de stock</span><button className="btn-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Produit</label>
            <select className="form-select" value={form.produitId} onChange={e => set("produitId", e.target.value)}>
              {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Quantité ajoutée *</label><input className="form-input" type="number" min="1" value={form.qte} onChange={e => set("qte", e.target.value)} placeholder="50" /></div>
          <div className="form-group"><label className="form-label">Note (optionnel)</label><input className="form-input" value={form.note} onChange={e => set("note", e.target.value)} placeholder="Réappro fournisseur X..." /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function ModalProduit({ onClose, onAdd }) {
  const [form, setForm] = useState({ nom: "", dispo: "", seuil: "10" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => { if (!form.nom) return; onAdd(form); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">Ajouter un produit au stock</span><button className="btn-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Nom du produit *</label><input className="form-input" value={form.nom} onChange={e => set("nom", e.target.value)} placeholder="Ceinture magnétique" /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Stock initial</label><input className="form-input" type="number" value={form.dispo} onChange={e => set("dispo", e.target.value)} placeholder="50" /></div>
            <div className="form-group"><label className="form-label">Seuil minimum</label><input className="form-input" type="number" value={form.seuil} onChange={e => set("seuil", e.target.value)} placeholder="10" /></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit}>Ajouter</button>
        </div>
      </div>
    </div>
  );
}

export default function Stock() {
  const [stocks,     setStocks]     = useState([]);
  const [filtre,     setFiltre]     = useState("tous");
  const [showEntree, setShowEntree] = useState(false);
  const [showProduit,setShowProduit]= useState(false);
  const [editSeuil,  setEditSeuil]  = useState(null);
  const [seuilVal,   setSeuilVal]   = useState("");

  const addProduit = f => setStocks(prev => [...prev, { id: Date.now(), nom: f.nom, dispo: +f.dispo || 0, seuil: +f.seuil || 10, dernEntree: new Date().toLocaleDateString("fr-FR") }]);
  const addEntree  = (id, qte, note) => setStocks(prev => prev.map(s => s.id === id ? { ...s, dispo: s.dispo + qte, dernEntree: new Date().toLocaleDateString("fr-FR") } : s));
  const saveSeuil  = (id) => { setStocks(prev => prev.map(s => s.id === id ? { ...s, seuil: +seuilVal || s.seuil } : s)); setEditSeuil(null); };

  const ruptures = stocks.filter(s => s.dispo === 0);
  const critiques = stocks.filter(s => s.dispo > 0 && s.dispo < s.seuil);
  const FILTRES = ["tous", "Rupture", "Critique", "OK"];
  const count   = f => f === "tous" ? stocks.length : stocks.filter(s => getStatut(s.dispo, s.seuil).label === f).length;
  const filtered = stocks.filter(s => filtre === "tous" || getStatut(s.dispo, s.seuil).label === filtre);

  return (
    <>
      {ruptures.length > 0 && (
        <div className="alert-banner danger" style={{ margin: "16px 24px 0" }}>
          🔴 Rupture : {ruptures.map(s => s.nom).join(", ")} — réapprovisionner en urgence
        </div>
      )}
      {ruptures.length === 0 && critiques.length > 0 && (
        <div className="alert-banner warning" style={{ margin: "16px 24px 0" }}>
          ⚠️ Stock critique : {critiques.map(s => s.nom).join(", ")}
        </div>
      )}

      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className={`kpi-card${ruptures.length > 0 ? " kpi-alert" : ""}`}><div className="kpi-value">{ruptures.length}</div><div className="kpi-label">En rupture</div></div>
        <div className={`kpi-card${critiques.length > 0 ? " kpi-warn" : ""}`}><div className="kpi-value">{critiques.length}</div><div className="kpi-label">Critiques</div></div>
        <div className="kpi-card kpi-success"><div className="kpi-value">{count("OK")}</div><div className="kpi-label">OK</div></div>
        <div className="kpi-card"><div className="kpi-value">{stocks.length}</div><div className="kpi-label">Total SKUs</div></div>
      </div>

      <div className="toolbar">
        <div className="filter-tabs">
          {FILTRES.map(f => (
            <button key={f} className={`filter-tab${filtre === f ? " active" : ""}`} onClick={() => setFiltre(f)}>
              {f} <span className="filter-count">{count(f)}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowEntree(true)} disabled={stocks.length === 0}>+ Entrée</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowProduit(true)}>+ Produit</button>
        </div>
      </div>

      {stocks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏪</div>
          <div className="empty-title">Stock vide</div>
          <div className="empty-sub">Ajoute tes produits pour suivre les niveaux de stock et éviter les ruptures</div>
          <button className="btn btn-primary" onClick={() => setShowProduit(true)}>+ Ajouter un produit</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Produit</th><th>Disponible</th><th>Seuil min.</th><th>Dernière entrée</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const st = getStatut(s.dispo, s.seuil);
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.nom}</td>
                    <td><span className="col-mono" style={{ fontWeight: 700, color: s.dispo === 0 ? "var(--red)" : s.dispo < s.seuil ? "var(--orange)" : "var(--green)" }}>{s.dispo} u</span></td>
                    <td>
                      {editSeuil === s.id ? (
                        <input className="inline-edit" value={seuilVal} onChange={e => setSeuilVal(e.target.value)} onBlur={() => saveSeuil(s.id)} onKeyDown={e => e.key === "Enter" && saveSeuil(s.id)} autoFocus />
                      ) : (
                        <span className="col-mono col-muted" style={{ cursor: "text" }} onDoubleClick={() => { setEditSeuil(s.id); setSeuilVal(String(s.seuil)); }}>
                          {s.seuil} u
                        </span>
                      )}
                    </td>
                    <td className="col-muted">{s.dernEntree || "—"}</td>
                    <td><span className="status-badge" style={{ color: st.color, background: st.bg }}>{st.emoji} {st.label}</span></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setShowEntree(true); }}>+ Stock</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--muted2)", borderTop: "1px solid var(--border)" }}>
            💡 Double-cliquer sur Seuil min. pour le modifier
          </div>
        </div>
      )}

      {showProduit && <ModalProduit onClose={() => setShowProduit(false)} onAdd={addProduit} />}
      {showEntree  && <ModalEntree  produits={stocks} onClose={() => setShowEntree(false)} onAdd={addEntree} />}
    </>
  );
}
