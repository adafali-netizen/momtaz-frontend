import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  Chart, LineElement, PointElement, LineController,
  BarElement, BarController, CategoryScale, LinearScale,
  Tooltip, Filler,
} from "chart.js";

Chart.register(
  LineElement, PointElement, LineController,
  BarElement, BarController,
  CategoryScale, LinearScale, Tooltip, Filler
);

// ─── Tokens ──────────────────────────────────────────────────────────────────
const CLR = {
  pageBg:      "#F4F5F7",
  cardBg:      "#FFFFFF",
  heroBgOk:    "#F0F7F0",
  heroBgAlert: "#FDF2F2",
  heroBgEmpty: "#F7F8FA",
  borderLight: "#E4E7EC",
  borderRow:   "#F1F5F9",
  textPrimary: "#0D1117",
  textSecond:  "#4B5563",
  textMuted:   "#94A3B8",
  textGhost:   "#CBD5E1",
  green:       "#16A34A",
  greenBg:     "#F0FDF4",
  greenBorder: "#BBF7D0",
  amber:       "#D97706",
  amberBg:     "#FFFBEB",
  amberBorder: "#FDE68A",
  red:         "#DC2626",
  redBg:       "#FEF2F2",
  redBorder:   "#FECACA",
  indigo:      "#534AB7",
  indigoBg:    "#EEF0FF",
  indigoBorder:"#AFA9EC",
};

const SHADOW = "0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)";
const SHADOW_HERO = "0 4px 24px rgba(0,0,0,0.08)";
const RADIUS = "10px";
const BORDER = `1px solid ${CLR.borderLight}`;

// ─── Constantes métier ────────────────────────────────────────────────────────
const FRAIS_EMBALLAGE    = 0;
const FRAIS_CONFIRMATION = 0;
const SEUIL_CONF = 35;
const SEUIL_LIVR = 55;
const STATUTS_LIVRES   = ["Livrée", "Facturée"];
const STATUTS_CONFIRMS = ["Confirmé", "Livrée", "Facturée", "Expédiée", "En cours de livraison"];
const STATUTS_EXCLUS   = ["Annulée", "Refusée", "Doublon", "Fausse commande"];

// ─── Helpers période ─────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function prevMonthRange() {
  const d = new Date();
  return {
    start: new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10),
    end:   new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10),
  };
}
function startOfQuarter() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
}

// ─── Helpers généraux ────────────────────────────────────────────────────────
function pct(val, total) { return total > 0 ? Math.round((val / total) * 100) : 0; }
function dateKey(d)       { return new Date(d).toISOString().slice(0, 10); }
function labelDate(d)     { return new Date(d).toLocaleDateString("fr", { day: "numeric", month: "short" }); }

function signal(val, seuil) {
  if (val == null)          return CLR.textGhost;
  if (val >= seuil)         return CLR.green;
  if (val >= seuil * 0.7)   return CLR.amber;
  return CLR.red;
}

const getMontant = r =>
  parseFloat(r.montant) ||
  (r.credit ? +r.credit : r.debit ? -Math.abs(+r.debit) : 0);

function calcMarge(row, prodMap) {
  const prix      = parseFloat(row.prix) || 0;
  const cout      = parseFloat(prodMap[row.produit]?.cout_achat) || 0;
  const fraisLivr = parseFloat(row.frais_livraison) || 0;
  return prix - cout - fraisLivr;
}

function decisionBadge(leads, livrees, marge) {
  if (leads < 5)                                   return "test";
  if (livrees / (leads || 1) >= 0.6 && marge > 0) return "scale";
  if (livrees / (leads || 1) >= 0.3 && marge > 0) return "opti";
  return "stop";
}
const DECISION_META = {
  scale: { label: "SCALE",     bg: "#F0FDF4",    color: CLR.green,  border: CLR.greenBorder },
  opti:  { label: "OPTIMISER", bg: CLR.amberBg,  color: CLR.amber,  border: CLR.amberBorder },
  test:  { label: "EN TEST",   bg: "#F0F7FF",    color: "#1D4ED8",  border: "#BFDBFE" },
  stop:  { label: "STOP",      bg: CLR.redBg,    color: CLR.red,    border: CLR.redBorder },
};

function fuiteLabel(taux_conf, taux_livr, marge_avg) {
  if (taux_conf < SEUIL_CONF)              return { label: "Confirmation", color: CLR.amber,  bg: CLR.amberBg };
  if (taux_livr < SEUIL_LIVR)             return { label: "Livraison",    color: CLR.red,    bg: CLR.redBg };
  if (marge_avg != null && marge_avg < 0) return { label: "Coûts",        color: CLR.indigo, bg: CLR.indigoBg };
  return null;
}

// ─── Composants UI ────────────────────────────────────────────────────────────

// POLISH : SectionDivider avec pill, ligne 1px, texte plus sombre
function SectionDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "52px 0 22px" }}>
      <div style={{ flex: 1, height: "1px", background: CLR.borderLight }} />
      <span style={{
        fontSize: "11px", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.12em",
        color: CLR.textPrimary, whiteSpace: "nowrap",
        background: CLR.cardBg,
        padding: "3px 14px",
        border: `1px solid ${CLR.borderLight}`,
        borderRadius: 20,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: "1px", background: CLR.borderLight }} />
    </div>
  );
}

function DecisionBadge({ type }) {
  const m = DECISION_META[type] || DECISION_META.test;
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: "5px",
                   fontSize: "11px", fontWeight: 600, background: m.bg, color: m.color,
                   border: `1px solid ${m.border}` }}>
      {m.label}
    </span>
  );
}

function FuiteBadge({ taux_conf, taux_livr, marge_avg }) {
  const f = fuiteLabel(taux_conf, taux_livr, marge_avg);
  if (!f) return <span style={{ color: CLR.textGhost, fontSize: 12 }}>—</span>;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "4px",
                   fontSize: "11px", fontWeight: 500, background: f.bg, color: f.color }}>
      {f.label}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: CLR.cardBg, border: BORDER, borderRadius: RADIUS,
                  padding: "20px 24px", boxShadow: SHADOW, minHeight: 120, ...style }}>
      {children}
    </div>
  );
}

// POLISH : état vide structuré avec icône + sous-texte
function EmptyState({ icon = "◎", title, sub }) {
  return (
    <div style={{
      padding: "36px 20px", textAlign: "center",
      background: "#F9FAFB", borderRadius: 8,
      border: `1px dashed ${CLR.borderLight}`,
    }}>
      <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.35 }}>{icon}</div>
      <div style={{ fontSize: 13, color: CLR.textMuted, fontWeight: 500 }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: CLR.textGhost, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const TH = {
  padding: "8px 12px", fontSize: "10px", fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em",
  color: CLR.textMuted, borderBottom: `1px solid ${CLR.borderLight}`,
  textAlign: "left", whiteSpace: "nowrap", background: "#F9FAFB",
};
const TD = (right) => ({
  padding: "10px 12px", fontSize: "13px", color: CLR.textPrimary,
  borderBottom: `1px solid ${CLR.borderRow}`,
  textAlign: right ? "right" : "left",
  verticalAlign: "middle", fontVariantNumeric: "tabular-nums",
});

function ProdTable({ rows, showDelta }) {
  if (rows.length === 0) return (
    <EmptyState
      title="Aucune donnée sur la période"
      sub="Les résultats s'afficheront dès qu'une commande livrée sera enregistrée"
    />
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            {["#", "Produit", "Cmds", "Livr.", showDelta && "Δ Marge", "Marge moy.", "Décision", "Fuite"]
              .filter(Boolean).map(h => <th key={h} style={TH}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.nom} style={{ background: i % 2 === 0 ? CLR.cardBg : "#F9FAFB" }}>
              <td style={{ ...TD(true), color: CLR.textMuted, fontSize: 11 }}>{i + 1}</td>
              <td style={{ ...TD(), maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.nom}>
                {p.nom}
              </td>
              <td style={TD(true)}>{p.total_leads}</td>
              <td style={{ ...TD(true), color: signal(p.taux_livr, SEUIL_LIVR), fontWeight: 600 }}>
                {p.total_livr}
              </td>
              {showDelta && (
                <td style={{ ...TD(true), color: p.delta_marge < 0 ? CLR.red : CLR.green, fontWeight: 600 }}>
                  {p.delta_marge != null ? `${p.delta_marge > 0 ? "+" : ""}${p.delta_marge} MAD` : "—"}
                </td>
              )}
              <td style={{ ...TD(true), fontWeight: 700,
                           color: p.marge_avg != null ? (p.marge_avg >= 0 ? CLR.green : CLR.red) : CLR.textGhost }}>
                {p.marge_avg != null ? `${p.marge_avg} MAD` : "—"}
              </td>
              <td style={TD()}><DecisionBadge type={p.decision} /></td>
              <td style={TD()}>
                <FuiteBadge taux_conf={p.taux_conf} taux_livr={p.taux_livr} marge_avg={p.marge_avg} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProgBar({ value, color }) {
  return (
    <div style={{ flex: 1, height: 4, background: CLR.borderLight, borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, value))}%`,
                    background: color, borderRadius: 99, transition: "width 0.4s ease" }} />
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function DashboardAnalytique() {
  const [dateStart, setDateStart] = useState(startOfMonth);
  const [dateEnd,   setDateEnd]   = useState(TODAY);
  const [loading,   setLoading]   = useState(true);
  const [data,      setData]      = useState(null);
  const [drill,     setDrill]     = useState(null);
  const heroRef   = useRef(null);
  const heroChart = useRef(null);
  const adsRef    = useRef(null);
  const adsChart  = useRef(null);

  useEffect(() => { fetchAll(dateStart, dateEnd); }, [dateStart, dateEnd]);

  async function fetchAll(sStr, eStr) {
    setLoading(true);
    const diffDays = Math.max(1, Math.round((new Date(eStr) - new Date(sStr)) / 86400000));
    const s2x = new Date(sStr);
    s2x.setDate(s2x.getDate() - diffDays);
    const s2Str = s2x.toISOString().slice(0, 10);

    const [
      { data: commandes }, { data: leads }, { data: adsSpend },
      { data: releve },    { data: produits },
    ] = await Promise.all([
      supabase.from("commandes")
        .select("id, created_at, statut, prix, frais_livraison, transporteur, conseillere, produit")
        .gte("created_at", s2Str).lte("created_at", eStr + "T23:59:59"),
      supabase.from("leads")
        .select("id, created_at, statut, conseillere, produit")
        .gte("created_at", sStr).lte("created_at", eStr + "T23:59:59"),
      supabase.from("ads_spend")
        .select("date, plateforme, budget_mad, spend_mad, impressions, clics, leads_count")
        .gte("date", sStr).lte("date", eStr),
      supabase.from("releve_bancaire")
        .select("*").order("date", { ascending: false }).limit(60),
      supabase.from("produits").select("id, nom, cout_achat"),
    ]);

    setData(build({
      commandes: commandes || [], leads: leads || [],
      adsSpend: adsSpend || [], releve: releve || [],
      produits: produits || [], sStr, eStr, s2Str, diffDays,
    }));
    setLoading(false);
  }

  function build({ commandes, leads, adsSpend, releve, produits, sStr, eStr, s2Str, diffDays }) {
    const prodMap = {};
    produits.forEach(p => { prodMap[p.id] = p; if (p.nom) prodMap[p.nom] = p; });

    const cmdCurrent     = commandes.filter(c => dateKey(c.created_at) >= sStr);
    const cmdLivrees     = cmdCurrent.filter(c => STATUTS_LIVRES.includes(c.statut));
    const cmdExpediables = cmdCurrent.filter(c => !STATUTS_EXCLUS.includes(c.statut));

    const byDay = {};
    for (let i = 0; i <= diffDays; i++) {
      const d = new Date(sStr); d.setDate(d.getDate() + i);
      byDay[dateKey(d)] = { sum: 0, n: 0 };
    }
    cmdLivrees.forEach(c => {
      const k = dateKey(c.created_at);
      if (byDay[k]) { byDay[k].sum += calcMarge(c, prodMap); byDay[k].n++; }
    });
    const heroLabels = Object.keys(byDay).map(labelDate);
    const heroValues = Object.values(byDay).map(d => d.n ? Math.round(d.sum / d.n) : null);
    const heroAvg    = cmdLivrees.length
      ? Math.round(cmdLivrees.reduce((s, c) => s + calcMarge(c, prodMap), 0) / cmdLivrees.length)
      : null;
    const heroPoints = heroValues.filter(v => v !== null).length;

    const PS = {};
    const initP = nom => { if (!PS[nom]) PS[nom] = { nom, cl: [], pl: [], cLeads: 0, cConf: 0 }; };
    leads.forEach(l => {
      const nom = l.produit; if (!nom) return;
      initP(nom); PS[nom].cLeads++;
      if (STATUTS_CONFIRMS.includes(l.statut)) PS[nom].cConf++;
    });
    commandes.forEach(c => {
      const nom = c.produit; if (!nom) return;
      initP(nom);
      const isCurr = dateKey(c.created_at) >= sStr;
      const isPrev = dateKey(c.created_at) >= s2Str && dateKey(c.created_at) < sStr;
      if (STATUTS_LIVRES.includes(c.statut)) {
        const m = calcMarge(c, prodMap);
        if (isCurr) PS[nom].cl.push(m);
        if (isPrev) PS[nom].pl.push(m);
      }
    });
    const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const prodList = Object.values(PS).map(p => {
      const ma = avg(p.cl), pa = avg(p.pl);
      const marge_avg = ma != null ? Math.round(ma) : null;
      const taux_conf = pct(p.cConf, p.cLeads);
      const taux_livr = pct(p.cl.length, p.cLeads);
      return {
        nom: p.nom, total_leads: p.cLeads, total_livr: p.cl.length,
        taux_conf, taux_livr, marge_avg,
        delta_marge: ma != null && pa != null ? Math.round(ma - pa) : null,
        decision: decisionBadge(p.cLeads, p.cl.length, marge_avg || 0),
      };
    });
    const byMargeCurrent = [...prodList].filter(p => p.marge_avg != null).sort((a, b) => b.marge_avg - a.marge_avg);
    const byMargeDecline = [...prodList].filter(p => p.delta_marge != null && p.delta_marge < 0).sort((a, b) => a.delta_marge - b.delta_marge);

    const totalSpend    = adsSpend.reduce((s, a) => s + (parseFloat(a.spend_mad || a.budget_mad) || 0), 0);
    const totalLeadsAds = adsSpend.reduce((s, a) => s + (parseInt(a.leads_count) || 0), 0);
    const totalClics    = adsSpend.reduce((s, a) => s + (parseInt(a.clics) || 0), 0);
    const totalImpr     = adsSpend.reduce((s, a) => s + (parseInt(a.impressions) || 0), 0);
    const cplMoyen = totalLeadsAds > 0 ? Math.round(totalSpend / totalLeadsAds) : null;
    const cplLivre = cmdLivrees.length > 0 ? Math.round(totalSpend / cmdLivrees.length) : null;
    const ctr      = totalImpr > 0 ? ((totalClics / totalImpr) * 100).toFixed(1) : null;
    const platfMap = {};
    adsSpend.forEach(a => {
      const pl = a.plateforme || "Inconnu";
      if (!platfMap[pl]) platfMap[pl] = { spend: 0, leads: 0, clics: 0, impr: 0 };
      platfMap[pl].spend += parseFloat(a.spend_mad || a.budget_mad) || 0;
      platfMap[pl].leads += parseInt(a.leads_count) || 0;
      platfMap[pl].clics += parseInt(a.clics) || 0;
      platfMap[pl].impr  += parseInt(a.impressions) || 0;
    });
    const plateformes = Object.entries(platfMap).map(([nom, d]) => ({
      nom, spend: Math.round(d.spend),
      cpl: d.leads > 0 ? Math.round(d.spend / d.leads) : null,
      ctr: d.impr  > 0 ? ((d.clics / d.impr) * 100).toFixed(1) : null,
    })).sort((a, b) => b.spend - a.spend);

    const totalLeads = leads.length;
    const confirmes  = leads.filter(l => STATUTS_CONFIRMS.includes(l.statut)).length;
    const txConf     = pct(confirmes, totalLeads);
    const txLivr     = pct(cmdLivrees.length, cmdExpediables.length || 1);
    const retours    = cmdCurrent.filter(c => ["Retour reçu", "Retour en cours"].includes(c.statut)).length;
    const txRetour   = pct(retours, cmdCurrent.length);
    const impactAds  = cplLivre || 0;
    const impactOps  = Math.max(0, SEUIL_CONF - txConf) * 2 + Math.max(0, SEUIL_LIVR - txLivr) * 3;
    const totalImp   = impactAds + impactOps;
    const pctAds     = totalImp > 0 ? Math.round((impactAds / totalImp) * 100) : 0;

    const consMap = {};
    leads.forEach(l => {
      const c = l.conseillere; if (!c) return;
      if (!consMap[c]) consMap[c] = { leads: 0, conf: 0 };
      consMap[c].leads++;
      if (STATUTS_CONFIRMS.includes(l.statut)) consMap[c].conf++;
    });
    const consStats = Object.entries(consMap)
      .map(([nom, c]) => ({ nom, leads: c.leads, taux_conf: pct(c.conf, c.leads) }))
      .sort((a, b) => b.taux_conf - a.taux_conf);

    const transMap = {};
    cmdCurrent.forEach(c => {
      const t = c.transporteur; if (!t) return;
      if (!transMap[t]) transMap[t] = { total: 0, livr: 0, ret: 0 };
      transMap[t].total++;
      if (STATUTS_LIVRES.includes(c.statut)) transMap[t].livr++;
      if (["Retour reçu", "Retour en cours"].includes(c.statut)) transMap[t].ret++;
    });
    const transStats = Object.entries(transMap).map(([nom, t]) => {
      const tl = pct(t.livr, t.total);
      return { nom, total: t.total, taux_livr: tl, taux_retour: pct(t.ret, t.total),
               grade: tl >= 60 ? "A1" : tl >= 45 ? "A2" : tl >= 40 ? "B2" : "STOP" };
    }).sort((a, b) => b.taux_livr - a.taux_livr);

    const revenues = releve.filter(r => getMontant(r) > 0);
    const expenses = releve.filter(r => getMontant(r) < 0);
    const totalRev = revenues.reduce((s, r) => s + getMontant(r), 0);
    const totalExp = expenses.reduce((s, r) => s + getMontant(r), 0);
    const solde    = totalRev + totalExp;
    const catMap   = {};
    expenses.forEach(r => {
      const cat = r.categorie || "Autre";
      catMap[cat] = (catMap[cat] || 0) + Math.abs(getMontant(r));
    });

    return {
      heroLabels, heroValues, heroAvg, heroPoints,
      prodList, byMargeCurrent, byMargeDecline,
      totalLeads, txConf, txLivr, txRetour,
      cmdLivrees: cmdLivrees.length,
      totalSpend, cplMoyen, cplLivre, ctr, plateformes,
      pctAds, pctOps: 100 - pctAds,
      consStats, transStats,
      releve, totalRev: Math.round(totalRev), totalExp: Math.round(totalExp),
      solde: Math.round(solde), catMap,
    };
  }

  useEffect(() => {
    if (!data || !heroRef.current) return;
    if (heroChart.current) heroChart.current.destroy();
    const col = data.heroAvg === null ? CLR.textGhost : data.heroAvg > 0 ? CLR.green : CLR.red;
    heroChart.current = new Chart(heroRef.current, {
      type: "line",
      data: {
        labels: data.heroLabels,
        datasets: [{
          data: data.heroValues, borderColor: col, borderWidth: 2.5,
          pointRadius: 0, tension: 0.35, fill: true,
          backgroundColor: data.heroAvg > 0 ? "rgba(22,163,74,0.09)" : "rgba(220,38,38,0.09)",
          spanGaps: data.heroPoints >= 7,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => `${ctx.parsed.y} MAD` },
          backgroundColor: CLR.textPrimary, titleColor: "#fff", bodyColor: "#fff",
          padding: 8, cornerRadius: 6,
        }},
        scales: {
          x: { display: true, grid: { display: false },
               ticks: { font: { size: 10 }, color: CLR.textMuted, maxTicksLimit: 8, maxRotation: 0 } },
          y: { grid: { color: "rgba(0,0,0,0.04)" },
               ticks: { font: { size: 10 }, color: CLR.textMuted, callback: v => v + " MAD" } },
        },
      },
    });
  }, [data]);

  useEffect(() => {
    if (!data || drill !== "ads" || !adsRef.current) return;
    setTimeout(() => {
      if (!adsRef.current) return;
      if (adsChart.current) adsChart.current.destroy();
      const labels = data.plateformes.map(p => p.nom);
      const PCOLS  = ["#534AB7", "#1877f2", "#e1306c", "#D97706", "#16A34A"];
      adsChart.current = new Chart(adsRef.current, {
        type: "bar",
        data: { labels, datasets: [{ data: data.plateformes.map(p => p.spend),
          backgroundColor: labels.map((_, i) => PCOLS[i % PCOLS.length]), borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { grid: { color: "rgba(0,0,0,0.04)" },
                 ticks: { font: { size: 10 }, callback: v => v + " MAD" } },
          },
        },
      });
    }, 80);
  }, [drill, data]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                  height: 360, color: CLR.textMuted, fontSize: 13 }}>
      Chargement…
    </div>
  );
  if (!data) return null;

  const { heroAvg, heroPoints,
          byMargeCurrent, byMargeDecline,
          totalLeads, txConf, txLivr, txRetour, cmdLivrees,
          totalSpend, cplMoyen, cplLivre, ctr, plateformes,
          pctAds, pctOps, consStats, transStats,
          releve, totalRev, totalExp, solde, catMap } = data;

  const heroBg    = heroAvg === null ? CLR.heroBgEmpty : heroAvg > 0 ? CLR.heroBgOk : CLR.heroBgAlert;
  const heroBdr   = heroAvg === null ? CLR.borderLight : heroAvg > 0 ? CLR.greenBorder : CLR.redBorder;
  const heroColor = heroAvg === null ? CLR.textGhost   : heroAvg > 0 ? CLR.green : CLR.red;
  // POLISH : chiffre héro plus grand
  const heroFontSz = heroAvg != null && String(Math.abs(heroAvg)).length <= 4 ? "72px" : "58px";
  // POLISH : ombre héro colorée selon état
  const heroShadow = heroAvg === null ? SHADOW
    : heroAvg > 0 ? "0 4px 24px rgba(22,163,74,0.12)"
    : "0 4px 24px rgba(220,38,38,0.12)";

  const gradeClr = {
    A1:   { bg: CLR.greenBg, color: CLR.green },
    A2:   { bg: CLR.greenBg, color: CLR.green },
    B2:   { bg: CLR.amberBg, color: CLR.amber },
    STOP: { bg: CLR.redBg,   color: CLR.red   },
  };
  const catColors = ["#534AB7", "#DC2626", "#D97706", "#16A34A", "#0891B2", "#94A3B8"];

  const inputStyle = {
    padding: "5px 10px", border: `1px solid ${CLR.borderLight}`, borderRadius: 7,
    fontSize: 13, color: CLR.textPrimary, background: CLR.cardBg,
    fontFamily: "inherit", cursor: "pointer", outline: "none",
  };
  const shortcutStyle = {
    padding: "5px 12px", border: `1px solid ${CLR.borderLight}`, borderRadius: 6,
    fontSize: 12, fontWeight: 500, color: CLR.textSecond, background: CLR.cardBg,
    cursor: "pointer", transition: "all 0.15s", outline: "none",
  };

  const fmtDate = d => new Date(d).toLocaleDateString("fr", { day: "numeric", month: "short" });
  const periodLabel = `${fmtDate(dateStart)} — ${fmtDate(dateEnd)}`;

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "0 24px 48px",
                  background: CLR.pageBg }}>

      {/* ── Header ── */}
      <div style={{ padding: "16px 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: CLR.textPrimary }}>Cockpit analytique</span>
          <span style={{ fontSize: 12, color: CLR.textMuted }}>
            {new Date().toLocaleDateString("fr", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 16,
                      borderBottom: `1px solid ${CLR.borderLight}`, flexWrap: "wrap" }}>
          <input type="date" value={dateStart} max={dateEnd}
            onChange={e => setDateStart(e.target.value)} style={inputStyle} />
          <span style={{ fontSize: 12, color: CLR.textMuted }}>→</span>
          <input type="date" value={dateEnd} min={dateStart} max={TODAY}
            onChange={e => setDateEnd(e.target.value)} style={inputStyle} />
          <div style={{ width: "0.5px", height: 20, background: CLR.borderLight, margin: "0 4px" }} />
          {[
            { label: "Mois en cours",  fn: () => { setDateStart(startOfMonth()); setDateEnd(TODAY); } },
            { label: "Mois précédent", fn: () => { const r = prevMonthRange(); setDateStart(r.start); setDateEnd(r.end); } },
            { label: "Trimestre",      fn: () => { setDateStart(startOfQuarter()); setDateEnd(TODAY); } },
          ].map(s => (
            <button key={s.label} onClick={s.fn} style={shortcutStyle}
              onMouseEnter={e => { e.currentTarget.style.borderColor = CLR.indigo; e.currentTarget.style.color = CLR.indigo; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = CLR.borderLight; e.currentTarget.style.color = CLR.textSecond; }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── SECTION 1 : HÉRO ── */}
      <SectionDivider label={`MARGE / LIVRÉ · ${periodLabel.toUpperCase()}`} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 28 }}>

        {/* POLISH : border 1.5px, radius 14, padding 28, ombre colorée */}
        <div style={{
          background: heroBg,
          border: `1.5px solid ${heroBdr}`,
          borderRadius: 14,
          padding: "28px 28px 0",
          overflow: "hidden",
          boxShadow: heroShadow,
          transition: "all 0.3s ease",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: heroFontSz, fontWeight: 800, color: heroColor, lineHeight: 1,
                           fontVariantNumeric: "tabular-nums", transition: "color 0.3s ease" }}>
              {heroAvg != null ? `${heroAvg} MAD` : "—"}
            </span>
            {/* POLISH : sous-titre plus affirmé */}
            <span style={{ fontSize: 15, fontWeight: 600, color: CLR.textSecond }}>marge nette / livré</span>
          </div>
          <div style={{ fontSize: 11, color: CLR.textMuted, marginBottom: 16 }}>
            {heroAvg != null
              ? `Calculé sur ${cmdLivrees} commandes · prix − coût produit − livraison − ${FRAIS_EMBALLAGE} − ${FRAIS_CONFIRMATION} MAD`
              : "Aucune commande livrée sur la période"}
          </div>
          <div style={{ height: 200, margin: "0 -28px" }}>
            <canvas ref={heroRef} />
          </div>
        </div>

        {/* POLISH : KPI padding 20px, valeur 30px */}
        <div style={{ borderLeft: `1px solid ${CLR.borderLight}`, paddingLeft: 24,
                      display: "flex", flexDirection: "column" }}>
          {[
            { label: "Taux confirmation", val: txConf,    unit: "%", seuil: SEUIL_CONF, sub: `Seuil > ${SEUIL_CONF}%` },
            { label: "Taux livraison",    val: txLivr,    unit: "%", seuil: SEUIL_LIVR, sub: `Seuil > ${SEUIL_LIVR}%` },
            { label: "Leads période",     val: totalLeads, unit: "", seuil: null,        sub: periodLabel },
            { label: "Livrées période",   val: cmdLivrees, unit: "", seuil: null,        sub: "Livrée + Facturée" },
          ].map((k, i, arr) => (
            <div key={k.label} style={{ padding: "20px 0",
                                        borderBottom: i < arr.length - 1 ? `1px solid ${CLR.borderLight}` : "none" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
                            letterSpacing: "0.12em", color: CLR.textMuted, marginBottom: 6 }}>
                {k.label}
              </div>
              <div style={{ fontSize: "30px", fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                            color: k.seuil ? signal(k.val, k.seuil) : (k.val > 0 ? CLR.textPrimary : CLR.textGhost) }}>
                {k.val != null ? `${k.val}${k.unit}` : "—"}
              </div>
              <div style={{ fontSize: 11, color: CLR.textMuted, marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 2A : PRODUITS MARGE ACTUELLE ── */}
      <SectionDivider label="PRODUITS · MARGE ACTUELLE" />
      <Card>
        <ProdTable rows={byMargeCurrent.slice(0, 10)} showDelta={false} />
      </Card>

      {/* ── SECTION 2B : PRODUITS MARGE EN BAISSE ── */}
      <SectionDivider label="PRODUITS · MARGE EN BAISSE" />
      <Card>
        {byMargeDecline.length > 0 ? (
          <>
            <div style={{ fontSize: 12, color: CLR.textMuted, marginBottom: 14 }}>
              Δ = marge période courante − période précédente. Négatif = dégradation réelle.
            </div>
            <ProdTable rows={byMargeDecline} showDelta={true} />
          </>
        ) : (
          <EmptyState
            icon="✓"
            title="Aucun produit en dégradation sur la période"
            sub="Les marges sont stables ou en progression"
          />
        )}
      </Card>

      {/* ── SECTION 3 : DIAGNOSTIC ADS VS OPS ── */}
      <SectionDivider label="DIAGNOSTIC · ADS VS OPS" />

      {/* POLISH : bandeau résumé plus structuré */}
      <div style={{
        display: "flex", gap: 24, marginBottom: 16,
        padding: "12px 18px", background: CLR.cardBg,
        border: BORDER, borderRadius: RADIUS, boxShadow: SHADOW,
      }}>
        <div style={{ fontSize: 12, color: CLR.textSecond }}>
          CPL / livré&nbsp;
          <strong style={{ color: CLR.textPrimary, fontVariantNumeric: "tabular-nums" }}>
            {cplLivre != null ? `${cplLivre} MAD` : "—"}
          </strong>
        </div>
        <div style={{ width: "0.5px", background: CLR.borderLight }} />
        <div style={{ fontSize: 12, color: CLR.textSecond }}>
          Écart conf.&nbsp;
          <strong style={{ color: Math.max(0, SEUIL_CONF - txConf) > 0 ? CLR.red : CLR.green }}>
            {Math.max(0, SEUIL_CONF - txConf) > 0 ? `-${Math.max(0, SEUIL_CONF - txConf)} pts` : "OK"}
          </strong>
        </div>
        <div style={{ width: "0.5px", background: CLR.borderLight }} />
        <div style={{ fontSize: 12, color: CLR.textSecond }}>
          Écart livr.&nbsp;
          <strong style={{ color: Math.max(0, SEUIL_LIVR - txLivr) > 0 ? CLR.red : CLR.green }}>
            {Math.max(0, SEUIL_LIVR - txLivr) > 0 ? `-${Math.max(0, SEUIL_LIVR - txLivr)} pts` : "OK"}
          </strong>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* POLISH : fond teinté + barre de score ads */}
        <div onClick={() => setDrill(drill === "ads" ? null : "ads")} style={{
          background: drill === "ads" ? CLR.indigoBg : "#FAFBFF",
          border: drill === "ads" ? `1.5px solid ${CLR.indigo}` : BORDER,
          borderRadius: RADIUS, padding: "20px 24px", cursor: "pointer",
          boxShadow: drill === "ads" ? `0 0 0 3px ${CLR.indigoBg}` : SHADOW,
          transition: "all 0.15s",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📣</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: CLR.textPrimary }}>Acquisition — Ads</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, color: CLR.indigo }}>{pctAds}%</span>
          </div>
          {/* POLISH : barre de score */}
          <div style={{ height: 3, borderRadius: 99, background: CLR.indigoBorder,
                        margin: "0 -24px 14px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pctAds}%`, background: CLR.indigo, borderRadius: 99,
                          transition: "width 0.4s ease" }} />
          </div>
          {[
            { label: "Spend total", val: `${Math.round(totalSpend)} MAD`, pct: 100 },
            { label: "CPL moyen",   val: cplMoyen != null ? `${cplMoyen} MAD` : "—", pct: cplMoyen ? Math.min(100, cplMoyen) : 0 },
            { label: "CPL / livré", val: cplLivre  != null ? `${cplLivre} MAD`  : "—", pct: cplLivre ? Math.min(100, cplLivre / 2) : 0 },
            { label: "CTR moyen",   val: ctr ? `${ctr}%` : "—", pct: ctr ? parseFloat(ctr) * 20 : 0 },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: CLR.textSecond, width: 80, flexShrink: 0 }}>{row.label}</span>
              <ProgBar value={row.pct} color={CLR.indigo} />
              <span style={{ fontSize: 12, fontWeight: 600, color: CLR.indigo, minWidth: 60,
                             textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.val}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 11, color: CLR.indigo, fontWeight: 500 }}>
            ▸ {drill === "ads" ? "Masquer le détail" : "Voir détail par plateforme"}
          </div>
        </div>

        {/* POLISH : fond teinté + barre de score OPS */}
        <div onClick={() => setDrill(drill === "ops" ? null : "ops")} style={{
          background: drill === "ops" ? CLR.amberBg : "#FFFDF5",
          border: drill === "ops" ? `1.5px solid ${CLR.amber}` : BORDER,
          borderRadius: RADIUS, padding: "20px 24px", cursor: "pointer",
          boxShadow: drill === "ops" ? `0 0 0 3px ${CLR.amberBg}` : SHADOW,
          transition: "all 0.15s",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>👥</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: CLR.textPrimary }}>OPS — Confirmation & Livraison</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, color: CLR.amber }}>{pctOps}%</span>
          </div>
          {/* POLISH : barre de score */}
          <div style={{ height: 3, borderRadius: 99, background: CLR.amberBorder,
                        margin: "0 -24px 14px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pctOps}%`, background: CLR.amber, borderRadius: 99,
                          transition: "width 0.4s ease" }} />
          </div>
          {[
            { label: "Confirmation", val: txConf,   seuil: SEUIL_CONF },
            { label: "Livraison",    val: txLivr,   seuil: SEUIL_LIVR },
            { label: "Retours",      val: txRetour, seuil: 75 },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: CLR.textSecond, width: 80, flexShrink: 0 }}>{row.label}</span>
              <ProgBar value={row.val} color={signal(row.val, row.seuil)} />
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 40, textAlign: "right",
                             color: signal(row.val, row.seuil), fontVariantNumeric: "tabular-nums" }}>
                {row.val}%
              </span>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 11, color: CLR.amber, fontWeight: 500 }}>
            ▸ {drill === "ops" ? "Masquer le détail" : "Voir conseillères & transporteurs"}
          </div>
        </div>
      </div>

      {/* Drill Ads */}
      {drill === "ads" && (
        <Card style={{ marginBottom: 16, border: `1px solid ${CLR.indigoBorder}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: CLR.textPrimary }}>📣 Ads — Détail par plateforme</span>
            <button onClick={() => setDrill(null)} style={{ background: "none", border: "none",
              cursor: "pointer", fontSize: 12, color: CLR.textMuted }}>✕ Fermer</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Spend total", val: `${Math.round(totalSpend)} MAD` },
              { label: "CPL moyen",   val: cplMoyen != null ? `${cplMoyen} MAD` : "—" },
              { label: "CPL / livré", val: cplLivre  != null ? `${cplLivre} MAD`  : "—" },
              { label: "CTR global",  val: ctr ? `${ctr}%` : "—" },
            ].map(k => (
              <div key={k.label} style={{ background: CLR.pageBg, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: CLR.textMuted, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: CLR.textPrimary,
                              fontVariantNumeric: "tabular-nums" }}>{k.val}</div>
              </div>
            ))}
          </div>
          {plateformes.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
              <thead><tr>
                {["Plateforme", "Spend", "CPL", "CTR"].map(h => <th key={h} style={TH}>{h}</th>)}
              </tr></thead>
              <tbody>
                {plateformes.map((pl, i) => (
                  <tr key={pl.nom} style={{ background: i % 2 === 0 ? CLR.cardBg : "#F9FAFB" }}>
                    <td style={{ ...TD(), fontWeight: 600 }}>{pl.nom}</td>
                    <td style={TD(true)}>{pl.spend} MAD</td>
                    <td style={TD(true)}>{pl.cpl != null ? `${pl.cpl} MAD` : "—"}</td>
                    <td style={TD(true)}>{pl.ctr ? `${pl.ctr}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="Aucune donnée ads" sub="Renseigne les dépenses dans l'onglet Ads" />
          )}
          <div style={{ height: 140 }}><canvas ref={adsRef} /></div>
        </Card>
      )}

      {/* Drill OPS */}
      {drill === "ops" && (
        <Card style={{ marginBottom: 16, border: `1px solid ${CLR.amberBorder}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: CLR.textPrimary }}>👥 OPS — Conseillères & Transporteurs</span>
            <button onClick={() => setDrill(null)} style={{ background: "none", border: "none",
              cursor: "pointer", fontSize: 12, color: CLR.textMuted }}>✕ Fermer</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
                            letterSpacing: "0.1em", color: CLR.textMuted, marginBottom: 12 }}>Conseillères</div>
              {consStats.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Conseillère", "Leads", "Conf.", "Statut"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {consStats.map((c, i) => (
                      <tr key={c.nom} style={{ background: i % 2 === 0 ? CLR.cardBg : "#F9FAFB" }}>
                        <td style={{ ...TD(), fontWeight: 600 }}>{c.nom}</td>
                        <td style={TD(true)}>{c.leads}</td>
                        <td style={{ ...TD(true), color: signal(c.taux_conf, SEUIL_CONF), fontWeight: 700 }}>{c.taux_conf}%</td>
                        <td style={TD()}>
                          <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 4,
                            background: c.taux_conf >= SEUIL_CONF ? CLR.greenBg : CLR.redBg,
                            color: c.taux_conf >= SEUIL_CONF ? CLR.green : CLR.red }}>
                            {c.taux_conf >= SEUIL_CONF ? "OK" : "À améliorer"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="Aucune conseillère identifiée" sub="Le champ conseillere doit être renseigné dans les leads" />
              )}
            </div>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
                            letterSpacing: "0.1em", color: CLR.textMuted, marginBottom: 12 }}>Transporteurs</div>
              {transStats.length > 0 ? (
                <>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
                    <thead><tr>{["Transporteur", "Livr.", "Retours", "Grade"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                    <tbody>
                      {transStats.map((t, i) => (
                        <tr key={t.nom} style={{ background: i % 2 === 0 ? CLR.cardBg : "#F9FAFB" }}>
                          <td style={{ ...TD(), fontWeight: 600 }}>{t.nom}</td>
                          <td style={{ ...TD(true), color: signal(t.taux_livr, SEUIL_LIVR), fontWeight: 700 }}>{t.taux_livr}%</td>
                          <td style={{ ...TD(true), color: t.taux_retour > 25 ? CLR.red : CLR.textPrimary }}>{t.taux_retour}%</td>
                          <td style={TD()}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px",
                              borderRadius: 4, ...gradeClr[t.grade] }}>{t.grade}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11, color: CLR.textMuted }}>A1 ≥ 60% · A2 45–60% · B2 40–45% · STOP &lt; 40%</div>
                </>
              ) : (
                <EmptyState title="Aucun transporteur identifié" sub="Le champ transporteur doit être renseigné dans les commandes" />
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── SECTION 6 : FINANCE ── */}
      <SectionDivider label="FINANCE · TRÉSORERIE & MOUVEMENTS" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          {/* POLISH : header journal fond gris */}
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${CLR.borderLight}`,
                        background: "#F9FAFB",
                        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: CLR.textPrimary }}>Journal des mouvements</span>
            <span style={{ fontSize: 11, color: CLR.textMuted,
                           background: CLR.cardBg, border: BORDER,
                           borderRadius: 5, padding: "2px 8px" }}>
              {releve.length} entrées
            </span>
          </div>
          {releve.length === 0 ? (
            <div style={{ padding: "32px 20px" }}>
              <EmptyState
                title="Aucun mouvement enregistré"
                sub="Alimente le relevé bancaire depuis l'onglet Finances"
              />
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr>
                  {["Date", "Libellé", "Catégorie", "Type", "Montant"].map(h => (
                    <th key={h} style={{ ...TH, background: "#F9FAFB" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {releve.slice(0, 20).map((r, i) => {
                  const mont = getMontant(r);
                  const isIn = mont > 0;
                  return (
                    <tr key={r.id || i} style={{ background: i % 2 === 0 ? CLR.cardBg : "#F9FAFB" }}>
                      <td style={{ ...TD(), fontSize: 12, color: CLR.textMuted, whiteSpace: "nowrap" }}>
                        {r.date ? new Date(r.date).toLocaleDateString("fr", { day: "numeric", month: "short" }) : "—"}
                      </td>
                      <td style={{ ...TD(), maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis",
                                   whiteSpace: "nowrap", fontSize: 12 }}>
                        {r.intitule || r.libelle || r.observation || "—"}
                      </td>
                      <td style={TD()}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: CLR.textSecond,
                                       background: "#F1F5F9", borderRadius: 4, padding: "1px 6px" }}>
                          {r.categorie || "—"}
                        </span>
                      </td>
                      <td style={TD()}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%",
                                         background: isIn ? CLR.green : CLR.red, display: "inline-block" }} />
                          <span style={{ color: isIn ? CLR.green : CLR.red, fontWeight: 600 }}>
                            {isIn ? "Recette" : "Dépense"}
                          </span>
                        </span>
                      </td>
                      {/* POLISH : police monospace sur les montants */}
                      <td style={{ ...TD(true), fontWeight: 700, color: isIn ? CLR.green : CLR.red,
                                   fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace" }}>
                        {isIn ? "+" : ""}{Math.round(Math.abs(mont)).toLocaleString("fr")} MAD
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* POLISH : card cash net colorée selon solde */}
          <Card style={{
            background: solde >= 0 ? CLR.greenBg : CLR.redBg,
            border: `1.5px solid ${solde >= 0 ? CLR.greenBorder : CLR.redBorder}`,
          }}>
            <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
                          letterSpacing: "0.1em", color: solde >= 0 ? CLR.green : CLR.red, marginBottom: 8 }}>
              Cash net
            </div>
            <div style={{ fontSize: String(Math.abs(solde)).length <= 5 ? "36px" : "28px",
                          fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                          fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                          color: solde >= 0 ? CLR.green : CLR.red, marginBottom: 4,
                          transition: "color 0.3s ease" }}>
              {solde >= 0 ? "+" : ""}{solde.toLocaleString("fr")} MAD
            </div>
            <div style={{ height: "0.5px", background: solde >= 0 ? CLR.greenBorder : CLR.redBorder, margin: "14px 0" }} />
            {[
              { label: "Recettes",  val: `+${totalRev.toLocaleString("fr")} MAD`, color: CLR.green },
              { label: "Dépenses",  val: `${totalExp.toLocaleString("fr")} MAD`,  color: CLR.red },
              { label: "Solde net", val: `${solde >= 0 ? "+" : ""}${solde.toLocaleString("fr")} MAD`,
                color: solde >= 0 ? CLR.green : CLR.red, bold: true },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between",
                                            alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: CLR.textSecond }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: row.bold ? 700 : 500, color: row.color,
                               fontVariantNumeric: "tabular-nums",
                               fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace" }}>
                  {row.val}
                </span>
              </div>
            ))}
          </Card>

          {Object.keys(catMap).length > 0 && (
            <Card>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
                            letterSpacing: "0.1em", color: CLR.textMuted, marginBottom: 12 }}>
                Ventilation dépenses
              </div>
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 1, marginBottom: 12 }}>
                {Object.entries(catMap).map(([cat, val], i) => (
                  <div key={cat} style={{ flex: val / (Math.abs(totalExp) || 1) * 100,
                                          background: catColors[i % catColors.length], minWidth: 2 }} />
                ))}
              </div>
              {Object.entries(catMap).map(([cat, val], i) => (
                <div key={cat} style={{ display: "flex", justifyContent: "space-between",
                                        alignItems: "center", fontSize: 12, marginBottom: 7 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, color: CLR.textSecond }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2,
                                   background: catColors[i % catColors.length], display: "inline-block" }} />
                    {cat}
                  </span>
                  <span style={{ fontWeight: 600, color: CLR.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(val).toLocaleString("fr")} MAD · {Math.round(val / (Math.abs(totalExp) || 1) * 100)}%
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .analytique-hero-grid { grid-template-columns: 1fr !important; }
          .analytique-diag-grid { grid-template-columns: 1fr !important; }
          .analytique-finance-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
