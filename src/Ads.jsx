import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const PLATEFORMES = ["Facebook", "TikTok", "Google", "Autre"];
const CPL_SEUIL   = 25; // MAD

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function Modal({ onClose, onCreate }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    date: today, produit: "", plateforme: "Facebook",
    budget_mad: "", budget_usd: "", impressions: "", clics: "",
    cpm: "", ctr: "", cpc: "", visites: "", pct_arrivee: "",
    leads: "", cout_visite: "", conv_site: "", creatives: "",
  });
  const [avance,   setAvance]   = useState(false);
  const [nomsProd, setNomsProd] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    supabase.from("produits").select("nom").order("nom").then(({ data }) => {
      if (data) setNomsProd(data.map(p => p.nom));
    });
  }, []);

  // CPL auto-calculé
  const cpl = form.budget_mad && form.leads && +form.leads > 0
    ? (+form.budget_mad / +form.leads).toFixed(1) : null;

  const submit = async () => {
    if (!form.date || !form.budget_mad) return;
    await onCreate({ ...form, cpl: cpl ? +cpl : 0 });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">+ Dépense publicitaire</span>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* Champs essentiels */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input className="form-input" type="date" value={form.date} onChange={e => set("date", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Plateforme</label>
              <select className="form-select" value={form.plateforme} onChange={e => set("plateforme", e.target.value)}>
                {PLATEFORMES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Produit</label>
              <select className="form-select" value={form.produit} onChange={e => set("produit", e.target.value)}>
                <option value="">— Aucun —</option>
                {nomsProd.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Créatives</label>
              <input className="form-input" value={form.creatives} onChange={e => set("creatives", e.target.value)} placeholder="Vidéo A, Image B..." />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Budget MAD *</label>
              <input className="form-input" type="number" value={form.budget_mad} onChange={e => set("budget_mad", e.target.value)} placeholder="150" />
            </div>
            <div className="form-group">
              <label className="form-label">Leads générés</label>
              <input className="form-input" type="number" value={form.leads} onChange={e => set("leads", e.target.value)} placeholder="16" />
            </div>
          </div>

          {/* CPL auto */}
          {cpl && (
            <div style={{ padding: "10px 12px", background: "var(--surface2)", borderRadius: 8, fontSize: 13 }}>
              CPL calculé : <strong style={{ color: +cpl > CPL_SEUIL ? "var(--red)" : "var(--green)", fontFamily: "JetBrains Mono" }}>{cpl} MAD</strong>
              {+cpl > CPL_SEUIL && <span style={{ color: "var(--orange)", marginLeft: 8, fontSize: 11 }}>⚠️ Seuil {CPL_SEUIL} MAD dépassé</span>}
            </div>
          )}

          {/* Toggle champs avancés */}
          <button className="btn btn-secondary btn-sm" onClick={() => setAvance(v => !v)} style={{ alignSelf: "flex-start" }}>
            {avance ? "▲ Masquer" : "▼ Champs avancés"} (Impressions, CTR, CPC…)
          </button>

          {avance && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Budget USD</label>
                  <input className="form-input" type="number" value={form.budget_usd} onChange={e => set("budget_usd", e.target.value)} placeholder="15" />
                </div>
                <div className="form-group">
                  <label className="form-label">Impressions</label>
                  <input className="form-input" type="number" value={form.impressions} onChange={e => set("impressions", e.target.value)} placeholder="8200" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Clics</label>
                  <input className="form-input" type="number" value={form.clics} onChange={e => set("clics", e.target.value)} placeholder="246" />
                </div>
                <div className="form-group">
                  <label className="form-label">CPM (MAD)</label>
                  <input className="form-input" type="number" value={form.cpm} onChange={e => set("cpm", e.target.value)} placeholder="18.3" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">CTR (%)</label>
                  <input className="form-input" type="number" value={form.ctr} onChange={e => set("ctr", e.target.value)} placeholder="3.0" />
                </div>
                <div className="form-group">
                  <label className="form-label">CPC (MAD)</label>
                  <input className="form-input" type="number" value={form.cpc} onChange={e => set("cpc", e.target.value)} placeholder="0.6" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Visites</label>
                  <input className="form-input" type="number" value={form.visites} onChange={e => set("visites", e.target.value)} placeholder="197" />
                </div>
                <div className="form-group">
                  <label className="form-label">% Arrivée</label>
                  <input className="form-input" type="number" value={form.pct_arrivee} onChange={e => set("pct_arrivee", e.target.value)} placeholder="80" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Coût/visite (MAD)</label>
                  <input className="form-input" type="number" value={form.cout_visite} onChange={e => set("cout_visite", e.target.value)} placeholder="0.10" />
                </div>
                <div className="form-group">
                  <label className="form-label">Conv% site</label>
                  <input className="form-input" type="number" value={form.conv_site} onChange={e => set("conv_site", e.target.value)} placeholder="6.5" />
                </div>
              </div>
            </>
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
  const [loading,   setLoading]   = useState(true);
  const [filtre,    setFiltre]    = useState("tous");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchAds();
    const ch = supabase.channel("ads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ads_spend" }, fetchAds)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchAds() {
    const { data, error } = await supabase
      .from("ads_spend")
      .select("*")
      .order("date", { ascending: false });
    if (!error) setCampagnes(data || []);
    setLoading(false);
  }

  async function create(form) {
    await supabase.from("ads_spend").insert([{
      date:        form.date,
      produit:     form.produit     || null,
      plateforme:  form.plateforme,
      budget_mad:  +form.budget_mad || 0,
      budget_usd:  +form.budget_usd || 0,
      impressions: +form.impressions|| 0,
      clics:       +form.clics      || 0,
      cpm:         +form.cpm        || 0,
      ctr:         +form.ctr        || 0,
      cpc:         +form.cpc        || 0,
      visites:     +form.visites    || 0,
      pct_arrivee: +form.pct_arrivee|| 0,
      leads:       +form.leads      || 0,
      cout_visite: +form.cout_visite|| 0,
      cpl:         +form.cpl        || 0,
      conv_site:   +form.conv_site  || 0,
      creatives:   form.creatives   || null,
    }]);
  }

  async function deleteCampagne(id) {
    if (!window.confirm("Supprimer cette ligne ?")) return;
    await supabase.from("ads_spend").delete().eq("id", id);
  }

  // KPIs
  const totalBudget = campagnes.reduce((s, c) => s + (c.budget_mad || 0), 0);
  const totalLeads  = campagnes.reduce((s, c) => s + (c.leads || 0), 0);
  const cplMoyen    = totalLeads > 0 ? (totalBudget / totalLeads).toFixed(1) : 0;
  const totalImpr   = campagnes.reduce((s, c) => s + (c.impressions || 0), 0);

  // Filtres par plateforme
  const FILTRES  = ["tous", ...PLATEFORMES];
  const count    = f => f === "tous" ? campagnes.length : campagnes.filter(c => c.plateforme === f).length;
  const filtered = campagnes.filter(c => filtre === "tous" || c.plateforme === filtre);

  // Totaux ligne filtrée
  const filtBudget = filtered.reduce((s, c) => s + (c.budget_mad || 0), 0);
  const filtLeads  = filtered.reduce((s, c) => s + (c.leads || 0), 0);
  const filtCpl    = filtLeads > 0 ? (filtBudget / filtLeads).toFixed(1) : "—";

  return (
    <>
      {+cplMoyen > CPL_SEUIL && campagnes.length > 0 && (
        <div className="alert-banner warning" style={{ margin: "16px 24px 0" }}>
          ⚠️ CPL moyen ({cplMoyen} MAD) au-dessus du seuil de {CPL_SEUIL} MAD
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className="kpi-card">
          <div className="kpi-value">{totalBudget.toLocaleString()} MAD</div>
          <div className="kpi-label">Budget total</div>
        </div>
        <div className={`kpi-card${+cplMoyen > CPL_SEUIL ? " kpi-warn" : " kpi-success"}`}>
          <div className="kpi-value">{cplMoyen} MAD</div>
          <div className="kpi-label">CPL moyen</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{totalLeads}</div>
          <div className="kpi-label">Leads générés</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{totalImpr.toLocaleString()}</div>
          <div className="kpi-label">Impressions</div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="filter-tabs">
          {FILTRES.map(f => count(f) > 0 || f === "tous" ? (
            <button key={f} className={`filter-tab${filtre === f ? " active" : ""}`} onClick={() => setFiltre(f)}>
              {f} <span className="filter-count">{count(f)}</span>
            </button>
          ) : null)}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Dépense</button>
      </div>

      {loading ? (
        <div className="state-wrap"><div className="spinner" /> Chargement...</div>
      ) : campagnes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📣</div>
          <div className="empty-title">Aucune campagne</div>
          <div className="empty-sub">Enregistre tes dépenses publicitaires pour suivre CPL et budget</div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Ajouter une dépense</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Produit</th>
                <th>Plateforme</th>
                <th>Budget MAD</th>
                <th>Impressions</th>
                <th>Clics</th>
                <th>CTR</th>
                <th>Visites</th>
                <th>Leads</th>
                <th>CPL</th>
                <th>Conv%</th>
                <th>Créatives</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const cplHigh = (c.cpl || 0) > CPL_SEUIL;
                return (
                  <tr key={c.id}>
                    <td className="col-muted">{fmtDate(c.date)}</td>
                    <td style={{ fontWeight: 600 }}>{c.produit || <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td><span className="tag">{c.plateforme}</span></td>
                    <td className="col-mono">{(c.budget_mad || 0).toLocaleString()} MAD</td>
                    <td className="col-mono">{c.impressions ? c.impressions.toLocaleString() : <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td className="col-mono">{c.clics || <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td className="col-mono">{c.ctr ? `${c.ctr}%` : <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td className="col-mono">{c.visites || <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td className="col-mono" style={{ fontWeight: 700 }}>{c.leads || <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td>
                      {c.cpl > 0
                        ? <span className="col-mono" style={{ fontWeight: 700, color: cplHigh ? "var(--red)" : "var(--green)" }}>{c.cpl} MAD{cplHigh ? " ⚠️" : ""}</span>
                        : <span style={{ color: "var(--muted2)" }}>—</span>}
                    </td>
                    <td className="col-mono">{c.conv_site ? `${c.conv_site}%` : <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td className="col-muted" style={{ fontSize: 11 }}>{c.creatives || <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" style={{ color: "var(--red)" }} onClick={() => deleteCampagne(c.id)}>🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 1 && (
              <tfoot>
                <tr style={{ background: "var(--surface2)", fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: "10px 12px", fontSize: 11, color: "var(--muted2)", textTransform: "uppercase" }}>TOTAL ({filtre})</td>
                  <td className="col-mono" style={{ fontWeight: 700 }}>{filtBudget.toLocaleString()} MAD</td>
                  <td colSpan={4} />
                  <td className="col-mono" style={{ fontWeight: 700 }}>{filtLeads}</td>
                  <td className="col-mono" style={{ fontWeight: 700, color: +filtCpl > CPL_SEUIL ? "var(--red)" : "var(--green)" }}>{filtCpl} MAD</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted2)", borderTop: "1px solid var(--border)" }}>
            💡 CPL seuil : {CPL_SEUIL} MAD · CPL = Budget ÷ Leads
          </div>
        </div>
      )}

      {showModal && <Modal onClose={() => setShowModal(false)} onCreate={create} />}
    </>
  );
}
