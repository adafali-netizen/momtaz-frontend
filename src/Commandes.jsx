import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const STATUTS_CMD = ["À expédier", "Expédié", "En livraison", "Livré", "Demande de retour", "Retour en cours", "Retour reçu", "Annulé"];

const S_CMD = {
  "À expédier":  { color: "#2563EB", bg: "#EFF6FF", emoji: "📦" },
  "Expédié":     { color: "#0891B2", bg: "#ECFEFF", emoji: "🚚" },
  "En livraison":{ color: "#D97706", bg: "#FFFBEB", emoji: "🛵" },
  "Livré":       { color: "#16A34A", bg: "#F0FDF4", emoji: "✅" },
"Demande de retour": { color: "#D97706", bg: "#FFFBEB", emoji: "📝" },
"Retour en cours":   { color: "#DC2626", bg: "#FEF2F2", emoji: "↩️" },
"Retour reçu":       { color: "#7C3AED", bg: "#F5F3FF", emoji: "✅" },
  "Annulé":      { color: "#DC2626", bg: "#FEF2F2", emoji: "❌" },
};

const TRANSPORTEURS = ["Amana", "Chronopost", "CTM", "Autre"];
const WEBHOOK = "https://momtaz-webhook-production.up.railway.app/api/commande/";

function Modal({ onClose, onCreate }) {
  const [form, setForm] = useState({ client_nom: "", telephone: "", produit: "", ville: "", quantite: 1, prix: "", transporteur: "Amana" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => { if (!form.client_nom || !form.telephone) return; await onCreate(form); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">Nouvelle commande</span><button className="btn-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group"><label className="form-label">Client *</label><input className="form-input" value={form.client_nom} onChange={e => set("client_nom", e.target.value)} placeholder="Nom complet" /></div>
            <div className="form-group"><label className="form-label">Téléphone *</label><input className="form-input" value={form.telephone} onChange={e => set("telephone", e.target.value)} placeholder="06XX XX XX XX" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Produit</label><input className="form-input" value={form.produit} onChange={e => set("produit", e.target.value)} placeholder="Nom du produit" /></div>
            <div className="form-group"><label className="form-label">Ville</label><input className="form-input" value={form.ville} onChange={e => set("ville", e.target.value)} placeholder="Casablanca" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Qté</label><input className="form-input" type="number" min="1" value={form.quantite} onChange={e => set("quantite", +e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Prix (MAD)</label><input className="form-input" type="number" value={form.prix} onChange={e => set("prix", e.target.value)} placeholder="299" /></div>
          </div>
          <div className="form-group"><label className="form-label">Transporteur</label>
            <select className="form-select" value={form.transporteur} onChange={e => set("transporteur", e.target.value)}>
              {TRANSPORTEURS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit}>Créer la commande</button>
        </div>
      </div>
    </div>
  );
}

export default function Commandes() {
  const [commandes,  setCommandes]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filtre,     setFiltre]     = useState("tous");
  const [selected,   setSelected]   = useState(null);
  const [showModal,  setShowModal]  = useState(false);
  const [tracking,   setTracking]   = useState({});
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    fetchCommandes();
    const ch = supabase.channel("commandes-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "commandes" }, fetchCommandes)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchCommandes() {
    const { data, error } = await supabase.from("commandes").select("*").order("created_at", { ascending: false });
    if (!error) setCommandes(data);
    setLoading(false);
  }

  async function createCommande(form) {
    await supabase.from("commandes").insert([{ client_nom: form.client_nom, telephone: form.telephone, produit: form.produit, ville: form.ville, quantite: form.quantite, prix: form.prix || null, transporteur: form.transporteur, statut: "À expédier" }]);
  }

  async function updateStatut(id, statut) {
    setSaving(true);
    const updates = { statut };
    if (statut === "Expédié") updates.date_expedition = new Date().toISOString();
    if (statut === "Livré")   updates.date_livraison  = new Date().toISOString();
    if (statut === "Retour")  updates.date_retour     = new Date().toISOString();
    await supabase.from("commandes").update(updates).eq("id", id);
    try { await fetch(WEBHOOK + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }); } catch (e) {}
    if (selected?.id === id) setSelected(s => ({ ...s, ...updates }));
    setSaving(false);
  }

  async function saveTracking(id) {
    const val = tracking[id] || "";
    await supabase.from("commandes").update({ tracking: val }).eq("id", id);
    if (selected?.id === id) setSelected(s => ({ ...s, tracking: val }));
  }

  const count    = s => s === "tous" ? commandes.length : commandes.filter(c => c.statut === s).length;
  const filtered = commandes.filter(c => filtre === "tous" || c.statut === filtre);
  const retours  = count("Retour");

  return (
    <>
      {retours > 0 && <div className="alert-banner danger" style={{ margin: "16px 24px 0" }}>🔴 {retours} retour{retours > 1 ? "s" : ""} en cours</div>}

      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className={`kpi-card${count("À expédier") > 0 ? " kpi-alert" : ""}`}><div className="kpi-value">{count("À expédier")}</div><div className="kpi-label">À expédier</div></div>
        <div className="kpi-card"><div className="kpi-value">{count("En livraison") + count("Expédié")}</div><div className="kpi-label">En transit</div></div>
        <div className="kpi-card kpi-success"><div className="kpi-value">{count("Livré")}</div><div className="kpi-label">Livrés</div></div>
        <div className={`kpi-card${retours > 0 ? " kpi-warn" : ""}`}><div className="kpi-value">{retours}</div><div className="kpi-label">Retours</div></div>
      </div>

      <div className="toolbar">
        <div className="filter-tabs">
          {["tous", ...STATUTS_CMD].map(f => (
            <button key={f} className={`filter-tab${filtre === f ? " active" : ""}`} onClick={() => setFiltre(f)}>
              {f} <span className="filter-count">{count(f)}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Commande</button>
      </div>

      {loading ? (
        <div className="state-wrap"><div className="spinner" /> Chargement...</div>
      ) : commandes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <div className="empty-title">Aucune commande</div>
          <div className="empty-sub">Les commandes apparaissent automatiquement quand un lead est confirmé</div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Commande manuelle</button>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Client</th><th>Téléphone</th><th>Produit</th><th>Ville</th><th>Transporteur</th><th>Tracking</th><th>Statut</th><th>Créé le</th></tr></thead>
              <tbody>
                {filtered.map(c => {
                  const m = S_CMD[c.statut] || {};
                  return (
                    <tr key={c.id} className={selected?.id === c.id ? "selected" : ""} onClick={() => setSelected(c)}>
                      <td style={{ fontWeight: 600 }}>{c.client_nom || "—"}</td>
                      <td className="col-mono">{c.telephone}</td>
                      <td>{c.produit || "—"}</td>
                      <td className="col-muted">{c.ville || "—"}</td>
                      <td className="col-muted">{c.transporteur || "—"}</td>
                      <td className="col-mono col-muted">{c.tracking || "—"}</td>
                      <td><span className="status-badge" style={{ color: m.color, background: m.bg }}>{m.emoji} {c.statut}</span></td>
                      <td className="col-muted">{c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selected && (
            <aside className="detail-panel">
              <div className="panel-header">
                <div className="panel-header-top">
                  <div className="panel-name">{selected.client_nom || "Sans nom"}</div>
                  <button className="btn-close" onClick={() => setSelected(null)}>×</button>
                </div>
                <span className="status-badge" style={{ color: S_CMD[selected.statut]?.color, background: S_CMD[selected.statut]?.bg }}>
                  {S_CMD[selected.statut]?.emoji} {selected.statut}
                </span>
                <div style={{ marginTop: 8 }}>
                  <div className="panel-info-row">📞 <span className="panel-phone">{selected.telephone}</span></div>
                  {selected.ville       && <div className="panel-info-row">📍 {selected.ville}</div>}
                  {selected.produit     && <div className="panel-info-row">🛒 {selected.produit} × {selected.quantite || 1}</div>}
                  {selected.prix        && <div className="panel-info-row">💰 {selected.prix} MAD</div>}
                  {selected.conseillere && <div className="panel-info-row">👤 {selected.conseillere}</div>}
                </div>
              </div>
              <div className="panel-body">
                <div className="panel-section">
                  <div className="panel-label">Statut expédition</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {STATUTS_CMD.map(s => {
                      const m = S_CMD[s]; const active = selected.statut === s;
                      return (
                        <button key={s} className={`status-btn${active ? " active" : ""}`}
                          onClick={() => updateStatut(selected.id, s)}
                          style={active ? { borderColor: m.color + "50", background: m.bg, color: m.color } : {}}>
                          {m.emoji} {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="panel-section">
                  <div className="panel-label">Transporteur</div>
                  <select className="form-select" value={selected.transporteur || "Amana"}
                    onChange={async e => { const val = e.target.value; await supabase.from("commandes").update({ transporteur: val }).eq("id", selected.id); setSelected(s => ({ ...s, transporteur: val })); }}>
                    {TRANSPORTEURS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="panel-section">
                  <div className="panel-label">N° Tracking</div>
                  <input className="form-input" placeholder="Numéro de suivi..."
                    value={tracking[selected.id] ?? selected.tracking ?? ""}
                    onChange={e => setTracking(t => ({ ...t, [selected.id]: e.target.value }))} />
                  <button className="btn-save" style={{ marginTop: 7 }} onClick={() => saveTracking(selected.id)} disabled={saving}>
                    {saving ? "⏳ Sauvegarde..." : "💾 Enregistrer"}
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}
      {showModal && <Modal onClose={() => setShowModal(false)} onCreate={createCommande} />}
    </>
  );
}
