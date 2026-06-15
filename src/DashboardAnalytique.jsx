/**
 * DashboardAnalytique.jsx — Cockpit COD Momtaz
 * Design : natif app Momtaz — light, sobre, ERP
 *
 * COLONNES SUPABASE :
 *   produits   : nom, prix_vente, cout_achat
 *   leads      : produit, statut, created_at
 *   commandes  : produit, statut, created_at, frais_livraison
 *   ads_spend  : produit, budget_mad, date
 */

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

// ─── CONSTANTES MÉTIER ────────────────────────────────────────────────────────
const EMBALLAGE              = 4;
const CONFIRMATION_PAR_LIVRE = 10;
const MIN_LEADS_TEST         = 20;
const SEUIL_MARGE_UNITE      = 20;
const SEUIL_VELOCITE         = 3;
const SEUIL_CONF_SCALE       = 0.35;
const SEUIL_LIVR_SCALE       = 0.55;
const SEUIL_CONF_REPAIR      = 0.25;
const SEUIL_LIVR_REPAIR      = 0.40;

const STATUTS_CONFIRMES = ["Confirmé", "Confirmée"];
const STATUTS_LIVRES    = ["Livrée", "Facturée"];
const STATUTS_EXPEDIES  = ["Expédiée"];

// ─── PALETTE NATIVE MOMTAZ (light / ERP) ─────────────────────────────────────
const C = {
  bg:          "#f8f9fa",
  surface:     "#ffffff",
  surfaceAlt:  "#f1f3f5",
  border:      "#e9ecef",
  borderMid:   "#dee2e6",
  text:        "#212529",
  textSub:     "#6c757d",
  textMuted:   "#adb5bd",

  // Accents statuts — même esprit que les badges Leads
  scale:       "#16a34a",  // vert foncé sobre
  scaleBg:     "#f0fdf4",
  scaleBd:     "#bbf7d0",

  optimize:    "#2563eb",  // bleu
  optimizeBg:  "#eff6ff",
  optimizeBd:  "#bfdbfe",

  test:        "#6b7280",  // gris neutre
  testBg:      "#f9fafb",
  testBd:      "#e5e7eb",

  repair:      "#d97706",  // amber
  repairBg:    "#fffbeb",
  repairBd:    "#fde68a",

  stop:        "#dc2626",  // rouge clair
  stopBg:      "#fef2f2",
  stopBd:      "#fecaca",

  accent:      "#2563eb",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const daysAgo = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString();
};
const inLastDays = (iso, n) => iso && new Date(iso) >= new Date(daysAgo(n));

function getDays(n) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    arr.push(d.toISOString().slice(0, 10));
  }
  return arr;
}

function computeMetrics(produit, leads, commandes, adsSpend, days = 30) {
  const nom       = produit.nom;
  const prixVente = parseFloat(produit.prix_vente) || 0;
  const coutAchat = parseFloat(produit.cout_achat)  || 0;

  const leadsP = leads.filter(l => l.produit === nom && inLastDays(l.created_at, days));
  const cmdsP  = commandes.filter(c => c.produit === nom && inLastDays(c.created_at, days));
  const adsP   = adsSpend.filter(a => a.produit === nom && inLastDays(a.date, days));

  const totalLeads  = leadsP.length;
  const nbConfirmes = leadsP.filter(l => STATUTS_CONFIRMES.includes(l.statut)).length;
  const livres      = cmdsP.filter(c => STATUTS_LIVRES.includes(c.statut));
  const expedies    = cmdsP.filter(c => STATUTS_EXPEDIES.includes(c.statut));
  const nbLivres    = livres.length;
  const nbExpedies  = expedies.length + nbLivres;

  const tauxConf = totalLeads > 0 ? nbConfirmes / totalLeads : 0;
  const tauxLivr = nbExpedies > 0 ? nbLivres / nbExpedies : 0;

  const fraisLivrMoy = nbLivres > 0
    ? livres.reduce((s, c) => s + (parseFloat(c.frais_livraison) || 0), 0) / nbLivres
    : 25;

  const adsTotal = adsP.reduce((s, a) => s + (parseFloat(a.budget_mad) || 0), 0);
  const cplReel  = totalLeads > 0 ? adsTotal / totalLeads : 0;
  const cacLivre = nbLivres > 0 ? adsTotal / nbLivres : 0;

  const margeBrute      = prixVente - coutAchat - fraisLivrMoy - EMBALLAGE - CONFIRMATION_PAR_LIVRE;
  const cplMax          = margeBrute * tauxConf * tauxLivr;
  const margeNetteUnite = margeBrute - cacLivre;
  const margeTotale     = nbLivres * margeNetteUnite;

  const dateFirst = leadsP.length > 0
    ? Math.min(...leadsP.map(l => new Date(l.created_at).getTime()))
    : Date.now();
  const joursActifs = Math.max(1, Math.ceil((Date.now() - dateFirst) / 86400000));
  const velocite    = nbLivres / joursActifs;

  // Décision
  let decision, action, colorKey;
  if (totalLeads < MIN_LEADS_TEST) {
    decision = "EN TEST"; colorKey = "test";
    action   = `Attendre ${MIN_LEADS_TEST - totalLeads} leads supplémentaires.`;
  } else if (margeNetteUnite <= 0 || margeTotale < 0) {
    decision = "STOP"; colorKey = "stop";
    action   = "Couper les ads immédiatement. Liquider le stock.";
  } else if (tauxConf < SEUIL_CONF_REPAIR) {
    decision = "RÉPARER"; colorKey = "repair";
    action   = `Taux conf ${pct(tauxConf)} trop bas. Revoir script avant de scaler.`;
  } else if (tauxLivr < SEUIL_LIVR_REPAIR) {
    decision = "RÉPARER"; colorKey = "repair";
    action   = `Taux livraison ${pct(tauxLivr)} trop bas. Vérifier transporteur.`;
  } else if (
    margeNetteUnite > SEUIL_MARGE_UNITE &&
    velocite >= SEUIL_VELOCITE &&
    tauxConf >= SEUIL_CONF_SCALE &&
    tauxLivr >= SEUIL_LIVR_SCALE
  ) {
    decision = "SCALER"; colorKey = "scale";
    action   = "Tous les voyants verts. Augmenter budget +30%.";
  } else {
    decision = "OPTIMISER"; colorKey = "optimize";
    action   = velocite < SEUIL_VELOCITE
      ? "Vélocité faible. Tester un nouveau visuel publicitaire."
      : "Marge positive mais améliorable. Optimiser le ciblage.";
  }

  // Étape de fuite
  let fuiteEtape = null;
  if (totalLeads >= MIN_LEADS_TEST) {
    if (tauxConf < SEUIL_CONF_REPAIR)       fuiteEtape = "confirmation";
    else if (tauxLivr < SEUIL_LIVR_REPAIR)  fuiteEtape = "livraison";
    else if (cplReel > cplMax && cplMax > 0) fuiteEtape = "ads";
  }

  return {
    nom, prixVente, coutAchat,
    totalLeads, nbConfirmes, nbExpedies, nbLivres,
    tauxConf, tauxLivr, fraisLivrMoy,
    adsTotal, cplReel, cplMax, cacLivre,
    margeBrute, margeNetteUnite, margeTotale,
    velocite,
    decision, action, colorKey,
    fuiteEtape,
  };
}

// ─── COMPOSANT ────────────────────────────────────────────────────────────────
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
      const since = daysAgo(30);
      const [pr, ld, cm, ad] = await Promise.all([
        supabase.from("produits").select("nom,prix_vente,cout_achat"),
        supabase.from("leads").select("produit,statut,created_at").gte("created_at", since),
        supabase.from("commandes").select("produit,statut,created_at,frais_livraison").gte("created_at", since),
        supabase.from("ads_spend").select("produit,budget_mad,date").gte("date", since.slice(0,10)),
      ]);
      const err = pr.error || ld.error || cm.error || ad.error;
      if (err) throw err;

      const seen = new Set();
      const uniq = (pr.data || []).filter(p => { if(seen.has(p.nom)) return false; seen.add(p.nom); return true; });

      setProduits(uniq);
      setLeads(ld.data    || []);
      setCommandes(cm.data || []);
      setAdsSpend(ad.data  || []);
      if (uniq.length) setSelected(uniq[0].nom);
    } catch(e) { setError(e?.message || "Erreur"); }
    finally    { setLoading(false); }
  }

  const allMetrics = useMemo(() =>
    produits.map(p => computeMetrics(p, leads, commandes, adsSpend, 30)),
    [produits, leads, commandes, adsSpend]
  );

  const sel = useMemo(() =>
    allMetrics.find(m => m.nom === selected) || null,
    [allMetrics, selected]
  );

  // Groupes décision
  const groupStop     = allMetrics.filter(m => m.colorKey === "stop");
  const groupRepair   = allMetrics.filter(m => m.colorKey === "repair");
  const groupOptimize = allMetrics.filter(m => m.colorKey === "optimize");
  const groupScale    = allMetrics.filter(m => m.colorKey === "scale");
  const groupTest     = allMetrics.filter(m => m.colorKey === "test");

  // KPIs santé globale
  const margeTotale30j  = allMetrics.reduce((s,m) => s + m.margeTotale, 0);
  const adsTotal30j     = allMetrics.reduce((s,m) => s + m.adsTotal, 0);
  const livresTotal30j  = allMetrics.reduce((s,m) => s + m.nbLivres, 0);
  const nbProblemes     = groupStop.length + groupRepair.length;
  const santeOk         = margeTotale30j > 0 && nbProblemes === 0;

  // Alerte principale = pire produit
  const alerte = [...groupStop, ...groupRepair][0] || null;

  // Courbe 30j du produit sélectionné
  const courbe = useMemo(() => {
    if (!sel) return [];
    return getDays(30).map(d => {
      const livresJ = commandes.filter(
        c => c.produit === sel.nom && STATUTS_LIVRES.includes(c.statut) && (c.created_at||"").slice(0,10) === d
      ).length;
      const adsJ = adsSpend
        .filter(a => a.produit === sel.nom && (a.date||"").slice(0,10) === d)
        .reduce((s,a) => s + (parseFloat(a.budget_mad)||0), 0);
      const marge = (livresJ > 0 || adsJ > 0)
        ? Math.round(livresJ * sel.margeBrute - adsJ) : null;
      return { d: d.slice(5), marge };
    });
  }, [sel, commandes, adsSpend]);

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:300, color: C.textSub, fontSize:14 }}>
      Chargement…
    </div>
  );
  if (error) return (
    <div style={{ padding:24, color: C.stop, fontSize:13 }}>
      ⚠️ {error} <button onClick={fetchAll} style={Btn.sm}>Réessayer</button>
    </div>
  );

  return (
    <div style={S.page}>

      {/* ══ BLOC 1 — SANTÉ GLOBALE ══════════════════════════════════════════ */}
      <div style={S.bloc}>

        {/* Verdict */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 20,
          paddingBottom: 16, borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: santeOk ? C.scale : C.stop,
            boxShadow: `0 0 0 3px ${santeOk ? C.scaleBg : C.stopBg}`,
          }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
            {santeOk ? "Business en bonne santé" : `${nbProblemes} produit${nbProblemes > 1 ? "s" : ""} à corriger`}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.textMuted }}>30 derniers jours</span>
          <button onClick={fetchAll} style={Btn.refresh}>↻</button>
        </div>

        {/* 3 KPIs */}
        <div style={S.kpiRow}>
          <KPI label="Marge nette 30j" value={fmt(margeTotale30j)} ok={margeTotale30j > 0} />
          <KPI label="Ads dépensés"    value={fmt(adsTotal30j)}    neutral />
          <KPI label="Commandes livrées" value={`${livresTotal30j} cmd`} neutral />
        </div>
      </div>

      {/* ══ BLOC 2 — ALERTE PRINCIPALE ══════════════════════════════════════ */}
      {alerte && (
        <div style={{
          ...S.bloc,
          borderLeft: `4px solid ${alerte.colorKey === "stop" ? C.stop : C.repair}`,
          background: alerte.colorKey === "stop" ? C.stopBg : C.repairBg,
          display: "flex", alignItems: "flex-start", gap: 16,
        }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize:13, fontWeight:700, color: alerte.colorKey === "stop" ? C.stop : C.repair }}>
                {alerte.colorKey === "stop" ? "⛔ Arrêter immédiatement" : "⚠️ À corriger en priorité"}
              </span>
              <span style={{ fontSize:13, fontWeight:600, color: C.text }}>{alerte.nom}</span>
            </div>
            <p style={{ margin:0, fontSize:13, color: C.textSub }}>{alerte.action}</p>
          </div>
          <button
            style={{ ...Btn.sm, whiteSpace:"nowrap" }}
            onClick={() => setSelected(alerte.nom)}
          >
            Voir le détail →
          </button>
        </div>
      )}

      {/* ══ BLOC 3 — PRODUITS PAR DÉCISION ══════════════════════════════════ */}
      <div style={S.bloc}>
        <p style={S.blocLabel}>Situation par produit</p>

        {/* Groupes */}
        {[
          { key:"stop",     label:"⛔ À couper",    items: groupStop },
          { key:"repair",   label:"⚠️ À réparer",   items: groupRepair },
          { key:"scale",    label:"🚀 À scaler",    items: groupScale },
          { key:"optimize", label:"⚙️ À optimiser", items: groupOptimize },
          { key:"test",     label:"🧪 En test",     items: groupTest },
        ].filter(g => g.items.length > 0).map(g => (
          <div key={g.key} style={{ marginBottom: 16 }}>
            <p style={{ fontSize:11, fontWeight:700, color: C[g.key] || C.textSub, textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 8px" }}>
              {g.label} · {g.items.length}
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap: 4 }}>
              {g.items.map(m => (
                <ProduitLigne key={m.nom} m={m} active={selected === m.nom} onClick={() => setSelected(m.nom)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ══ BLOC 4 — DRILL PRODUIT SÉLECTIONNÉ ══════════════════════════════ */}
      {sel && (
        <div style={S.bloc}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: 20 }}>
            <Badge colorKey={sel.colorKey} label={sel.decision} />
            <span style={{ fontSize:15, fontWeight:600, color: C.text }}>{sel.nom}</span>
          </div>

          {/* Action prescrite */}
          <div style={{
            padding: "12px 14px",
            background: C[sel.colorKey + "Bg"] || C.surfaceAlt,
            border: `1px solid ${C[sel.colorKey + "Bd"] || C.border}`,
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 13,
            color: C.text,
          }}>
            <span style={{ fontWeight:600, color: C[sel.colorKey], marginRight: 6 }}>Action :</span>
            {sel.action}
          </div>

          <div style={S.drillGrid}>

            {/* FUNNEL */}
            <div>
              <p style={S.subLabel}>Funnel</p>
              {[
                { label:"Leads",      val: sel.totalLeads,  sub: null,                         fuite: sel.fuiteEtape === "ads" },
                { label:"Confirmés",  val: sel.nbConfirmes, sub: pct(sel.tauxConf) + " conf",  fuite: sel.fuiteEtape === "confirmation" },
                { label:"Expédiés",   val: sel.nbExpedies,  sub: null,                         fuite: false },
                { label:"Livrés",     val: sel.nbLivres,    sub: pct(sel.tauxLivr) + " livr",  fuite: sel.fuiteEtape === "livraison" },
              ].map((step, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", marginBottom: 4 }}>
                  <div style={{
                    flex:1, display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding: "10px 14px",
                    background: step.fuite ? C.stopBg : C.surfaceAlt,
                    border: `1px solid ${step.fuite ? C.stopBd : C.border}`,
                    borderRadius: 8,
                  }}>
                    <div>
                      <span style={{ fontSize:12, fontWeight:600, color: C.textSub, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                        {step.label}
                      </span>
                      {step.sub && <span style={{ fontSize:11, color: C.textMuted, marginLeft: 8 }}>{step.sub}</span>}
                    </div>
                    <span style={{ fontSize:20, fontWeight:700, color: C.text, fontVariantNumeric:"tabular-nums" }}>
                      {step.val}
                    </span>
                  </div>
                  {step.fuite && (
                    <span style={{ marginLeft:8, fontSize:11, fontWeight:700, color: C.stop, whiteSpace:"nowrap" }}>
                      ← fuite
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* MÉTRIQUES + COURBE */}
            <div>
              <p style={S.subLabel}>Économie du produit</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap: 8, marginBottom: 20 }}>
                {[
                  { k:"Marge brute/livré",   v: fmt(sel.margeBrute) },
                  { k:"CPL max",             v: fmt(sel.cplMax) },
                  { k:"CPL réel",            v: sel.cplReel > 0 ? fmt(sel.cplReel) : "—", alert: sel.cplReel > sel.cplMax && sel.cplMax > 0 },
                  { k:"Marge nette/livré",   v: fmt(sel.margeNetteUnite), alert: sel.margeNetteUnite <= 0 },
                ].map(({k,v,alert}) => (
                  <div key={k} style={{ padding:"10px 12px", background: alert ? C.stopBg : C.surfaceAlt, border:`1px solid ${alert ? C.stopBd : C.border}`, borderRadius:8 }}>
                    <p style={{ fontSize:10, color: C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", margin:"0 0 4px" }}>{k}</p>
                    <p style={{ fontSize:15, fontWeight:700, color: alert ? C.stop : C.text, margin:0, fontVariantNumeric:"tabular-nums" }}>{v}</p>
                  </div>
                ))}
              </div>

              <p style={S.subLabel}>Marge nette 30 jours</p>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={courbe} margin={{ top:4, right:8, left:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
                  <XAxis dataKey="d" tick={{ fill: C.textMuted, fontSize:10 }} interval={6} />
                  <YAxis tick={{ fill: C.textMuted, fontSize:10 }} width={42} />
                  <Tooltip
                    contentStyle={{ background: C.surface, border:`1px solid ${C.border}`, borderRadius:6, fontSize:11 }}
                    labelStyle={{ color: C.textSub }}
                  />
                  <ReferenceLine y={0} stroke={C.stop} strokeDasharray="3 3" strokeWidth={1} />
                  <Line type="monotone" dataKey="marge" stroke={C.accent} strokeWidth={2} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// ─── SOUS-COMPOSANTS ─────────────────────────────────────────────────────────

function KPI({ label, value, ok, neutral }) {
  return (
    <div style={{ flex:1, padding:"14px 16px", background: C.surfaceAlt, borderRadius:8, border:`1px solid ${C.border}` }}>
      <p style={{ fontSize:10, fontWeight:600, color: C.textMuted, textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 6px" }}>{label}</p>
      <p style={{
        fontSize:22, fontWeight:700, margin:0, fontVariantNumeric:"tabular-nums", letterSpacing:"-0.01em",
        color: neutral ? C.text : (ok ? C.scale : C.stop),
      }}>{value}</p>
    </div>
  );
}

function ProduitLigne({ m, active, onClick }) {
  const borderColor = C[m.colorKey] || C.textMuted;
  return (
    <div
      onClick={onClick}
      style={{
        display:"flex", alignItems:"center", gap:12, padding:"10px 14px",
        background: active ? C.surfaceAlt : C.surface,
        border: `1px solid ${active ? C.borderMid : C.border}`,
        borderRadius: 8, cursor:"pointer",
        borderLeft: `3px solid ${borderColor}`,
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontSize:13, fontWeight:500, color: C.text, flex:1, minWidth:0 }}>{m.nom}</span>

      <span style={{ fontSize:12, color: C.textSub, whiteSpace:"nowrap" }}>
        {m.totalLeads} leads
      </span>
      <span style={{ fontSize:12, color: C.textSub, whiteSpace:"nowrap" }}>
        Conf {pct(m.tauxConf)}
      </span>
      <span style={{ fontSize:12, color: C.textSub, whiteSpace:"nowrap" }}>
        Livr {pct(m.tauxLivr)}
      </span>
      <span style={{
        fontSize:13, fontWeight:700, whiteSpace:"nowrap",
        color: m.margeNetteUnite > 0 ? C.scale : C.stop,
        fontVariantNumeric:"tabular-nums",
      }}>
        {fmt(m.margeNetteUnite)}/livré
      </span>
      <span style={{ fontSize:11, color: C.textMuted }}>›</span>
    </div>
  );
}

function Badge({ colorKey, label }) {
  return (
    <span style={{
      padding:"3px 10px", borderRadius:4, fontSize:11, fontWeight:700,
      textTransform:"uppercase", letterSpacing:"0.06em",
      color:    C[colorKey],
      background: C[colorKey + "Bg"] || "#f9f9f9",
      border: `1px solid ${C[colorKey + "Bd"] || "#eee"}`,
    }}>{label}</span>
  );
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = v => (v === null || v === undefined || isNaN(v))
  ? "—"
  : Math.round(v).toLocaleString("fr-MA") + " MAD";
const pct = v => (!v && v !== 0) ? "—" : (v * 100).toFixed(0) + "%";

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  page: {
    padding: "0 0 40px",
    fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
    color: C.text,
    background: C.bg,
    minHeight: "100vh",
    maxWidth: 1040,
  },
  bloc: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "20px 22px",
    marginBottom: 14,
  },
  kpiRow: {
    display: "flex", gap: 12,
  },
  blocLabel: {
    fontSize: 12, fontWeight: 600, color: C.textSub,
    textTransform: "uppercase", letterSpacing: "0.08em",
    margin: "0 0 14px",
  },
  subLabel: {
    fontSize: 11, fontWeight: 600, color: C.textMuted,
    textTransform: "uppercase", letterSpacing: "0.08em",
    margin: "0 0 10px",
  },
  drillGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)",
    gap: 24,
  },
};

const Btn = {
  sm: {
    padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.borderMid}`,
    background: C.surface, color: C.textSub, fontSize: 12,
    cursor: "pointer", fontFamily: "inherit",
  },
  refresh: {
    padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
    background: "transparent", color: C.textMuted, fontSize: 13,
    cursor: "pointer", fontFamily: "inherit",
  },
};
