/**
 * DashboardAnalytique.jsx — Momtaz ERP
 * Colonnes Supabase vérifiées le 13/06/2026
 *
 * CONSTANTES MÉTIER (modifier ici si besoin) :
 *   EMBALLAGE_PAR_CMD  = 4 MAD  (sous-traitance stock/emballage)
 *   CONFIRMATION_PAR_LIVRE = 10 MAD  (10 DH par commande livrée)
 *   MIN_LEADS_TEST     = 20
 *   SEUIL_MARGE        = 20 MAD
 */

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

// ─── CONSTANTES MÉTIER ────────────────────────────────────────────────────────
const EMBALLAGE_PAR_CMD       = 4;   // MAD
const CONFIRMATION_PAR_LIVRE  = 10;  // MAD
const MIN_LEADS_TEST          = 20;
const SEUIL_MARGE             = 20;  // MAD marge nette min pour SCALE

// Statuts leads
const STATUTS_CONFIRMES = ["Confirmé", "Confirmée"];
// Statuts commandes
const STATUTS_LIVRES   = ["Livrée", "Facturée"];
const STATUTS_EXPEDIES = ["Expédiée", "Livrée", "Facturée"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function movingAvg(data, key, window = 3) {
  return data.map((d, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1);
    const vals  = slice.map(x => x[key]).filter(v => v !== null && v !== undefined);
    const avg   = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    return { ...d, ma3: avg !== null ? Math.round(avg) : null };
  });
}

function computeMetrics(produit, leads, commandes, adsSpend) {
  const nom = produit.nom;

  // ── Leads ──────────────────────────────────────────────────────────────────
  const leadsP     = leads.filter(l => l.produit === nom);
  const confirmes  = leadsP.filter(l => STATUTS_CONFIRMES.includes(l.statut));
  const totalLeads = leadsP.length;

  // ── Commandes ──────────────────────────────────────────────────────────────
  const commandesP = commandes.filter(c => c.produit === nom);
  const livres     = commandesP.filter(c => STATUTS_LIVRES.includes(c.statut));
  const expedies   = commandesP.filter(c => STATUTS_EXPEDIES.includes(c.statut));

  const tauxConf = totalLeads > 0 ? confirmes.length / totalLeads : 0;
  const tauxLivr = expedies.length > 0 ? livres.length / expedies.length : 0;

  // ── Frais livraison moyen (depuis commandes livrées) ──────────────────────
  const fraisLivrTotal  = livres.reduce((s, c) => s + (parseFloat(c.frais_livraison) || 0), 0);
  const fraisLivrMoyen  = livres.length > 0 ? fraisLivrTotal / livres.length : 0;

  // ── Ads spend ──────────────────────────────────────────────────────────────
  const totalAds = adsSpend
    .filter(a => a.produit === nom)
    .reduce((s, a) => s + (parseFloat(a.budget_mad) || 0), 0);

  const cplReel = totalLeads > 0 ? totalAds / totalLeads : 0;

  // ── Marge brute par unité livrée ──────────────────────────────────────────
  // = prix_vente - cout_achat - frais_livraison_moyen - emballage - confirmation
  const margeBrute = (parseFloat(produit.prix_vente) || 0)
    - (parseFloat(produit.cout_achat)  || 0)
    - fraisLivrMoyen
    - EMBALLAGE_PAR_CMD
    - CONFIRMATION_PAR_LIVRE;

  // ── CPL MAX ───────────────────────────────────────────────────────────────
  // = marge_brute × taux_conf × taux_livr
  const cplMax = margeBrute * tauxConf * tauxLivr;

  // ── Marge nette par livré ─────────────────────────────────────────────────
  // coût acquisition par livré = CPL_réel / (taux_conf × taux_livr)
  const denomAcq   = tauxConf * tauxLivr;
  const coutAcqLiv = denomAcq > 0 ? cplReel / denomAcq : 0;
  const margeNette = margeBrute - coutAcqLiv;

  // ── Décision ──────────────────────────────────────────────────────────────
  let decision = "EN TEST";
  if (totalLeads < MIN_LEADS_TEST) {
    decision = "EN TEST";
  } else if (tauxLivr >= 0.6 && tauxConf >= 0.4 && margeNette > SEUIL_MARGE) {
    decision = "SCALE";
  } else if (tauxConf >= 0.25 && tauxLivr >= 0.4 && margeNette > 0) {
    decision = "OPTIMISER";
  } else {
    decision = "STOP";
  }

  return {
    nom,
    totalLeads,
    nbConfirmes: confirmes.length,
    nbLivres:    livres.length,
    nbExpedies:  expedies.length,
    tauxConf,
    tauxLivr,
    fraisLivrMoyen,
    totalAds,
    cplReel,
    cplMax,
    margeBrute,
    margeNette,
    decision,
    rentable: cplReel > 0 && cplReel <= cplMax && margeNette > 0,
    prixVente: parseFloat(produit.prix_vente) || 0,
    coutAchat: parseFloat(produit.cout_achat) || 0,
  };
}

function computeDailyData(nom, produits, commandes, adsSpend) {
  const p = produits.find(x => x.nom === nom);
  const prixVente  = p ? parseFloat(p.prix_vente) || 0 : 0;
  const coutAchat  = p ? parseFloat(p.cout_achat)  || 0 : 0;

  const days = getLast30Days();
  const raw  = days.map(date => {
    const livresJour = commandes.filter(
      c => c.produit === nom
        && STATUTS_LIVRES.includes(c.statut)
        && (c.created_at || "").slice(0, 10) === date
    );
    const fraisLivrJour = livresJour.reduce(
      (s, c) => s + (parseFloat(c.frais_livraison) || 0), 0
    );
    const adsJour = adsSpend
      .filter(a => a.produit === nom && (a.date || "").slice(0, 10) === date)
      .reduce((s, a) => s + (parseFloat(a.budget_mad) || 0), 0);

    const nbLivres = livresJour.length;

    // Marge nette jour = revenus_livres - couts_livres - ads
    const revenu   = nbLivres * prixVente;
    const couts    = nbLivres * coutAchat
                   + fraisLivrJour
                   + nbLivres * EMBALLAGE_PAR_CMD
                   + nbLivres * CONFIRMATION_PAR_LIVRE
                   + adsJour;

    const marge = (nbLivres > 0 || adsJour > 0)
      ? Math.round(revenu - couts)
      : null;

    return { date: date.slice(5), nbLivres, adsJour, marge };
  });

  return movingAvg(raw, "marge");
}

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────
export default function DashboardAnalytique() {
  const [produits,  setProduits]  = useState([]);
  const [leads,     setLeads]     = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [adsSpend,  setAdsSpend]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [selected,  setSelected]  = useState(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true); setError(null);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceISO  = since.toISOString();
      const sinceDate = sinceISO.slice(0, 10);

      const [
        { data: pData,  error: pErr },
        { data: lData,  error: lErr },
        { data: cData,  error: cErr },
        { data: aData,  error: aErr },
      ] = await Promise.all([
        supabase.from("produits")
          .select("nom, prix_vente, cout_achat"),
        supabase.from("leads")
          .select("produit, statut, created_at")
          .gte("created_at", sinceISO),
        supabase.from("commandes")
          .select("produit, statut, created_at, frais_livraison")
          .gte("created_at", sinceISO),
        supabase.from("ads_spend")
          .select("produit, budget_mad, date")
          .gte("date", sinceDate),
      ]);

      if (pErr || lErr || cErr || aErr)
        throw pErr || lErr || cErr || aErr;

      // Déduplique produits par nom (variantes → garder 1 ligne par nom)
      const nomsVus = new Set();
      const produitsUniques = (pData || []).filter(p => {
        if (nomsVus.has(p.nom)) return false;
        nomsVus.add(p.nom); return true;
      });

      setProduits(produitsUniques);
      setLeads(lData    || []);
      setCommandes(cData || []);
      setAdsSpend(aData  || []);
      if (produitsUniques.length) setSelected(produitsUniques[0].nom);
    } catch (e) {
      setError(e?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  const allMetrics = useMemo(() =>
    produits.map(p => computeMetrics(p, leads, commandes, adsSpend)),
    [produits, leads, commandes, adsSpend]
  );

  const selMetrics = useMemo(() =>
    allMetrics.find(m => m.nom === selected) || null,
    [allMetrics, selected]
  );

  const dailyData = useMemo(() => {
    if (!selected) return [];
    return computeDailyData(selected, produits, commandes, adsSpend);
  }, [selected, produits, commandes, adsSpend]);

  // ─── RENDER ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={S.center}>
      <div style={S.spinner} />
      <p style={{ color: "#64748b", marginTop: 14, fontSize: 13 }}>Chargement des données…</p>
    </div>
  );

  if (error) return (
    <div style={S.center}>
      <p style={{ color: "#ef4444", fontSize: 13 }}>⚠️ {error}</p>
      <button onClick={fetchAll} style={S.btnSm}>Réessayer</button>
    </div>
  );

  return (
    <div style={S.page}>

      {/* HEADER */}
      <div style={S.pageHeader}>
        <div>
          <h1 style={S.h1}>Dashboard Analytique</h1>
          <p style={S.subtitle}>30 derniers jours · {produits.length} produits</p>
        </div>
        <button onClick={fetchAll} style={S.btnSm}>↻ Actualiser</button>
      </div>

      {/* ── ZONE 1 — CPL Réel vs CPL MAX ─────────────────────────────────── */}
      <Zone num="01" titre="Alerte CPL — Rentabilité par produit">
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                {[
                  "Produit", "Leads", "Conf.", "Livr.",
                  "Frais livr. moy.", "Ads (MAD)", "CPL Réel",
                  "CPL MAX", "Marge nette/livré", "Statut"
                ].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {allMetrics.map(m => (
                <tr
                  key={m.nom}
                  style={{
                    ...S.tr,
                    background: selected === m.nom ? "#1e293b" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelected(m.nom)}
                >
                  <td style={S.td}><span style={S.nomP}>{m.nom}</span></td>
                  <td style={S.tdR}>{m.totalLeads}</td>
                  <td style={S.tdR}>{pct(m.tauxConf)}</td>
                  <td style={S.tdR}>{pct(m.tauxLivr)}</td>
                  <td style={S.tdR}>{m.fraisLivrMoyen > 0 ? fmt(m.fraisLivrMoyen) : "—"}</td>
                  <td style={S.tdR}>{m.totalAds > 0 ? fmt(m.totalAds) : "—"}</td>
                  <td style={{ ...S.tdR, color: m.rentable ? "#4ade80" : "#f87171" }}>
                    {m.cplReel > 0 ? fmt(m.cplReel) : "—"}
                  </td>
                  <td style={S.tdR}>{fmt(m.cplMax)}</td>
                  <td style={{
                    ...S.tdR, fontWeight: 700,
                    color: m.margeNette > 0 ? "#4ade80" : "#f87171",
                  }}>
                    {fmt(m.margeNette)}
                  </td>
                  <td style={S.td}>
                    <span style={chip(m.rentable)}>
                      {m.rentable ? "🟢 RENTABLE" : "🔴 PERTE"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={S.hint}>
          CPL MAX = (PV − PA − Livr. − {EMBALLAGE_PAR_CMD} − {CONFIRMATION_PAR_LIVRE}) × Taux conf × Taux livr &nbsp;·&nbsp;
          Cliquer sur une ligne pour voir le détail ci-dessous
        </p>
      </Zone>

      {/* TABS sélecteur produit */}
      {produits.length > 1 && (
        <div style={S.tabs}>
          {produits.map(p => {
            const m = allMetrics.find(x => x.nom === p.nom);
            return (
              <button
                key={p.nom}
                onClick={() => setSelected(p.nom)}
                style={{
                  ...S.tab,
                  ...(selected === p.nom ? S.tabActive : {}),
                  borderColor: selected === p.nom
                    ? (m?.rentable ? "#4ade80" : "#f87171")
                    : "#1e293b",
                }}
              >
                {p.nom}
              </button>
            );
          })}
        </div>
      )}

      {selMetrics && (
        <>
          {/* ── ZONE 2 — Courbe marge nette 30j ──────────────────────────── */}
          <Zone num="02" titre={`Marge nette quotidienne — ${selected}`}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dailyData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 11 }} />
                <YAxis tick={{ fill: "#475569", fontSize: 11 }} unit=" MAD" width={70} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: "#e2e8f0" }}
                  formatter={(v, name) => [v !== null ? `${v} MAD` : "—", name]}
                />
                <ReferenceLine
                  y={0} stroke="#ef4444" strokeDasharray="4 4"
                  label={{ value: "Seuil 0", fill: "#ef4444", fontSize: 10, position: "insideTopRight" }}
                />
                <Line
                  type="monotone" dataKey="marge" stroke="#38bdf8"
                  strokeWidth={2} dot={false} name="Marge nette" connectNulls={false}
                />
                <Line
                  type="monotone" dataKey="ma3" stroke="#f59e0b"
                  strokeWidth={1.5} dot={false} strokeDasharray="5 3"
                  name="Moy. mobile 3j" connectNulls
                />
                <Legend wrapperStyle={{ color: "#64748b", fontSize: 12, paddingTop: 8 }} />
              </LineChart>
            </ResponsiveContainer>
            <p style={S.hint}>
              Marge nette jour = (Livrés × PV) − cout_achat − frais_livraison − {EMBALLAGE_PAR_CMD} MAD/cmd − {CONFIRMATION_PAR_LIVRE} MAD/livré − Ads
            </p>
          </Zone>

          {/* ── ZONE 3 — Diagnostic (seulement si en perte) ──────────────── */}
          {!selMetrics.rentable && selMetrics.totalLeads >= MIN_LEADS_TEST && (
            <Zone num="03" titre={`Diagnostic — Pourquoi ${selected} est en perte ?`}>
              <div style={S.diagGrid}>
                <DiagCard
                  titre="CPL trop élevé ?"
                  ok={selMetrics.cplReel <= selMetrics.cplMax || selMetrics.cplReel === 0}
                  valeur={selMetrics.cplReel > 0
                    ? `Réel ${fmt(selMetrics.cplReel)} vs MAX ${fmt(selMetrics.cplMax)}`
                    : `CPL MAX = ${fmt(selMetrics.cplMax)}`}
                  action={selMetrics.cplReel > selMetrics.cplMax
                    ? "Réduire le budget ou améliorer le ciblage publicitaire"
                    : "CPL sous contrôle — chercher ailleurs"}
                />
                <DiagCard
                  titre="Taux de confirmation ?"
                  ok={selMetrics.tauxConf >= 0.25}
                  valeur={pct(selMetrics.tauxConf)}
                  action={selMetrics.tauxConf < 0.25
                    ? "Revoir le script de la conseillère / qualité des leads"
                    : "Confirmation correcte"}
                />
                <DiagCard
                  titre="Taux de livraison ?"
                  ok={selMetrics.tauxLivr >= 0.4}
                  valeur={pct(selMetrics.tauxLivr)}
                  action={selMetrics.tauxLivr < 0.4
                    ? "Vérifier zones géo, délais, ou qualité produit"
                    : "Livraison correcte"}
                />
                <DiagCard
                  titre="Marge brute suffisante ?"
                  ok={selMetrics.margeBrute > 50}
                  valeur={fmt(selMetrics.margeBrute)}
                  action={selMetrics.margeBrute <= 50
                    ? `PV ${fmt(selMetrics.prixVente)} − PA ${fmt(selMetrics.coutAchat)} − Livr. ${fmt(selMetrics.fraisLivrMoyen)} − ${EMBALLAGE_PAR_CMD + CONFIRMATION_PAR_LIVRE} MAD frais fixes`
                    : "Marge brute suffisante — le problème vient des ads"}
                />
              </div>
            </Zone>
          )}

          {/* ── ZONE 4 — Décisions tous produits ─────────────────────────── */}
          <Zone num="04" titre="Décisions produits">
            <div style={S.cardGrid}>
              {allMetrics.map(m => (
                <DecisionCard
                  key={m.nom} m={m}
                  active={m.nom === selected}
                  onClick={() => setSelected(m.nom)}
                />
              ))}
            </div>
          </Zone>
        </>
      )}

    </div>
  );
}

// ─── SOUS-COMPOSANTS ──────────────────────────────────────────────────────────
function Zone({ num, titre, children }) {
  return (
    <div style={S.zone}>
      <div style={S.zoneHead}>
        <span style={S.zoneNum}>{num}</span>
        <h2 style={S.zoneTitle}>{titre}</h2>
      </div>
      {children}
    </div>
  );
}

function DiagCard({ titre, ok, valeur, action }) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: 10,
      border: `1px solid ${ok ? "#22d3ee20" : "#f8717130"}`,
      background: ok ? "rgba(34,211,238,0.04)" : "rgba(248,113,113,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span>{ok ? "✅" : "❌"}</span>
        <span style={{ color: "#cbd5e1", fontWeight: 600, fontSize: 13 }}>{titre}</span>
      </div>
      <p style={{ color: ok ? "#4ade80" : "#f87171", fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>
        {valeur}
      </p>
      <p style={{ color: "#64748b", fontSize: 12, margin: 0, lineHeight: 1.5 }}>{action}</p>
    </div>
  );
}

const DCFG = {
  SCALE:     { color: "#4ade80", bg: "rgba(74,222,128,0.08)",  icon: "🚀" },
  OPTIMISER: { color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  icon: "⚙️" },
  "EN TEST": { color: "#38bdf8", bg: "rgba(56,189,248,0.06)",  icon: "🧪" },
  STOP:      { color: "#f87171", bg: "rgba(248,113,113,0.08)", icon: "🛑" },
};

function DecisionCard({ m, active, onClick }) {
  const c = DCFG[m.decision] || DCFG["EN TEST"];
  return (
    <div onClick={onClick} style={{
      padding: "16px 18px", borderRadius: 12, cursor: "pointer",
      border: `1px solid ${active ? c.color : "#1e293b"}`,
      background: active ? c.bg : "#0a0f1a",
      transition: "border-color .15s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500 }}>{m.nom}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
          color: c.color, background: c.bg,
        }}>{c.icon} {m.decision}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
        <Kv k="Leads" v={m.totalLeads} />
        <Kv k="Livrés" v={m.nbLivres} />
        <Kv k="Marge nette/livré" v={fmt(m.margeNette)} color={m.margeNette > 0 ? "#4ade80" : "#f87171"} />
        <Kv k="CPL réel" v={m.cplReel > 0 ? fmt(m.cplReel) : "—"} />
      </div>
    </div>
  );
}

function Kv({ k, v, color }) {
  return (
    <div>
      <p style={{ color: "#334155", fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", margin: 0 }}>{k}</p>
      <p style={{ color: color || "#e2e8f0", fontSize: 14, fontWeight: 600, margin: "2px 0 0" }}>{v}</p>
    </div>
  );
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = v => (isNaN(v) || v === null) ? "—" : Math.round(v).toLocaleString("fr-MA") + " MAD";
const pct = v => (isNaN(v) || v === null) ? "—" : (v * 100).toFixed(1) + "%";
const chip = ok => ({
  padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
  background: ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
  color: ok ? "#4ade80" : "#f87171",
  border: `1px solid ${ok ? "#4ade8040" : "#f8717140"}`,
  whiteSpace: "nowrap",
});

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  page:      { padding: "24px 20px", maxWidth: 1140, margin: "0 auto", fontFamily: "'Inter', system-ui, sans-serif", color: "#e2e8f0" },
  pageHeader:{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  h1:        { fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: "0 0 4px" },
  subtitle:  { fontSize: 12, color: "#475569", margin: 0 },
  zone:      { background: "#0d1520", border: "1px solid #1e293b", borderRadius: 14, padding: "20px 20px 22px", marginBottom: 20 },
  zoneHead:  { display: "flex", alignItems: "center", gap: 10, marginBottom: 18 },
  zoneNum:   { fontSize: 11, fontWeight: 700, color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", borderRadius: 6, padding: "2px 8px", letterSpacing: ".06em" },
  zoneTitle: { fontSize: 15, fontWeight: 600, color: "#cbd5e1", margin: 0 },
  table:     { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:        { textAlign: "left", color: "#334155", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", padding: "8px 12px", borderBottom: "1px solid #1e293b" },
  tr:        { borderBottom: "1px solid #0d1520" },
  td:        { padding: "10px 12px", color: "#cbd5e1", verticalAlign: "middle" },
  tdR:       { padding: "10px 12px", color: "#94a3b8", textAlign: "right", fontVariantNumeric: "tabular-nums", verticalAlign: "middle" },
  nomP:      { fontWeight: 600, color: "#e2e8f0", fontSize: 13 },
  hint:      { color: "#1e293b", fontSize: 11, marginTop: 10, marginBottom: 0 },
  tabs:      { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  tab:       { padding: "6px 14px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#475569", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" },
  tabActive: { background: "#1e293b", color: "#e2e8f0" },
  diagGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 },
  cardGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 },
  center:    { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300 },
  spinner:   { width: 28, height: 28, border: "2px solid #1e293b", borderTop: "2px solid #38bdf8", borderRadius: "50%", animation: "spin .8s linear infinite" },
  btnSm:     { padding: "6px 14px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
};
