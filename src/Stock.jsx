import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function getStatut(dispo, seuil) {
  if (dispo <= 0)    return { label: "Rupture",  color: "#DC2626", bg: "#FEF2F2", emoji: "🔴" };
  if (dispo < seuil) return { label: "Critique", color: "#D97706", bg: "#FFFBEB", emoji: "🟠" };
  return                    { label: "OK",       color: "#16A34A", bg: "#F0FDF4", emoji: "🟢" };
}

function ModalEntree({ produits, onClose, onAdd }) {
  const [form, setForm] = useState({ produit_id: produits[0]?.id || "", qte: "", note: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.produit_id || !form.qte) return;
    await onAdd(form.produit_id, +form.qte, form.note);
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">+ Entrée de stock</span><button className="btn-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Produit</label>
            <select className="form-select" value={form.produit_id} onChange={e => set("produit_id", e.target.value)}>
              {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Quantité *</label>
            <input className="form-input" type="number" min="1" value={form.qte} onChange={e => set("qte", e.target.value)} placeholder="50" />
          </div>
          <div className="form-group"><label className="form-label">Note (optionnel)</label>
            <input className="form-input" value={form.note} onChange={e => set("note", e.target.value)} placeholder="Réappro fournisseur..." />
          </div>
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
  const [form, setForm] = useState({ nom: "", prix_vente: "", cout_achat: "", stock_disponible: "", stock_minimum: "5" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.nom) return;
    await onAdd(form);
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">Nouveau produit</span><button className="btn-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Nom du produit *</label>
            <input className="form-input" value={form.nom} onChange={e => set("nom", e.target.value)} placeholder="Ceinture magnétique" />
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Prix vente (MAD)</label>
              <input className="form-input" type="number" value={form.prix_vente} onChange={e => set("prix_vente", e.target.value)} placeholder="299" />
            </div>
            <div className="form-group"><label className="form-label">Coût achat (MAD)</label>
              <input className="form-input" type="number" value={form.cout_achat} onChange={e => set("cout_achat", e.target.value)} placeholder="80" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Stock initial</label>
              <input className="form-input" type="number" value={form.stock_disponible} onChange={e => set("stock_disponible", e.target.value)} placeholder="50" />
            </div>
            <div className="form-group"><label className="form-label">Seuil minimum</label>
              <input className="form-input" type="number" value={form.stock_minimum} onChange={e => set("stock_minimum", e.target.value)} placeholder="5" />
            </div>
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
  const [produits,    setProduits]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filtre,      setFiltre]      = useState("tous");
  const [showEntree,  setShowEntree]  = useState(false);
  const [showProduit, setShowProduit] = useState(false);
  const [editSeuil,   setEditSeuil]   = useState(null);
  const [seuilVal,    setSeuilVal]    = useState("");

  useEffect(() => {
    fetchProduits();
    const ch = supabase.channel("produits-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "produits" }, fetchProduits)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchProduits() {
    const { data, error } = await supabase.from("produits").select("*").order("nom");
    if (!error) setProduits(data);
    setLoading(false);
  }

  async function addProduit(form) {
    await supabase.from("produits").insert([{
      nom:             form.nom,
      prix_vente:      +form.prix_vente || 0,
      cout_achat:      +form.cout_achat || 0,
      stock_disponible:+form.stock_disponible || 0,
      stock_minimum:   +form.stock_minimum || 5,
    }]);
  }

  async function addEntree(produit_id, qte, note) {
    // Mise à jour stock
    const produit = produits.find(p => p.id === produit_id);
    if (!produit) return;
    await supabase.from("produits")
      .update({ stock_disponible: produit.stock_disponible + qte })
      .eq("id", produit_id);
    // Enregistre mouvement
    await supabase.from("stock_movements").insert([{
      produit_id, type: "entree", quantite: qte, source: note || "manuel"
    }]);
  }

  async function saveSeuil(id) {
    await supabase.from("produits").update({ stock_minimum: +seuilVal }).eq("id", id);
    setEditSeuil(null);
  }

  const FILTRES  = ["tous", "Rupture", "Critique", "OK"];
  const count    = f => f === "tous" ? produits.length : produits.filter(p => getStatut(p.stock_disponible, p.stock_minimum).label === f).length;
  const filtered = produits.filter(p => filtre === "tous" || getStatut(p.stock_disponible, p.stock_minimum).label === filtre);

  const ruptures  = produits.filter(p => p.stock_disponible <= 0);
  const critiques = produits.filter(p => p.stock_disponible > 0 && p.stock_disponible < p.stock_minimum);

  return (
    <>
      {ruptures.length > 0 && (
        <div className="alert-banner danger" style={{ margin: "16px 24px 0" }}>
          🔴 Rupture : {ruptures.map(p => p.nom).join(", ")}
        </div>
      )}
      {ruptures.length === 0 && critiques.length > 0 && (
        <div className="alert-banner warning" style={{ margin: "16px 24px 0" }}>
          ⚠️ Stock critique : {critiques.map(p => p.nom).join(", ")}
        </div>
      )}

      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className={`kpi-card${ruptures.length > 0 ? " kpi-alert" : ""}`}><div className="kpi-value">{ruptures.length}</div><div className="kpi-label">En rupture</div></div>
        <div className={`kpi-card${critiques.length > 0 ? " kpi-warn" : ""}`}><div className="kpi-value">{critiques.length}</div><div className="kpi-label">Critiques</div></div>
        <div className="kpi-card kpi-success"><div className="kpi-value">{count("OK")}</div><div className="kpi-label">OK</div></div>
        <div className="kpi-card"><div className="kpi-value">{produits.length}</div><div className="kpi-label">Total SKUs</div></div>
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
          <button className="btn btn-secondary btn-sm" onClick={() => setShowEntree(true)} disabled={produits.length === 0}>+ Entrée stock</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowProduit(true)}>+ Produit</button>
        </div>
      </div>

      {loading ? (
        <div className="state-wrap"><div className="spinner" /> Chargement...</div>
      ) : produits.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏪</div>
          <div className="empty-title">Stock vide</div>
          <div className="empty-sub">Ajoute tes produits pour suivre le stock et recevoir des alertes de rupture</div>
          <button className="btn btn-primary" onClick={() => setShowProduit(true)}>+ Ajouter un produit</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Produit</th><th>Stock dispo</th><th>Seuil min.</th><th>Marge</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const st    = getStatut(p.stock_disponible, p.stock_minimum);
                const marge = (p.prix_vente || 0) - (p.cout_achat || 0);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nom}</td>
                    <td>
                      <span className="col-mono" style={{ fontWeight: 700, color: st.color }}>
                        {p.stock_disponible} u
                      </span>
                    </td>
                    <td>
                      {editSeuil === p.id ? (
                        <input className="inline-edit" value={seuilVal}
                          onChange={e => setSeuilVal(e.target.value)}
                          onBlur={() => saveSeuil(p.id)}
                          onKeyDown={e => e.key === "Enter" && saveSeuil(p.id)}
                          autoFocus />
                      ) : (
                        <span className="col-mono col-muted" style={{ cursor: "text" }}
                          onDoubleClick={() => { setEditSeuil(p.id); setSeuilVal(String(p.stock_minimum)); }}>
                          {p.stock_minimum} u
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="col-mono" style={{ color: marge > 0 ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
                        {marge} MAD
                      </span>
                    </td>
                    <td>
                      <span className="status-badge" style={{ color: st.color, background: st.bg }}>
                        {st.emoji} {st.label}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setShowEntree(true); }}>
                        + Stock
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted2)", borderTop: "1px solid var(--border)" }}>
            💡 Double-cliquer sur Seuil min. pour modifier · Stock se met à jour automatiquement à chaque livraison
          </div>
        </div>
      )}

      {showProduit && <ModalProduit onClose={() => setShowProduit(false)} onAdd={addProduit} />}
      {showEntree  && <ModalEntree produits={produits} onClose={() => setShowEntree(false)} onAdd={addEntree} />}
    </>
  );
}
