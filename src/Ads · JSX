import { useState } from "react";

const PLATEFORMES = ["Meta", "TikTok", "Google", "Autre"];
const CPL_SEUIL   = 25; // MAD

function Modal({ onClose, onCreate }) {
  const [form, setForm] = useState({ campagne: "", produit: "", budget: "", leads: "", plateforme: "Meta" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const cpl = form.budget && form.leads && +form.leads > 0 ? (+form.budget / +form.leads).toFixed(1) : "—";
  const submit = () => { if (!form.campagne || !form.budget) return; onCreate(form); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">+ Dépense publicitaire</span><button className="btn-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Nom de la campagne *</label><input className="form-input" value={form.campagne} onChange={e => set("campagne", e.target.value)} placeholder="Campagne Ceinture Juin..." /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Produit lié</label><input className="form-input" value={form.produit} onChange={e => set("produit", e.target.value)} placeholder="Ceinture magnétique" /></div>
            <div className="form-group"><label className="form-label">Plateforme</label>
              <select className="form-select" value={form.plateforme} onChange={e => set("plateforme", e.target.value)}>
                {PLATEFORMES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Budget dépensé (MAD) *</label><input className="form-input" type="number" value={form.budget} onChange={e => set("budget", e.target.value)} placeholder="500" /></div>
            <div className="form-group"><label className="form-label">Leads générés</label><input className="form-input" type="number" value={form.leads} onChange={e => set("leads", e.target.value)} placeholder="28" /></div>
          </div>
          {form.budget && form.leads && (
            <div style={{ padding: "10px 12px", background: "var(--surface2)", borderRadius: 8, fontSize: 13 }}>
              CPL calculé : <strong style={{ color: +cpl > CPL_SEUIL ? "var(--red)" : "var(--green)", fontFamily: "JetBrains Mono" }}>{cpl} MAD</strong>
              {+cpl > CPL_SEUIL && <span style={{ color: "var(--orange)", marginLeft: 8, fontSize: 11 }}>⚠️ Au-dessus du seuil ({CPL_SEUIL} MAD)</span>}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

export default function Ads() {
  const [campagnes, setCampagnes] = useState([]);
  const [filtre,    setFiltre]    = useState("tous");
  const [showModal, setShowModal] = useState(false);

  const create = f => setCampagnes(prev => [{
    id: Date.now(),
    campagne: f.campagne, produit: f.produit, plateforme: f.plateforme,
    budget: +f.budget, leads: +f.leads || 0,
    cpl: f.leads > 0 ? +(+f.budget / +f.leads).toFixed(1) : 0,
    statut: "Active",
    date: new Date().toLocaleDateString("fr-FR"),
  }, ...prev]);

  const toggleStatut = id => setCampagnes(prev => prev.map(c => c.id === id ? { ...c, statut: c.statut === "Active" ? "Pausée" : "Active" } : c));

  const FILTRES = ["tous", "Active", "Pausée"];
  const count   = f => f === "tous" ? campagnes.length : campagnes.filter(c => c.statut === f).length;
  const filtered = campagnes.filter(c => filtre === "tous" || c.statut === filtre);

  const totalBudget  = campagnes.reduce((s, c) => s + c.budget, 0);
  const totalLeads   = campagnes.reduce((s, c) => s + c.leads, 0);
  const cplMoyen     = totalLeads > 0 ? (totalBudget / totalLeads).toFixed(1) : 0;
  const actives      = campagnes.filter(c => c.statut === "Active").length;

  return (
    <>
      {+cplMoyen > CPL_SEUIL && campagnes.length > 0 && (
        <div className="alert-banner warning" style={{ margin: "16px 24px 0" }}>
          ⚠️ CPL moyen élevé ({cplMoyen} MAD) — au-dessus du seuil de {CPL_SEUIL} MAD
        </div>
      )}

      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className="kpi-card"><div className="kpi-value">{totalBudget.toLocaleString()} MAD</div><div className="kpi-label">Budget ce mois</div></div>
        <div className={`kpi-card${+cplMoyen > CPL_SEUIL ? " kpi-warn" : "kpi-success"}`}><div className="kpi-value">{cplMoyen} MAD</div><div className="kpi-label">CPL moyen</div></div>
        <div className="kpi-card"><div className="kpi-value">{actives}</div><div className="kpi-label">Campagnes actives</div></div>
        <div className="kpi-card"><div className="kpi-value">{totalLeads}</div><div className="kpi-label">Leads générés</div></div>
      </div>

      <div className="toolbar">
        <div className="filter-tabs">
          {FILTRES.map(f => (
            <button key={f} className={`filter-tab${filtre === f ? " active" : ""}`} onClick={() => setFiltre(f)}>
              {f} <span className="filter-count">{count(f)}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Dépense</button>
      </div>

      {campagnes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📣</div>
          <div className="empty-title">Aucune campagne</div>
          <div className="empty-sub">Enregistre tes dépenses publicitaires pour suivre ton CPL et ton budget</div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Ajouter une dépense</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Campagne</th><th>Produit</th><th>Plateforme</th><th>Budget</th><th>Leads</th><th>CPL</th><th>Statut</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const cplHigh = c.cpl > CPL_SEUIL;
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.campagne}</td>
                    <td className="col-muted">{c.produit || "—"}</td>
                    <td><span className="tag">{c.plateforme}</span></td>
                    <td className="col-mono">{c.budget.toLocaleString()} MAD</td>
                    <td className="col-mono">{c.leads}</td>
                    <td><span className="col-mono" style={{ fontWeight: 700, color: cplHigh ? "var(--red)" : "var(--green)" }}>{c.cpl > 0 ? `${c.cpl} MAD` : "—"}{cplHigh && " ⚠️"}</span></td>
                    <td>
                      <span className="status-badge" style={{ color: c.statut === "Active" ? "#16A34A" : "#64748B", background: c.statut === "Active" ? "#F0FDF4" : "#F8FAFC" }}>
                        {c.statut === "Active" ? "🟢" : "⏸️"} {c.statut}
                      </span>
                    </td>
                    <td className="col-muted">{c.date}</td>
                    <td><button className="btn btn-secondary btn-sm" onClick={() => toggleStatut(c.id)}>{c.statut === "Active" ? "Pauser" : "Activer"}</button></td>
                  </tr>
                );
              })}
            </tbody>
            {campagnes.length > 1 && (
              <tfoot>
                <tr>
                  <td colSpan={3}><strong>TOTAL</strong></td>
                  <td className="col-mono"><strong>{totalBudget.toLocaleString()} MAD</strong></td>
                  <td className="col-mono"><strong>{totalLeads}</strong></td>
                  <td className="col-mono" style={{ color: +cplMoyen > CPL_SEUIL ? "var(--red)" : "var(--green)", fontWeight: 700 }}>{cplMoyen} MAD</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {showModal && <Modal onClose={() => setShowModal(false)} onCreate={create} />}
    </>
  );
}
