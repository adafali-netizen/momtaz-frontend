import { useState } from "react";

const STATUTS_CMD = ["À expédier","Expédié","En livraison","Livré","Retour"];
const S_CMD = {
  "À expédier":  { color: "#2563EB", bg: "#EFF6FF", emoji: "📦" },
  "Expédié":     { color: "#0891B2", bg: "#ECFEFF", emoji: "🚚" },
  "En livraison":{ color: "#D97706", bg: "#FFFBEB", emoji: "🛵" },
  "Livré":       { color: "#16A34A", bg: "#F0FDF4", emoji: "✅" },
  "Retour":      { color: "#DC2626", bg: "#FEF2F2", emoji: "↩️" },
};
const TRANSPORTEURS = ["Amana","Chronopost","CTM","Autre"];

function Modal({ onClose, onCreate }) {
  const [form, setForm] = useState({ client: "", telephone: "", produit: "", ville: "", quantite: 1, prix: "", transporteur: "Amana" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = () => { if (!form.client || !form.telephone) return; onCreate(form); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Nouvelle commande</span>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group"><label className="form-label">Client *</label><input className="form-input" value={form.client} onChange={e => set("client", e.target.value)} placeholder="Nom complet" /></div>
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
  const [commandes, setCommandes] = useState([]);
  const [filtre,    setFiltre]    = useState("tous");
  const [selected,  setSelected]  = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [tracking,  setTracking]  = useState({});

  const count = s => s === "tous" ? commandes.length : commandes.filter(c => c.statut === s).length;

  const create = form => {
    const id = Date.now();
    setCommandes(prev => [{ id, ...form, statut: "À expédier", created: new Date().toLocaleDateString("fr-FR"), tracking: "" }, ...prev]);
  };

  const updateStatut = (id, statut) => {
    setCommandes(prev => prev.map(c => c.id === id ? { ...c, statut } : c));
    if (selected?.id === id) setSelected(s => ({ ...s, statut }));
  };

  const saveTracking = id => {
    const val = tracking[id] || "";
    setCommandes(prev => prev.map(c => c.id === id ? { ...c, tracking: val } : c));
    if (selected?.id === id) setSelected(s => ({ ...s, tracking: val }));
  };

  const filtered = commandes.filter(c => filtre === "tous" || c.statut === filtre);
  const retours  = count("Retour");

  return (
    <>
      {retours > 0 && (
        <div className="alert-banner danger" style={{ margin: "16px 24px 0" }}>
          🔴 {retours} retour{retours > 1 ? "s" : ""} en cours à traiter
        </div>
      )}

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

      {commandes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <div className="empty-title">Aucune commande</div>
          <div className="empty-sub">Crée une commande manuellement ou attends qu'un lead soit confirmé</div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nouvelle commande</button>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th><th>Téléphone</th><th>Produit</th><th>Ville</th>
                  <th>Transporteur</th><th>Tracking</th><th>Statut</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const m = S_CMD[c.statut] || {};
                  return (
                    <tr key={c.id} className={selected?.id === c.id ? "selected" : ""} onClick={() => setSelected(c)}>
                      <td style={{ fontWeight: 600 }}>{c.client}</td>
                      <td className="col-mono">{c.telephone}</td>
                      <td>{c.produit || "—"}</td>
                      <td className="col-muted">{c.ville || "—"}</td>
                      <td className="col-muted">{c.transporteur}</td>
                      <td className="col-mono col-muted">{c.tracking || "—"}</td>
                      <td><span className="status-badge" style={{ color: m.color, background: m.bg }}>{m.emoji} {c.statut}</span></td>
                      <td className="col-muted">{c.created}</td>
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
                  <div className="panel-name">{selected.client}</div>
                  <button className="btn-close" onClick={() => setSelected(null)}>×</button>
                </div>
                <span className="status-badge" style={{ color: S_CMD[selected.statut]?.color, background: S_CMD[selected.statut]?.bg }}>
                  {S_CMD[selected.statut]?.emoji} {selected.statut}
                </span>
                <div style={{ marginTop: 8 }}>
                  <div className="panel-info-row">📞 <span className="panel-phone">{selected.telephone}</span></div>
                  {selected.ville    && <div className="panel-info-row">📍 {selected.ville}</div>}
                  {selected.produit  && <div className="panel-info-row">🛒 {selected.produit} × {selected.quantite}</div>}
                  {selected.prix     && <div className="panel-info-row">💰 {selected.prix} MAD</div>}
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
                  <div className="panel-label">N° Tracking</div>
                  <input className="form-input" placeholder="Numéro de suivi..."
                    value={tracking[selected.id] ?? selected.tracking ?? ""}
                    onChange={e => setTracking(t => ({ ...t, [selected.id]: e.target.value }))}
                  />
                  <button className="btn-save" style={{ marginTop: 7 }} onClick={() => saveTracking(selected.id)}>
                    💾 Enregistrer
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}

      {showModal && <Modal onClose={() => setShowModal(false)} onCreate={create} />}
    </>
  );
}
