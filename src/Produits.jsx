import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function getDecision(p) {
  if (p.decision === "SCALE")     return { label: "SCALE",     color: "#16A34A", bg: "#F0FDF4" };
  if (p.decision === "STOP")      return { label: "STOP",      color: "#DC2626", bg: "#FEF2F2" };
  return                                 { label: "OPTIMISER", color: "#D97706", bg: "#FFFBEB" };
}

function Modal({ onClose, onCreate }) {
  const [form, setForm] = useState({ nom: "", cout_achat: "", fournisseur: "", stock_disponible: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.nom) return;
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
            <input className="form-input" value={form.nom} onChange={e => set("nom", e.target.value)} placeholder="4 boites à lunch..." />
          </div>
          <div className="form-group">
            <label className="form-label">Prix achat (MAD)</label>
            <input className="form-input" type="number" value={form.cout_achat} onChange={e => set("cout_achat", e.target.value)} placeholder="80" />
          </div>
          <div className="form-group">
            <label className="form-label">Fournisseur</label>
            <input className="form-input" value={form.fournisseur} onChange={e => set("fournisseur", e.target.value)} placeholder="Nom du fournisseur..." />
          </div>
          <div className="form-group">
            <label className="form-label">Unités en stock</label>
            <input className="form-input" type="number" value={form.stock_disponible} onChange={e => set("stock_disponible", e.target.value)} placeholder="50" />
          </div>
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
  const [loading,   setLoading]   = useState(true);
  const [filtre,    setFiltre]    = useState("tous");
  const [showModal, setShowModal] = useState(false);
  const [editCell,  setEditCell]  = useState(null);
  const [editVal,   setEditVal]   = useState("");

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
      cout_achat:       +form.cout_achat || 0,
      fournisseur:      form.fournisseur || null,
      stock_disponible: +form.stock_disponible || 0,
      stock_minimum:    5,
      decision:         "OPTIMISER",
    }]);
  }

  async function updateField(id, field, value) {
    const val = ["cout_achat", "prix_vente", "stock_disponible", "stock_minimum"].includes(field) ? +value : value;
    await supabase.from("produits").update({ [field]: val }).eq("id", id);
    setEditCell(null);
  }

  async function toggleDecision(id, current) {
    const seq = ["OPTIMISER", "SCALE", "STOP"];
    const next = seq[(seq.indexOf(current) + 1) % seq.length];
    await supabase.from("produits").update({ decision: next }).eq("id", id);
  }

  const DECISIONS = ["tous", "SCALE", "OPTIMISER", "STOP"];
  const count     = d => d === "tous" ? produits.length : produits.filter(p => getDecision(p).label === d).length;
  const filtered  = produits.filter(p => filtre === "tous" || getDecision(p).label === filtre);

  const EditCell = ({ id, field, value, mono, placeholder }) => {
    const active = editCell?.id === id && editCell?.field === field;
    return active ? (
      <input className="inline-edit" value={editVal}
        onChange={e => setEditVal(e.target.value)}
        onBlur={() => updateField(id, field, editVal)}
        onKeyDown={e => e.key === "Enter" && updateField(id, field, editVal)}
        autoFocus />
    ) : (
      <span className={mono ? "col-mono" : ""} style={{ cursor: "text", color: "inherit" }}
        onDoubleClick={() => { setEditCell({ id, field }); setEditVal(String(value ?? "")); }}>
        {value || <span style={{ color: "var(--muted2)" }}>{placeholder}</span>}
      </span>
    );
  };

  return (
    <>
      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className="kpi-card"><div className="kpi-value">{produits.length}</div><div className="kpi-label">Produits</div></div>
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
          <div className="empty-sub">Ajoute tes produits pour suivre coûts et décisions</div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nouveau produit</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Prix achat</th>
                <th>Prix vente</th>
                <th>Marge</th>
                <th>Fournisseur</th>
                <th>Stock</th>
                <th>Décision</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const marge = (p.prix_vente || 0) - (p.cout_achat || 0);
                const d     = getDecision(p);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nom}</td>

                    <td><EditCell id={p.id} field="cout_achat" value={p.cout_achat ? `${p.cout_achat} MAD` : ""} mono placeholder="—" /></td>

                    <td><EditCell id={p.id} field="prix_vente" value={p.prix_vente ? `${p.prix_vente} MAD` : ""} mono placeholder="à définir" /></td>

                    <td>
                      {p.prix_vente && p.cout_achat
                        ? <span style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: marge > 0 ? "var(--green)" : "var(--red)" }}>{marge} MAD</span>
                        : <span style={{ color: "var(--muted2)", fontSize: 12 }}>—</span>}
                    </td>

                    <td><EditCell id={p.id} field="fournisseur" value={p.fournisseur} placeholder="Ajouter..." /></td>

                    <td>
                      <span className="col-mono" style={{ fontWeight: 700, color: p.stock_disponible <= 0 ? "var(--red)" : p.stock_disponible < p.stock_minimum ? "var(--orange)" : "var(--green)" }}>
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
            💡 Double-cliquer sur n'importe quelle cellule pour éditer
          </div>
        </div>
      )}

      {showModal && <Modal onClose={() => setShowModal(false)} onCreate={createProduit} />}
    </>
  );
}
