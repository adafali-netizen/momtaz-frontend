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
const RADIUS = "10px";
const BORDER = `1px solid ${CLR.borderLight}`;

// ─── Constantes métier ────────────────────────────────────────────────────────
const FRAIS_EMBALLAGE   = 4;
const FRAIS_CONFIRMATION = 10;
const SEUIL_CONF = 35;
const SEUIL_LIVR = 55;
const STATUTS_LIVRES    = ["Livrée", "Facturée"];
const STATUTS_CONFIRMS  = ["Confirmé", "Livrée", "Facturée", "Expédiée", "En cours de livraison"];
const STATUTS_EXCLUS    = ["Annulée", "Refusée", "Doublon", "Fausse commande"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pct(val, total) { return total > 0 ? Math.round((val / total) * 100) : 0; }
function dateKey(d)       { return new Date(d).toISOString().slice(0, 10); }
function labelDate(d)     { return new Date(d).toLocaleDateString("fr", { day: "numeric", month: "short" }); }

// Signal couleur
function signal(val, seuil) {
  if (val == null)       return CLR.textGhost;
  if (val >= seuil)      return CLR.green;
  if (val >= seuil * 0.7) return CLR.amber;
  return CLR.red;
}

// Montant depuis releve_bancaire (supporte debit/credit ou montant)
const getMontant = r =>
  parseFloat(r.montant) ||
  (r.credit ? +r.credit : r.debit ? -Math.abs(+r.debit) : 0);

// Calcul marge unitaire
function calcMarge(row, prodMap) {
  const prix      = parseFloat(row.prix) || 0;
  const cout      = parseFloat(prodMap[row.produit]?.cout_achat) || 0;
  const fraisLivr = parseFloat(row.frais_livraison) || 0;
  return prix - cout - fraisLivr - FRAIS_EMBALLAGE - FRAIS_CONFIRMATION;
}

// Décision produit
function decisionBadge(leads, livrees, marge) {
  if (leads < 5)                                         return "test";
  if (livrees / (leads || 1) >= 0.6 && marge > 0)       return "scale";
  if (livrees / (leads || 1) >= 0.3 && marge > 0)       return "opti";
  return "stop";
}
const DECISION_META = {
  scale: { label: "SCALE",    bg: "#F0FDF4", color: CLR.green,  border: CLR.greenBorder },
  opti:  { label: "OPTIMISER",bg: CLR.amberBg, color: CLR.amber, border: CLR.amberBorder },
  test:  { label: "EN TEST",  bg: "#F0F7FF", color: "#1D4ED8",  border: "#BFDBFE" },
  stop:  { label: "STOP",     bg: CLR.redBg,  color: CLR.red,   border: CLR.redBorder },
};

function fuiteLabel(taux_conf, taux_livr, marge_avg) {
  if (taux_conf < SEUIL_CONF)  return { label: "Confirmation", color: CLR.amber, bg: CLR.amberBg };
  if (taux_livr < SEUIL_LIVR)  return { label: "Livraison",    color: CLR.red,   bg: CLR.redBg };
  if (marge_avg != null && marge_avg < 0) return { label: "Coûts", color: CLR.indigo, bg: CLR.indigoBg };
  return null;
}

// ─── Composants UI ────────────────────────────────────────────────────────────

// Séparateur éditorial de section
function SectionDivider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "40px 0 20px" }}>
      <div style={{ flex: 1, height: "0.5px", background: CLR.borderLight }} />
      <span style={{
        fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.1em", color: CLR.textMuted, whiteSpace: "nowrap",
      }}>{label}</span>
      <div style={{ flex: 1, height: "0.5px", background: CLR.borderLight }} />
    </div>
  );
}

// Valeur avec état vide
function Val({ v, unit = "", emptySize = "26px", filledSize = "26px", weight = 700, color }) {
  if (v == null) return (
    <span style={{ fontSize: emptySize, fontWeight: weight, color: CLR.textGhost, fontVariantNumeric: "tabular-nums" }}>—</span>
  );
  return (
    <span style={{ fontSize: filledSize, fontWeight: weight, color: color || CLR.textPrimary, fontVariantNumeric: "tabular-nums" }}>
      {v}{unit && <span style={{ fontSize: "14px", fontWeight: 500, marginLeft: 4 }}>{unit}</span>}
    </span>
  );
}

// Badge décision
function DecisionBadge({ type }) {
  const m = DECISION_META[type] || DECISION_META.test;
  return (
    <span style={{
      display: "inline-block", padding: "3px 9px", borderRadius: "5px",
      fontSize: "11px", fontWeight: 600, background: m.bg, color: m.color,
      border: `1px solid ${m.border}`,
    }}>{m.label}</span>
  );
}

// Badge fuite
function FuiteBadge({ taux_conf, taux_livr, marge_avg }) {
  const f = fuiteLabel(taux_conf, taux_livr, marge_avg);
  if (!f) return <span style={{ color: CLR.textGhost, fontSize: 12 }}>—</span>;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "4px",
      fontSize: "11px", fontWeight: 500, background: f.bg, color: f.color,
    }}>{f.label}</span>
  );
}

// Card générique
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: CLR.cardBg, border: BORDER, borderRadius: RADIUS,
      padding: "20px 24px", boxShadow: SHADOW, minHeight: 120, ...style,
    }}>
      {children}
    </div>
  );
}

// Table th/td helpers
const TH = {
  padding: "8px 12px", fontSize: "10px", fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em",
  color: CLR.textMuted, borderBottom: `1px solid ${CLR.borderLight}`,
  textAlign: "left", whiteSpace: "nowrap", background: "#F9FAFB",
};
const TD = (right) => ({
  padding: "10px 12px", fontSize: "13px", color: CLR.textPrimary,
  borderBottom: `1px solid ${CLR.borderRow}`, textAlign: right ? "right" : "left",
  verticalAlign: "middle", fontVariantNumeric: "tabular-nums",
});

// Tableau produits
function ProdTable({ rows, showDelta }) {
  if (rows.length === 0) return (
    <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: CLR.textMuted }}>
      Aucune donnée sur la période
    </div>
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
              <td style={{ ...TD(), maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.nom}>
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
              <td style={{ ...TD(true), color: p.marge_avg != null ? (p.marge_avg >= 0 ? CLR.green : CLR.red) : CLR.textGhost, fontWeight: 700 }}>
                {p.marge_avg != null ? `${p.marge_avg} MAD` : "—"}
              </td>
              <td style={TD()}><DecisionBadge type={p.decision} /></td>
              <td style={TD()}><FuiteBadge taux_conf={p.taux_conf} taux_livr={p.taux_livr} marge_avg={p.marge_avg} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Barre de progression diagnostic
function ProgBar({ value, color, max = 100 }) {
  return (
    <div style={{ flex: 1, height: 4, background: CLR.borderLight, borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, (value / max) * 100))}%`, background: color, borderRadius: 99, transition: "width 0.4s ease" }} />
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function DashboardAnalytique() {
  const [period, setPeriod]   = useState(30);
  const [loading, setLoading] = useState(true);
  const [data, setData]       = useState(null);
  const [drill, setDrill]     = useState(null);
  const heroRef     = useRef(null);
  const heroChart   = useRef(null);
  const adsRef      = useRef(null);
  const adsChart    = useRef(null);

  useEffect(() => { fetchAll(period); }, [period]);

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  async function fetchAll(days) {
    setLoading(true);
    const end   = new Date();
    const start = new Date(); start.setDate(start.getDate() - (days - 1));
    const start2x = new Date(); start2x.setDate(start2x.getDate() - (days * 2 - 1));
    const [sStr, eStr, s2Str] = [dateKey(start), dateKey(end), dateKey(start2x)];

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
      produits: produits || [], days, sStr, eStr, s2Str,
    }));
    setLoading(false);
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────
  function build({ commandes, leads, adsSpend, releve, produits, days, sStr, eStr, s2Str }) {
    const prodMap = {};
    produits.forEach(p => { prodMap[p.id] = p; if (p.nom) prodMap[p.nom] = p; });

    const cmdCurrent   = commandes.filter(c => dateKey(c.created_at) >= sStr);
    const cmdLivrees   = cmdCurrent.filter(c => STATUTS_LIVRES.includes(c.statut));
    const cmdExpediables = cmdCurrent.filter(c => !STATUTS_EXCLUS.includes(c.statut));

    // ── Courbe héro ──
    const byDay = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
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

    // ── Produits (par nom, depuis commandes + leads) ──
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
    const byMargeDecline  = [...prodList].filter(p => p.delta_marge != null && p.delta_marge < 0).sort((a, b) => a.delta_marge - b.delta_marge);

    // ── Ads ──
    const totalSpend    = adsSpend.reduce((s, a) => s + (parseFloat(a.spend_mad || a.budget_mad) || 0), 0);
    const totalLeadsAds = adsSpend.reduce((s, a) => s + (parseInt(a.leads_count) || 0), 0);
    const totalClics    = adsSpend.reduce((s, a) => s + (parseInt(a.clics) || 0), 0);
    const totalImpr     = adsSpend.reduce((s, a) => s + (parseInt(a.impressions) || 0), 0);
    const cplMoyen  = totalLeadsAds > 0 ? Math.round(totalSpend / totalLeadsAds) : null;
    const cplLivre  = cmdLivrees.length > 0 ? Math.round(totalSpend / cmdLivrees.length) : null;
    const ctr       = totalImpr > 0 ? ((totalClics / totalImpr) * 100).toFixed(1) : null;

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

    // ── OPS ──
    const totalLeads = leads.length;
    const confirmes  = leads.filter(l => STATUTS_CONFIRMS.includes(l.statut)).length;
    const txConf     = pct(confirmes, totalLeads);
    const txLivr     = pct(cmdLivrees.length, cmdExpediables.length || 1);
    const retours    = cmdCurrent.filter(c => ["Retour reçu", "Retour en cours"].includes(c.statut)).length;
    const txRetour   = pct(retours, cmdCurrent.length);

    const impactAds = cplLivre || 0;
    const impactOps = Math.max(0, SEUIL_CONF - txConf) * 2 + Math.max(0, SEUIL_LIVR - txLivr) * 3;
    const totalImp  = impactAds + impactOps;
    const pctAds    = totalImp > 0 ? Math.round((impactAds / totalImp) * 100) : 0;

    // ── Conseillères ──
    const consMap = {};
    leads.forEach(l => {
      const c = l.conseillere; if (!c) return;
      if (!consMap[c]) consMap[c] = { leads: 0, conf: 0 };
      consMap[c].leads++;
      if (STATUTS_CONFIRMS.includes(l.statut)) consMap[c].conf++;
    });
    const consStats = Object.entries(consMap).map(([nom, c]) => ({
      nom, leads: c.leads, taux_conf: pct(c.conf, c.leads),
    })).sort((a, b) => b.taux_conf - a.taux_conf);

    // ── Transporteurs ──
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

    // ── Finance ──
    const revenues  = releve.filter(r => getMontant(r) > 0);
    const expenses  = releve.filter(r => getMontant(r) < 0);
    const totalRev  = revenues.reduce((s, r) => s + getMontant(r), 0);
    const totalExp  = expenses.reduce((s, r) => s + getMontant(r), 0);
    const solde     = totalRev + totalExp;
    const catMap    = {};
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
      pctAds, pctOps: 100 - pctAds, impactAds, impactOps,
      consStats, transStats,
      releve, totalRev: Math.round(totalRev), totalExp: Math.round(totalExp),
      solde: Math.round(solde), catMap,
    };
  }

  // ─── Charts ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !heroRef.current) return;
    if (heroChart.current) heroChart.current.destroy();
    const signalColor = data.heroAvg === null ? CLR.textGhost
                      : data.heroAvg > 0      ? CLR.green
                      :                         CLR.red;
    heroChart.current = new Chart(heroRef.current, {
      type: "line",
      data: {
        labels: data.heroLabels,
        datasets: [{
          data: data.heroValues,
          borderColor: signalColor, borderWidth: 2,
          pointRadius: 0, tension: 0.35,
          fill: true,
          backgroundColor: data.heroAvg > 0 ? "rgba(22,163,74,0.07)" : "rgba(220,38,38,0.07)",
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
            y: { grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 10 }, callback: v => v + " MAD" } },
          },
        },
      });
    }, 80);
  }, [drill, data]);

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                  height: 360, color: CLR.textMuted, fontSize: 13 }}>
      Chargement…
    </div>
  );
  if (!data) return null;

  const { heroAvg, heroLabels, heroValues, heroPoints,
          byMargeCurrent, byMargeDecline,
          totalLeads, txConf, txLivr, txRetour, cmdLivrees,
          totalSpend, cplMoyen, cplLivre, ctr, plateformes,
          pctAds, pctOps, consStats, transStats,
          releve, totalRev, totalExp, solde, catMap } = data;

  // Couleurs héro dynamiques
  const heroBg      = heroAvg === null ? CLR.heroBgEmpty : heroAvg > 0 ? CLR.heroBgOk : CLR.heroBgAlert;
  const heroBdr     = heroAvg === null ? CLR.borderLight : heroAvg > 0 ? CLR.greenBorder : CLR.redBorder;
  const heroColor   = heroAvg === null ? CLR.textGhost   : heroAvg > 0 ? CLR.green : CLR.red;
  const heroFontSz  = heroAvg != null && String(Math.abs(heroAvg)).length <= 4 ? "64px" : "52px";
  const periodLabel = period === 7 ? "7 derniers jours" : period === 30 ? "30 derniers jours" : "90 derniers jours";

  const gradeClr = {
    A1:   { bg: CLR.greenBg,  color: CLR.green },
    A2:   { bg: CLR.greenBg,  color: CLR.green },
    B2:   { bg: CLR.amberBg,  color: CLR.amber },
    STOP: { bg: CLR.redBg,    color: CLR.red   },
  };

  const catColors = ["#534AB7", "#DC2626", "#D97706", "#16A34A", "#0891B2", "#94A3B8"];

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "0 0 48px",
                  maxWidth: 1100, margin: "0 auto", background: CLR.pageBg }}>

      {/* ── Topbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 0 20px", borderBottom: `1px solid ${CLR.borderLight}`, marginBottom: 0 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: CLR.textPrimary }}>Cockpit analytique</span>
          <span style={{ fontSize: 12, color: CLR.textMuted, marginLeft: 10 }}>
            {new Date().toLocaleDateString("fr", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[7, 30, 90].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "5px 13px", border: `1px solid ${period === p ? CLR.indigo : CLR.borderLight}`,
              borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: period === p ? 600 : 400,
              background: period === p ? CLR.indigo : CLR.cardBg,
              color: period === p ? "#fff" : CLR.textSecond,
              transition: "all 0.15s",
            }}>{p}j</button>
          ))}
        </div>
      </div>

      {/* ── SECTION 1 : HÉRO ── */}
      <SectionDivider label={`MARGE / LIVRÉ — ${periodLabel.toUpperCase()}`} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(220px, 260px)", gap: 20 }}>

        {/* Surface héro */}
        <div style={{
          background: heroBg, border: `1px solid ${heroBdr}`, borderRadius: RADIUS,
          padding: "24px 24px 0", overflow: "hidden", boxShadow: SHADOW,
          transition: "background-color 0.3s ease, border-color 0.3s ease",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: heroFontSz, fontWeight: 800, color: heroColor, lineHeight: 1,
                           fontVariantNumeric: "tabular-nums",
                           transition: "color 0.3s ease, font-size 0.15s" }}>
              {heroAvg != null ? `${heroAvg} MAD` : "—"}
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, color: CLR.textSecond }}>marge nette / livré</span>
          </div>
          <div style={{ fontSize: 11, color: CLR.textMuted, marginBottom: 16 }}>
            {heroAvg != null
              ? `Calculé sur ${cmdLivrees} commandes · prix − coût produit − livraison − ${FRAIS_EMBALLAGE} − ${FRAIS_CONFIRMATION} MAD`
              : "Aucune commande livrée sur la période"}
          </div>
          <div style={{ height: 200, margin: "0 -24px" }}>
            <canvas ref={heroRef} />
          </div>
        </div>

        {/* Colonne KPI */}
        <div style={{ borderLeft: `1px solid ${CLR.borderLight}`, paddingLeft: 20,
                      display: "flex", flexDirection: "column" }}>
          {[
            { label: "Taux confirmation", val: txConf, unit: "%", seuil: SEUIL_CONF, sub: `Seuil > ${SEUIL_CONF}%` },
            { label: "Taux livraison",    val: txLivr, unit: "%", seuil: SEUIL_LIVR, sub: `Seuil > ${SEUIL_LIVR}%` },
            { label: "Leads période",     val: totalLeads, unit: "", seuil: null, sub: periodLabel },
            { label: "Livrées période",   val: cmdLivrees,  unit: "", seuil: null, sub: "Livrée + Facturée" },
          ].map((k, i, arr) => (
            <div key={k.label} style={{
              padding: "14px 0",
              borderBottom: i < arr.length - 1 ? `1px solid ${CLR.borderLight}` : "none",
            }}>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
                            letterSpacing: "0.12em", color: CLR.textMuted, marginBottom: 5 }}>
                {k.label}
              </div>
              <div style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                            color: k.seuil ? signal(k.val, k.seuil) : (k.val > 0 ? CLR.textPrimary : CLR.textGhost) }}>
                {k.val != null ? `${k.val}${k.unit}` : "—"}
              </div>
              <div style={{ fontSize: 11, color: CLR.textMuted, marginTop: 3 }}>{k.sub}</div>
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
          <div style={{ padding: "12px 0", fontSize: 13, color: CLR.textMuted }}>
            — Aucun produit en dégradation sur la période
          </div>
        )}
      </Card>

      {/* ── SECTION 3 : DIAGNOSTIC ADS VS OPS ── */}
      <SectionDivider label="DIAGNOSTIC · ADS VS OPS" />
      <div style={{ fontSize: 12, color: CLR.textSecond, marginBottom: 16 }}>
        CPL/livré : <strong>{cplLivre != null ? `${cplLivre} MAD` : "—"}</strong>
        &nbsp;·&nbsp; Pts sous seuil conf : <strong>{Math.max(0, SEUIL_CONF - txConf)}</strong>
        &nbsp;·&nbsp; Pts sous seuil livr : <strong>{Math.max(0, SEUIL_LIVR - txLivr)}</strong>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Ads */}
        <div onClick={() => setDrill(drill === "ads" ? null : "ads")} style={{
          background: CLR.cardBg, border: drill === "ads" ? `1.5px solid ${CLR.indigo}` : BORDER,
          borderRadius: RADIUS, padding: "20px 24px", cursor: "pointer", boxShadow: SHADOW,
          boxShadow: drill === "ads" ? `0 0 0 3px ${CLR.indigoBg}` : SHADOW,
          transition: "border 0.15s, box-shadow 0.15s",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📣</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: CLR.textPrimary }}>Acquisition — Ads</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, color: CLR.indigo }}>{pctAds}%</span>
          </div>
          {[
            { label: "Spend total", val: `${Math.round(totalSpend)} MAD`, pct: 100 },
            { label: "CPL moyen",   val: cplMoyen != null ? `${cplMoyen} MAD` : "—", pct: cplMoyen ? Math.min(100, cplMoyen) : 0 },
            { label: "CPL / livré", val: cplLivre  != null ? `${cplLivre} MAD`  : "—", pct: cplLivre  ? Math.min(100, cplLivre / 2) : 0 },
            { label: "CTR moyen",   val: ctr ? `${ctr}%` : "—", pct: ctr ? parseFloat(ctr) * 20 : 0 },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: CLR.textSecond, width: 80, flexShrink: 0 }}>{row.label}</span>
              <ProgBar value={row.pct} color={CLR.indigo} />
              <span style={{ fontSize: 12, fontWeight: 600, color: CLR.indigo, minWidth: 60, textAlign: "right",
                             fontVariantNumeric: "tabular-nums" }}>{row.val}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 11, color: CLR.indigo, fontWeight: 500 }}>
            ▸ {drill === "ads" ? "Masquer le détail" : "Voir détail par plateforme"}
          </div>
        </div>

        {/* OPS */}
        <div onClick={() => setDrill(drill === "ops" ? null : "ops")} style={{
          background: CLR.cardBg, border: drill === "ops" ? `1.5px solid ${CLR.amber}` : BORDER,
          borderRadius: RADIUS, padding: "20px 24px", cursor: "pointer",
          boxShadow: drill === "ops" ? `0 0 0 3px ${CLR.amberBg}` : SHADOW,
          transition: "border 0.15s, box-shadow 0.15s",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>👥</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: CLR.textPrimary }}>OPS — Confirmation & Livraison</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, color: CLR.amber }}>{pctOps}%</span>
          </div>
          {[
            { label: "Confirmation", val: txConf, seuil: SEUIL_CONF, max: 100 },
            { label: "Livraison",    val: txLivr, seuil: SEUIL_LIVR, max: 100 },
            { label: "Retours",      val: txRetour, seuil: 100 - 25,  max: 100, inverse: true },
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
                    <td style={TD()}><strong>{pl.nom}</strong></td>
                    <td style={TD(true)}>{pl.spend} MAD</td>
                    <td style={TD(true)}>{pl.cpl != null ? `${pl.cpl} MAD` : "—"}</td>
                    <td style={TD(true)}>{pl.ctr ? `${pl.ctr}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: "12px 0", fontSize: 13, color: CLR.textMuted }}>— Aucune donnée ads</div>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Conseillères */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
                            letterSpacing: "0.1em", color: CLR.textMuted, marginBottom: 12 }}>
                Conseillères
              </div>
              {consStats.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    {["Conseillère", "Leads", "Conf.", "Statut"].map(h => <th key={h} style={TH}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {consStats.map((c, i) => (
                      <tr key={c.nom} style={{ background: i % 2 === 0 ? CLR.cardBg : "#F9FAFB" }}>
                        <td style={{ ...TD(), fontWeight: 600 }}>{c.nom}</td>
                        <td style={TD(true)}>{c.leads}</td>
                        <td style={{ ...TD(true), color: signal(c.taux_conf, SEUIL_CONF), fontWeight: 700 }}>
                          {c.taux_conf}%
                        </td>
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
              ) : <div style={{ fontSize: 13, color: CLR.textGhost }}>— Aucune donnée</div>}
            </div>
            {/* Transporteurs */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
                            letterSpacing: "0.1em", color: CLR.textMuted, marginBottom: 12 }}>
                Transporteurs
              </div>
              {transStats.length > 0 ? (
                <>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
                    <thead><tr>
                      {["Transporteur", "Livr.", "Retours", "Grade"].map(h => <th key={h} style={TH}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {transStats.map((t, i) => (
                        <tr key={t.nom} style={{ background: i % 2 === 0 ? CLR.cardBg : "#F9FAFB" }}>
                          <td style={{ ...TD(), fontWeight: 600 }}>{t.nom}</td>
                          <td style={{ ...TD(true), color: signal(t.taux_livr, SEUIL_LIVR), fontWeight: 700 }}>
                            {t.taux_livr}%
                          </td>
                          <td style={{ ...TD(true), color: t.taux_retour > 25 ? CLR.red : CLR.textPrimary }}>
                            {t.taux_retour}%
                          </td>
                          <td style={TD()}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                              ...gradeClr[t.grade] }}>{t.grade}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11, color: CLR.textMuted }}>
                    A1 ≥ 60% · A2 45–60% · B2 40–45% · STOP &lt; 40%
                  </div>
                </>
              ) : <div style={{ fontSize: 13, color: CLR.textGhost }}>— Aucun transporteur</div>}
            </div>
          </div>
        </Card>
      )}

      {/* ── SECTION 6 : FINANCE ── */}
      <SectionDivider label="FINANCE · TRÉSORERIE & MOUVEMENTS" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

        {/* Journal */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${CLR.borderLight}`,
                        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: CLR.textPrimary }}>Journal des mouvements</span>
            <span style={{ fontSize: 11, color: CLR.textMuted }}>{releve.length} entrées</span>
          </div>
          {releve.length === 0 ? (
            <div style={{ padding: "24px 20px", fontSize: 13, color: CLR.textGhost }}>— Aucun mouvement enregistré</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead><tr style={{ background: "#F9FAFB" }}>
                {["Date", "Libellé", "Catégorie", "Type", "Montant"].map(h => (
                  <th key={h} style={{ ...TH, background: "#F9FAFB" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {releve.slice(0, 20).map((r, i) => {
                  const mont  = getMontant(r);
                  const isIn  = mont > 0;
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
                      <td style={{ ...TD(true), fontWeight: 700, color: isIn ? CLR.green : CLR.red }}>
                        {isIn ? "+" : ""}{Math.round(Math.abs(mont)).toLocaleString("fr")} MAD
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {/* Synthèse */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card>
            <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
                          letterSpacing: "0.1em", color: CLR.textMuted, marginBottom: 8 }}>Cash net</div>
            <div style={{ fontSize: solde !== 0 && String(Math.abs(solde)).length <= 5 ? "36px" : "28px",
                          fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                          color: solde >= 0 ? CLR.green : CLR.red, marginBottom: 4,
                          transition: "color 0.3s ease" }}>
              {solde >= 0 ? "+" : ""}{solde.toLocaleString("fr")} MAD
            </div>
            <div style={{ height: "0.5px", background: CLR.borderLight, margin: "14px 0" }} />
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
                               fontVariantNumeric: "tabular-nums" }}>{row.val}</span>
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

      {/* ── Responsive ── */}
      <style>{`
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .diag-grid { grid-template-columns: 1fr !important; }
          .finance-grid { grid-template-columns: 1fr !important; }
          .kpi-col { border-left: none !important; border-top: 1px solid ${CLR.borderLight}; padding-left: 0 !important; padding-top: 16px; }
        }
      `}</style>

    </div>
  );
}
