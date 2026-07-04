import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "./supabaseClient";

const PLATEFORMES = ["Facebook", "TikTok", "Google", "Autre"];
const CPL_SEUIL   = 25; // MAD — seuil brut, indicatif uniquement (voir ratio marge/ads pour la vraie décision)

const STATUTS_LIVRES   = ["Livrée", "Facturée"];
const STATUTS_CONFIRMS = ["Confirmé", "Livrée", "Facturée", "Expédiée", "En cours de livraison"];

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
function fmtMAD(n) {
  const v = Math.round(n || 0);
  return `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString()} MAD`;
}
function calcMarge(cmd, prodMap) {
  const prix      = parseFloat(cmd.prix) || 0;
  const cout      = parseFloat(prodMap[cmd.produit]?.cout_achat) || 0;
  const fraisLivr = parseFloat(cmd.frais_livraison) || 0;
  return prix - cout - fraisLivr;
}

// ── Palette états sémantiques (hex — nécessaire pour le SVG, les var() CSS ne sont pas fiables en attribut) ──
const STATE_HEX = {
  good:    "#16A34A",
  warn:    "#D97706",
  bad:     "#DC2626",
  test:    "#94A3B8",
  neutral: "#0F172A",
};

// ── Sparkline SVG minimaliste (pas de lib, cockpit sobre) ──
function Sparkline({ data, color = "#0F172A", width = 72, height = 26 }) {
  const valid = data.map((v, i) => ({ v, i })).filter(p => p.v !== null && p.v !== undefined && !isNaN(p.v));
  if (valid.length < 2) {
    return <div style={{ width, height, display: "flex", alignItems: "center", fontSize: 10, color: "#94A3B8" }}>—</div>;
  }
  const vals  = valid.map(p => p.v);
  const min   = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const step  = width / (data.length - 1);
  const points = valid.map(p => `${p.i * step},${height - ((p.v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── KPI card (bloc 1) ──
function KPICard({ label, value, sousTexte, variationPct, data, state }) {
  const color = STATE_HEX[state] || STATE_HEX.neutral;
  const varLabel = variationPct === null
    ? "—"
    : `${variationPct > 0 ? "↑" : variationPct < 0 ? "↓" : "→"} ${Math.abs(variationPct)}% vs 7j`;
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${color}`, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div className="kpi-value" style={{ color: state === "neutral" ? undefined : color }}>{value}</div>
          <div className="kpi-label">{label}</div>
        </div>
        <Sparkline data={data} color={color} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
        <span style={{ color: "var(--muted2)" }}>{sousTexte}</span>
        <span style={{ fontWeight: 600, color: state === "test" ? "var(--muted2)" : color }}>{varLabel}</span>
      </div>
    </div>
  );
}

// ── Verdict global (bloc 1) ──
const VERDICT_META = {
  scaler:     { label: "SCALER",     color: "#16A34A", bg: "#F0FDF4", icon: "🟢" },
  surveiller: { label: "SURVEILLER", color: "#2563EB", bg: "#EFF6FF", icon: "🔵" },
  analyser:   { label: "ANALYSER",   color: "#D97706", bg: "#FFFBEB", icon: "🟠" },
  couper:     { label: "COUPER",     color: "#DC2626", bg: "#FEF2F2", icon: "🔴" },
  test:       { label: "EN TEST",    color: "#64748B", bg: "#F1F5F9", icon: "⚪" },
};
function VerdictBanner({ verdict, reason }) {
  const m = VERDICT_META[verdict] || VERDICT_META.test;
  return (
    <div style={{ margin: "16px 24px 0", padding: "12px 16px", borderRadius: 8, background: m.bg, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>{m.icon}</span>
      <span style={{ fontWeight: 700, fontSize: 13, color: m.color, letterSpacing: "0.02em" }}>{m.label}</span>
      <span style={{ fontSize: 13, color: "var(--text)" }}>— {reason}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function Modal({ onClose, onSave, initial }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState(initial ? {
    date: initial.date || today,
    produit: initial.produit || "",
    plateforme: initial.plateforme || "Facebook",
    budget_mad: initial.budget_mad ?? "",
    budget_usd: initial.budget_usd ?? "",
    impressions: initial.impressions ?? "",
    clics: initial.clics ?? "",
    cpm: initial.cpm ?? "",
    ctr: initial.ctr ?? "",
    cpc: initial.cpc ?? "",
    visites: initial.visites ?? "",
    pct_arrivee: initial.pct_arrivee ?? "",
    leads: initial.leads ?? "",
    cout_visite: initial.cout_visite ?? "",
    conv_site: initial.conv_site ?? "",
    creatives: initial.creatives || "",
  } : {
    date: today, produit: "", plateforme: "Facebook",
    budget_mad: "", budget_usd: "", impressions: "", clics: "",
    cpm: "", ctr: "", cpc: "", visites: "", pct_arrivee: "",
    leads: "", cout_visite: "", conv_site: "", creatives: "",
  });
  const [avance,   setAvance]   = useState(!!initial);
  const [nomsProd, setNomsProd] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    supabase.from("produits").select("nom").order("nom").then(({ data }) => {
      if (data) setNomsProd(data.map(p => p.nom));
    });
  }, []);

  const cpl = form.budget_mad && form.leads && +form.leads > 0
    ? (+form.budget_mad / +form.leads).toFixed(1) : null;

  const submit = async () => {
    if (!form.date || !form.budget_mad) return;
    await onSave({ ...form, cpl: cpl ? +cpl : 0 }, initial?.id || null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{initial ? "✏️ Modifier la dépense" : "+ Dépense publicitaire"}</span>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
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

          {cpl && (
            <div style={{ padding: "10px 12px", background: "var(--surface2)", borderRadius: 8, fontSize: 13 }}>
              CPL calculé : <strong style={{ color: +cpl > CPL_SEUIL ? "var(--red)" : "var(--green)", fontFamily: "JetBrains Mono" }}>{cpl} MAD</strong>
              {+cpl > CPL_SEUIL && <span style={{ color: "var(--orange)", marginLeft: 8, fontSize: 11 }}>⚠️ Seuil {CPL_SEUIL} MAD dépassé</span>}
            </div>
          )}

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

// ─────────────────────────────────────────────────────────────────────────
export default function Ads() {
  const [campagnes, setCampagnes] = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [leads,     setLeads]     = useState([]);
  const [produits,  setProduits]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filtre,    setFiltre]    = useState("tous");
  const [showModal, setShowModal] = useState(null); // null | "new" | objet campagne
  const [showJournal, setShowJournal] = useState(false);

  useEffect(() => {
    fetchAll();
    const ch = supabase.channel("ads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ads_spend" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "commandes" },  fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" },      fetchAll)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchAll() {
    const [{ data: ads }, { data: cmds }, { data: lds }, { data: prods }] = await Promise.all([
      supabase.from("ads_spend").select("*").order("date", { ascending: false }),
      supabase.from("commandes").select("statut, prix, frais_livraison, produit, created_at"),
      supabase.from("leads").select("statut, produit, created_at"),
      supabase.from("produits").select("nom, cout_achat"),
    ]);
    setCampagnes(ads   || []);
    setCommandes(cmds  || []);
    setLeads(lds       || []);
    setProduits(prods  || []);
    setLoading(false);
  }

  async function save(form, id) {
    const payload = {
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
    };
    if (id) {
      await supabase.from("ads_spend").update(payload).eq("id", id);
    } else {
      await supabase.from("ads_spend").insert([payload]);
    }
  }

  async function deleteCampagne(id) {
    if (!window.confirm("Supprimer cette ligne ?")) return;
    await supabase.from("ads_spend").delete().eq("id", id);
  }

  const prodMap = {};
  produits.forEach(p => { if (p.nom) prodMap[p.nom] = p; });

  // ── Agrégation par produit (rentabilité ads réelle) ──
  const nomsAvecAds = [...new Set(campagnes.map(c => c.produit).filter(Boolean))];

  const produitsAds = nomsAvecAds.map(nom => {
    const adsP     = campagnes.filter(c => c.produit === nom);
    const budget   = adsP.reduce((s, c) => s + (parseFloat(c.budget_mad) || 0), 0);
    const leadsAds = adsP.reduce((s, c) => s + (parseInt(c.leads) || 0), 0);

    const leadsP     = leads.filter(l => l.produit === nom);
    const leadsCRM   = leadsP.length;
    const confirmees = leadsP.filter(l => STATUTS_CONFIRMS.includes(l.statut)).length;

    const cmdP       = commandes.filter(c => c.produit === nom);
    const cmdLivrees = cmdP.filter(c => STATUTS_LIVRES.includes(c.statut));
    const livrees    = cmdLivrees.length;
    const margesUnit = cmdLivrees.map(c => calcMarge(c, prodMap));
    const margeUnitMoy = margesUnit.length ? margesUnit.reduce((a, b) => a + b, 0) / margesUnit.length : null;
    const margeTotale  = margesUnit.reduce((a, b) => a + b, 0);

    const cpl              = leadsAds > 0 ? budget / leadsAds : null;
    const coutParConfirmee = confirmees > 0 ? budget / confirmees : null;
    const coutParLivree    = livrees > 0 ? budget / livrees : null;
    const margeApresAds    = margeTotale - budget;
    const ratioMargeAds    = budget > 0 ? margeTotale / budget : null;

    let statutAds = "test";
    if (budget > 0 && livrees === 0 && leadsCRM >= 5)          statutAds = "sans_vente";
    else if (margeApresAds < 0 && livrees > 0)                  statutAds = "stop";
    else if (ratioMargeAds !== null && ratioMargeAds >= 1.5)    statutAds = "scale";
    else if (ratioMargeAds !== null && ratioMargeAds >= 1)      statutAds = "rentable";
    else if (livrees > 0)                                       statutAds = "optimiser";

    return {
      nom, budget, leadsAds, leadsCRM, confirmees, livrees,
      margeUnitMoy, margeTotale, cpl, coutParConfirmee, coutParLivree,
      margeApresAds, ratioMargeAds, statutAds,
    };
  }).sort((a, b) => b.budget - a.budget);

  // (statutAds conservé pour les alertes ci-dessous, plus affiché en tableau)

  // ── KPIs globaux (niveau exécutif) ──
  const totalBudget    = campagnes.reduce((s, c) => s + (parseFloat(c.budget_mad) || 0), 0);
  const totalLeadsCRM  = leads.length;
  const totalConfirmes = leads.filter(l => STATUTS_CONFIRMS.includes(l.statut)).length;
  const totalLivrees   = commandes.filter(c => STATUTS_LIVRES.includes(c.statut)).length;
  const cmdLivreesAll  = commandes.filter(c => STATUTS_LIVRES.includes(c.statut));
  const caLivre        = cmdLivreesAll.reduce((s, c) => s + (parseFloat(c.prix) || 0), 0);
  const margeGlobale   = cmdLivreesAll.reduce((s, c) => s + calcMarge(c, prodMap), 0);

  const cacLivre       = totalLivrees > 0 ? totalBudget / totalLivrees : null;
  const margeApresAdsG = margeGlobale - totalBudget;
  const ratioMargeAdsG = totalBudget > 0 ? margeGlobale / totalBudget : null;
  const txConfGlobal   = totalLeadsCRM > 0 ? Math.round((totalConfirmes / totalLeadsCRM) * 100) : 0;
  const txLivrGlobal   = totalConfirmes > 0 ? Math.round((totalLivrees / totalConfirmes) * 100) : 0;
  const partAdsCA      = caLivre > 0 ? Math.round((totalBudget / caLivre) * 100) : 0;
  const totalLeadsAdsG = campagnes.reduce((s, c) => s + (parseInt(c.leads) || 0), 0);
  const cplMoyenGlobal = totalLeadsAdsG > 0 ? totalBudget / totalLeadsAdsG : null;
  const totalImpressionsG = campagnes.reduce((s, c) => s + (parseInt(c.impressions) || 0), 0);
  const totalClicsG       = campagnes.reduce((s, c) => s + (parseInt(c.clics) || 0), 0);
  const totalVisitesG     = campagnes.reduce((s, c) => s + (parseInt(c.visites) || 0), 0);
  const ctrGlobal = totalImpressionsG > 0 ? (totalClicsG / totalImpressionsG) * 100 : null;
  const cvrGlobal = totalVisitesG > 0 ? (totalLeadsAdsG / totalVisitesG) * 100
                   : totalClicsG > 0   ? (totalLeadsAdsG / totalClicsG) * 100 : null;
  const coutLeadConfirmeGlobal = totalConfirmes > 0 ? totalBudget / totalConfirmes : null;

  // ── Séries journalières 7 jours (base des sparklines + variations bloc 1) ──
  const last7DatesG = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  function dailyGlobal(dateStr) {
    const rowsAds = campagnes.filter(c => c.date === dateStr);
    const budget      = rowsAds.reduce((s, c) => s + (parseFloat(c.budget_mad) || 0), 0);
    const leadsAdsD   = rowsAds.reduce((s, c) => s + (parseInt(c.leads) || 0), 0);
    const impressions = rowsAds.reduce((s, c) => s + (parseInt(c.impressions) || 0), 0);
    const clics       = rowsAds.reduce((s, c) => s + (parseInt(c.clics) || 0), 0);
    const visites     = rowsAds.reduce((s, c) => s + (parseInt(c.visites) || 0), 0);

    const leadsDuJour     = leads.filter(l => (l.created_at || "").slice(0, 10) === dateStr);
    const confirmesDuJour = leadsDuJour.filter(l => STATUTS_CONFIRMS.includes(l.statut)).length;
    const livreesDuJour   = commandes.filter(c => (c.created_at || "").slice(0, 10) === dateStr && STATUTS_LIVRES.includes(c.statut));
    const margeDuJour     = livreesDuJour.reduce((s, c) => s + calcMarge(c, prodMap), 0);

    return {
      cpl:               leadsAdsD > 0 ? budget / leadsAdsD : null,
      ctr:               impressions > 0 ? (clics / impressions) * 100 : null,
      cvr:               visites > 0 ? (leadsAdsD / visites) * 100 : (clics > 0 ? (leadsAdsD / clics) * 100 : null),
      coutLeadConfirme:  confirmesDuJour > 0 ? budget / confirmesDuJour : null,
      margeApresAds:     margeDuJour - budget,
    };
  }
  const serieGlobale = last7DatesG.map(dailyGlobal);
  function serie(key) { return serieGlobale.map(d => d[key]); }
  function variationVs7j(key) {
    const vals = serieGlobale.map(d => d[key]).filter(v => v !== null && v !== undefined && !isNaN(v));
    if (vals.length < 3) return null;
    const today    = vals[vals.length - 1];
    const prevAvg  = vals.slice(0, -1).reduce((a, b) => a + b, 0) / (vals.length - 1);
    if (!prevAvg) return null;
    return Math.round(((today - prevAvg) / prevAvg) * 100);
  }

  // ── États des 5 KPI ──
  const volumeOk = totalLeadsAdsG >= 5;
  const cplVar = variationVs7j("cpl");
  const ctrVar = variationVs7j("ctr");
  const cvrVar = variationVs7j("cvr");
  const coutConfVar  = variationVs7j("coutLeadConfirme");
  const margeVar     = variationVs7j("margeApresAds");

  const cplState = !volumeOk ? "test" : cplMoyenGlobal === null ? "neutral" : cplMoyenGlobal <= CPL_SEUIL ? "good" : "bad";
  const ctrState = !volumeOk || totalImpressionsG < 100 ? "test" : ctrVar === null ? "neutral" : ctrVar >= 0 ? "good" : ctrVar >= -20 ? "warn" : "bad";
  const cvrState = !volumeOk ? "test" : cvrVar === null ? "neutral" : cvrVar >= 0 ? "good" : cvrVar >= -20 ? "warn" : "bad";
  const ratioCoutConfCPL = (coutLeadConfirmeGlobal !== null && cplMoyenGlobal) ? coutLeadConfirmeGlobal / cplMoyenGlobal : null;
  const coutConfState = totalConfirmes < 3 ? "test" : ratioCoutConfCPL === null ? "neutral" : ratioCoutConfCPL <= 1.3 ? "good" : ratioCoutConfCPL <= 2 ? "warn" : "bad";
  const margeState = totalLivrees < 3 ? "test" : margeApresAdsG >= 0 ? "good" : "bad";

  // ── Verdict global (4 niveaux + EN TEST) ──
  function computeVerdictGlobal() {
    if (!volumeOk) return { verdict: "test", reason: "Volume de leads insuffisant sur la période pour trancher." };
    if (margeApresAdsG < 0) {
      if (ratioCoutConfCPL !== null && ratioCoutConfCPL > 2) {
        return { verdict: "couper", reason: "Marge négative et coût par lead confirmé plus de 2x le CPL — leads de mauvaise qualité, non viable en l'état." };
      }
      return { verdict: "analyser", reason: "Marge après ads négative — identifier la cause précise avant d'agir sur le budget." };
    }
    const degradation = (ctrVar !== null && ctrVar < -20) || (cvrVar !== null && cvrVar < -20) || (cplVar !== null && cplVar > 20);
    if (degradation) {
      return { verdict: "surveiller", reason: "Marge positive mais un signal se dégrade (CTR, CVR ou CPL) — observer avant de scaler." };
    }
    return { verdict: "scaler", reason: "Tous les signaux sont sains — candidat à l'augmentation de budget." };
  }
  const verdictGlobal = computeVerdictGlobal();

  // ── Tendance CPL 7 derniers jours, par produit ──
  const last7Dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  function cplTrend(nom) {
    return last7Dates.map(date => {
      const rows   = campagnes.filter(c => c.produit === nom && c.date === date);
      const budget = rows.reduce((s, c) => s + (parseFloat(c.budget_mad) || 0), 0);
      const ldsD   = rows.reduce((s, c) => s + (parseInt(c.leads) || 0), 0);
      return {
        jour: new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        cpl: ldsD > 0 ? +(budget / ldsD).toFixed(1) : null,
      };
    });
  }

  // ── Alertes prioritaires ──
  const produitsStop      = produitsAds.filter(p => p.statutAds === "stop");
  const produitsSansVente = produitsAds.filter(p => p.statutAds === "sans_vente");
  const produitsScale     = produitsAds.filter(p => p.statutAds === "scale");
  const alertes = [];
  if (margeApresAdsG < 0) alertes.push({ level: "critical", text: `Marge nette après ads négative globalement (${fmtMAD(margeApresAdsG)}) — le business perd de l'argent sur l'ensemble des campagnes.` });
  if (produitsSansVente.length) alertes.push({ level: "critical", text: `${produitsSansVente.length} produit(s) dépensent du budget sans aucune vente livrée : ${produitsSansVente.map(p => p.nom).join(", ")}.` });
  if (produitsStop.length) alertes.push({ level: "critical", text: `${produitsStop.length} produit(s) en perte nette après ads : ${produitsStop.map(p => p.nom).join(", ")}.` });
  if (produitsScale.length) alertes.push({ level: "success", text: `${produitsScale.length} produit(s) rentable(s) (ratio marge/ads ≥ 1.5) à scaler : ${produitsScale.map(p => p.nom).join(", ")}.` });

  // ── Analyse & recommandations (style agence media buying) ──
  function trendDirection(nom) {
    const pts = cplTrend(nom).map(d => d.cpl).filter(v => v !== null);
    if (pts.length < 2) return null;
    const first = pts[0], last = pts[pts.length - 1];
    if (!first) return null;
    const delta = ((last - first) / first) * 100;
    if (delta > 15)  return { dir: "hausse", pct: Math.round(delta) };
    if (delta < -15) return { dir: "baisse", pct: Math.round(Math.abs(delta)) };
    return { dir: "stable", pct: Math.round(Math.abs(delta)) };
  }

  const recommandations = [];
  if (partAdsCA >= 100) {
    recommandations.push({ level: "critical", title: "Structure économique intenable",
      text: `Le budget ads (${fmtMAD(totalBudget)}) dépasse le chiffre d'affaires livré (${partAdsCA}% du CA). Chaque MAD investi coûte plus qu'il ne rapporte au global. Priorité : geler toute augmentation de budget et corriger la rentabilité produit par produit avant de réinjecter du cash.` });
  } else if (partAdsCA > 30) {
    recommandations.push({ level: "warning", title: "Dépendance élevée au paid",
      text: `${partAdsCA}% du CA livré part dans la pub. Marge de sécurité réduite si le CPL continue de grimper — vérifier que la marge produit peut absorber une hausse de 10-15% du CPL sans devenir négative.` });
  } else {
    recommandations.push({ level: "success", title: "Poids du marketing sous contrôle",
      text: `${partAdsCA}% du CA livré consacré à l'acquisition — niveau sain, marge de manœuvre pour tester de nouvelles créatives sans mettre la rentabilité en danger.` });
  }

  produitsAds.forEach(p => {
    const trend = trendDirection(p.nom);
    let level = "info", text = "";
    if (p.statutAds === "scale") {
      level = "success";
      text = `Rentable (ratio marge/ads ${p.ratioMargeAds.toFixed(2)}). Augmenter le budget progressivement (+20-30%/jour) tant que le CPL reste stable et que le stock suit.`;
    } else if (p.statutAds === "rentable") {
      level = "success";
      text = `Rentable mais marge de manœuvre limitée (ratio ${p.ratioMargeAds.toFixed(2)}). Stabiliser avant de scaler — surveiller le CPL de près.`;
    } else if (p.statutAds === "optimiser") {
      level = "warning";
      text = `Des ventes réelles mais l'équation économique reste fragile. Tester une nouvelle créative ou resserrer le ciblage avant d'augmenter le budget.`;
    } else if (p.statutAds === "stop") {
      level = "critical";
      text = `Perte nette de ${fmtMAD(Math.abs(p.margeApresAds))} après ads. Couper le budget ou revoir le prix/coût produit — ne pas laisser tourner en l'état.`;
    } else if (p.statutAds === "sans_vente") {
      level = "critical";
      text = `${fmtMAD(p.budget)} dépensés sans aucune vente livrée. Vérifier la landing page, l'offre affichée dans la pub, ou la réactivité du call center avant de continuer à dépenser.`;
    } else {
      level = "info";
      text = `Volume encore trop faible (${p.leadsCRM} leads) pour trancher. Laisser tourner en test avant toute décision de scale ou de coupe.`;
    }
    if (trend?.dir === "hausse")  text += ` ⚠️ CPL en hausse de ${trend.pct}% sur la période observée — signal de fatigue créative ou de saturation d'audience à surveiller de près.`;
    if (trend?.dir === "baisse") text += ` 📉 CPL en baisse de ${trend.pct}% — bon signe, la créative/audience actuelle performe mieux qu'en début de période.`;
    recommandations.push({ level, title: p.nom, text });
  });

  const RECO_STYLE = {
    critical: { border: "var(--red)",    bg: "var(--red-lt)" },
    warning:  { border: "var(--orange)", bg: "var(--orange-lt)" },
    success:  { border: "var(--green)",  bg: "var(--green-lt)" },
    info:     { border: "var(--blue)",   bg: "var(--blue-lt)" },
  };

  // ── Filtres tableau brut (plateforme) ──
  const FILTRES  = ["tous", ...PLATEFORMES];
  const count    = f => f === "tous" ? campagnes.length : campagnes.filter(c => c.plateforme === f).length;
  const filtered = campagnes.filter(c => filtre === "tous" || c.plateforme === filtre);
  const filtBudget = filtered.reduce((s, c) => s + (parseFloat(c.budget_mad) || 0), 0);
  const filtLeads  = filtered.reduce((s, c) => s + (parseInt(c.leads) || 0), 0);
  const filtCpl    = filtLeads > 0 ? (filtBudget / filtLeads).toFixed(1) : "—";

  return (
    <>
      {/* ── BLOC 1 : Verdict global ── */}
      <VerdictBanner verdict={verdictGlobal.verdict} reason={verdictGlobal.reason} />

      {/* ── BLOC 1 : Alertes actives ── */}
      {alertes.map((a, i) => (
        a.level === "critical" ? (
          <div key={i} className="alert-banner danger" style={{ margin: "8px 24px 0" }}>
            🔴 {a.text}
          </div>
        ) : (
          <div key={i} style={{ margin: "8px 24px 0", padding: "10px 14px", borderRadius: "var(--radius)", background: "var(--green-lt)", border: "1px solid #BBF7D0", color: "var(--green)" }}>
            🟢 {a.text}
          </div>
        )
      ))}

      {/* ── BLOC 1 : 5 KPI cards (CPL · CTR · CVR · Coût/lead confirmé · Marge après ads) ── */}
      <div className="kpi-row" style={{ padding: "16px 24px 12px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <KPICard
          label="CPL" state={cplState} data={serie("cpl")} variationPct={cplVar}
          value={cplMoyenGlobal !== null ? `${cplMoyenGlobal.toFixed(1)} MAD` : "—"}
          sousTexte="Coût pour 1 lead"
        />
        <KPICard
          label="CTR" state={ctrState} data={serie("ctr")} variationPct={ctrVar}
          value={ctrGlobal !== null ? `${ctrGlobal.toFixed(1)}%` : "—"}
          sousTexte="% qui cliquent sur la pub"
        />
        <KPICard
          label="CVR" state={cvrState} data={serie("cvr")} variationPct={cvrVar}
          value={cvrGlobal !== null ? `${cvrGlobal.toFixed(1)}%` : "—"}
          sousTexte="% qui deviennent lead"
        />
        <KPICard
          label="Coût / lead confirmé" state={coutConfState} data={serie("coutLeadConfirme")} variationPct={coutConfVar}
          value={coutLeadConfirmeGlobal !== null ? `${coutLeadConfirmeGlobal.toFixed(0)} MAD` : "—"}
          sousTexte="Coût réel après filtre qualité"
        />
        <KPICard
          label="Marge après ads" state={margeState} data={serie("margeApresAds")} variationPct={margeVar}
          value={fmtMAD(margeApresAdsG)}
          sousTexte="Profit réel, spend déduit"
        />
      </div>

      {/* ── Analyse & Recommandations ── */}
      <div style={{ margin: "0 24px 24px" }}>
        <div style={{ fontWeight: 700, fontSize: 13, margin: "0 0 10px" }}>📊 Analyse & Recommandations</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recommandations.map((r, i) => {
            const s = RECO_STYLE[r.level];
            return (
              <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: s.bg, borderLeft: `3px solid ${s.border}` }}>
                {r.title && <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 3, color: s.border }}>{r.title}</div>}
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{r.text}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tendance CPL 7 jours, par produit ── */}
      {nomsAvecAds.length > 0 && (
        <div style={{ margin: "0 24px 24px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, margin: "0 0 10px" }}>Tendance CPL — 7 derniers jours</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {nomsAvecAds.map(nom => {
              const data = cplTrend(nom);
              const vals = data.map(d => d.cpl).filter(v => v !== null);
              const dernier = vals.length ? vals[vals.length - 1] : null;
              return (
                <div key={nom} className="table-wrap" style={{ flex: "1 1 380px", minWidth: 320, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{nom}</span>
                    <span className="col-mono" style={{ fontSize: 13, fontWeight: 700, color: dernier === null ? "var(--muted2)" : dernier > CPL_SEUIL ? "var(--red)" : "var(--green)" }}>
                      {dernier !== null ? `${dernier} MAD` : "—"}
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="jour" tick={{ fontSize: 10, fill: "var(--muted2)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted2)" }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip formatter={v => v !== null ? [`${v} MAD`, "CPL"] : ["—", "CPL"]} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Line type="monotone" dataKey="cpl" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Journal des dépenses (détail, replié par défaut) ── */}
      {loading ? (
        <div className="state-wrap"><div className="spinner" /> Chargement...</div>
      ) : campagnes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📣</div>
          <div className="empty-title">Aucune campagne</div>
          <div className="empty-sub">Enregistre tes dépenses publicitaires pour suivre la rentabilité</div>
          <button className="btn btn-primary" onClick={() => setShowModal("new")}>+ Ajouter une dépense</button>
        </div>
      ) : (
        <div style={{ margin: "0 24px 24px" }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "var(--surface2)", borderRadius: 8, cursor: "pointer" }}
            onClick={() => setShowJournal(v => !v)}
          >
            <span style={{ fontWeight: 700, fontSize: 13 }}>{showJournal ? "▾" : "▸"} Journal des dépenses ({campagnes.length})</span>
            <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); setShowModal("new"); }}>+ Dépense</button>
          </div>

          {showJournal && (
            <div style={{ marginTop: 12 }}>
              <div className="toolbar">
                <div className="filter-tabs">
                  {FILTRES.map(f => count(f) > 0 || f === "tous" ? (
                    <button key={f} className={`filter-tab${filtre === f ? " active" : ""}`} onClick={() => setFiltre(f)}>
                      {f} <span className="filter-count">{count(f)}</span>
                    </button>
                  ) : null)}
                </div>
              </div>
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
                const cplRow = c.leads > 0 ? +(c.budget_mad / c.leads).toFixed(1) : 0;
                const cplHigh = cplRow > CPL_SEUIL;
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
                      {cplRow > 0
                        ? <span className="col-mono" style={{ fontWeight: 700, color: cplHigh ? "var(--red)" : "var(--green)" }}>{cplRow} MAD{cplHigh ? " ⚠️" : ""}</span>
                        : <span style={{ color: "var(--muted2)" }}>—</span>}
                    </td>
                    <td className="col-mono">{c.conv_site ? `${c.conv_site}%` : <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td className="col-muted" style={{ fontSize: 11 }}>{c.creatives || <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(c)}>✏️</button>
                        <button className="btn btn-secondary btn-sm" style={{ color: "var(--red)" }} onClick={() => deleteCampagne(c.id)}>🗑</button>
                      </div>
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
                  💡 CPL seuil indicatif : {CPL_SEUIL} MAD · CPL = Budget ÷ Leads · Voir "Analyse & Recommandations" en haut de page pour la rentabilité réelle
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <Modal
          onClose={() => setShowModal(null)}
          onSave={save}
          initial={showModal === "new" ? null : showModal}
        />
      )}
    </>
  );
}
