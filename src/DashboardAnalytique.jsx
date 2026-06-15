/**
 * DashboardAnalytique.jsx — Cockpit COD Momtaz
 * Architecture décisionnelle en cascade :
 *   Vue Exécutive → Alertes → Fuite → Diagnostic → Produits
 *
 * Tables Supabase utilisées :
 *   produits   : nom, prix_vente, cout_achat
 *   leads      : produit, statut, conseillere, created_at
 *   commandes  : produit, statut, ville, created_at, frais_livraison
 *   ads_spend  : produit, budget_mad, cpm, ctr, clics, impressions, leads, date, plateforme
 */

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

// ─── SEUILS MÉTIER ────────────────────────────────────────────────────────────
const SEUILS = {
  marge:   { bon: 30,  vigilance: 10  },   // MAD / livré
  conf:    { bon: 0.35, vigilance: 0.25 },
  livr:    { bon: 0.55, vigilance: 0.40 },
  retours: { bon: 0.15, vigilance: 0.25 },
  cplRatio:{ bon: 0.80, vigilance: 1.00 }, // cpl_reel / cpl_max
};

const EMBALLAGE   = 4;
const CONFIRMATION = 10;
const MIN_LEADS   = 20;

const STATUTS_CONFIRMES  = ["Confirmé", "Confirmée"];
const STATUTS_LIVRES     = ["Livrée", "Facturée"];
const STATUTS_EXPEDIES   = ["Expédiée", "Livrée", "Facturée"];
const STATUTS_RETOURS    = ["Retour reçu", "Retour", "Retourné"];
const STATUTS_INJOIGNABLE= ["Injoignable"];
const STATUTS_ANNULE     = ["Annulé", "Refusé", "Annulée"];

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const P = {
  bg:         "#F7F8FA",
  surface:    "#FFFFFF",
  surfaceAlt: "#F1F4F9",
  border:     "#E4E8EE",
  borderMid:  "#CDD3DD",

  text:       "#1A1F2E",
  textSub:    "#5A6479",
  textMuted:  "#9BA5B7",

  teal:       "#0D9488",
  tealBg:     "#F0FDFA",
  tealBd:     "#99F6E4",

  green:      "#16A34A",
  greenBg:    "#F0FDF4",
  greenBd:    "#BBF7D0",

  amber:      "#B45309",
  amberBg:    "#FFFBEB",
  amberBd:    "#FDE68A",

  red:        "#DC2626",
  redBg:      "#FFF1F1",
  redBd:      "#FECACA",

  blue:       "#2563EB",
  blueBg:     "#EFF6FF",
  blueBd:     "#BFDBFE",

  gray:       "#5A6479",
  grayBg:     "#F1F4F9",
  grayBd:     "#E4E8EE",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
const toDate  = (iso) => (iso || "").slice(0, 10);
const inDays  = (iso, n) => iso && new Date(iso) >= new Date(daysAgo(n));

function statut(val, seuil) {
  if (val === null || val === undefined) return "neutre";
  // Pour retours : seuils inversés
  if (seuil === SEUILS.retours) {
    if (val <= seuil.bon)       return "bon";
    if (val <= seuil.vigilance) return "vigilance";
    return "critique";
  }
  if (val >= seuil.bon)       return "bon";
  if (val >= seuil.vigilance) return "vigilance";
  return "critique";
}

function statutMarge(v) {
  if (v === null) return "neutre";
  if (v > SEUILS.marge.bon)       return "bon";
  if (v > SEUILS.marge.vigilance) return "vigilance";
  if (v > 0)                      return "vigilance";
  return "critique";
}

const STATUT_COLOR = {
  bon:       { text: P.green, bg: P.greenBg, bd: P.greenBd },
  vigilance: { text: P.amber, bg: P.amberBg, bd: P.amberBd },
  critique:  { text: P.red,   bg: P.redBg,   bd: P.redBd   },
  neutre:    { text: P.gray,  bg: P.grayBg,  bd: P.grayBd  },
};

function getDays(n) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    arr.push(d.toISOString().slice(0, 10));
  }
  return arr;
}

// ─── CALCUL MÉTRIQUES PRODUIT ─────────────────────────────────────────────────
function computeProduit(p, leads, commandes, adsSpend, days = 30) {
  const nom       = p.nom;
  const pv        = parseFloat(p.prix_vente) || 0;
  const pa        = parseFloat(p.cout_achat)  || 0;

  const ld  = leads.filter(l => l.produit === nom && inDays(l.created_at, days));
  const cm  = commandes.filter(c => c.produit === nom && inDays(c.created_at, days));
  const ads = adsSpend.filter(a => a.produit === nom && inDays(a.date, days));

  const totalLeads  = ld.length;
  const confirmes   = ld.filter(l => STATUTS_CONFIRMES.includes(l.statut));
  const livres      = cm.filter(c => STATUTS_LIVRES.includes(c.statut));
  const expedies    = cm.filter(c => STATUTS_EXPEDIES.includes(c.statut));
  const retours     = cm.filter(c => STATUTS_RETOURS.includes(c.statut));
  const injoignables= ld.filter(l => STATUTS_INJOIGNABLE.includes(l.statut));
  const annules     = ld.filter(l => STATUTS_ANNULE.includes(l.statut));

  const nbConf   = confirmes.length;
  const nbLivres = livres.length;
  const nbExp    = expedies.length;
  const nbRet    = retours.length;

  const tauxConf  = totalLeads > 0 ? nbConf / totalLeads : 0;
  const tauxLivr  = nbExp > 0 ? nbLivres / nbExp : 0;
  const tauxRet   = nbExp > 0 ? nbRet / nbExp : 0;

  const fraisLivrMoy = nbLivres > 0
    ? livres.reduce((s, c) => s + (parseFloat(c.frais_livraison) || 0), 0) / nbLivres
    : 25;

  const adsTotal   = ads.reduce((s, a) => s + (parseFloat(a.budget_mad) || 0), 0);
  const totalClics = ads.reduce((s, a) => s + (parseInt(a.clics) || 0), 0);
  const totalImpr  = ads.reduce((s, a) => s + (parseInt(a.impressions) || 0), 0);
  const cpmMoy     = totalImpr > 0 ? ads.reduce((s,a) => s + (parseFloat(a.cpm)||0)*(parseInt(a.impressions)||0), 0) / totalImpr : 0;
  const ctrMoy     = totalImpr > 0 ? totalClics / totalImpr : 0;

  const cplReel  = totalLeads > 0 ? adsTotal / totalLeads : 0;
  const cacLivre = nbLivres > 0 ? adsTotal / nbLivres : 0;

  const margeBrute      = pv - pa - fraisLivrMoy - EMBALLAGE - CONFIRMATION;
  const cplMax          = margeBrute > 0 ? margeBrute * tauxConf * tauxLivr : 0;
  const margeNetteUnite = margeBrute - cacLivre;

  const statConf  = statut(tauxConf,  SEUILS.conf);
  const statLivr  = statut(tauxLivr,  SEUILS.livr);
  const statRet   = statut(tauxRet,   SEUILS.retours);
  const statMarge = statutMarge(margeNetteUnite);
  const statCpl   = cplMax > 0 ? statut(cplReel / cplMax, { bon: SEUILS.cplRatio.bon, vigilance: SEUILS.cplRatio.vigilance }) : "neutre";

  // Identification fuite dominante
  let fuites = [];
  if (statCpl   === "critique") fuites.push({ key: "acquisition",   score: 3 });
  if (statCpl   === "vigilance")fuites.push({ key: "acquisition",   score: 1 });
  if (statConf  === "critique") fuites.push({ key: "confirmation",  score: 3 });
  if (statConf  === "vigilance")fuites.push({ key: "confirmation",  score: 1 });
  if (statLivr  === "critique") fuites.push({ key: "livraison",     score: 3 });
  if (statLivr  === "vigilance")fuites.push({ key: "livraison",     score: 1 });
  if (statRet   === "critique") fuites.push({ key: "retours",       score: 2 });
  fuites.sort((a, b) => b.score - a.score);
  const fuiteDominante = fuites[0]?.key || null;

  // Décision produit
  let decision;
  if (totalLeads < MIN_LEADS)        decision = "EN TEST";
  else if (margeNetteUnite <= 0)     decision = "STOP";
  else if (statMarge === "critique") decision = "SURVEILLER";
  else if (statMarge === "bon" && tauxConf >= SEUILS.conf.bon && tauxLivr >= SEUILS.livr.bon)
                                     decision = "SCALER";
  else                               decision = "MAINTENIR";

  // Motifs non-confirmation
  const motifsNonConf = {
    injoignable: injoignables.length,
    annule:      annules.length,
    aRappeler:   ld.filter(l => l.statut === "À rappeler" || l.statut === "Demande de rappel").length,
  };

  // Perf par conseillère
  const conseilleresMap = {};
  ld.forEach(l => {
    const c = l.conseillere || "—";
    if (!conseilleresMap[c]) conseilleresMap[c] = { total: 0, conf: 0 };
    conseilleresMap[c].total++;
    if (STATUTS_CONFIRMES.includes(l.statut)) conseilleresMap[c].conf++;
  });
  const conseilleresPerf = Object.entries(conseilleresMap).map(([nom, d]) => ({
    nom,
    total: d.total,
    conf:  d.conf,
    taux:  d.total > 0 ? d.conf / d.total : 0,
  }));

  // Perf par ville
  const villesMap = {};
  cm.forEach(c => {
    const v = c.ville || "Inconnue";
    if (!villesMap[v]) villesMap[v] = { exp: 0, livres: 0, ret: 0 };
    if (STATUTS_EXPEDIES.includes(c.statut)) villesMap[v].exp++;
    if (STATUTS_LIVRES.includes(c.statut))   villesMap[v].livres++;
    if (STATUTS_RETOURS.includes(c.statut))  villesMap[v].ret++;
  });
  const villesPerf = Object.entries(villesMap)
    .map(([v, d]) => ({ ville: v, ...d, taux: d.exp > 0 ? d.livres / d.exp : 0 }))
    .sort((a, b) => b.exp - a.exp)
    .slice(0, 5);

  return {
    nom, pv, pa,
    totalLeads, nbConf, nbLivres, nbExp, nbRet,
    tauxConf, tauxLivr, tauxRet,
    fraisLivrMoy, adsTotal, cplReel, cplMax, cacLivre, cpmMoy, ctrMoy,
    margeBrute, margeNetteUnite,
    statConf, statLivr, statRet, statMarge, statCpl,
    fuiteDominante, fuites,
    decision,
    motifsNonConf, conseilleresPerf, villesPerf,
  };
}

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────
export default function DashboardAnalytique() {
  const [produits,  setProduits]  = useState([]);
  const [leads,     setLeads]     = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [adsSpend,  setAdsSpend]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [selected,  setSelected]  = useState(null);    // produit sélectionné pour drill
  const [drillZone, setDrillZone] = useState(null);    // acquisition / confirmation / livraison / retours

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true); setError(null);
    try {
      const since = daysAgo(30);
      const [pr, ld, cm, ad] = await Promise.all([
        supabase.from("produits").select("nom,prix_vente,cout_achat"),
        supabase.from("leads").select("produit,statut,conseillere,created_at").gte("created_at", since),
        supabase.from("commandes").select("produit,statut,ville,created_at,frais_livraison").gte("created_at", since),
        supabase.from("ads_spend").select("produit,budget_mad,cpm,ctr,clics,impressions,leads,date,plateforme").gte("date", since.slice(0,10)),
      ]);
      if (pr.error || ld.error || cm.error || ad.error) throw pr.error || ld.error || cm.error || ad.error;
      const seen = new Set();
      const uniq = (pr.data||[]).filter(p => { if(seen.has(p.nom)) return false; seen.add(p.nom); return true; });
      setProduits(uniq);
      setLeads(ld.data||[]);
      setCommandes(cm.data||[]);
      setAdsSpend(ad.data||[]);
      if (uniq.length) setSelected(uniq[0].nom);
    } catch(e) { setError(e?.message||"Erreur de chargement"); }
    finally    { setLoading(false); }
  }

  const metrics = useMemo(() =>
    produits.map(p => computeProduit(p, leads, commandes, adsSpend, 30)),
    [produits, leads, commandes, adsSpend]
  );

  const sel = useMemo(() => metrics.find(m => m.nom === selected) || null, [metrics, selected]);

  // ── VUE EXÉCUTIVE ────────────────────────────────────────────────────────
  const margeGlobale = metrics.length > 0
    ? metrics.reduce((s,m) => s + m.margeNetteUnite * m.nbLivres, 0) /
      Math.max(1, metrics.reduce((s,m) => s + m.nbLivres, 0))
    : 0;
  const cplMoyen     = metrics.filter(m=>m.cplReel>0).reduce((s,m,_,a) => s + m.cplReel/a.length, 0);
  const confMoyenne  = metrics.filter(m=>m.totalLeads>=5).reduce((s,m,_,a) => s + m.tauxConf/a.length, 0);
  const livrMoyenne  = metrics.filter(m=>m.nbExp>0).reduce((s,m,_,a) => s + m.tauxLivr/a.length, 0);
  const nbCritiques  = metrics.filter(m => m.statMarge === "critique" || m.decision === "STOP").length;
  const statGlobal   = statutMarge(margeGlobale);

  // ── ALERTES ───────────────────────────────────────────────────────────────
  const alertes = [];
  metrics.forEach(m => {
    if (m.decision === "STOP")
      alertes.push({ niveau:"critique", texte: `${m.nom} — marge négative (${fmt(m.margeNetteUnite)}/livré). Couper les ads immédiatement.`, produit: m.nom });
    else if (m.statConf === "critique" && m.totalLeads >= MIN_LEADS)
      alertes.push({ niveau:"vigilance", texte: `${m.nom} — taux de confirmation ${pct(m.tauxConf)} (< 25%). Vérifier le script et les conseillères.`, produit: m.nom });
    else if (m.statLivr === "critique" && m.nbExp >= 5)
      alertes.push({ niveau:"vigilance", texte: `${m.nom} — taux de livraison ${pct(m.tauxLivr)} (< 40%). Vérifier le transporteur ou la zone.`, produit: m.nom });
    else if (m.statRet === "critique" && m.nbExp >= 5)
      alertes.push({ niveau:"vigilance", texte: `${m.nom} — retours élevés ${pct(m.tauxRet)} (> 25%). Marge détruite en cascade.`, produit: m.nom });
  });
  const alertesAffichees = alertes.slice(0, 4);

  // ── FUITE GLOBALE ─────────────────────────────────────────────────────────
  const fuiteScores = { acquisition: 0, confirmation: 0, livraison: 0, retours: 0 };
  metrics.forEach(m => {
    m.fuites.forEach(f => { fuiteScores[f.key] = (fuiteScores[f.key]||0) + f.score; });
  });
  const fuiteDominanteGlobale = Object.entries(fuiteScores).sort((a,b) => b[1]-a[1])[0]?.[0] || null;

  // ── COURBE 30J ────────────────────────────────────────────────────────────
  const courbe = useMemo(() => {
    if (!sel) return [];
    return getDays(30).map(d => {
      const lJ  = commandes.filter(c => c.produit===sel.nom && STATUTS_LIVRES.includes(c.statut) && toDate(c.created_at)===d).length;
      const aJ  = adsSpend.filter(a => a.produit===sel.nom && toDate(a.date)===d).reduce((s,a)=>s+(parseFloat(a.budget_mad)||0),0);
      const marge = (lJ>0||aJ>0) ? Math.round(lJ*sel.margeBrute - aJ) : null;
      return { d: d.slice(5), marge };
    });
  }, [sel, commandes, adsSpend]);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <div style={SS.loadWrap}><span style={SS.spinner}/><p style={SS.loadTxt}>Chargement…</p></div>;
  if (error)   return <div style={SS.errWrap}><p style={{color:P.red,margin:0}}>⚠️ {error}</p><button style={SS.btnSm} onClick={fetchAll}>Réessayer</button></div>;

  return (
    <div style={SS.page}>

      {/* ═══ 1. VUE EXÉCUTIVE ════════════════════════════════════════════════ */}
      <Card style={{ marginBottom: 14 }}>
        {/* En-tête */}
        <div style={SS.exHead}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <StatutDot statut={statGlobal} />
            <span style={SS.exTitle}>
              {statGlobal === "bon"
                ? "Business sain"
                : statGlobal === "vigilance"
                ? "Surveillance requise"
                : `${nbCritiques} produit${nbCritiques>1?"s":""} en situation critique`}
            </span>
            {nbCritiques > 0 && (
              <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:4, background:P.redBg, color:P.red, border:`1px solid ${P.redBd}` }}>
                {nbCritiques} critique{nbCritiques>1?"s":""}
              </span>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={SS.dateLbl}>30 derniers jours</span>
            <button style={SS.btnRefresh} onClick={fetchAll}>↻ Actualiser</button>
          </div>
        </div>

        {/* KPIs */}
        <div style={SS.kpiGrid}>
          <ExKPI
            label="Marge nette / livré"
            value={fmt(margeGlobale)}
            statut={statGlobal}
            sub="Signal principal"
            main
          />
          <ExKPI label="CPL moyen"        value={fmt(cplMoyen)}   statut="neutre" sub="Coût par lead" />
          <ExKPI label="Taux confirmation" value={pct(confMoyenne)} statut={statut(confMoyenne, SEUILS.conf)} sub={`Seuil bon ≥ ${pct(SEUILS.conf.bon)}`} />
          <ExKPI label="Taux livraison"   value={pct(livrMoyenne)} statut={statut(livrMoyenne, SEUILS.livr)} sub={`Seuil bon ≥ ${pct(SEUILS.livr.bon)}`} />
          <ExKPI label="Produits actifs"  value={`${metrics.filter(m=>m.totalLeads>=MIN_LEADS).length}`} statut="neutre" sub={`${metrics.length} total`} />
        </div>
      </Card>

      {/* ═══ 2. ALERTES PRIORITAIRES ════════════════════════════════════════ */}
      {alertesAffichees.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <p style={SS.blocLabel}>Alertes prioritaires</p>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {alertesAffichees.map((a, i) => (
              <div key={i} style={{
                display:"flex", alignItems:"center", gap:12, padding:"12px 14px",
                background: a.niveau==="critique" ? P.redBg : P.amberBg,
                border:`1px solid ${a.niveau==="critique" ? P.redBd : P.amberBd}`,
                borderRadius:8,
              }}>
                <span style={{ fontSize:15 }}>{a.niveau==="critique" ? "⛔" : "⚠️"}</span>
                <p style={{ margin:0, fontSize:13, color:P.text, flex:1, lineHeight:1.4 }}>{a.texte}</p>
                <button style={SS.btnSm} onClick={() => { setSelected(a.produit); setDrillZone(null); }}>
                  Voir →
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ═══ 3. OÙ EST LA FUITE ? ═══════════════════════════════════════════ */}
      <Card style={{ marginBottom: 14 }}>
        <p style={SS.blocLabel}>Où est la fuite ?</p>
        <div style={SS.fuiteGrid}>
          {[
            {
              key:"acquisition",
              label:"Acquisition",
              icon:"📡",
              metric: cplMoyen > 0 ? fmt(cplMoyen) : "—",
              sub:"CPL moyen",
              statut: metrics.some(m=>m.statCpl==="critique") ? "critique" : metrics.some(m=>m.statCpl==="vigilance") ? "vigilance" : "bon",
              desc:"CPM, CTR, CPC, arrivée",
            },
            {
              key:"confirmation",
              label:"Confirmation",
              icon:"📞",
              metric: pct(confMoyenne),
              sub:`Objectif ≥ ${pct(SEUILS.conf.bon)}`,
              statut: statut(confMoyenne, SEUILS.conf),
              desc:"Script, conseillères, délais",
            },
            {
              key:"livraison",
              label:"Livraison",
              icon:"📦",
              metric: pct(livrMoyenne),
              sub:`Objectif ≥ ${pct(SEUILS.livr.bon)}`,
              statut: statut(livrMoyenne, SEUILS.livr),
              desc:"Transporteur, ville, suivi",
            },
            {
              key:"retours",
              label:"Retours",
              icon:"↩️",
              metric: metrics.length > 0 ? pct(metrics.reduce((s,m,_,a)=>s+m.tauxRet/a.length,0)) : "—",
              sub:`Seuil critique > ${pct(SEUILS.retours.vigilance)}`,
              statut: statut(metrics.reduce((s,m,_,a)=>s+m.tauxRet/a.length,0), SEUILS.retours),
              desc:"Destruction de marge en cascade",
            },
          ].map(f => (
            <FuiteCard
              key={f.key}
              {...f}
              dominant={f.key === fuiteDominanteGlobale}
              onClick={() => setDrillZone(drillZone === f.key ? null : f.key)}
              active={drillZone === f.key}
            />
          ))}
        </div>
      </Card>

      {/* ═══ 4. DIAGNOSTIC DÉTAILLÉ (au clic sur une fuite) ════════════════ */}
      {drillZone && sel && (
        <Card style={{ marginBottom: 14, borderLeft: `3px solid ${P.teal}` }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <p style={{ ...SS.blocLabel, margin:0 }}>
              Diagnostic — {drillZone.charAt(0).toUpperCase() + drillZone.slice(1)} · {sel.nom}
            </p>
            <button style={SS.btnSm} onClick={() => setDrillZone(null)}>Fermer ✕</button>
          </div>

          {drillZone === "acquisition" && <DiagAcquisition m={sel} />}
          {drillZone === "confirmation" && <DiagConfirmation m={sel} />}
          {drillZone === "livraison"    && <DiagLivraison m={sel} />}
          {drillZone === "retours"      && <DiagRetours m={sel} />}
        </Card>
      )}

      {/* ═══ 5. PRODUITS ════════════════════════════════════════════════════ */}
      <Card style={{ marginBottom: 14 }}>
        <p style={SS.blocLabel}>Produits — Décisions</p>

        {/* Sélecteur produit */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
          {metrics.map(m => (
            <button
              key={m.nom}
              onClick={() => { setSelected(m.nom); setDrillZone(null); }}
              style={{
                padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:500,
                cursor:"pointer", fontFamily:"inherit",
                background: selected===m.nom ? P.teal : P.surface,
                color:       selected===m.nom ? "#fff"  : P.textSub,
                border:`1px solid ${selected===m.nom ? P.teal : P.border}`,
              }}
            >
              {m.nom}
            </button>
          ))}
        </div>

        {/* Tableau */}
        <div style={{ overflowX:"auto" }}>
          <table style={SS.table}>
            <thead>
              <tr>
                {["Produit","Décision","Leads","Conf","Livr","Retours","CPL réel","CPL max","Marge/livré","Fuite"].map(h => (
                  <th key={h} style={SS.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.sort((a,b) => a.margeNetteUnite - b.margeNetteUnite).map(m => (
                <tr
                  key={m.nom}
                  style={{
                    ...SS.tr,
                    background: selected===m.nom ? "#F7F9FF" : "transparent",
                    cursor:"pointer",
                  }}
                  onClick={() => { setSelected(m.nom); setDrillZone(null); }}
                >
                  <td style={SS.td}><span style={SS.nomP}>{m.nom}</span></td>
                  <td style={SS.td}><DecisionBadge d={m.decision} /></td>
                  <td style={SS.tdR}>{m.totalLeads}</td>
                  <td style={{ ...SS.tdR, ...statutStyle(m.statConf) }}>{pct(m.tauxConf)}</td>
                  <td style={{ ...SS.tdR, ...statutStyle(m.statLivr) }}>{pct(m.tauxLivr)}</td>
                  <td style={{ ...SS.tdR, ...statutStyle(m.statRet,true) }}>{pct(m.tauxRet)}</td>
                  <td style={SS.tdR}>{m.cplReel>0 ? fmt(m.cplReel) : "—"}</td>
                  <td style={SS.tdR}>{m.cplMax>0  ? fmt(m.cplMax)  : "—"}</td>
                  <td style={{ ...SS.tdR, fontWeight:700, color: m.margeNetteUnite>0 ? P.green : P.red }}>
                    {fmt(m.margeNetteUnite)}
                  </td>
                  <td style={SS.td}>
                    {m.fuiteDominante
                      ? <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:P.amberBg, color:P.amber, border:`1px solid ${P.amberBd}`, fontWeight:600 }}>
                          {m.fuiteDominante}
                        </span>
                      : <span style={{ color:P.textMuted, fontSize:12 }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ═══ COURBE MARGE 30J (produit sélectionné) ═══════════════════════ */}
      {sel && (
        <Card>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <p style={{ ...SS.blocLabel, margin:0 }}>Marge nette 30j — {sel.nom}</p>
            <div style={{ display:"flex", gap:8 }}>
              {[
                { key:"acquisition",  label:"CPL ?" },
                { key:"confirmation", label:"Conf ?" },
                { key:"livraison",    label:"Livr ?" },
              ].map(z => (
                <button
                  key={z.key}
                  style={{
                    ...SS.btnSm,
                    background: drillZone===z.key ? P.teal : P.surface,
                    color:       drillZone===z.key ? "#fff"  : P.textSub,
                    borderColor: drillZone===z.key ? P.teal  : P.border,
                  }}
                  onClick={() => setDrillZone(drillZone===z.key ? null : z.key)}
                >
                  🔍 {z.label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={courbe} margin={{ top:4, right:8, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={P.border} />
              <XAxis dataKey="d" tick={{ fill:P.textMuted, fontSize:10 }} interval={6} />
              <YAxis tick={{ fill:P.textMuted, fontSize:10 }} width={52} />
              <Tooltip contentStyle={{ background:P.surface, border:`1px solid ${P.border}`, borderRadius:6, fontSize:11 }} />
              <ReferenceLine y={0} stroke={P.red} strokeDasharray="3 3" strokeWidth={1} />
              <Line type="monotone" dataKey="marge" stroke={P.teal} strokeWidth={2} dot={false} connectNulls={false} name="Marge nette (MAD)" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

    </div>
  );
}

// ─── BLOCS DIAGNOSTIC ────────────────────────────────────────────────────────

function DiagAcquisition({ m }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10 }}>
      {[
        { k:"CPL réel",    v: fmt(m.cplReel),   bad: m.statCpl==="critique" },
        { k:"CPL max",     v: fmt(m.cplMax),     bad: false },
        { k:"Écart CPL",   v: m.cplMax>0 ? `${Math.round((m.cplReel/m.cplMax-1)*100)}%` : "—", bad: m.cplReel>m.cplMax },
        { k:"CPM moyen",   v: m.cpmMoy>0 ? `${m.cpmMoy.toFixed(2)} USD` : "—", bad: false },
        { k:"CTR moyen",   v: m.ctrMoy>0 ? pct(m.ctrMoy) : "—", bad: m.ctrMoy<0.01 && m.ctrMoy>0 },
        { k:"Ads dépensés",v: fmt(m.adsTotal),  bad: false },
      ].map(({k,v,bad}) => (
        <MicroKpi key={k} label={k} value={v} alert={bad} />
      ))}
      <div style={{ gridColumn:"1/-1", marginTop:4 }}>
        <p style={{ fontSize:12, color:P.textSub, margin:0, lineHeight:1.5 }}>
          {m.statCpl==="critique"
            ? `⛔ Le CPL dépasse le maximum toléré. À budget constant, chaque lead génère une perte. Réduire le budget ou améliorer le ciblage.`
            : m.statCpl==="vigilance"
            ? `⚠️ Le CPL approche du maximum toléré. Surveiller l'évolution quotidienne.`
            : `✅ CPL sous contrôle. La fuite n'est pas dans l'acquisition.`}
        </p>
      </div>
    </div>
  );
}

function DiagConfirmation({ m }) {
  const total = m.motifsNonConf.injoignable + m.motifsNonConf.annule + m.motifsNonConf.aRappeler;
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10, marginBottom:14 }}>
        <MicroKpi label="Taux confirmation"  value={pct(m.tauxConf)} alert={m.statConf!=="bon"} />
        <MicroKpi label="Leads total"         value={m.totalLeads} />
        <MicroKpi label="Confirmés"           value={m.nbConf} />
        <MicroKpi label="Injoignables"        value={m.motifsNonConf.injoignable} alert={m.motifsNonConf.injoignable / Math.max(1,m.totalLeads) > 0.3} />
        <MicroKpi label="Annulés / Refusés"   value={m.motifsNonConf.annule} alert={m.motifsNonConf.annule / Math.max(1,m.totalLeads) > 0.2} />
        <MicroKpi label="À rappeler"          value={m.motifsNonConf.aRappeler} />
      </div>

      {m.conseilleresPerf.length > 0 && (
        <>
          <p style={SS.subLabel}>Performance par conseillère</p>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {m.conseilleresPerf.sort((a,b)=>b.taux-a.taux).map(c => (
              <div key={c.nom} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:13, color:P.text, width:120, flexShrink:0 }}>{c.nom}</span>
                <div style={{ flex:1, height:6, background:P.surfaceAlt, borderRadius:3, overflow:"hidden" }}>
                  <div style={{ width:`${(c.taux*100).toFixed(0)}%`, height:"100%", background: c.taux>=SEUILS.conf.bon ? P.green : c.taux>=SEUILS.conf.vigilance ? P.amber : P.red, borderRadius:3 }} />
                </div>
                <span style={{ fontSize:12, color:P.textSub, width:36, textAlign:"right" }}>{pct(c.taux)}</span>
                <span style={{ fontSize:11, color:P.textMuted }}>({c.total} leads)</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DiagLivraison({ m }) {
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10, marginBottom:14 }}>
        <MicroKpi label="Taux livraison"   value={pct(m.tauxLivr)} alert={m.statLivr!=="bon"} />
        <MicroKpi label="Expédiées"        value={m.nbExp} />
        <MicroKpi label="Livrées"          value={m.nbLivres} />
        <MicroKpi label="Retours"          value={m.nbRet} alert={m.statRet!=="bon"} />
        <MicroKpi label="Frais livr. moy." value={`${Math.round(m.fraisLivrMoy)} MAD`} />
      </div>

      {m.villesPerf.length > 0 && (
        <>
          <p style={SS.subLabel}>Performance par ville (Top 5)</p>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {m.villesPerf.map(v => (
              <div key={v.ville} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:13, color:P.text, width:120, flexShrink:0 }}>{v.ville}</span>
                <div style={{ flex:1, height:6, background:P.surfaceAlt, borderRadius:3, overflow:"hidden" }}>
                  <div style={{ width:`${(v.taux*100).toFixed(0)}%`, height:"100%", background: v.taux>=SEUILS.livr.bon ? P.green : v.taux>=SEUILS.livr.vigilance ? P.amber : P.red, borderRadius:3 }} />
                </div>
                <span style={{ fontSize:12, color:P.textSub, width:36, textAlign:"right" }}>{pct(v.taux)}</span>
                <span style={{ fontSize:11, color:P.textMuted }}>({v.exp} exp.)</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DiagRetours({ m }) {
  const perteCashParRetour = m.pa + m.fraisLivrMoy + EMBALLAGE;
  const perteTotale = m.nbRet * perteCashParRetour;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10 }}>
      <MicroKpi label="Taux retours"      value={pct(m.tauxRet)}  alert={m.statRet!=="bon"} />
      <MicroKpi label="Nb retours"        value={m.nbRet} />
      <MicroKpi label="Perte / retour"    value={fmt(perteCashParRetour)} alert />
      <MicroKpi label="Perte totale retours" value={fmt(perteTotale)} alert={m.nbRet>0} />
      <div style={{ gridColumn:"1/-1", marginTop:4 }}>
        <p style={{ fontSize:12, color:P.textSub, margin:0, lineHeight:1.5 }}>
          Chaque retour détruit <strong>{fmt(perteCashParRetour)}</strong> de cash (achat + livraison + emballage non récupérable).
          Sur {m.nbRet} retours : perte sèche de <strong>{fmt(perteTotale)}</strong>.
        </p>
      </div>
    </div>
  );
}

// ─── SOUS-COMPOSANTS ─────────────────────────────────────────────────────────

function Card({ children, style = {} }) {
  return (
    <div style={{ background:P.surface, border:`1px solid ${P.border}`, borderRadius:10, padding:"18px 20px", boxShadow:"0 1px 3px rgba(0,0,0,0.05)", ...style }}>
      {children}
    </div>
  );
}

function StatutDot({ statut }) {
  const c = { bon: P.green, vigilance: P.amber, critique: P.red, neutre: P.textMuted }[statut] || P.textMuted;
  return (
    <div style={{ width:10, height:10, borderRadius:"50%", background:c, flexShrink:0,
      boxShadow: `0 0 0 3px ${c}22` }} />
  );
}

function ExKPI({ label, value, statut: st, sub, main }) {
  const c = STATUT_COLOR[st] || STATUT_COLOR.neutre;
  return (
    <div style={{
      flex: main ? "1.4 1 200px" : "1 1 140px",
      padding:"14px 16px",
      background: main ? c.bg : P.surfaceAlt,
      border:`1px solid ${main ? c.bd : P.border}`,
      borderRadius:8,
    }}>
      <p style={{ fontSize:10, fontWeight:600, color:P.textMuted, textTransform:"uppercase", letterSpacing:"0.09em", margin:"0 0 6px" }}>{label}</p>
      <p style={{ fontSize: main ? 24 : 20, fontWeight:700, color: main ? c.text : P.text, margin:"0 0 3px", fontVariantNumeric:"tabular-nums", letterSpacing:"-0.01em" }}>{value}</p>
      <p style={{ fontSize:11, color:P.textMuted, margin:0 }}>{sub}</p>
    </div>
  );
}

function FuiteCard({ key:_, label, icon, metric, sub, statut: st, desc, dominant, onClick, active }) {
  const c = STATUT_COLOR[st] || STATUT_COLOR.neutre;
  return (
    <div
      onClick={onClick}
      style={{
        flex: "1 1 0", padding:"16px", borderRadius:8, cursor:"pointer",
        background: active ? c.bg : P.surfaceAlt,
        border:`1px solid ${active ? c.bd : (dominant ? c.bd : P.border)}`,
        borderTop: dominant ? `3px solid ${c.text}` : `1px solid ${active ? c.bd : P.border}`,
        transition:"all 0.15s",
        position:"relative",
      }}
    >
      {dominant && <span style={{ position:"absolute", top:8, right:8, fontSize:9, fontWeight:700, color:c.text, textTransform:"uppercase", letterSpacing:"0.06em" }}>Cause principale</span>}
      <div style={{ fontSize:18, marginBottom:8 }}>{icon}</div>
      <p style={{ fontSize:12, fontWeight:700, color:P.text, margin:"0 0 4px" }}>{label}</p>
      <p style={{ fontSize:22, fontWeight:700, color:c.text, margin:"0 0 4px", fontVariantNumeric:"tabular-nums" }}>{metric}</p>
      <p style={{ fontSize:11, color:P.textMuted, margin:"0 0 6px" }}>{sub}</p>
      <p style={{ fontSize:11, color:P.textSub, margin:0 }}>{desc}</p>
    </div>
  );
}

function MicroKpi({ label, value, alert: isAlert }) {
  return (
    <div style={{ padding:"10px 12px", background: isAlert ? P.redBg : P.surfaceAlt, border:`1px solid ${isAlert ? P.redBd : P.border}`, borderRadius:8 }}>
      <p style={{ fontSize:10, color:P.textMuted, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 4px" }}>{label}</p>
      <p style={{ fontSize:16, fontWeight:700, color: isAlert ? P.red : P.text, margin:0, fontVariantNumeric:"tabular-nums" }}>{value}</p>
    </div>
  );
}

function DecisionBadge({ d }) {
  const MAP = {
    "STOP":      { bg:P.redBg,    bd:P.redBd,    txt:P.red   },
    "SURVEILLER":{ bg:P.amberBg,  bd:P.amberBd,  txt:P.amber },
    "MAINTENIR": { bg:P.blueBg,   bd:P.blueBd,   txt:P.blue  },
    "SCALER":    { bg:P.greenBg,  bd:P.greenBd,  txt:P.green },
    "EN TEST":   { bg:P.grayBg,   bd:P.grayBd,   txt:P.gray  },
  };
  const c = MAP[d] || MAP["EN TEST"];
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:4, textTransform:"uppercase", letterSpacing:"0.06em", background:c.bg, border:`1px solid ${c.bd}`, color:c.txt }}>
      {d}
    </span>
  );
}

function statutStyle(st, inverse = false) {
  const s = inverse
    ? { bon:"neutre", vigilance:"vigilance", critique:"critique" }[st] || "neutre"
    : st;
  return { color: STATUT_COLOR[s]?.text || P.textSub, fontWeight: s!=="neutre" ? 600 : 400 };
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = v => (v===null||v===undefined||isNaN(v)) ? "—" : Math.round(v).toLocaleString("fr-MA") + " MAD";
const pct = v => (!v && v!==0) ? "—" : (v*100).toFixed(0) + "%";

// ─── STYLES ──────────────────────────────────────────────────────────────────
const SS = {
  page:     { padding:"0 0 48px", fontFamily:"'Inter',-apple-system,system-ui,sans-serif", color:P.text, background:P.bg, minHeight:"100vh", display:"flex", flexDirection:"column", gap:14 },
  loadWrap: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:300, gap:12 },
  spinner:  { display:"inline-block", width:20, height:20, border:`2px solid ${P.border}`, borderTop:`2px solid ${P.teal}`, borderRadius:"50%", animation:"spin .7s linear infinite" },
  loadTxt:  { fontSize:13, color:P.textMuted, margin:0 },
  errWrap:  { padding:24, display:"flex", flexDirection:"column", gap:12, alignItems:"flex-start" },

  exHead:   { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, paddingBottom:14, borderBottom:`1px solid ${P.border}` },
  exTitle:  { fontSize:15, fontWeight:600, color:P.text },
  dateLbl:  { fontSize:12, color:P.textMuted },
  kpiGrid:  { display:"flex", flexWrap:"wrap", gap:10 },

  blocLabel:{ fontSize:11, fontWeight:700, color:P.textSub, textTransform:"uppercase", letterSpacing:"0.09em", margin:"0 0 14px" },
  subLabel: { fontSize:11, fontWeight:600, color:P.textMuted, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 10px" },

  fuiteGrid:{ display:"flex", gap:10, flexWrap:"wrap" },

  table:    { width:"100%", borderCollapse:"collapse", fontSize:13 },
  th:       { textAlign:"left", color:P.textMuted, fontWeight:600, fontSize:10, textTransform:"uppercase", letterSpacing:"0.09em", padding:"10px 12px", borderBottom:`1px solid ${P.border}`, whiteSpace:"nowrap" },
  tr:       { borderBottom:`1px solid ${P.border}`, transition:"background 0.1s", cursor:"pointer" },
  td:       { padding:"11px 12px", color:P.text, verticalAlign:"middle" },
  tdR:      { padding:"11px 12px", textAlign:"right", fontVariantNumeric:"tabular-nums", verticalAlign:"middle", color:P.textSub },
  nomP:     { fontWeight:600, color:P.text, fontSize:13 },

  btnSm:    { padding:"5px 12px", borderRadius:6, border:`1px solid ${P.borderMid}`, background:P.surface, color:P.textSub, fontSize:12, cursor:"pointer", fontFamily:"inherit" },
  btnRefresh:{ padding:"5px 10px", borderRadius:6, border:`1px solid ${P.border}`, background:"transparent", color:P.textMuted, fontSize:12, cursor:"pointer", fontFamily:"inherit" },
};
