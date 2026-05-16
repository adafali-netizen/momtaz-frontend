import { useState } from "react";

function getDecision(marge, tauxLivr) {
  if (marge < 0 || tauxLivr < 30)  return { label: "STOP",      color: "#DC2626", bg: "#FEF2F2" };
  if (marge >= 20 && tauxLivr >= 50) return { label: "SCALE",    color: "#16A34A", bg: "#F0FDF4" };
  return                                    { label: "OPTIMISER", color: "#D97706", bg: "#FFFBEB" };
}

function Modal({ onClose, onCreate }) {
  const [form, setForm] = useState({ nom: "", prix: "", cout: "", stock: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const marge = form.prix && form.cout ? (+form.prix - +form.cout).toFixed(0) : "—";
  const submit = () => { if (!form.nom || !form.prix || !form.cout) return; onCreate(form); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Nouveau produit</span>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Nom du produit *</label><input className="form-input" value={form.nom} onChange={e => set("nom", e.target.value)} placeholder="Ceinture magnétique..." /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Prix vente (MAD) *</label><input className="form-input" type="number" value={form.prix} onChange={e => set("prix", e.target.value)} placeholder="299" /></div>
            <div className="form-group"><label className="form-label">Coût achat (MAD) *</label><input className="form-input" type="number" value={form.cout} onChange={e => set("cout", e.target.value)} placeholder="80" /></div>
          </div>
          <div className="form-group"><label className="form-label">Stock initial</label><input className="form-input" type="number" value={form.stock} onChange={e => set("stock", e.target.value)} placeholder="50" /></div>
          {form.prix && form.cout && (
            <div style={{ padding: "10px 12px", background: "var(--surface2)", borderRadius: 8, fontSize: 13, color: "var(--muted)" }}>
              Marge estimée : <strong style={{ color: +marge > 0 ? "var(--green)" : "var(--red)" }}>{marge} MAD</strong>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit}>Créer le produit</button>
        </div>
      </div>
    </div>
  );
}

export default function Produits() {
  const [produits,  setProduits]  = useState([]);
  const [filtre,    setFiltre]    = useState("tous");
  const [showModal, setShowModal] = useState(false);
  const [editCell,  setEditCell]  = useState(null); // { id, field }
  const [editVal,   setEditVal]   = useState("");

  const create = f => {
    setProduits(prev => [...prev, {
      id: Date.now(), nom: f.nom, prix: +f.prix, cout: +f.cout,
      stock: +f.stock || 0, tauxConf: 0, tauxLivr: 0,
      decisionManuelle: null,
    }]);
  };

  const startEdit = (id, field, val) => { setEditCell({ id, field }); setEditVal(String(val)); };
  const commitEdit = () => {
    if (!editCell) return;
    setProduits(prev => prev.map(p => p.id === editCell.id ? { ...p, [editCell.field]: +editVal || 0 } : p));
    setEditCell(null);
  };

  const toggleDecision = (id) => {
    const seq = [null, "SCALE", "OPTIMISER", "STOP"];
    setProduits(prev => prev.map(p => {
      if (p.id !== id) return p;
      const idx = seq.indexOf(p.decisionManuelle);
      return { ...p, decisionManuelle: seq[(idx + 1) % seq.length] };
    }));
  };

  const DECISIONS = ["tous", "SCALE", "OPTIMISER", "STOP"];
  const getD = p => {
    if (p.decisionManuelle) {
      const map = { SCALE: { label: "SCALE", color: "#16A34A", bg: "#F0FDF4" }, OPTIMISER: { label: "OPTIMISER", color: "#D97706", bg: "#FFFBEB" }, STOP: { label: "STOP", color: "#DC2626", bg: "#FEF2F2" } };
      return map[p.decisionManuelle];
    }
    return getDecision(p.prix - p.cout, p.tauxLivr);
  };

  const countD = d => d === "tous" ? produits.length : produits.filter(p => getD(p).label === d).length;
  const filtered = produits.filter(p => filtre === "tous" || getD(p).label === filtre);

  const avgMarge = produits.length ? Math.round(produits.reduce((s, p) => s + (p.prix - p.cout), 0) / produits.length) : 0;

  return (
    <>
      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className="kpi-card"><div className="kpi-value">{produits.length}</div><div className="kpi-label">Produits actifs</div></div>
        <div className="kpi-card"><div className="kpi-value">{avgMarge} MAD</div><div className="kpi-label">Marge moyenne</div></div>
        <div className="kpi-card kpi-success"><div className="kpi-value">{countD("SCALE")}</div><div className="kpi-label">SCALE</div></div>
        <div className="kpi-card kpi-warn"><div className="kpi-value">{countD("OPTIMISER")}</div><div className="kpi-label">OPTIMISER</div></div>
        <div className={`kpi-card${countD("STOP") > 0 ? " kpi-alert" : ""}`}><div className="kpi-value">{countD("STOP")}</div><div className="kpi-label">STOP</div></div>
      </div>

      <div className="toolbar">
        <div className="filter-tabs">
          {DECISIONS.map(d => (
            <button key={d} className={`filter-tab${filtre === d ? " active" : ""}`} onClick={() => setFiltre(d)}>
              {d} <span className="filter-count">{countD(d)}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Produit</button>
      </div>

      {produits.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏷️</div>
          <div className="empty-title">Aucun produit</div>
          <div className="empty-sub">Ajoute tes produits pour suivre coûts, marges et décisions de scaling</div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nouveau produit</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produit</th><th>Prix vente</th><th>Coût achat</th>
                <th>Marge nette</th><th>Taux conf.</th><th>Taux livr.</th><th>Décision</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const marge = p.prix - p.cout;
                const d     = getD(p);
                const editing = (field) => editCell?.id === p.id && editCell?.field === field;
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nom}</td>
                    <td className="col-mono" onDoubleClick={() => startEdit(p.id, "prix", p.prix)} style={{ cursor: "text" }}>
                      {editing("prix") ? <input className="inline-edit" value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} autoFocus /> : `${p.prix} MAD`}
                    </td>
                    <td className="col-mono" onDoubleClick={() => startEdit(p.id, "cout", p.cout)} style={{ cursor: "text" }}>
                      {editing("cout") ? <input className="inline-edit" value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} autoFocus /> : `${p.cout} MAD`}
                    </td>
                    <td><span style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: marge > 0 ? "var(--green)" : "var(--red)" }}>{marge} MAD</span></td>
                    <td className="col-mono col-muted">{p.tauxConf}%</td>
                    <td className="col-mono col-muted">{p.tauxLivr}%</td>
                    <td>
                      <span className="decision-badge" onClick={() => toggleDecision(p.id)}
                        style={{ color: d.color, background: d.bg, cursor: "pointer" }}
                        title="Cliquer pour changer manuellement">
                        {d.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--muted2)", borderTop: "1px solid var(--border)" }}>
            💡 Double-cliquer sur Prix ou Coût pour éditer · Cliquer sur Décision pour override manuel
          </div>
        </div>
      )}

      {showModal && <Modal onClose={() => setShowModal(false)} onCreate={create} />}
    </>
  );
}
