import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const STATUTS = ["À appeler","Confirmé","Injoignable","Demande de rappel","Annulé","Pas intéressé","Numéro faux"];

const S = {
  "À appeler":         { color: "#2563EB", bg: "#EFF6FF", emoji: "📋" },
  "Confirmé":          { color: "#16A34A", bg: "#F0FDF4", emoji: "✅" },
  "Injoignable":       { color: "#D97706", bg: "#FFFBEB", emoji: "📵" },
  "Demande de rappel": { color: "#7C3AED", bg: "#F5F3FF", emoji: "🔔" },
  "Annulé":            { color: "#DC2626", bg: "#FEF2F2", emoji: "❌" },
  "Pas intéressé":     { color: "#64748B", bg: "#F8FAFC", emoji: "🚫" },
  "Numéro faux":       { color: "#DC2626", bg: "#FEF2F2", emoji: "⚠️" },
};

const FILTRES = ["tous","À appeler","Confirmé","Injoignable","Demande de rappel","Annulé"];
const WEBHOOK  = "https://momtaz-webhook-production.up.railway.app/api/lead/";

function StatusBadge({ statut }) {
  const m = S[statut] || { color: "#64748B", bg: "#F8FAFC", emoji: "•" };
  return <span className="status-badge" style={{ color: m.color, background: m.bg }}>{m.emoji} {statut}</span>;
}

export default function Leads({ role, nom }) {
  const [leads,       setLeads]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filtre,      setFiltre]      = useState("tous");
  const [search,      setSearch]      = useState("");
  const [selected,    setSelected]    = useState(null);
  const [commentaire, setCommentaire] = useState("");
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    fetchLeads();
    const ch = supabase.channel("leads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, fetchLeads)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchLeads() {
    let q = supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (role !== "admin") q = q.eq("conseillere", nom);
    const { data, error } = await q;
    if (!error) setLeads(data);
    setLoading(false);
  }

  async function updateStatut(id, statut) {
    await supabase.from("leads").update({ statut }).eq("id", id);
    await fetch(WEBHOOK + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statut }) });
    if (selected?.id === id) setSelected({ ...selected, statut });
  }

  async function saveComment() {
    if (!selected) return;
    setSaving(true);
    await supabase.from("leads").update({ commentaire }).eq("id", selected.id);
    await fetch(WEBHOOK + selected.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentaire }) });
    setSaving(false);
    setSelected({ ...selected, commentaire });
  }

  function openLead(lead) { setSelected(lead); setCommentaire(lead.commentaire || ""); }

  const count   = f => f === "tous" ? leads.length : leads.filter(l => l.statut === f).length;
  const rappels = leads.filter(l => l.statut === "Demande de rappel").length;

  const filtered = leads
    .filter(l => filtre === "tous" || l.statut === filtre)
    .filter(l => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (l.client_nom||"").toLowerCase().includes(q) || (l.telephone||"").includes(q) || (l.ville||"").toLowerCase().includes(q) || (l.produit||"").toLowerCase().includes(q);
    });

  return (
    <>
      {/* KPI Row */}
      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className="kpi-card"><div className="kpi-value">{leads.length}</div><div className="kpi-label">Total leads</div></div>
        <div className={`kpi-card${count("À appeler") > 0 ? " kpi-alert" : ""}`}><div className="kpi-value">{count("À appeler")}</div><div className="kpi-label">À appeler</div></div>
        <div className="kpi-card kpi-success"><div className="kpi-value">{count("Confirmé")}</div><div className="kpi-label">Confirmés</div></div>
        <div className="kpi-card"><div className="kpi-value">{count("Injoignable")}</div><div className="kpi-label">Injoignables</div></div>
        {role === "admin" && <div className={`kpi-card${rappels > 3 ? " kpi-warn" : ""}`}><div className="kpi-value">{rappels}</div><div className="kpi-label">Rappels</div></div>}
      </div>

      {/* Alert */}
      {rappels > 4 && (
        <div className="alert-banner warning" style={{ margin: "0 24px 10px" }}>
          ⚠️ {rappels} rappels en attente — à traiter en priorité
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Nom, téléphone, ville, produit..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="filter-tabs">
          {FILTRES.map(f => (
            <button key={f} className={`filter-tab${filtre === f ? " active" : ""}`} onClick={() => setFiltre(f)}>
              {f} <span className="filter-count">{count(f)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="leads-layout">
        <div className="leads-list">
          {loading ? (
            <div className="state-wrap"><div className="spinner" /> Chargement...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-title">Aucun lead trouvé</div>
              <div className="empty-sub">Essaie un autre filtre ou efface la recherche</div>
            </div>
          ) : filtered.map(lead => {
            const m = S[lead.statut] || {};
            return (
              <div key={lead.id} className={`lead-card${selected?.id === lead.id ? " selected" : ""}`} onClick={() => openLead(lead)}>
                <div>
                  <div className="card-name">{lead.client_nom || "Sans nom"}</div>
                  <div className="card-phone">{lead.telephone}</div>
                </div>
                <div className="card-badge"><StatusBadge statut={lead.statut} /></div>
                <div className="card-tags">
                  {lead.ville   && <span className="tag">{lead.ville}</span>}
                  {lead.produit && <span className="tag blue">{lead.produit}</span>}
                  {lead.source  && <span className="tag">{lead.source}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail Panel */}
        {selected && (
          <aside className="detail-panel">
            <div className="panel-header">
              <div className="panel-header-top">
                <div className="panel-name">{selected.client_nom || "Sans nom"}</div>
                <button className="btn-close" onClick={() => setSelected(null)}>×</button>
              </div>
              <StatusBadge statut={selected.statut} />
              <div style={{ marginTop: 8 }}>
                <div className="panel-info-row">📞 <span className="panel-phone">{selected.telephone}</span></div>
                {selected.ville      && <div className="panel-info-row">📍 {selected.ville}{selected.adresse ? ` — ${selected.adresse}` : ""}</div>}
                {selected.conseillere && <div className="panel-info-row">👤 {selected.conseillere}</div>}
              </div>
            </div>

            <div className="panel-body">
              {selected.produit && (
                <div className="panel-section">
                  <div className="panel-label">Commande</div>
                  <div className="product-card">
                    <div className="product-title">{selected.produit}</div>
                    <div className="product-meta">
                      {selected.quantite && <span className="product-chip">Qté <strong>{selected.quantite}</strong></span>}
                      {selected.prix     && <span className="product-chip">Prix <strong>{selected.prix} MAD</strong></span>}
                      {selected.source   && <span className="product-chip">via <strong>{selected.source}</strong></span>}
                    </div>
                  </div>
                </div>
              )}

              <div className="panel-section">
                <div className="panel-label">Statut</div>
                <div className="status-grid">
                  {STATUTS.map(s => {
                    const m = S[s]; const active = selected.statut === s;
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
                <div className="panel-label">Note opérateur</div>
                <textarea className="comment-area" value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Ajouter une note..." />
                <button className="btn-save" onClick={saveComment} disabled={saving}>{saving ? "⏳ Sauvegarde..." : "💾 Sauvegarder"}</button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
