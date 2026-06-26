import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  Chart,
  LineElement,
  PointElement,
  LineController,
  BarElement,
  BarController,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
} from "chart.js";

Chart.register(
  LineElement, PointElement, LineController,
  BarElement, BarController,
  CategoryScale, LinearScale,
  Tooltip, Filler
);

const FRAIS_EMBALLAGE = 4;
const FRAIS_CONFIRMATION = 10;
const SEUIL_CONF = 35;
const SEUIL_LIVR = 55;
const STATUTS_LIVRES = ["Livrée", "Facturée"];

function pct(val, total) {
  if (!total) return 0;
  return Math.round((val / total) * 100);
}
function dateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}
function labelDate(d) {
  return new Date(d).toLocaleDateString("fr", { day: "numeric", month: "short" });
}

// Calcul marge : cout_achat vient du prodMap (table produits), pas de commandes
function calcMarge(row, prodMap) {
  const prix = parseFloat(row.prix) || 0;
  const cout = parseFloat(prodMap[row.produit]?.cout_achat) || 0;
  const fraisLivr = parseFloat(row.frais_livraison) || 0;
  return prix - cout - fraisLivr - FRAIS_EMBALLAGE - FRAIS_CONFIRMATION;
}

const S = {
  page: { fontFamily: "var(--font-sans, system-ui)", padding: "0 0 48px", maxWidth: 1100, margin: "0 auto" },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 18px", borderBottom: "0.5px solid #e2e8f0", marginBottom: "28px" },
  sectionLabel: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: "#94a3b8", marginBottom: 12 },
  divider: { height: "0.5px", background: "#e2e8f0", margin: "28px 0" },
  card: { background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: "20px 24px" },
  statCard: { background: "#f8fafc", borderRadius: 8, padding: "14px 16px" },
  badge: (color) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, ...badgeColors[color] }),
  chip: (ok) => ({ display: "inline-block", padding: "1px 7px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: ok ? "#EAF3DE" : "#FCEBEB", color: ok ? "#3B6D11" : "#A32D2D" }),
};

const badgeColors = {
  test:  { background: "#EAF3DE", color: "#3B6D11" },
  scale: { background: "#E1F5EE", color: "#0F6E56" },
  opti:  { background: "#FAEEDA", color: "#854F0B" },
  stop:  { background: "#FCEBEB", color: "#A32D2D" },
};

function decisionBadge(p) {
  if (p.total_leads < 5) return "test";
  if (p.taux_conf >= 40 && p.taux_livr >= 60 && p.marge_avg > 0) return "scale";
  if (p.taux_conf >= 25 && p.taux_livr >= 40 && p.marge_avg > 0) return "opti";
  return "stop";
}
const decisionLabel = { test: "EN TEST", scale: "SCALE", opti: "OPTIMISER", stop: "STOP" };

function fuiteLabel(p) {
  if (p.taux_conf < SEUIL_CONF) return { label: "Confirmation", color: "#854F0B", bg: "#FAEEDA" };
  if (p.taux_livr < SEUIL_LIVR) return { label: "Livraison", color: "#A32D2D", bg: "#FCEBEB" };
  if (p.marge_avg < 0) return { label: "Coûts", color: "#534AB7", bg: "#EEEDFE" };
  return null;
}

export default function DashboardAnalytique() {
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [drill, setDrill] = useState(null);
  const heroRef = useRef(null);
  const heroChartRef = useRef(null);
  const adsRef = useRef(null);
  const adsChartRef = useRef(null);

  useEffect(() => { fetchAll(period); }, [period]);

  async function fetchAll(days) {
    setLoading(true);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const startStr = dateKey(start);
    const endStr = dateKey(end);
    const start2x = new Date();
    start2x.setDate(start2x.getDate() - (days * 2 - 1));
    const start2xStr = dateKey(start2x);

    const [
      { data: commandes },
      { data: leads },
      { data: adsSpend },
      { data: releve },
      { data: produits },
    ] = await Promise.all([
      supabase
        .from("commandes")
        .select("id, created_at, statut, prix, frais_livraison, transporteur, conseillere, produit")
        .gte("created_at", start2xStr)
        .lte("created_at", endStr + "T23:59:59"),
      supabase
        .from("leads")
        .select("id, created_at, statut, conseillere, produit")
        .gte("created_at", startStr)
        .lte("created_at", endStr + "T23:59:59"),
      supabase
        .from("ads_spend")
        .select("date, plateforme, budget_mad, spend_mad, impressions, clics, leads_count")
        .gte("date", startStr)
        .lte("date", endStr),
      supabase
        .from("releve_bancaire")
        .select("*")
        .order("date", { ascending: false })
        .limit(50),
      supabase.from("produits").select("id, nom, cout_achat"),
    ]);

    const result = buildAnalytics({
      commandes: commandes || [],
      leads: leads || [],
      adsSpend: adsSpend || [],
      releve: releve || [],
      produits: produits || [],
      days, startStr, endStr, start2xStr,
    });

    setData(result);
    setLoading(false);
  }
const getMontant = r => parseFloat(r.montant) || (r.credit ? +r.credit : r.debit ? -Math.abs(+r.debit) : 0);
  function buildAnalytics({ commandes, leads, adsSpend, releve, produits, days, startStr, endStr, start2xStr }) {
    // prodMap par nom (car commandes.produit est un texte) ET par id
    const prodMap = {};
    produits.forEach((p) => {
      prodMap[p.id] = p;
      if (p.nom) prodMap[p.nom] = p;
    });

    // Commandes période courante
    const cmdCurrent = commandes.filter((c) => dateKey(c.created_at) >= startStr);
    const cmdLivrees = cmdCurrent.filter((c) => STATUTS_LIVRES.includes(c.statut));

    // ── Courbe héro ──
    const margsByDay = {};
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      margsByDay[dateKey(d)] = { sum: 0, count: 0 };
    }
    cmdLivrees.forEach((c) => {
      const k = dateKey(c.created_at);
      if (margsByDay[k]) {
        margsByDay[k].sum += calcMarge(c, prodMap);
        margsByDay[k].count += 1;
      }
    });
    const heroLabels = Object.keys(margsByDay).map(labelDate);
    const heroValues = Object.values(margsByDay).map((d) => d.count ? Math.round(d.sum / d.count) : null);
    const heroAvg = cmdLivrees.length
      ? Math.round(cmdLivrees.reduce((s, c) => s + calcMarge(c, prodMap), 0) / cmdLivrees.length)
      : null;

    // ── Produits par nom de produit (texte) ──
    const prodStats = {};
    const initProd = (nomProduit) => {
      if (!prodStats[nomProduit]) {
        prodStats[nomProduit] = {
          nom: nomProduit,
          curr_livr: [], curr_leads: 0, curr_conf: 0,
          prev_livr: [], prev_leads: 0, prev_conf: 0,
        };
      }
    };

    // Leads — groupés par produit_id si disponible, sinon ignorés
leads.forEach((l) => {
  const nom = l.produit;
  if (!nom) return;
  initProd(nom);
  prodStats[nom].curr_leads++;
  if (["Confirmé", "Livrée", "Facturée", "Expédiée", "En cours de livraison"].includes(l.statut))
    prodStats[nom].curr_conf++;
});

    // Commandes — groupées par nom produit
    commandes.forEach((c) => {
      const nom = c.produit;
      if (!nom) return;
      initProd(nom);
      const isCurrent = dateKey(c.created_at) >= startStr;
      const isPrev = dateKey(c.created_at) >= start2xStr && dateKey(c.created_at) < startStr;
      if (STATUTS_LIVRES.includes(c.statut)) {
        const m = calcMarge(c, prodMap);
        if (isCurrent) prodStats[nom].curr_livr.push(m);
        if (isPrev) prodStats[nom].prev_livr.push(m);
      }
      if (isCurrent) prodStats[nom].curr_leads++;
    });

    const prodList = Object.values(prodStats).map((p) => {
      const curr_marge_avg = p.curr_livr.length ? p.curr_livr.reduce((s, v) => s + v, 0) / p.curr_livr.length : null;
      const prev_marge_avg = p.prev_livr.length ? p.prev_livr.reduce((s, v) => s + v, 0) / p.prev_livr.length : null;
      const delta = curr_marge_avg != null && prev_marge_avg != null ? Math.round(curr_marge_avg - prev_marge_avg) : null;
      const taux_conf = pct(p.curr_conf, p.curr_leads);
      const taux_livr = pct(p.curr_livr.length, p.curr_leads);
      const marge_avg = curr_marge_avg != null ? Math.round(curr_marge_avg) : null;
      return {
        id: p.nom, nom: p.nom,
        total_leads: p.curr_leads,
        total_livr: p.curr_livr.length,
        taux_conf, taux_livr, marge_avg,
        delta_marge: delta,
        decision: decisionBadge({ total_leads: p.curr_leads, taux_conf, taux_livr, marge_avg: marge_avg || 0 }),
        fuite: fuiteLabel({ taux_conf, taux_livr, marge_avg: marge_avg || 0 }),
      };
    });

    const byMargeCurrent = [...prodList].filter((p) => p.marge_avg != null).sort((a, b) => b.marge_avg - a.marge_avg);
    const byMargeDecline = [...prodList].filter((p) => p.delta_marge != null && p.delta_marge < 0).sort((a, b) => a.delta_marge - b.delta_marge);

    // ── Ads ──
    const totalSpend = adsSpend.reduce((s, a) => s + (parseFloat(a.spend_mad || a.budget_mad) || 0), 0);
    const totalLeadsAds = adsSpend.reduce((s, a) => s + (parseInt(a.leads_count) || 0), 0);
    const totalClics = adsSpend.reduce((s, a) => s + (parseInt(a.clics) || 0), 0);
    const totalImpr = adsSpend.reduce((s, a) => s + (parseInt(a.impressions) || 0), 0);
    const cplMoyen = totalLeadsAds ? Math.round(totalSpend / totalLeadsAds) : null;
    const ctr = totalImpr ? ((totalClics / totalImpr) * 100).toFixed(1) : null;
    const cpc = totalClics ? Math.round(totalSpend / totalClics) : null;
    const cplLivre = cmdLivrees.length ? Math.round(totalSpend / cmdLivrees.length) : null;

    const platfMap = {};
    adsSpend.forEach((a) => {
      const pl = a.plateforme || "Inconnu";
      if (!platfMap[pl]) platfMap[pl] = { spend: 0, leads: 0, clics: 0, impr: 0 };
      platfMap[pl].spend += parseFloat(a.spend_mad || a.budget_mad) || 0;
      platfMap[pl].leads += parseInt(a.leads_count) || 0;
      platfMap[pl].clics += parseInt(a.clics) || 0;
      platfMap[pl].impr += parseInt(a.impressions) || 0;
    });
    const plateformes = Object.entries(platfMap).map(([nom, d]) => ({
      nom,
      spend: Math.round(d.spend),
      cpl: d.leads ? Math.round(d.spend / d.leads) : null,
      ctr: d.impr ? ((d.clics / d.impr) * 100).toFixed(1) : null,
      cpc: d.clics ? Math.round(d.spend / d.clics) : null,
    })).sort((a, b) => b.spend - a.spend);

    // ── OPS depuis leads ──
    const totalLeadsPeriod = leads.length;
    const STATUTS_CONFIRMS = ["Confirmé", "Livrée", "Facturée", "Expédiée", "En cours de livraison"];
    const confirmes = leads.filter((l) => STATUTS_CONFIRMS.includes(l.statut)).length;
    const txConf = pct(confirmes, totalLeadsPeriod);
    const cmdExpediables = cmdCurrent.filter(c => !["Annulée","Refusée","Doublon","Fausse commande"].includes(c.statut));
const txLivr = pct(cmdLivrees.length, cmdExpediables.length || 1);
    const retours = cmdCurrent.filter((c) => ["Retour reçu", "Retour en cours"].includes(c.statut)).length;
    const txRetour = pct(retours, cmdCurrent.length);

    const pertePctConf = Math.max(0, SEUIL_CONF - txConf);
    const pertePctLivr = Math.max(0, SEUIL_LIVR - txLivr);
    const impactAdsMAD = cplLivre || 0;
    const impactOpsTotal = pertePctConf * 2 + pertePctLivr * 3;
    const totalImpact = impactAdsMAD + impactOpsTotal;
    const pctAds = totalImpact ? Math.round((impactAdsMAD / totalImpact) * 100) : 50;
    const pctOps = 100 - pctAds;

    // ── Conseillères (depuis leads — champ conseillere texte) ──
    const consStats = {};
    leads.forEach((l) => {
      const cid = l.conseillere;
      if (!cid) return;
      if (!consStats[cid]) consStats[cid] = { leads: 0, conf: 0 };
      consStats[cid].leads++;
      if (STATUTS_CONFIRMS.includes(l.statut)) consStats[cid].conf++;
    });
    const conseilleresStats = Object.entries(consStats).map(([nom, c]) => ({
      nom,
      leads: c.leads,
      taux_conf: pct(c.conf, c.leads),
    })).sort((a, b) => b.taux_conf - a.taux_conf);

    // ── Transporteurs (depuis commandes — champ transporteur texte) ──
    const transStats = {};
    cmdCurrent.forEach((c) => {
      const tid = c.transporteur;
      if (!tid) return;
      if (!transStats[tid]) transStats[tid] = { total: 0, livr: 0, retour: 0 };
      transStats[tid].total++;
      if (STATUTS_LIVRES.includes(c.statut)) transStats[tid].livr++;
      if (["Retour reçu", "Retour en cours"].includes(c.statut)) transStats[tid].retour++;
    });
    const transporteursStats = Object.entries(transStats).map(([nom, t]) => {
      const txL = pct(t.livr, t.total);
      let grade = "STOP";
      if (txL >= 60) grade = "A1";
      else if (txL >= 45) grade = "A2";
      else if (txL >= 40) grade = "B2";
      return { nom, total: t.total, livr: t.livr, retour: t.retour, taux_livr: txL, taux_retour: pct(t.retour, t.total), grade };
    }).sort((a, b) => b.taux_livr - a.taux_livr);

    // ── Finance ──

const revenus = (releve || []).filter(r => getMontant(r) > 0);
const depenses = (releve || []).filter(r => getMontant(r) < 0);
const totalRevenu = revenus.reduce((s, r) => s + getMontant(r), 0);
const totalDepense = depenses.reduce((s, r) => s + getMontant(r), 0);
    const soldeNet = totalRevenu + totalDepense;
    const catMap = {};
    depenses.forEach((r) => {
      const cat = r.categorie || r.type || "Autre";
      if (!catMap[cat]) catMap[cat] = 0;
      catMap[cat] += Math.abs(getMontant(r));
    });

    return {
      heroLabels, heroValues, heroAvg,
      prodList, byMargeCurrent, byMargeDecline,
      totalLeadsPeriod, txConf, txLivr, txRetour,
      cmdLivrees: cmdLivrees.length,
      totalSpend, cplMoyen, cplLivre, ctr, cpc,
      plateformes,
      pctAds, pctOps, impactAdsMAD, impactOpsTotal,
      conseilleresStats, transporteursStats,
      releve: releve || [],
      totalRevenu: Math.round(totalRevenu),
      totalDepense: Math.round(totalDepense),
      soldeNet: Math.round(soldeNet),
      catMap,
    };
  }

  useEffect(() => {
    if (!data || !heroRef.current) return;
    if (heroChartRef.current) heroChartRef.current.destroy();
    heroChartRef.current = new Chart(heroRef.current, {
      type: "line",
      data: {
        labels: data.heroLabels,
        datasets: [{ label: "Marge nette / livré (MAD)", data: data.heroValues, borderColor: "#E24B4A", borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true, backgroundColor: "rgba(226,75,74,0.06)", spanGaps: true }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} MAD` } } },
        scales: {
          x: { display: true, ticks: { font: { size: 10 }, color: "#94a3b8", maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
          y: { grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 10 }, color: "#94a3b8", callback: (v) => v + " MAD" } },
        },
      },
    });
  }, [data]);

  useEffect(() => {
    if (!data || drill !== "ads" || !adsRef.current) return;
    setTimeout(() => {
      if (!adsRef.current) return;
      if (adsChartRef.current) adsChartRef.current.destroy();
      const labels = data.plateformes.map((p) => p.nom);
      const spends = data.plateformes.map((p) => p.spend);
      const colors = ["#1877f2", "#e1306c", "#010101", "#FF4500", "#0077B5"];
      adsChartRef.current = new Chart(adsRef.current, {
        type: "bar",
        data: { labels, datasets: [{ label: "Spend (MAD)", data: spends, backgroundColor: labels.map((_, i) => colors[i % colors.length]), borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 10 }, callback: (v) => v + " MAD" } },
          },
        },
      });
    }, 80);
  }, [drill, data]);

  const gradeColor = { A1: { bg: "#EAF3DE", color: "#3B6D11" }, A2: { bg: "#E1F5EE", color: "#0F6E56" }, B2: { bg: "#FAEEDA", color: "#854F0B" }, STOP: { bg: "#FCEBEB", color: "#A32D2D" } };

  function ProdTable({ rows, showDelta }) {
    const th = { padding: "8px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#94a3b8", fontWeight: 500, borderBottom: "0.5px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap" };
    const td = (center) => ({ padding: "9px 10px", fontSize: 13, color: "#1e293b", textAlign: center ? "right" : "left", verticalAlign: "middle" });
    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={th}>Produit</th>
            <th style={{ ...th, textAlign: "right" }}>Cmds</th>
            <th style={{ ...th, textAlign: "right" }}>Livr.</th>
            {showDelta && <th style={{ ...th, textAlign: "right" }}>Δ Marge</th>}
            <th style={{ ...th, textAlign: "right" }}>Marge moy.</th>
            <th style={th}>Décision</th>
            <th style={th}>Fuite</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const f = p.fuite;
            const dec = p.decision;
            const livrOk = p.taux_livr >= SEUIL_LIVR;
            return (
              <tr key={p.id} style={{ borderTop: "0.5px solid #f1f5f9" }}>
                <td style={td(true)}>{i + 1}</td>
                <td style={{ ...td(), maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.nom}>{p.nom}</td>
                <td style={td(true)}>{p.total_leads}</td>
                <td style={{ ...td(true), color: livrOk ? "#3B6D11" : "#A32D2D", fontWeight: 500 }}>{p.total_livr}</td>
                {showDelta && (
                  <td style={{ ...td(true), color: p.delta_marge < 0 ? "#A32D2D" : "#3B6D11", fontWeight: 500 }}>
                    {p.delta_marge != null ? `${p.delta_marge > 0 ? "+" : ""}${p.delta_marge} MAD` : "—"}
                  </td>
                )}
                <td style={{ ...td(true), color: p.marge_avg != null ? (p.marge_avg >= 0 ? "#3B6D11" : "#A32D2D") : "#94a3b8", fontWeight: 600 }}>
                  {p.marge_avg != null ? `${p.marge_avg} MAD` : "—"}
                </td>
                <td style={td()}><span style={S.badge(dec)}>{decisionLabel[dec]}</span></td>
                <td style={td()}>
                  {f ? <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: f.bg, color: f.color }}>{f.label}</span>
                     : <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={8} style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Aucune donnée sur la période</td></tr>
          )}
        </tbody>
      </table>
    );
  }

  const th = { padding: "8px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#94a3b8", fontWeight: 500, borderBottom: "0.5px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap" };
  const td = (center) => ({ padding: "9px 10px", fontSize: 13, color: "#1e293b", textAlign: center ? "right" : "left", verticalAlign: "middle" });

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "#94a3b8", fontSize: 14 }}>Chargement du cockpit analytique…</div>;
  }
  if (!data) return null;

  const { heroLabels, heroValues, heroAvg, byMargeCurrent, byMargeDecline, totalLeadsPeriod, txConf, txLivr, txRetour, cmdLivrees, totalSpend, cplMoyen, cplLivre, ctr, cpc, plateformes, pctAds, pctOps, conseilleresStats, transporteursStats, releve, totalRevenu, totalDepense, soldeNet, catMap } = data;
  const periodLabel = period === 7 ? "7 derniers jours" : period === 30 ? "30 derniers jours" : "90 derniers jours";
  const hasDecline = byMargeDecline.length > 0;

  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Cockpit analytique</span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{new Date().toLocaleDateString("fr", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {hasDecline && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#FCEBEB", border: "0.5px solid #F7C1C1", borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 500, color: "#A32D2D" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E24B4A", display: "inline-block" }} />
              {byMargeDecline.length} produit{byMargeDecline.length > 1 ? "s" : ""} en déclin
            </div>
          )}
          {[7, 30, 90].map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: "5px 12px", border: "0.5px solid", borderRadius: 6, fontSize: 12, cursor: "pointer", background: period === p ? "#534AB7" : "#fff", color: period === p ? "#fff" : "#64748b", borderColor: period === p ? "#534AB7" : "#e2e8f0", fontWeight: period === p ? 600 : 400 }}>
              {p}j
            </button>
          ))}
        </div>
      </div>

      <div style={S.sectionLabel}>1 — Signal principal · marge unitaire / livré · {periodLabel}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, marginBottom: 28 }}>
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 6 }}>
            <span style={{ fontSize: 40, fontWeight: 600, color: heroAvg != null ? (heroAvg >= 0 ? "#3B6D11" : "#E24B4A") : "#94a3b8", lineHeight: 1 }}>
              {heroAvg != null ? `${heroAvg} MAD` : "—"}
            </span>
            <span style={{ fontSize: 13, color: "#64748b" }}>marge nette moyenne / livré</span>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
            Calculé sur {cmdLivrees} commandes livrées · prix − coût achat produit − livraison − emballage ({FRAIS_EMBALLAGE} MAD) − confirmation ({FRAIS_CONFIRMATION} MAD)
          </div>
<div style={{ position: "relative", height: 180 }}>
  <canvas ref={heroRef} />
</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Taux confirmation", val: `${txConf}%`, ok: txConf >= SEUIL_CONF, warn: txConf >= 25, seuil: `Seuil > ${SEUIL_CONF}%` },
            { label: "Taux livraison", val: `${txLivr}%`, ok: txLivr >= SEUIL_LIVR, warn: txLivr >= 40, seuil: `Seuil > ${SEUIL_LIVR}%` },
            { label: "Leads période", val: totalLeadsPeriod, ok: true, seuil: periodLabel },
            { label: "Livrées période", val: cmdLivrees, ok: cmdLivrees > 0, seuil: "Livrée + Facturée" },
          ].map((s) => (
            <div key={s.label} style={S.statCard}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: s.ok ? "#1e293b" : s.warn ? "#BA7517" : "#A32D2D" }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.seuil}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.divider} />

      <div style={S.sectionLabel}>2a — Produits · classement par marge actuelle</div>
      <div style={{ ...S.card, marginBottom: 20, overflowX: "auto" }}>
        <ProdTable rows={byMargeCurrent.slice(0, 10)} showDelta={false} />
      </div>

      <div style={S.sectionLabel}>2b — Produits · marge en baisse · comparaison {period}j vs {period}j précédents</div>
      <div style={{ ...S.card, marginBottom: 0, overflowX: "auto" }}>
        {hasDecline ? (
          <>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>Delta = marge moyenne période courante − période précédente.</div>
            <ProdTable rows={byMargeDecline} showDelta={true} />
          </>
        ) : (
          <div style={{ padding: "20px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Aucun produit en dégradation sur la période.</div>
        )}
      </div>

      <div style={S.divider} />

      <div style={S.sectionLabel}>3 — Diagnostic fuite · Ads vs OPS</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
        Impact Ads = CPL/livré ({cplLivre != null ? `${cplLivre} MAD` : "—"}) · Impact OPS = points sous seuil conf ({Math.max(0, SEUIL_CONF - txConf)} pts) et livraison ({Math.max(0, SEUIL_LIVR - txLivr)} pts)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div onClick={() => setDrill(drill === "ads" ? null : "ads")} style={{ ...S.card, cursor: "pointer", borderColor: drill === "ads" ? "#534AB7" : "#e2e8f0", borderWidth: drill === "ads" ? 1.5 : 0.5 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, color: "#534AB7" }}>📣</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>Acquisition — Ads</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#534AB7" }}>{pctAds}%</span>
          </div>
          {[
            { label: "Spend total", val: `${Math.round(totalSpend)} MAD`, pct: 100 },
            { label: "CPL moyen", val: cplMoyen != null ? `${cplMoyen} MAD` : "—", pct: cplMoyen ? Math.min(100, cplMoyen) : 0 },
            { label: "CPL / livré", val: cplLivre != null ? `${cplLivre} MAD` : "—", pct: cplLivre ? Math.min(100, cplLivre / 2) : 0 },
            { label: "CTR moyen", val: ctr ? `${ctr}%` : "—", pct: ctr ? parseFloat(ctr) * 20 : 0 },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#64748b", width: 90, flexShrink: 0 }}>{row.label}</span>
              <div style={{ flex: 1, height: 5, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${row.pct}%`, background: "#534AB7", borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#534AB7", minWidth: 60, textAlign: "right" }}>{row.val}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 11, color: "#534AB7" }}>▸ {drill === "ads" ? "Masquer" : "Voir détail par plateforme"}</div>
        </div>

        <div onClick={() => setDrill(drill === "ops" ? null : "ops")} style={{ ...S.card, cursor: "pointer", borderColor: drill === "ops" ? "#BA7517" : "#e2e8f0", borderWidth: drill === "ops" ? 1.5 : 0.5 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, color: "#BA7517" }}>👥</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>OPS — Confirmation & Livraison</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#BA7517" }}>{pctOps}%</span>
          </div>
          {[
            { label: "Confirmation", val: `${txConf}%`, pct: txConf, seuil: SEUIL_CONF, color: "#BA7517" },
            { label: "Livraison", val: `${txLivr}%`, pct: txLivr, seuil: SEUIL_LIVR, color: "#BA7517" },
            { label: "Retours", val: `${txRetour}%`, pct: txRetour, seuil: 25, color: "#E24B4A" },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#64748b", width: 90, flexShrink: 0 }}>{row.label}</span>
              <div style={{ flex: 1, height: 5, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${row.pct}%`, background: row.color, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: row.pct < row.seuil ? "#A32D2D" : "#3B6D11", minWidth: 40, textAlign: "right" }}>{row.val}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 11, color: "#BA7517" }}>▸ {drill === "ops" ? "Masquer" : "Voir conseillères & transporteurs"}</div>
        </div>
      </div>

      {drill === "ads" && (
        <div style={{ ...S.card, marginBottom: 20, borderColor: "#AFA9EC" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>📣 Ads — Détail par plateforme</span>
            <button onClick={() => setDrill(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#94a3b8" }}>✕ Fermer</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {[{ label: "Spend total", val: `${Math.round(totalSpend)} MAD` }, { label: "CPL moyen", val: cplMoyen != null ? `${cplMoyen} MAD` : "—" }, { label: "CPL / livré", val: cplLivre != null ? `${cplLivre} MAD` : "—" }, { label: "CTR global", val: ctr ? `${ctr}%` : "—" }].map((k) => (
              <div key={k.label} style={S.statCard}><div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{k.label}</div><div style={{ fontSize: 18, fontWeight: 600, color: "#1e293b" }}>{k.val}</div></div>
            ))}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
            <thead><tr style={{ background: "#f8fafc" }}>{["Plateforme", "Spend", "CPL", "CTR", "CPC"].map((h) => (<th key={h} style={{ ...th, background: "#f8fafc" }}>{h}</th>))}</tr></thead>
            <tbody>
              {plateformes.length > 0 ? plateformes.map((pl) => (
                <tr key={pl.nom} style={{ borderTop: "0.5px solid #f1f5f9" }}>
                  <td style={{ ...td(), fontWeight: 500 }}>{pl.nom}</td>
                  <td style={td(true)}>{pl.spend} MAD</td>
                  <td style={td(true)}>{pl.cpl != null ? `${pl.cpl} MAD` : "—"}</td>
                  <td style={td(true)}>{pl.ctr ? `${pl.ctr}%` : "—"}</td>
                  <td style={td(true)}>{pl.cpc != null ? `${pl.cpc} MAD` : "—"}</td>
                </tr>
              )) : <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Aucune donnée ads</td></tr>}
            </tbody>
          </table>
          <div style={{ position: "relative", height: 140 }}><canvas ref={adsRef} /></div>
        </div>
      )}

      {drill === "ops" && (
        <div style={{ ...S.card, marginBottom: 20, borderColor: "#FAC775" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>👥 OPS — Conseillères & Transporteurs</span>
            <button onClick={() => setDrill(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#94a3b8" }}>✕ Fermer</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Conseillères</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Conseillère", "Leads", "Taux conf.", "Tendance"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {conseilleresStats.length > 0 ? conseilleresStats.map((c) => (
                    <tr key={c.nom} style={{ borderTop: "0.5px solid #f1f5f9" }}>
                      <td style={{ ...td(), fontWeight: 500 }}>{c.nom}</td>
                      <td style={td(true)}>{c.leads}</td>
                      <td style={{ ...td(true), color: c.taux_conf >= SEUIL_CONF ? "#3B6D11" : c.taux_conf >= 25 ? "#BA7517" : "#A32D2D", fontWeight: 600 }}>{c.taux_conf}%</td>
                      <td style={td()}><span style={S.chip(c.taux_conf >= SEUIL_CONF)}>{c.taux_conf >= SEUIL_CONF ? "OK" : "À améliorer"}</span></td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Aucune donnée</td></tr>}
                </tbody>
              </table>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Transporteurs</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Transporteur", "Livr.", "Retours", "Grade"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {transporteursStats.length > 0 ? transporteursStats.map((t) => (
                    <tr key={t.nom} style={{ borderTop: "0.5px solid #f1f5f9" }}>
                      <td style={{ ...td(), fontWeight: 500 }}>{t.nom}</td>
                      <td style={{ ...td(true), color: t.taux_livr >= SEUIL_LIVR ? "#3B6D11" : "#A32D2D", fontWeight: 600 }}>{t.taux_livr}%</td>
                      <td style={{ ...td(true), color: t.taux_retour > 25 ? "#A32D2D" : "#1e293b" }}>{t.taux_retour}%</td>
                      <td style={td()}><span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, ...gradeColor[t.grade] }}>{t.grade}</span></td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Aucun transporteur</td></tr>}
                </tbody>
              </table>
              <div style={{ marginTop: 12, fontSize: 11, color: "#94a3b8" }}>A1 ≥ 60% · A2 45–60% · B2 40–45% · STOP &lt; 40%</div>
            </div>
          </div>
        </div>
      )}

      <div style={S.divider} />

      <div style={S.sectionLabel}>6 — Finance · trésorerie & mouvements</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", marginBottom: 14 }}>Journal des mouvements</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Date", "Libellé", "Catégorie", "Type", "Montant"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {releve.length > 0 ? releve.slice(0, 20).map((r, i) => {
                const montant = getMontant(r);
                const isIn = montant > 0;
                return (
                  <tr key={i} style={{ borderTop: "0.5px solid #f1f5f9" }}>
                    <td style={{ ...td(), color: "#94a3b8", fontSize: 12 }}>{r.date ? new Date(r.date).toLocaleDateString("fr", { day: "numeric", month: "short" }) : "—"}</td>
                    <td style={{ ...td(), maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{r.libelle || r.description || r.intitule || "—"}</td>
                    <td style={td()}><span style={{ fontSize: 11, color: "#64748b" }}>{r.categorie || r.type || "—"}</span></td>
                    <td style={td()}><span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 4, fontSize: 11, fontWeight: 500, background: isIn ? "#EAF3DE" : "#FCEBEB", color: isIn ? "#3B6D11" : "#A32D2D" }}>{isIn ? "Recette" : "Dépense"}</span></td>
                    <td style={{ ...td(true), fontWeight: 600, color: isIn ? "#3B6D11" : "#A32D2D" }}>{isIn ? "+" : ""}{Math.round(Math.abs(montant))} MAD</td>
                  </tr>
                );
              }) : <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Aucun mouvement enregistré</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={S.card}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Cash net</div>
            <div style={{ fontSize: 34, fontWeight: 700, color: soldeNet >= 0 ? "#3B6D11" : "#A32D2D", lineHeight: 1, marginBottom: 4 }}>{soldeNet >= 0 ? "+" : ""}{soldeNet} MAD</div>
            <div style={{ height: "0.5px", background: "#e2e8f0", margin: "14px 0" }} />
            {[{ label: "Recettes", val: `+${totalRevenu} MAD`, color: "#3B6D11" }, { label: "Dépenses", val: `${totalDepense} MAD`, color: "#A32D2D" }, { label: "Solde net", val: `${soldeNet >= 0 ? "+" : ""}${soldeNet} MAD`, color: soldeNet >= 0 ? "#3B6D11" : "#A32D2D", bold: true }].map((row) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 10 }}>
                <span style={{ color: "#64748b" }}>{row.label}</span>
                <span style={{ fontWeight: row.bold ? 700 : 500, color: row.color }}>{row.val}</span>
              </div>
            ))}
          </div>
          {Object.keys(catMap).length > 0 && (
            <div style={S.card}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Ventilation dépenses</div>
              <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1, marginBottom: 12 }}>
                {Object.entries(catMap).map(([cat, val], i) => {
                  const barColors = ["#534AB7", "#E24B4A", "#BA7517", "#3B6D11", "#888"];
                  return <div key={cat} title={`${cat}`} style={{ flex: val / (Math.abs(totalDepense) || 1) * 100, background: barColors[i % barColors.length], minWidth: 2 }} />;
                })}
              </div>
              {Object.entries(catMap).map(([cat, val], i) => {
                const barColors = ["#534AB7", "#E24B4A", "#BA7517", "#3B6D11", "#888"];
                return (
                  <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: barColors[i % barColors.length], display: "inline-block" }} />
                      {cat}
                    </span>
                    <span style={{ fontWeight: 500, color: "#1e293b" }}>{Math.round(val)} MAD · {Math.round(val / (Math.abs(totalDepense) || 1) * 100)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
