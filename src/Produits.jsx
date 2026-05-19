import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function getDecision(marge, tauxLivr) {
  if (marge < 0 || tauxLivr < 30)    return { label: "STOP",      color: "#DC2626", bg: "#FEF2F2" };
  if (marge >= 20 && tauxLivr >= 50) return { label: "SCALE",     color: "#16A34A", bg: "#F0FDF4" };
  return                                     { label: "OPTIMISER", color: "#D97706", bg: "#FFFBEB" };
}

function Modal({ onClose, onCreate }) {
  const [form, setForm] = useState({ nom: "", prix_vente: "", cout_achat: "", stock_disponible: "", stock_minimum: "5" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const marge = form.prix_vente && form.cout_achat ? (+form.prix_vente - +form.cout_achat) : null;
  const submit = async () => {
    if (!form.nom || !form.prix_vente || !form.cout_achat) return;
    await onCreate(form);
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Nouveau produit</span>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Nom du produit *</label>
            <input className="form-input" value={form.nom} onChange={e => set("nom", e.target.value)} placeholder="Ceinture magnétique..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Prix vente (MAD) *</label>
              <input className="form-input" type="number" value={form.prix_vente} onChange={e => set("prix_vente", e.target.value)} placeholder="299" />
            </div>
            <div className="form-group">
              <label className="form-label">Coût achat (MAD) *</label>
              <input className="form-input" type="number" value={form.cout_achat} onChange={e => set("cout_achat", e.target.value)} placeholder="80" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Stock initial</label>
              <input className="form-input" type="number" value={form.stock_disponible} onChange={e => set("stock_disponible", e.target.value)} placeholder="50" />
            </div>
            <div className="form-group">
              <label className="form-label">Seuil minimum</label>
              <input className="form-input" type="number" value={form.stock_minimum} onChange={e => set("stock_minimum", e.target.value)} placeholder="5" />
            </div>
          </div>
          {marge !== null && (
            <div style={{ padding: "10px 12px", background: "var(--surface2)", borderRadius: 8, fontSize: 13 }}>
              Marge estimée : <strong style={{ color: marge > 0 ? "var(--green)" : "var(--red)" }}>{marge} MAD</strong>
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
  const [produits,   setProduits]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filtre,     setFiltre]     = useState("tous");
  const [showModal,  setShowModal]  = useState(false);
  const [editCell,   setEditCell]   = useState(null);
  const [editVal,    setEditVal]    = useState("");

  useEffect(() => {
    fetchProduits();
    const ch = supabase.channel("produits-rt2")
      .on("postgres_changes", { event: "*", schema: "public", table: "produits" }, fetchProduits)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchProduits() {
    const { data, error } = await supabase.from("produits").select("*").order("nom");
    if (!error) setProduits(data);
    setLoading(false);
  }

  async function createProduit(form) {
    await supabase.from("produits").insert([{
      nom:              form.nom,
      prix_vente:       +form.prix_vente,
      cout_achat:       +form.cout_achat,
      stock_disponible: +form.stock_disponible || 0,
      stock_minimum:    +form.stock_minimum || 5,
      decision:         "OPTIMISER",
    }]);
  }

  async function updateField(id, field, value) {
    await supabase.from("produits").update({ [field]: +value }).eq("id", id);
    setEditCell(null);
  }

  async function toggleDecision(id, current) {
    const seq = ["OPTIMISER", "SCALE", "STOP"];
    const next = seq[(seq.indexOf(current) + 1) % seq.length];
    await supabase.from("produits").update({ decision: next }).eq("id", id);
  }

  const getD = p => {
    if (p.decision === "SCALE")     return { label: "SCALE",     color: "#16A34A", bg: "#F0FDF4" };
    if (p.decision === "STOP")      return { label: "STOP",      color: "#DC2626", bg: "#FEF2F2" };
    if (p.decision === "OPTIMISER") return { label: "OPTIMISER", color: "#D97706", bg: "#FFFBEB" };
    return getDecision((p.prix_vente || 0) - (p.cout_achat || 0), 0);
  };

  const DECISIONS = ["tous", "SCALE", "OPTIMISER", "STOP"];
  const count     = d => d === "tous" ? produits.length : produits.filter(p => getD(p).label === d).length;
  const filtered  = produits.filter(p => filtre === "tous" || getD(p).label === filtre);
  const avgMarge  = produits.length ? Math.round(produits.reduce((s, p) => s + ((p.prix_vente || 0) - (p.cout_achat || 0)), 0) / produits.length) : 0;

  return (
    <>
      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className="kpi-card"><div className="kpi-value">{produits.length}</div><div className="kpi-label">Produits actifs</div></div>
        <div className="kpi-card"><div className="kpi-value">{avgMarge} MAD</div><div className="kpi-label">Marge moyenne</div></div>
        <div className="kpi-card kpi-success"><div className="kpi-value">{count("SCALE")}</div><div className="kpi-label">SCALE</div></div>
        <div className="kpi-card kpi-warn"><div className="kpi-value">{count("OPTIMISER")}</div><div className="kpi-label">OPTIMISER</div></div>
        <div className={`kpi-card${count("STOP") > 0 ? " kpi-alert" : ""}`}><div className="kpi-value">{count("STOP")}</div><div className="kpi-label">STOP</div></div>
      </div>

      <div className="toolbar">
        <div className="filter-tabs">
          {DECISIONS.map(d => (
            <button key={d} className={`filter-tab${filtre === d ? " active" : ""}`} onClick={() => setFiltre(d)}>
              {d} <span className="filter-count">{count(d)}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Produit</button>
      </div>

      {loading ? (
        <div className="state-wrap"><div className="spinner" /> Chargement...</div>
      ) : produits.length === 0 ? (
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
                <th>Produit</th>
                <th>Prix vente</th>
                <th>Coût achat</th>
                <th>Marge nette</th>
                <th>Stock</th>
                <th>Décision</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const marge = (p.prix_vente || 0) - (p.cout_achat || 0);
                const d     = getD(p);
                const editing = field => editCell?.id === p.id && editCell?.field === field;
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, maxWidth: 300 }}>{p.nom}</td>

                    <td className="col-mono" onDoubleClick={() => { setEditCell({ id: p.id, field: "prix_vente" }); setEditVal(String(p.prix_vente || 0)); }} style={{ cursor: "text" }}>
                      {editing("prix_vente")
                        ? <input className="inline-edit" value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => updateField(p.id, "prix_vente", editVal)} onKeyDown={e => e.key === "Enter" && updateField(p.id, "prix_vente", editVal)} autoFocus />
                        : `${p.prix_vente || 0} MAD`}
                    </td>

                    <td className="col-mono" onDoubleClick={() => { setEditCell({ id: p.id, field: "cout_achat" }); setEditVal(String(p.cout_achat || 0)); }} style={{ cursor: "text" }}>
                      {editing("cout_achat")
                        ? <input className="inline-edit" value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => updateField(p.id, "cout_achat", editVal)} onKeyDown={e => e.key === "Enter" && updateField(p.id, "cout_achat", editVal)} autoFocus />
                        : `${p.cout_achat || 0} MAD`}
                    </td>

                    <td>
                      <span style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: marge > 0 ? "var(--green)" : "var(--red)" }}>
                        {marge} MAD
                      </span>
                    </td>

                    <td>
                      <span className="col-mono" style={{ color: p.stock_disponible <= 0 ? "var(--red)" : p.stock_disponible < p.stock_minimum ? "var(--orange)" : "var(--green)", fontWeight: 600 }}>
                        {p.stock_disponible} u
                      </span>
                    </td>

                    <td>
                      <span className="decision-badge" onClick={() => toggleDecision(p.id, p.decision)}
                        style={{ color: d.color, background: d.bg, cursor: "pointer" }} title="Cliquer pour changer">
                        {d.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted2)", borderTop: "1px solid var(--border)" }}>
            💡 Double-cliquer sur Prix ou Coût pour éditer · Cliquer sur Décision pour changer
          </div>
        </div>
      )}

      {showModal && <Modal onClose={() => setShowModal(false)} onCreate={createProduit} />}
    </>
  );
}
