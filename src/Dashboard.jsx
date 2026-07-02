import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

// ─── Constantes métier ────────────────────────────────────────────────────────
const STATUTS_CONFIRMS  = ["Confirmé", "Livrée", "Expédiée", "Facturée", "En cours de livraison", "Retour en cours", "Retour reçu", "Refusée", "Demande de retour", "Reportée", "Injoignable", "Changement de dest"];
const STATUTS_LIVRES    = ["Livrée", "Facturée"];
const STATUTS_RETOURS   = ["Retour reçu", "Retour en cours"];
const STATUTS_EXCLUS    = ["Annulée"];
const SEUIL_CONF        = 35;
const SEUIL_LIVR        = 55;

// ─── Couleurs ─────────────────────────────────────────────────────────────────
const CLR = {
  green:  { bg: "#F0FDF4", border: "#BBF7D0", text: "#16A34A", dark: "#14532D" },
  amber:  { bg: "#FFFBEB", border: "#FDE68A", text: "#D97706", dark: "#78350F" },
  red:    { bg: "#FEF2F2", border: "#FECACA", text: "#DC2626", dark: "#7F1D1D" },
  indigo: { bg: "#EEF0FF", border: "#AFA9EC", text: "#534AB7", dark: "#312E81" },
  slate:  { bg: "#F8FAFC", border: "#E2E8F0", text: "#64748B", dark: "#1E293B" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pct    = (a, b) => b > 0 ? Math.round((a / b) * 100) : null;
const avg    = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
const sum    = arr => arr.reduce((s, v) => s + v, 0);
const round  = n => Math.round(n);
const fmt    = n => n == null ? null : round(n).toLocaleString("fr");

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function endOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
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
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
}

function getMontant(r) {
  if (r.credit && +r.credit > 0) return +r.credit;
  if (r.debit  && +r.debit  > 0) return -Math.abs(+r.debit);
  return 0;
}

function signal(val, seuilVert, seuilAmbre) {
  if (val == null) return CLR.slate;
  if (val >= seuilVert)  return CLR.green;
  if (val >= seuilAmbre) return CLR.amber;
  return CLR.red;
}

// ─── Composants UI ────────────────────────────────────────────────────────────
function Pill({ color, children }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: color.bg, color: color.text, border: `1px solid ${color.border}` }}>
      {children}
    </span>
  );
}

function KpiMini({ label, value, color, sub }) {
  return (
    <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 11, color: CLR.slate.text, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color?.dark || CLR.slate.dark }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 10, color: CLR.slate.text, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Bar({ value, color }) {
  return (
    <div style={{ height: 4, background: "#E2E8F0", borderRadius: 99, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, value || 0))}%`, background: color.text, borderRadius: 99, transition: "width .4s" }} />
    </div>
  );
}

function SectionCard({ children, borderColor, style = {} }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${borderColor || "#E2E8F0"}`, borderRadius: 14, padding: "20px 24px", ...style }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, dot, onAnalyse }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {dot && <div style={{ width: 8, height: 8, borderRadius: "50%", background: dot.text }} />}
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#0F172A" }}>{title}</span>
      </div>
      {onAnalyse && (
        <button onClick={e => { e.stopPropagation(); onAnalyse(); }}
          style={{ fontSize: 11, color: CLR.indigo.text, fontWeight: 600, background: CLR.indigo.bg, border: `1px solid ${CLR.indigo.border}`, borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>
          Analyser →
        </button>
      )}
    </div>
  );
}

function PeriodSelector({ start, end, onChange }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input type="date" value={start} max={end} onChange={e => onChange(e.target.value, end)}
        style={{ padding: "5px 10px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 13, color: "#1E293B", background: "#fff", outline: "none" }} />
      <span style={{ fontSize: 12, color: "#94A3B8" }}>→</span>
      <input type="date" value={end} min={start} max={today} onChange={e => onChange(start, e.target.value)}
        style={{ padding: "5px 10px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 13, color: "#1E293B", background: "#fff", outline: "none" }} />
      <div style={{ display: "flex", gap: 4 }}>
        {[
          { label: "Mois en cours",  fn: () => onChange(startOfMonth(), endOfMonth()) },
          { label: "Mois précédent", fn: () => { const r = prevMonthRange(); onChange(r.start, r.end); } },
          { label: "Trimestre",      fn: () => onChange(startOfQuarter(), today) },
        ].map(s => (
          <button key={s.label} onClick={s.fn}
            style={{ padding: "5px 10px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 11, fontWeight: 500, color: "#64748B", background: "#fff", cursor: "pointer" }}>
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
  const [period,  setPeriod]  = useState({ start: startOfMonth(), end: today });
  const [loading, setLoading] = useState(true);
  const [data,    setData]    = useState(null);
  const [drill,   setDrill]   = useState(null); // produit sélectionné pour drill-down

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
    ] = await Promise.all([
      supabase.from("releve_bancaire")
        .select("date, debit, credit, type, est_bancaire, intitule, produit")
        .gte("date", start).lte("date", end),
      supabase.from("commandes")
        .select("id, statut, prix, frais_livraison, frais_emballage_stockage, transporteur, conseillere, produit, created_at, date_livraison")
        .gte("created_at", start).lte("created_at", endFull),
      supabase.from("leads")
        .select("id, statut, conseillere, produit, created_at")
        .gte("created_at", start).lte("created_at", endFull),
      supabase.from("ads_spend")
        .select("date, plateforme, spend_mad, budget_mad, leads_count, produit_id")
        .gte("date", start).lte("date", end),
      supabase.from("produits")
        .select("id, nom, cout_achat, stock_disponible, frais_emballage_stockage"),
    ]);

    setData(compute({
      releve:    releve    || [],
      commandes: commandes || [],
      leads:     leads     || [],
      adsSpend:  adsSpend  || [],
      produits:  produits  || [],
    }));
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  function compute({ releve, commandes, leads, adsSpend, produits }) {
    const prodMap = {};
    produits.forEach(p => { prodMap[p.id] = p; prodMap[p.nom] = p; });

    // ── FINANCES ──────────────────────────────────────────────────────────
    const mvtsBanc  = releve.filter(r => r.est_bancaire !== false);
    const recettes  = sum(mvtsBanc.filter(r => getMontant(r) > 0).map(r => getMontant(r)));
    const depenses  = sum(mvtsBanc.filter(r => getMontant(r) < 0).map(r => Math.abs(getMontant(r))));
    const solde     = recettes - depenses;
    const releve_ok = releve.length > 0;

    const capitalImmobilise = produits
      .filter(p => (p.stock_disponible || 0) > 0 && p.cout_achat > 0)
      .reduce((s, p) => s + (p.stock_disponible * p.cout_achat), 0);

    const finSignal = !releve_ok ? CLR.slate
      : solde > 0 ? CLR.green
      : solde > -500 ? CLR.amber
      : CLR.red;

    // ── COMMANDES ─────────────────────────────────────────────────────────
    const cmdLivrees   = commandes.filter(c => STATUTS_LIVRES.includes(c.statut));
    const cmdRetours   = commandes.filter(c => STATUTS_RETOURS.includes(c.statut));
    const cmdActives   = commandes.filter(c => !STATUTS_EXCLUS.includes(c.statut));

    const tauxLivr   = pct(cmdLivrees.length, cmdActives.length);
    const tauxRetour = pct(cmdRetours.length, cmdActives.length);

    const capitalEncaisse = sum(cmdLivrees.map(c => parseFloat(c.prix) || 0));

    const livrSignal = signal(tauxLivr, SEUIL_LIVR, SEUIL_LIVR * 0.75);

    // ── LEADS / CALL CENTER ───────────────────────────────────────────────
    const totalLeads = leads.length;
    const confirmes  = leads.filter(l => STATUTS_CONFIRMS.includes(l.statut)).length;
    const tauxConf   = pct(confirmes, totalLeads);
    const confSignal = signal(tauxConf, SEUIL_CONF, SEUIL_CONF * 0.7);

    // Par conseillère
    const consMap = {};
    leads.forEach(l => {
      const c = l.conseillere; if (!c) return;
      if (!consMap[c]) consMap[c] = { nom: c, total: 0, conf: 0, livr: 0 };
      consMap[c].total++;
      if (STATUTS_CONFIRMS.includes(l.statut)) consMap[c].conf++;
    });
    cmdLivrees.forEach(c => {
      if (c.conseillere && consMap[c.conseillere]) consMap[c.conseillere].livr++;
    });
    const consStats = Object.values(consMap)
      .map(c => ({ ...c, tauxConf: pct(c.conf, c.total), tauxLivr: pct(c.livr, c.total) }))
      .sort((a, b) => b.tauxConf - a.tauxConf);

    // ── ADS ───────────────────────────────────────────────────────────────
    const totalSpend    = sum(adsSpend.map(a => parseFloat(a.spend_mad || a.budget_mad) || 0));
    const totalLeadsAds = sum(adsSpend.map(a => parseInt(a.leads_count) || 0));
    const hasAds        = totalSpend > 0;
    const cplMoyen      = hasAds && totalLeadsAds > 0 ? totalSpend / totalLeadsAds : null;
    const cplLivre      = hasAds && cmdLivrees.length > 0 ? totalSpend / cmdLivrees.length : null;

    // ── PRODUITS — MARGE ─────────────────────────────────────────────────
    // Calcul marge par commande livrée
    function calcMarge(c) {
      const prix      = parseFloat(c.prix) || 0;
      const prod      = prodMap[c.produit];
      const cout      = prod?.cout_achat || 0;
      const livr      = parseFloat(c.frais_livraison) || 0;
      const emb       = parseFloat(c.frais_emballage_stockage) || prod?.frais_emballage_stockage || 0;
      if (!prix || !cout) return null;
      return prix - cout - livr - emb;
    }

    // Ads par produit
    const adsByProduit = {};
    adsSpend.forEach(a => {
      if (!a.produit_id) return;
      adsByProduit[a.produit_id] = (adsByProduit[a.produit_id] || 0) + (parseFloat(a.spend_mad || a.budget_mad) || 0);
    });

    // Stats par produit
    const PS = {};
    leads.forEach(l => {
      if (!l.produit) return;
      if (!PS[l.produit]) PS[l.produit] = { nom: l.produit, leads: 0, conf: 0, livr: [], retours: 0, ads: 0 };
      PS[l.produit].leads++;
      if (STATUTS_CONFIRMS.includes(l.statut)) PS[l.produit].conf++;
    });
    cmdLivrees.forEach(c => {
      if (!c.produit) return;
      if (!PS[c.produit]) PS[c.produit] = { nom: c.produit, leads: 0, conf: 0, livr: [], retours: 0, ads: 0 };
      const m = calcMarge(c);
      PS[c.produit].livr.push({ marge: m, prix: parseFloat(c.prix) || 0 });
    });
    cmdRetours.forEach(c => {
      if (c.produit && PS[c.produit]) PS[c.produit].retours++;
    });

    // Lier les ads aux produits (via produit_id → nom)
    Object.entries(adsByProduit).forEach(([pid, spend]) => {
      const nom = prodMap[pid]?.nom;
      if (nom && PS[nom]) PS[nom].ads = spend;
    });

    const prodList = Object.values(PS).map(p => {
      const livrées       = p.livr.length;
      const margesNettes  = p.livr.map(l => l.marge).filter(m => m !== null);
      const caTotal       = sum(p.livr.map(l => l.prix));
      const margeNette    = margesNettes.length > 0
        ? sum(margesNettes) - p.ads
        : null;
      const margeUnitaire = margeNette !== null && livrées > 0
        ? margeNette / livrées
        : null;
      const tauxConf = pct(p.conf, p.leads);
      const tauxLivr = pct(livrées, p.leads);
      const tauxRet  = pct(p.retours, livrées + p.retours);

      // Cause dominante
      let cause = null;
      if (tauxRet > 25)       cause = "Retours élevés";
      else if (tauxConf < 50) cause = "Confirmation faible";
      else if (p.ads > 0 && margeUnitaire !== null && p.ads > sum(margesNettes)) cause = "Ads coûteuses";

      // Verdict
      let verdict = "SURVEILLER";
      if (margeUnitaire === null)    verdict = "EN TEST";
      else if (margeUnitaire > 15)   verdict = "CONTINUER";
      else if (margeUnitaire > 0)    verdict = "SURVEILLER";
      else                           verdict = "ANALYSER";

      const verdictColor = {
        "CONTINUER":  CLR.green,
        "SURVEILLER": CLR.amber,
        "ANALYSER":   CLR.red,
        "EN TEST":    CLR.indigo,
      };

      return {
        nom: p.nom, leads: p.leads, conf: p.conf, livrées, retours: p.retours,
        caTotal, margeNette, margeUnitaire, ads: p.ads,
        tauxConf, tauxLivr, tauxRet,
        cause, verdict, verdictColor: verdictColor[verdict],
      };
    }).sort((a, b) => (a.margeUnitaire ?? 999) - (b.margeUnitaire ?? 999));

    // ── TRANSPORTEURS ─────────────────────────────────────────────────────
    const tMap = {};
    commandes.forEach(c => {
      if (!c.transporteur) return;
      if (!tMap[c.transporteur]) tMap[c.transporteur] = { nom: c.transporteur, total: 0, livr: 0, ret: 0 };
      tMap[c.transporteur].total++;
      if (STATUTS_LIVRES.includes(c.statut))  tMap[c.transporteur].livr++;
      if (STATUTS_RETOURS.includes(c.statut)) tMap[c.transporteur].ret++;
    });
    const transStats = Object.values(tMap).map(t => ({
      ...t,
      tauxLivr:   pct(t.livr, t.total),
      tauxRetour: pct(t.ret, t.total),
      grade: pct(t.livr, t.total) >= 60 ? "A1" : pct(t.livr, t.total) >= 45 ? "A2" : pct(t.livr, t.total) >= 40 ? "B2" : "STOP",
    })).sort((a, b) => b.total - a.total);

    return {
      // Finance
      releve_ok, recettes, depenses, solde, capitalImmobilise, finSignal,
      // Commandes
      tauxLivr, tauxRetour, cmdLivrees: cmdLivrees.length,
      capitalEncaisse, livrSignal,
      // Leads
      totalLeads, confirmes, tauxConf, confSignal, consStats,
      // Ads
      hasAds, totalSpend, cplMoyen, cplLivre,
      // Produits
      prodList,
      // Transporteurs
      transStats,
    };
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 320, color: "#94A3B8", fontSize: 14 }}>
      Chargement…
    </div>
  );

  const d = data;
  const gradeClr = { A1: CLR.green, A2: CLR.green, B2: CLR.amber, STOP: CLR.red };

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "0 0 48px" }}>

      {/* ── Topbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 22px", borderBottom: "1px solid #E2E8F0", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Vue d'ensemble</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Pilotage financier & business</div>
        </div>
        <PeriodSelector start={period.start} end={period.end} onChange={(s, e) => setPeriod({ start: s, end: e })} />
      </div>

      {/* ══ NIVEAU 1 — TABLEAU PRODUITS ══ */}
      <SectionCard style={{ marginBottom: 20 }}>
        <SectionHeader title="Rentabilité produits" onAnalyse={() => setModule("dashboard-analytique")} />

        {d.prodList.length === 0 ? (
          <div style={{ padding: "20px 0", color: "#94A3B8", fontSize: 13, textAlign: "center" }}>
            Aucune donnée produit sur la période — les données apparaissent dès qu'une commande est livrée
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Produit", "Leads", "Livrées", "Taux livr.", "Marge nette", "Marge unitaire", "Cause", "Verdict"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: "#94A3B8", borderBottom: "1px solid #E2E8F0", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.prodList.map((p, i) => (
                  <>
                    <tr key={p.nom}
                      onClick={() => setDrill(drill === p.nom ? null : p.nom)}
                      style={{ borderBottom: "1px solid #F1F5F9", background: drill === p.nom ? "#FAFBFF" : i % 2 === 0 ? "#fff" : "#F9FAFB", cursor: "pointer", transition: "background .15s" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: 13, color: "#0F172A", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.nom}>
                        <span style={{ marginRight: 6 }}>{drill === p.nom ? "▾" : "▸"}</span>{p.nom}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748B" }}>{p.leads}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{p.livrées}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: p.tauxLivr >= SEUIL_LIVR ? CLR.green.text : p.tauxLivr >= SEUIL_LIVR * 0.75 ? CLR.amber.text : CLR.red.text, fontWeight: 600 }}>
                        {p.tauxLivr != null ? `${p.tauxLivr}%` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: p.margeNette != null ? (p.margeNette >= 0 ? CLR.green.text : CLR.red.text) : "#94A3B8", fontFamily: "monospace" }}>
                        {p.margeNette != null ? `${p.margeNette >= 0 ? "+" : ""}${fmt(p.margeNette)} MAD` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: p.margeUnitaire != null ? (p.margeUnitaire >= 0 ? CLR.green.text : CLR.red.text) : "#94A3B8", fontFamily: "monospace" }}>
                        {p.margeUnitaire != null ? `${p.margeUnitaire >= 0 ? "+" : ""}${fmt(p.margeUnitaire)} MAD` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: CLR.amber.text }}>
                        {p.cause || <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <Pill color={p.verdictColor}>{p.verdict}</Pill>
                      </td>
                    </tr>

                    {/* ── DRILL-DOWN ── */}
                    {drill === p.nom && (
                      <tr key={`${p.nom}-drill`}>
                        <td colSpan={8} style={{ padding: "0 12px 16px", background: "#FAFBFF", borderBottom: "1px solid #E2E8F0" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, paddingTop: 14 }}>

                            {/* Call center */}
                            <div style={{ background: "#fff", border: `1px solid ${p.tauxConf >= SEUIL_CONF ? CLR.green.border : CLR.red.border}`, borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94A3B8", marginBottom: 8 }}>📞 Call center</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: p.tauxConf >= SEUIL_CONF ? CLR.green.dark : CLR.red.dark }}>{p.tauxConf ?? "—"}%</div>
                              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Confirmation</div>
                              <Bar value={p.tauxConf} color={p.tauxConf >= SEUIL_CONF ? CLR.green : CLR.red} />
                              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
                                {p.tauxConf < SEUIL_CONF ? "→ Retravailler script / qualité lead" : "✓ OK"}
                              </div>
                            </div>

                            {/* Media buying */}
                            <div style={{ background: "#fff", border: `1px solid ${p.ads > 0 ? CLR.indigo.border : CLR.slate.border}`, borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94A3B8", marginBottom: 8 }}>📣 Media buying</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: CLR.indigo.dark }}>{p.ads > 0 ? `${fmt(p.ads)} MAD` : "—"}</div>
                              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Dépense ads</div>
                              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
                                {p.ads === 0 ? "→ Aucune dépense ads allouée" : p.livrées > 0 ? `CPL/livré : ${fmt(p.ads / p.livrées)} MAD` : "—"}
                              </div>
                            </div>

                            {/* Stock */}
                            <div style={{ background: "#fff", border: `1px solid ${CLR.slate.border}`, borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94A3B8", marginBottom: 8 }}>📦 Stock</div>
                              {(() => {
                                const prod = d.prodList.find(x => x.nom === p.nom);
                                const produit = Object.values({}).find(x => x); // placeholder
                                const stockProduit = []; // sera enrichi si besoin
                                return (
                                  <>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: CLR.slate.dark }}>
                                      {fmt(p.livrées)} livrées
                                    </div>
                                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>sur la période</div>
                                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
                                      → Voir page Produits pour le stock dispo
                                    </div>
                                  </>
                                );
                              })()}
                            </div>

                            {/* Livraison */}
                            <div style={{ background: "#fff", border: `1px solid ${p.tauxRet > 25 ? CLR.red.border : p.tauxLivr >= SEUIL_LIVR ? CLR.green.border : CLR.amber.border}`, borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94A3B8", marginBottom: 8 }}>🚚 Livraison</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: p.tauxRet > 25 ? CLR.red.dark : CLR.green.dark }}>
                                {p.tauxRet ?? "0"}% retours
                              </div>
                              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Taux livr. : {p.tauxLivr ?? "—"}%</div>
                              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
                                {p.tauxRet > 25 ? "→ Vérifier produit / destination / transporteur" : "✓ OK"}
                              </div>
                            </div>

                            {/* Finance */}
                            <div style={{ background: "#fff", border: `1px solid ${p.margeNette >= 0 ? CLR.green.border : CLR.red.border}`, borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94A3B8", marginBottom: 8 }}>💰 Finance</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: p.margeNette != null ? (p.margeNette >= 0 ? CLR.green.dark : CLR.red.dark) : "#94A3B8", fontFamily: "monospace" }}>
                                {p.margeNette != null ? `${p.margeNette >= 0 ? "+" : ""}${fmt(p.margeNette)} MAD` : "—"}
                              </div>
                              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Marge nette totale</div>
                              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
                                CA : {fmt(p.caTotal)} MAD · {p.livrées} livrées
                              </div>
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ══ NIVEAU 2 — BLOCS DÉPARTEMENTAUX ══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 20 }}>

        {/* Finance */}
        <SectionCard borderColor={d.finSignal.border} style={{ padding: "16px 18px" }}>
          <SectionHeader title="Finance" dot={d.finSignal} onAnalyse={() => setModule("finances")} />
          {!d.releve_ok ? (
            <div style={{ fontSize: 12, color: "#94A3B8" }}>Aucun mouvement</div>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: d.solde >= 0 ? CLR.green.dark : CLR.red.dark, fontFamily: "monospace", marginBottom: 6 }}>
                {d.solde >= 0 ? "+" : ""}{fmt(d.solde)} MAD
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8 }}>Solde net période</div>
              <div style={{ fontSize: 12, color: CLR.green.text }}>+{fmt(d.recettes)} MAD</div>
              <div style={{ fontSize: 12, color: CLR.red.text }}>−{fmt(d.depenses)} MAD</div>
            </>
          )}
        </SectionCard>

        {/* Livraison */}
        <SectionCard borderColor={d.livrSignal.border} style={{ padding: "16px 18px" }}>
          <SectionHeader title="Livraison" dot={d.livrSignal} onAnalyse={() => setModule("commandes")} />
          <div style={{ fontSize: 22, fontWeight: 800, color: d.livrSignal.dark, marginBottom: 4 }}>
            {d.tauxLivr ?? "—"}{d.tauxLivr != null ? "%" : ""}
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>Taux livraison</div>
          <Bar value={d.tauxLivr} color={d.livrSignal} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11 }}>
            <span style={{ color: CLR.red.text }}>Retours : {d.tauxRetour ?? "—"}{d.tauxRetour != null ? "%" : ""}</span>
            <span style={{ color: "#64748B" }}>{d.cmdLivrees} livrées</span>
          </div>
        </SectionCard>

        {/* Call center */}
        <SectionCard borderColor={d.confSignal.border} style={{ padding: "16px 18px" }}>
          <SectionHeader title="Call center" dot={d.confSignal} onAnalyse={() => setModule("leads")} />
          <div style={{ fontSize: 22, fontWeight: 800, color: d.confSignal.dark, marginBottom: 4 }}>
            {d.tauxConf ?? "—"}{d.tauxConf != null ? "%" : ""}
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>Taux confirmation</div>
          <Bar value={d.tauxConf} color={d.confSignal} />
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 8 }}>
            {d.totalLeads} leads · {d.confirmes} confirmés
          </div>
        </SectionCard>

        {/* Media buying */}
        <SectionCard borderColor={d.hasAds ? CLR.indigo.border : CLR.slate.border} style={{ padding: "16px 18px" }}>
          <SectionHeader title="Media buying" dot={d.hasAds ? CLR.indigo : CLR.slate} onAnalyse={() => setModule("ads")} />
          {!d.hasAds ? (
            <div style={{ fontSize: 12, color: "#94A3B8" }}>Aucune dépense ads</div>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: CLR.indigo.dark, marginBottom: 4, fontFamily: "monospace" }}>
                {fmt(d.totalSpend)} MAD
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8 }}>Dépense ads</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>
                CPL : {d.cplMoyen != null ? `${fmt(d.cplMoyen)} MAD` : "—"}
              </div>
              <div style={{ fontSize: 12, color: "#64748B" }}>
                CPL/livré : {d.cplLivre != null ? `${fmt(d.cplLivre)} MAD` : "—"}
              </div>
            </>
          )}
        </SectionCard>

        {/* Stock */}
        <SectionCard borderColor={CLR.slate.border} style={{ padding: "16px 18px" }}>
          <SectionHeader title="Stock" dot={CLR.slate} onAnalyse={() => setModule("produits")} />
          <div style={{ fontSize: 22, fontWeight: 800, color: CLR.slate.dark, marginBottom: 4, fontFamily: "monospace" }}>
            {fmt(d.capitalImmobilise)} MAD
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8 }}>Capital immobilisé</div>
          {d.transStats.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>Transporteurs</div>
              {d.transStats.slice(0, 2).map(t => (
                <div key={t.nom} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: "#64748B" }}>{t.nom}</span>
                  <Pill color={gradeClr[t.grade]}>{t.grade}</Pill>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>

      {/* ══ NIVEAU 3 — ÉVALUATIONS TRANSVERSALES ══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Conseillères */}
        <SectionCard>
          <SectionHeader title="Évaluation conseillères" onAnalyse={() => setModule("dashboard-analytique")} />
          {d.consStats.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94A3B8" }}>Aucune conseillère identifiée sur la période</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Conseillère", "Leads", "Confirmation", "Livrées", "Statut"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "#94A3B8", borderBottom: "1px solid #E2E8F0", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.consStats.map((c, i) => (
                  <tr key={c.nom} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                    <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600 }}>{c.nom}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#64748B" }}>{c.total}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700, color: c.tauxConf >= SEUIL_CONF ? CLR.green.text : CLR.red.text }}>
                      {c.tauxConf ?? "—"}{c.tauxConf != null ? "%" : ""}
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#64748B" }}>{c.livr}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <Pill color={c.tauxConf >= SEUIL_CONF ? CLR.green : CLR.red}>
                        {c.tauxConf >= SEUIL_CONF ? "OK" : "À améliorer"}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* Transporteurs */}
        <SectionCard>
          <SectionHeader title="Évaluation transporteurs" onAnalyse={() => setModule("dashboard-analytique")} />
          {d.transStats.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94A3B8" }}>Aucun transporteur identifié sur la période</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Transporteur", "Commandes", "Livraison", "Retours", "Grade"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "#94A3B8", borderBottom: "1px solid #E2E8F0", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.transStats.map((t, i) => (
                  <tr key={t.nom} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                    <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600 }}>{t.nom}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#64748B" }}>{t.total}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700, color: t.tauxLivr >= SEUIL_LIVR ? CLR.green.text : CLR.red.text }}>
                      {t.tauxLivr ?? "—"}{t.tauxLivr != null ? "%" : ""}
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: t.tauxRetour > 25 ? CLR.red.text : "#64748B" }}>
                      {t.tauxRetour ?? "—"}{t.tauxRetour != null ? "%" : ""}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <Pill color={gradeClr[t.grade]}>{t.grade}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={5} style={{ padding: "6px 10px", fontSize: 10, color: "#94A3B8" }}>A1 ≥ 60% · A2 45–60% · B2 40–45% · STOP &lt; 40%</td></tr>
              </tfoot>
            </table>
          )}
        </SectionCard>

      </div>
    </div>
  );
}
