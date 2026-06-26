import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

// ─── Constantes métier ────────────────────────────────────────────────────────
const FRAIS_EMBALLAGE = 4;
const FRAIS_CONFIRMATION = 10;
const STATUTS_CONFIRMS = ["Confirmé", "Livrée", "Expédiée", "Facturée", "En cours de livraison"];
const STATUTS_LIVRES = ["Livrée", "Facturée"];
const STATUTS_RETOURS = ["Retour reçu", "Retour en cours"];
const STATUTS_EXCLUS = ["Annulée", "Refusée", "Doublon", "Fausse commande"];


// ─── Couleurs ─────────────────────────────────────────────────────────────────
const CLR = {
  green:  { bg: "#EAF3DE", border: "#97C459", text: "#3B6D11", dark: "#27500A" },
  amber:  { bg: "#FAEEDA", border: "#EF9F27", text: "#854F0B", dark: "#633806" },
  red:    { bg: "#FCEBEB", border: "#F09595", text: "#A32D2D", dark: "#791F1F" },
  purple: { bg: "#EEEDFE", border: "#AFA9EC", text: "#534AB7", dark: "#3C3489" },
  slate:  { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b", dark: "#1e293b" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pct(a, b) { return (b > 0) ? Math.round((a / b) * 100) : null; }
function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }
function sum(arr) { return arr.reduce((s, v) => s + v, 0); }
function round(n) { return Math.round(n); }
function fmtMAD(n, opts = {}) {
  if (n == null || isNaN(n)) return null;
  const sign = n > 0 ? "+" : "";
  return `${opts.noSign ? "" : sign}${round(n).toLocaleString("fr")} MAD`;
}
function dateKey(d) { return new Date(d).toISOString().slice(0, 10); }

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}
function prevMonthRange() {
  const d = new Date();
  const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const last  = new Date(d.getFullYear(), d.getMonth(), 0);
  return { start: dateKey(first), end: dateKey(last) };
}
function startOfQuarter() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
}

// ─── Composants UI partagés ───────────────────────────────────────────────────
function Signal({ color }) {
  return (
    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color.text, flexShrink: 0 }} />
  );
}

function EstimLabel() {
  return (
    <span style={{ fontSize: 10, fontWeight: 500, color: "#94a3b8", background: "#f1f5f9", borderRadius: 3, padding: "1px 5px", marginLeft: 5, verticalAlign: "middle", letterSpacing: ".02em" }}>
      estimé
    </span>
  );
}

function Unavailable({ label }) {
  return (
    <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
      {label || "donnée indisponible"}
    </span>
  );
}

function ProgressBar({ value, color, showPct = true }) {
  if (value == null) return <Unavailable />;
  const w = Math.min(100, Math.max(0, value));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, background: color.text, borderRadius: 99, transition: "width .4s" }} />
      </div>
      {showPct && <span style={{ fontSize: 12, fontWeight: 700, color: color.dark, minWidth: 35, textAlign: "right" }}>{value}%</span>}
    </div>
  );
}

function BlockCard({ children, onClick, borderColor, style = {} }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: `0.5px solid ${borderColor || "#e2e8f0"}`,
        borderRadius: 12,
        padding: "20px 22px",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = "0 2px 16px rgba(0,0,0,0.06)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
    >
      {children}
    </div>
  );
}

function BlockHeader({ title, signal, onAnalyse }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {signal && <Signal color={signal} />}
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#0f172a" }}>{title}</span>
      </div>
      {onAnalyse && (
        <button
          onClick={e => { e.stopPropagation(); onAnalyse(); }}
          style={{ fontSize: 11, color: CLR.purple.text, fontWeight: 600, background: CLR.purple.bg, border: `0.5px solid ${CLR.purple.border}`, borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}
        >
          Analyser →
        </button>
      )}
    </div>
  );
}

function KpiRow({ label, value, valueColor, estim = false, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "0.5px solid #f8fafc" }}>
      <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        {value == null
          ? <Unavailable />
          : <span style={{ fontSize: 13, fontWeight: 600, color: valueColor || "#1e293b" }}>
              {value}{estim && <EstimLabel />}
            </span>
        }
        {sub && <div style={{ fontSize: 11, color: "#94a3b8" }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Sélecteur de période ─────────────────────────────────────────────────────
function PeriodSelector({ start, end, onChange }) {
  const today = new Date().toISOString().slice(0, 10);
  const shortcuts = [
    { label: "Mois en cours",   fn: () => onChange(startOfMonth(), endOfMonth()) },
    { label: "Mois précédent",  fn: () => { const r = prevMonthRange(); onChange(r.start, r.end); } },
    { label: "Trimestre",       fn: () => onChange(startOfQuarter(), today) },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="date"
          value={start}
          max={end}
          onChange={e => onChange(e.target.value, end)}
          style={{ padding: "5px 10px", border: "0.5px solid #e2e8f0", borderRadius: 7, fontSize: 13, color: "#1e293b", background: "#fff" }}
        />
        <span style={{ fontSize: 12, color: "#94a3b8" }}>→</span>
        <input
          type="date"
          value={end}
          min={start}
          max={today}
          onChange={e => onChange(start, e.target.value)}
          style={{ padding: "5px 10px", border: "0.5px solid #e2e8f0", borderRadius: 7, fontSize: 13, color: "#1e293b", background: "#fff" }}
        />
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {shortcuts.map(s => (
          <button key={s.label} onClick={s.fn} style={{ padding: "5px 10px", border: "0.5px solid #e2e8f0", borderRadius: 6, fontSize: 11, fontWeight: 500, color: "#64748b", background: "#fff", cursor: "pointer" }}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Dashboard({ role, nom, setModule }) {
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState({ start: startOfMonth(), end: today });
  const [loading, setLoading] = useState(true);
  const [data, setData]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = period;
    const endFull = end + "T23:59:59";

    const [
      { data: releve },
      { data: commandes },
      { data: leads },
      { data: adsSpend },
      { data: produits },
      { data: transporteurs },
    ] = await Promise.all([
      supabase.from("releve_bancaire").select("date, montant, categorie, type, libelle, description").gte("date", start).lte("date", end),
      supabase.from("commandes").select("id, statut, prix, frais_livraison, transporteur, conseillere, created_at").gte("created_at", start).lte("created_at", endFull),
      supabase.from("leads").select("id, statut, conseillere_id, conseillere, created_at").gte("created_at", start).lte("created_at", endFull),
      supabase.from("ads_spend").select("date, plateforme, spend_mad, budget_mad, leads_count").gte("date", start).lte("date", end),
      supabase.from("produits").select("id, nom, cout_achat, stock_actuel"),
      supabase.from("transporteurs").select("id, nom"),
    ]);

    setData(compute({
      releve: releve || [],
      commandes: commandes || [],
      leads: leads || [],
      adsSpend: adsSpend || [],
      produits: produits || [],
      transporteurs: transporteurs || [],
    }));
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  function compute({ releve, commandes, leads, adsSpend, produits, transporteurs }) {
    const prodMap = {};
    produits.forEach(p => { prodMap[p.id] = p; });
    const transMap = {};
    transporteurs.forEach(t => { transMap[t.id] = t; });

    // ── Bloc 1 : Finances ──────────────────────────────────────────────────
    const releve_ok = releve.length > 0;
    const montants = releve.map(r => parseFloat(r.montant) || 0);
    const recettes = sum(montants.filter(m => m > 0));
    const depenses = Math.abs(sum(montants.filter(m => m < 0)));
    const resultat = recettes - depenses;
    const ratioDepRec = recettes > 0 ? depenses / recettes : null;

    const capitalImmobilise = produits
      .filter(p => p.stock_actuel > 0 && p.cout_achat > 0)
      .reduce((s, p) => s + (p.stock_actuel * p.cout_achat), 0);
    const hasCapitalData = produits.some(p => p.stock_actuel > 0 && p.cout_achat > 0);

    const finSignal = !releve_ok ? CLR.slate
      : resultat > 0 ? CLR.green
      : resultat > -500 ? CLR.amber
      : CLR.red;

    // ── Bloc 2 : Produit ───────────────────────────────────────────────────
    const calcMarge = (c) => {
      const prix = parseFloat(c.prix) || 0;
      const cout = parseFloat(c.cout_achat) || parseFloat(prodMap[c.produit_id]?.cout_achat) || null;
      const livr = parseFloat(c.frais_livraison) || 0;
      if (!prix || cout == null) return null;
      return prix - cout - livr - FRAIS_EMBALLAGE - FRAIS_CONFIRMATION;
    };

    const livrees = commandes.filter(c => STATUTS_LIVRES.includes(c.statut));
    const margesLivrees = livrees.map(c => calcMarge(c)).filter(v => v !== null);
    const margeAvg = margesLivrees.length >= 1 ? avg(margesLivrees) : null; // min 3 livrées pour être fiable

    // Par produit
    const prodStats = {};
    livrees.forEach(c => {
      const pid = c.produit_id;
      if (!pid) return;
      if (!prodStats[pid]) prodStats[pid] = { nom: prodMap[pid]?.nom || `#${pid}`, marges: [], total: 0 };
      const m = calcMarge(c);
      if (m !== null) prodStats[pid].marges.push(m);
      prodStats[pid].total++;
    });

    const prodList = Object.values(prodStats)
      .map(p => ({
        nom: p.nom,
        margeAvg: p.marges.length ? avg(p.marges) : null,
        margeTotal: p.marges.length ? sum(p.marges) : null,
        count: p.total,
        fiable: p.marges.length >= 3,
      }))
      .filter(p => p.margeAvg !== null);

    const rentables = prodList.filter(p => p.margeAvg > 0);
    const nonRentables = prodList.filter(p => p.margeAvg <= 0);
    const topCreateurs = [...prodList].sort((a, b) => (b.margeTotal || 0) - (a.margeTotal || 0)).slice(0, 2);
    const topDestructeur = [...prodList].filter(p => p.margeAvg < 0).sort((a, b) => a.margeAvg - b.margeAvg)[0] || null;

    const capitalParProduit = produits
      .filter(p => p.stock_actuel > 0 && p.cout_achat > 0)
      .map(p => ({ nom: p.nom, capital: p.stock_actuel * p.cout_achat }))
      .sort((a, b) => b.capital - a.capital);
    const topCapitalImmob = capitalParProduit[0] || null;

    const prodSignal = prodList.length === 0 ? CLR.slate
      : rentables.length / prodList.length >= 0.6 ? CLR.green
      : rentables.length / prodList.length >= 0.4 ? CLR.amber
      : CLR.red;

    // ── Bloc 3 : Ads ───────────────────────────────────────────────────────
    const hasAds = adsSpend.length > 0;
    const totalSpend = sum(adsSpend.map(a => parseFloat(a.spend_mad || a.budget_mad) || 0));
    const totalLeadsAds = sum(adsSpend.map(a => parseInt(a.leads_count) || 0));
    const cplMoyen = (hasAds && totalLeadsAds > 0) ? totalSpend / totalLeadsAds : null;
    const cplLivre = (hasAds && livrees.length > 0) ? totalSpend / livrees.length : null;
    const contribNette = (hasAds && margeAvg !== null && livrees.length > 0)
      ? (livrees.length * margeAvg) - totalSpend
      : null;

    // Seuil CPL/livré : rouge si CPL/livré > margeAvg (on dépense plus en ads que la marge produite)
    const adsSignal = !hasAds ? CLR.slate
      : contribNette === null ? CLR.slate
      : contribNette > 0 ? CLR.green
      : contribNette > -1000 ? CLR.amber
      : CLR.red;

    // ── Bloc 4 : Call Center ───────────────────────────────────────────────
    const totalLeads = leads.length;
    const confirmes = leads.filter(l => STATUTS_CONFIRMS.includes(l.statut)).length;
    const tauxConf = pct(confirmes, totalLeads);

    // Capital activé = leads confirmés × marge avg (estimation)
    const capitalActive = (confirmes > 0 && margeAvg !== null)
      ? confirmes * margeAvg
      : null;

    // Par conseillère
    const consMap = {};
    leads.forEach(l => {
      const cid = l.conseillere_id || l.conseillere;
      if (!cid) return;
      if (!consMap[cid]) consMap[cid] = { id: cid, total: 0, conf: 0 };
      consMap[cid].total++;
      if (STATUTS_CONFIRMS.includes(l.statut)) consMap[cid].conf++;
    });
    const consStats = Object.values(consMap)
      .filter(c => c.total >= 1)
      .map(c => ({ id: c.id, taux: pct(c.conf, c.total), total: c.total }))
      .sort((a, b) => b.taux - a.taux);
    const topCons = consStats[0] || null;
    const flopCons = consStats[consStats.length - 1] || null;
    const hasConsData = consStats.length >= 2;

    const confSignal = tauxConf === null ? CLR.slate
      : tauxConf >= 35 ? CLR.green
      : tauxConf >= 25 ? CLR.amber
      : CLR.red;

    // ── Bloc 5 : Logistique ────────────────────────────────────────────────
    const expedies = commandes.filter(c => !STATUTS_EXCLUS.includes(c.statut));
    const retours = commandes.filter(c => STATUTS_RETOURS.includes(c.statut));
    const tauxLivr = pct(livrees.length, expedies.length);
    const tauxRetour = pct(retours.length, expedies.length);

    // Capital encaissé (proxy : livrées × prix moyen)
    const prixLivrees = livrees.map(c => parseFloat(c.prix) || 0).filter(v => v > 0);
    const capitalEncaisse = prixLivrees.length > 0 ? sum(prixLivrees) : null;

    // Capital détruit par retours (estimation : retours × frais engagés)
    const fraisEngagesAvg = (cplLivre || 0) + 15 + FRAIS_EMBALLAGE + FRAIS_CONFIRMATION;
    const capitalDetruit = retours.length > 0 ? retours.length * fraisEngagesAvg : 0;

    // Par transporteur
    const tStats = {};
    commandes.forEach(c => {
      const tid = c.transporteur_id;
      if (!tid) return;
      if (!tStats[tid]) tStats[tid] = { id: tid, total: 0, livr: 0 };
      tStats[tid].total++;
      if (["Livrée", "Facturée"].includes(c.statut)) tStats[tid].livr++;
    });
    const transStats = Object.values(tStats)
      .filter(t => t.total >= 1)
      .map(t => ({
        nom: transMap[t.id]?.nom || `#${t.id}`,
        taux: pct(t.livr, t.total),
        total: t.total,
        grade: pct(t.livr, t.total) >= 60 ? "A1" : pct(t.livr, t.total) >= 45 ? "A2" : pct(t.livr, t.total) >= 40 ? "B2" : "STOP",
      }))
      .sort((a, b) => b.total - a.total);
    const transPrincipal = transStats[0] || null;

    const livrSignal = tauxLivr === null ? CLR.slate
      : tauxLivr >= 55 ? CLR.green
      : tauxLivr >= 40 ? CLR.amber
      : CLR.red;

    return {
      // Finances
      releve_ok, recettes, depenses, resultat, ratioDepRec,
      capitalImmobilise, hasCapitalData, finSignal,
      // Produit
      margeAvg, prodList, rentables, nonRentables,
      topCreateurs, topDestructeur, topCapitalImmob,
      hasMargeData: margesLivrees.length >= 1,
      prodSignal,
      // Ads
      hasAds, totalSpend, cplMoyen, cplLivre, contribNette, adsSignal,
      // Call center
      totalLeads, confirmes, tauxConf, capitalActive, consStats,
      topCons, flopCons, hasConsData, confSignal,
      // Logistique
      tauxLivr, tauxRetour, livrees: livrees.length,
      capitalEncaisse, capitalDetruit, transStats, transPrincipal, livrSignal,
    };
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 320, color: "#94a3b8", fontSize: 14 }}>
      Chargement…
    </div>
  );

  const d = data;
  const gradeClr = { A1: CLR.green, A2: CLR.green, B2: CLR.amber, STOP: CLR.red };

  return (
    <div style={{ fontFamily: "var(--font-sans, system-ui)", padding: "0 0 48px", maxWidth: "100%" }}>

      {/* ── Topbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 22px", borderBottom: "0.5px solid #e2e8f0", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Vue d'ensemble</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Pilotage financier & business</div>
        </div>
        <PeriodSelector start={period.start} end={period.end} onChange={(s, e) => setPeriod({ start: s, end: e })} />
      </div>

      {/* ── BLOC 1 : FINANCES ── */}
      <div style={{ background: "#fff", border: `1px solid ${d.finSignal.border}`, borderRadius: 14, padding: "24px 28px", marginBottom: 20 }}>
        <BlockHeader
          title="Pilotage financier"
          signal={d.finSignal}
          onAnalyse={() => setModule("dashboard-analytique")}
        />

        {!d.releve_ok ? (
          <div style={{ padding: "12px 0", color: "#94a3b8", fontSize: 13 }}>
            Aucun mouvement enregistré sur la période. <span style={{ color: CLR.purple.text, cursor: "pointer", fontWeight: 600 }} onClick={() => setModule("dashboard-analytique")}>Alimenter le relevé bancaire →</span>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 20, alignItems: "start" }}>
            {/* Résultat net — héro */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: d.finSignal.text, marginBottom: 6 }}>Résultat net période</div>
              <div style={{ fontSize: 48, fontWeight: 800, color: d.finSignal.dark, lineHeight: 1, marginBottom: 6 }}>
                {d.resultat >= 0 ? "+" : ""}{round(d.resultat).toLocaleString("fr")}
                <span style={{ fontSize: 20, fontWeight: 500, marginLeft: 6 }}>MAD</span>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>recettes encaissées − toutes dépenses</div>
            </div>

            {/* Recettes */}
            <div style={{ borderLeft: "0.5px solid #f1f5f9", paddingLeft: 20 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>Recettes</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: CLR.green.dark }}>{round(d.recettes).toLocaleString("fr")} MAD</div>
              <div style={{ height: "0.5px", background: "#f1f5f9", margin: "10px 0" }} />
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>Dépenses</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: CLR.red.dark }}>{round(d.depenses).toLocaleString("fr")} MAD</div>
            </div>

            {/* Ratio */}
            <div style={{ borderLeft: "0.5px solid #f1f5f9", paddingLeft: 20 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>Ratio dépenses / recettes</div>
              {d.ratioDepRec === null
                ? <Unavailable label="recettes nulles" />
                : <>
                    <div style={{ fontSize: 28, fontWeight: 700, color: d.ratioDepRec > 1 ? CLR.red.dark : d.ratioDepRec > 0.8 ? CLR.amber.dark : CLR.green.dark }}>
                      {d.ratioDepRec.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{d.ratioDepRec > 1 ? "⚠ dépenses > recettes" : d.ratioDepRec > 0.8 ? "attention, marge faible" : "ratio sain"}</div>
                  </>
              }
              <div style={{ height: "0.5px", background: "#f1f5f9", margin: "10px 0" }} />
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>Capital immobilisé stock</div>
              {!d.hasCapitalData
                ? <Unavailable />
                : <div style={{ fontSize: 18, fontWeight: 600, color: "#1e293b" }}>{round(d.capitalImmobilise).toLocaleString("fr")} MAD</div>
              }
            </div>

            {/* Lecture rapide */}
            <div style={{ borderLeft: "0.5px solid #f1f5f9", paddingLeft: 20 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>Lecture rapide</div>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
                {d.resultat > 0
                  ? <span style={{ color: CLR.green.dark, fontWeight: 500 }}>✓ Le cycle crée de la valeur</span>
                  : <span style={{ color: CLR.red.dark, fontWeight: 500 }}>✗ Le cycle détruit de la valeur</span>
                }
                <br />
                {d.ratioDepRec !== null && d.ratioDepRec > 1
                  ? <span style={{ color: CLR.amber.dark }}>→ Vérifier Ads et logistique</span>
                  : null
                }
              </div>
              <div style={{ marginTop: 14 }}>
                <button onClick={() => setModule("dashboard-analytique")} style={{ fontSize: 11, color: CLR.purple.text, fontWeight: 600, background: CLR.purple.bg, border: `0.5px solid ${CLR.purple.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", width: "100%" }}>
                  Détail finance →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── GRILLE 2×2 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 0 }}>

        {/* ── BLOC 2 : PRODUIT ── */}
        <BlockCard borderColor={d.prodSignal.border}>
          <BlockHeader title="Sélection produit" signal={d.prodSignal} onAnalyse={() => setModule("dashboard-analytique")} />

          {!d.hasMargeData ? (
            <Unavailable label="Moins de 3 commandes livrées — données insuffisantes pour calculer la marge" />
          ) : (
            <>
              {/* KPI principaux fiables */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>Marge moy. / livré</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: d.margeAvg >= 0 ? CLR.green.dark : CLR.red.dark }}>
                    {round(d.margeAvg)} MAD
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>prix − coût − livr − {FRAIS_EMBALLAGE} − {FRAIS_CONFIRMATION}</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>Produits rentables</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: d.rentables.length > 0 ? CLR.green.dark : CLR.red.dark }}>
                    {d.rentables.length}<span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 400 }}>/{d.prodList.length}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>avec marge &gt; 0 MAD/livré</div>
                </div>
              </div>

              {/* Top créateurs */}
              {d.topCreateurs.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "#94a3b8", marginBottom: 6 }}>Créateurs de valeur</div>
                  {d.topCreateurs.map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid #f8fafc", fontSize: 12 }}>
                      <span style={{ color: "#1e293b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.nom}>{p.nom}</span>
                      <span style={{ fontWeight: 600, color: CLR.green.dark }}>
                        +{round(p.margeTotal).toLocaleString("fr")} MAD
                        {!p.fiable && <EstimLabel />}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Destructeur */}
              {d.topDestructeur && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "#94a3b8", marginBottom: 6 }}>Destructeur de valeur</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 8px", background: CLR.red.bg, borderRadius: 6 }}>
                    <span style={{ color: CLR.red.dark, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.topDestructeur.nom}>{d.topDestructeur.nom}</span>
                    <span style={{ fontWeight: 600, color: CLR.red.dark }}>{round(d.topDestructeur.margeAvg)} MAD/livré</span>
                  </div>
                </div>
              )}

              {/* Capital immobilisé */}
              {d.topCapitalImmob && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "#94a3b8", marginBottom: 6 }}>Capital immobilisé — stock principal</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#64748b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.topCapitalImmob.nom}>{d.topCapitalImmob.nom}</span>
                    <span style={{ fontWeight: 600, color: "#1e293b" }}>{round(d.topCapitalImmob.capital).toLocaleString("fr")} MAD</span>
                  </div>
                </div>
              )}
            </>
          )}
        </BlockCard>

        {/* ── BLOC 3 : ADS ── */}
        <BlockCard borderColor={d.adsSignal.border}>
          <BlockHeader title="Ads / Acquisition" signal={d.adsSignal} onAnalyse={() => setModule("dashboard-analytique")} />

          {!d.hasAds ? (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>
              Aucune dépense ads enregistrée sur la période.{" "}
              <span style={{ color: CLR.purple.text, cursor: "pointer", fontWeight: 600 }} onClick={() => setModule("ads")}>Ajouter →</span>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>Spend période</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{round(d.totalSpend).toLocaleString("fr")} MAD</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>CPL / livré</div>
                  {d.cplLivre === null
                    ? <Unavailable />
                    : <>
                        <div style={{ fontSize: 22, fontWeight: 700, color: (d.margeAvg !== null && d.cplLivre > d.margeAvg) ? CLR.red.dark : CLR.green.dark }}>
                          {round(d.cplLivre)} MAD
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>spend / commandes livrées</div>
                      </>
                  }
                </div>
              </div>

              <KpiRow
                label="CPL moyen"
                value={d.cplMoyen !== null ? `${round(d.cplMoyen)} MAD` : null}
                sub={d.cplMoyen === null ? "leads_count non renseigné" : undefined}
              />

              <div style={{ padding: "10px 0", borderBottom: "0.5px solid #f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    Contribution nette Ads
                    <EstimLabel />
                  </span>
                  {d.contribNette === null
                    ? <Unavailable />
                    : <span style={{ fontSize: 13, fontWeight: 700, color: d.contribNette >= 0 ? CLR.green.dark : CLR.red.dark }}>
                        {d.contribNette >= 0 ? "+" : ""}{round(d.contribNette).toLocaleString("fr")} MAD
                      </span>
                  }
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>(livrées × marge moy.) − spend</div>
              </div>

              {d.margeAvg !== null && d.cplLivre !== null && (
                <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 7, background: d.cplLivre > d.margeAvg ? CLR.red.bg : CLR.green.bg }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: d.cplLivre > d.margeAvg ? CLR.red.dark : CLR.green.dark }}>
                    {d.cplLivre > d.margeAvg
                      ? "⚠ Ads coûtent plus que la marge produite — acquisition non rentable"
                      : "✓ Ads rentables sur la période"
                    }
                  </span>
                </div>
              )}
            </>
          )}
        </BlockCard>

        {/* ── BLOC 4 : CALL CENTER ── */}
        <BlockCard borderColor={d.confSignal.border}>
          <BlockHeader title="Call center / Conversion" signal={d.confSignal} onAnalyse={() => setModule("dashboard-analytique")} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Taux confirmation</div>
              {d.tauxConf === null
                ? <Unavailable label="aucun lead" />
                : <>
                    <div style={{ fontSize: 28, fontWeight: 800, color: d.confSignal.dark, marginBottom: 6 }}>{d.tauxConf}%</div>
                    <ProgressBar value={d.tauxConf} color={d.confSignal} />
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>seuil bon &gt; 35%</div>
                  </>
              }
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>Leads traités</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#1e293b" }}>{d.totalLeads}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{d.confirmes} confirmés</div>
            </div>
          </div>

          <div style={{ padding: "8px 0", borderBottom: "0.5px solid #f8fafc", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>Capital activé vers livraison <EstimLabel /></span>
              {d.capitalActive === null
                ? <Unavailable />
                : <span style={{ fontSize: 13, fontWeight: 600, color: d.capitalActive >= 0 ? CLR.green.dark : CLR.red.dark }}>
                    {round(d.capitalActive).toLocaleString("fr")} MAD
                  </span>
              }
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>confirmés × marge moy. / livré</div>
          </div>

          {!d.hasConsData ? (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {d.totalLeads === 0 ? "Aucun lead sur la période" : "Données conseillères insuffisantes (min. 3 leads / personne)"}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "#94a3b8", marginBottom: 6 }}>Meilleures / moins bonne</div>
              {[d.topCons, d.flopCons].filter(Boolean).map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid #f8fafc", fontSize: 12 }}>
                  <span style={{ color: "#64748b" }}>{i === 0 ? "↑ Meilleure" : "↓ Moins bonne"}</span>
                  <span style={{ fontWeight: 600, color: i === 0 ? CLR.green.dark : CLR.red.dark }}>{c.taux}% conf · {c.total} leads</span>
                </div>
              ))}
            </div>
          )}
        </BlockCard>

        {/* ── BLOC 5 : LOGISTIQUE ── */}
        <BlockCard borderColor={d.livrSignal.border}>
          <BlockHeader title="Logistique / Encaissement" signal={d.livrSignal} onAnalyse={() => setModule("dashboard-analytique")} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Taux livraison</div>
              {d.tauxLivr === null
                ? <Unavailable label="aucune commande" />
                : <>
                    <div style={{ fontSize: 28, fontWeight: 800, color: d.livrSignal.dark, marginBottom: 6 }}>{d.tauxLivr}%</div>
                    <ProgressBar value={d.tauxLivr} color={d.livrSignal} />
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>seuil bon &gt; 55%</div>
                  </>
              }
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>Taux retour</div>
              {d.tauxRetour === null
                ? <Unavailable label="aucune commande" />
                : <>
                    <div style={{ fontSize: 28, fontWeight: 700, color: d.tauxRetour > 25 ? CLR.red.dark : d.tauxRetour > 10 ? CLR.amber.dark : CLR.green.dark }}>{d.tauxRetour}%</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>seuil critique &gt; 25%</div>
                  </>
              }
            </div>
          </div>

          <KpiRow
            label="Capital encaissé (proxy)"
            value={d.capitalEncaisse !== null ? `${round(d.capitalEncaisse).toLocaleString("fr")} MAD` : null}
            estim={true}
            sub="livrées × prix · avant rapprochement bancaire"
          />
          <KpiRow
            label="Capital détruit par retours"
            value={d.capitalDetruit > 0 ? `${round(d.capitalDetruit).toLocaleString("fr")} MAD` : "0 MAD"}
            valueColor={d.capitalDetruit > 0 ? CLR.red.dark : CLR.green.dark}
            estim={true}
            sub={`${d.livrees} livrées · frais engagés estimés`}
          />

          {d.transPrincipal && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#f8fafc", borderRadius: 7 }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>Transporteur principal — {d.transPrincipal.nom}</span>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: gradeClr[d.transPrincipal.grade].bg, color: gradeClr[d.transPanel?.grade]?.dark || gradeClr[d.transPrincipal.grade].dark }}>
                {d.transPrincipal.grade}
              </span>
            </div>
          )}
        </BlockCard>

      </div>

    </div>
  );
}
