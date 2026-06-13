/**
 * DashboardAnalytique.jsx — Cockpit COD Momtaz
 * Architecture 4 zones : Pouls → Décisions → Drill → Cashflow
 *
 * COLONNES SUPABASE UTILISÉES :
 *   produits   : nom, prix_vente, cout_achat
 *   leads      : produit, statut, created_at
 *   commandes  : produit, statut, created_at, frais_livraison, prix
 *   ads_spend  : produit, budget_mad, date
 *
 * CONSTANTES MÉTIER : modifiables en tête de fichier.
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
const EMBALLAGE              = 4;    // MAD / commande
const CONFIRMATION_PAR_LIVRE = 10;   // MAD / livré
const MIN_LEADS_TEST         = 20;
const SEUIL_MARGE_UNITE      = 20;   // MAD
const SEUIL_VELOCITE         = 3;    // livrés / jour
const SEUIL_CONF_SCALE       = 0.35;
const SEUIL_LIVR_SCALE       = 0.55;
const SEUIL_CONF_REPAIR      = 0.25;
const SEUIL_LIVR_REPAIR      = 0.40;
const DELAI_ENCAISSEMENT_J   = 20;

const STATUTS_CONFIRMES = ["Confirmé", "Confirmée"];
const STATUTS_LIVRES    = ["Livrée", "Facturée"];
const STATUTS_EXPEDIES  = ["Expédiée"]; // pas encore livrée

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString();
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

// ─── CALCUL MÉTRIQUES PAR PRODUIT ─────────────────────────────────────────────
function computeMetrics(produit, leads, commandes, adsSpend, periodDays = 30) {
  const nom = produit.nom;
  const prixVente = parseFloat(produit.prix_vente) || 0;
  const coutAchat = parseFloat(produit.cout_achat) || 0;

  // Filtres période
  const leadsP = leads.filter(l => l.produit === nom && inLastDays(l.created_at, periodDays));
  const cmdsP  = commandes.filter(c => c.produit === nom && inLastDays(c.created_at, periodDays));
  const adsP   = adsSpend.filter(a => a.produit === nom && inLastDays(a.date, periodDays));

  const totalLeads = leadsP.length;
  const nbConfirmes = leadsP.filter(l => STATUTS_CONFIRMES.includes(l.statut)).length;

  const livres   = cmdsP.filter(c => STATUTS_LIVRES.includes(c.statut));
  const expedies = cmdsP.filter(c => STATUTS_EXPEDIES.includes(c.statut));

  const nbLivres   = livres.length;
  const nbExpedies = expedies.length;
  const totalExpedShipped = nbExpedies + nbLivres; // tout ce qui est sorti

  const tauxConf = totalLeads > 0 ? nbConfirmes / totalLeads : 0;
  const tauxLivr = totalExpedShipped > 0 ? nbLivres / totalExpedShipped : 0;

  // Frais livraison moyen
  const fraisLivrTotal = livres.reduce((s, c) => s + (parseFloat(c.frais_livraison) || 0), 0);
  const fraisLivrMoyen = nbLivres > 0 ? fraisLivrTotal / nbLivres : 25; // fallback 25 MAD

  // Ads
  const adsTotal = adsP.reduce((s, a) => s + (parseFloat(a.budget_mad) || 0), 0);

  // Métriques économiques
  const margeBrute = prixVente - coutAchat - fraisLivrMoyen - EMBALLAGE - CONFIRMATION_PAR_LIVRE;
  const cplMax    = margeBrute * tauxConf * tauxLivr;
  const cplReel   = totalLeads > 0 ? adsTotal / totalLeads : 0;
  const cacLivre  = nbLivres > 0 ? adsTotal / nbLivres : (tauxConf * tauxLivr > 0 ? cplReel / (tauxConf * tauxLivr) : 0);

  const margeNetteUnite = margeBrute - cacLivre;
  const margeTotale     = nbLivres * margeNetteUnite;

  // Vélocité : livrés / jours actifs (max periodDays)
  const dateFirstLead = leadsP.length > 0
    ? Math.min(...leadsP.map(l => new Date(l.created_at).getTime()))
    : Date.now();
  const joursActifs = Math.max(1, Math.min(periodDays, Math.ceil((Date.now() - dateFirstLead) / 86400000)));
  const velocite = nbLivres / joursActifs;

  // Cash en transit (expédiées non livrées, le client paiera)
  const cashTransit = nbExpedies * prixVente;

  // Cash en attente d'encaissement (livré récemment < DELAI_ENCAISSEMENT_J)
  const cashAttente = livres
    .filter(c => inLastDays(c.created_at, DELAI_ENCAISSEMENT_J))
    .reduce((s, c) => s + prixVente, 0);

  // CA livré
  const caLivre = nbLivres * prixVente;

  // ── DÉCISION ──────────────────────────────────────────────────────────────
  let decision, action, color;
  if (totalLeads < MIN_LEADS_TEST) {
    decision = "EN TEST";
    action = `Attendre ${MIN_LEADS_TEST - totalLeads} leads pour décider`;
    color = "test";
  } else if (margeNetteUnite <= 0) {
    decision = "STOP";
    action = "Couper les ads aujourd'hui. Liquider le stock restant.";
    color = "stop";
  } else if (margeTotale < 0) {
    decision = "STOP";
    action = "Pertes confirmées sur 30j. Couper immédiatement.";
    color = "stop";
  } else if (tauxConf < SEUIL_CONF_REPAIR) {
    decision = "RÉPARER";
    action = `Conf ${pct(tauxConf)} < 25%. Revoir script conseillère AVANT de scaler.`;
    color = "repair";
  } else if (tauxLivr < SEUIL_LIVR_REPAIR) {
    decision = "RÉPARER";
    action = `Livraison ${pct(tauxLivr)} < 40%. Vérifier transporteur / zone / qualité produit.`;
    color = "repair";
  } else if (
    margeNetteUnite > SEUIL_MARGE_UNITE
    && velocite >= SEUIL_VELOCITE
    && tauxConf >= SEUIL_CONF_SCALE
    && tauxLivr >= SEUIL_LIVR_SCALE
  ) {
    decision = "SCALE";
    action = `Tous les voyants verts. Augmenter budget ads +30% cette semaine.`;
    color = "scale";
  } else {
    decision = "OPTIMISER";
    const faiblesse = velocite < SEUIL_VELOCITE
      ? `vélocité ${velocite.toFixed(1)}/j faible`
      : (margeNetteUnite < SEUIL_MARGE_UNITE
        ? `marge nette ${fmt(margeNetteUnite)} sous le seuil`
        : `conf/livr à améliorer`);
    action = `Marge OK mais ${faiblesse}. Tester nouveau creative avant de scaler.`;
    color = "optimize";
  }

  // Identifier l'étape la plus faible du funnel (pour drill)
  let fuiteEtape = null;
  if (totalLeads >= MIN_LEADS_TEST) {
    if (tauxConf < SEUIL_CONF_REPAIR) fuiteEtape = "confirmation";
    else if (tauxLivr < SEUIL_LIVR_REPAIR) fuiteEtape = "livraison";
    else if (cplReel > cplMax) fuiteEtape = "ads";
  }

  return {
    nom, prixVente, coutAchat,
    totalLeads, nbConfirmes, nbExpedies, nbLivres, totalExpedShipped,
    tauxConf, tauxLivr,
    fraisLivrMoyen, adsTotal,
    margeBrute, cplMax, cplReel, cacLivre,
    margeNetteUnite, margeTotale,
    velocite, joursActifs,
    cashTransit, cashAttente, caLivre,
    decision, action, color,
    fuiteEtape,
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
  const [selected,  setSelected]  = useState(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true); setError(null);
    try {
      const sinceISO  = daysAgo(60); // on charge 60j pour pouvoir comparer 30j vs 30j
      const sinceDate = sinceISO.slice(0, 10);

      const [pr, ld, cm, ad] = await Promise.all([
        supabase.from("produits").select("nom, prix_vente, cout_achat"),
        supabase.from("leads").select("produit, statut, created_at").gte("created_at", sinceISO),
        supabase.from("commandes").select("produit, statut, created_at, frais_livraison").gte("created_at", sinceISO),
        supabase.from("ads_spend").select("produit, budget_mad, date").gte("date", sinceDate),
      ]);

      const err = pr.error || ld.error || cm.error || ad.error;
      if (err) throw err;

      // Déduplique produits par nom
      const seen = new Set();
      const produitsUniques = (pr.data || []).filter(p => {
        if (seen.has(p.nom)) return false;
        seen.add(p.nom); return true;
      });

      setProduits(produitsUniques);
      setLeads(ld.data    || []);
      setCommandes(cm.data || []);
      setAdsSpend(ad.data  || []);
      if (produitsUniques.length) setSelected(produitsUniques[0].nom);
    } catch (e) {
      setError(e?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  // Métriques 30j et 7j
  const metrics30j = useMemo(() =>
    produits.map(p => computeMetrics(p, leads, commandes, adsSpend, 30))
      .sort((a, b) => a.margeTotale - b.margeTotale), // pertes en haut
    [produits, leads, commandes, adsSpend]
  );

  const metrics7j = useMemo(() =>
    produits.map(p => computeMetrics(p, leads, commandes, adsSpend, 7)),
    [produits, leads, commandes, adsSpend]
  );

  // Métrique 7j précédents (J-14 à J-7) pour delta
  const metrics7jPrev = useMemo(() => {
    const filtered = (arr, key) => arr.filter(x => {
      const t = new Date(x[key] || x.date).getTime();
      return t >= Date.now() - 14 * 86400000 && t < Date.now() - 7 * 86400000;
    });
    return produits.map(p => computeMetrics(
      p,
      filtered(leads, "created_at"),
      filtered(commandes, "created_at"),
      filtered(adsSpend, "date"),
      7
    ));
  }, [produits, leads, commandes, adsSpend]);

  const sel = useMemo(() =>
    metrics30j.find(m => m.nom === selected) || null,
    [metrics30j, selected]
  );

  // KPIs Zone 1
  const pouls = useMemo(() => {
    const sum = (arr, key) => arr.reduce((s, x) => s + (x[key] || 0), 0);
    const marge7j     = sum(metrics7j, "margeTotale");
    const margePrev   = sum(metrics7jPrev, "margeTotale");
    const adsTotal7j  = sum(metrics7j, "adsTotal");
    const cashTransit = sum(metrics30j, "cashTransit");
    const cashAttente = sum(metrics30j, "cashAttente");

    const delta = margePrev !== 0
      ? ((marge7j - margePrev) / Math.abs(margePrev)) * 100
      : null;

    // Pire produit (la plus grosse fuite)
    const pireProduit = metrics30j.find(m => m.decision === "STOP");

    return { marge7j, delta, adsTotal7j, cashTransit, cashAttente, pireProduit };
  }, [metrics7j, metrics7jPrev, metrics30j]);

  // Courbe 30j pour produit sélectionné
  const dailyData = useMemo(() => {
    if (!sel) return [];
    const days = getDays(30);
    return days.map(d => {
      const livresJour = commandes.filter(
        c => c.produit === sel.nom
          && STATUTS_LIVRES.includes(c.statut)
          && (c.created_at || "").slice(0, 10) === d
      ).length;
      const adsJour = adsSpend
        .filter(a => a.produit === sel.nom && (a.date || "").slice(0, 10) === d)
        .reduce((s, a) => s + (parseFloat(a.budget_mad) || 0), 0);

      const revenu = livresJour * sel.prixVente;
      const coutsLivr = livresJour * (sel.coutAchat + sel.fraisLivrMoyen + EMBALLAGE + CONFIRMATION_PAR_LIVRE);
      const marge = (livresJour > 0 || adsJour > 0)
        ? Math.round(revenu - coutsLivr - adsJour)
        : null;

      return { date: d.slice(5), marge };
    });
  }, [sel, commandes, adsSpend]);

  // Cashflow global 30j
  const cashflow = useMemo(() => {
    const sortie     = metrics30j.reduce((s, m) => s + m.adsTotal, 0);
    const entree     = metrics30j.reduce((s, m) => s + m.caLivre, 0);
    const transit    = metrics30j.reduce((s, m) => s + m.cashTransit, 0);
    const netFlow    = entree - sortie;
    const roi        = sortie > 0 ? entree / sortie : 0;
    return { sortie, entree, transit, netFlow, roi };
  }, [metrics30j]);

  // ─── RENDER ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={S.center}>
      <div style={S.spinner} />
      <p style={{ color: PALETTE.textMuted, marginTop: 14, fontSize: 13 }}>Chargement…</p>
    </div>
  );

  if (error) return (
    <div style={S.center}>
      <p style={{ color: PALETTE.danger, fontSize: 13 }}>⚠️ {error}</p>
      <button onClick={fetchAll} style={S.btnSm}>Réessayer</button>
    </div>
  );

  return (
    <div style={S.page}>

      {/* ═══ ZONE 1 — POULS ═══ */}
      <div style={S.zonePouls}>
        <div style={S.pulseGrid}>
          <Hero
            label="Marge nette 7j"
            value={fmt(pouls.marge7j)}
            delta={pouls.delta}
            color={pouls.marge7j >= 0 ? PALETTE.win : PALETTE.danger}
          />
          <Hero
            label="Cash dépensé (ads) 7j"
            value={fmt(pouls.adsTotal7j)}
            color={PALETTE.textHi}
          />
          <Hero
            label="Cash à risque"
            value={fmt(pouls.cashTransit)}
            subtitle="Expédié non livré"
            color={PALETTE.warn}
          />
          <Hero
            label="Cash en attente"
            value={fmt(pouls.cashAttente)}
            subtitle={`< ${DELAI_ENCAISSEMENT_J}j encaissement`}
            color={PALETTE.cash}
          />
        </div>

        {pouls.pireProduit && (
          <div style={S.alertBar}>
            <div>
              <span style={{ color: PALETTE.danger, fontWeight: 700, fontSize: 13, letterSpacing: "0.04em" }}>⛔ ALERTE</span>
              <span style={{ color: PALETTE.textHi, fontSize: 13, marginLeft: 10 }}>
                <b>{pouls.pireProduit.nom}</b> perd <b>{fmt(pouls.pireProduit.margeTotale)}</b> sur 30j —{" "}
                {pouls.pireProduit.action}
              </span>
            </div>
            <button
              style={S.alertBtn}
              onClick={() => setSelected(pouls.pireProduit.nom)}
            >
              Voir détail →
            </button>
          </div>
        )}
      </div>

      {/* ═══ ZONE 2 — TABLEAU DÉCISIONS ═══ */}
      <Section num="01" title="Décisions par produit" sub="Trié par marge 30j (pertes en haut)">
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                {["Décision", "Produit", "Leads", "Conf", "Livr", "Vél./j", "CAC", "Marge/livré", "Marge 30j", ""].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics30j.map(m => (
                <tr
                  key={m.nom}
                  style={{
                    ...S.tr,
                    background: selected === m.nom ? PALETTE.surface2 : "transparent",
                    borderLeft: `3px solid ${selected === m.nom ? COLORS[m.color] : "transparent"}`,
                  }}
                  onClick={() => setSelected(m.nom)}
                  onMouseEnter={e => { if (selected !== m.nom) e.currentTarget.style.background = `${PALETTE.surface2}80`; }}
                  onMouseLeave={e => { if (selected !== m.nom) e.currentTarget.style.background = "transparent"; }}
                >
                  <td style={S.td}>
                    <Pill decision={m.decision} colorKey={m.color} />
                  </td>
                  <td style={S.td}>
                    <span style={S.nomP}>{m.nom}</span>
                  </td>
                  <td style={S.tdR}>{m.totalLeads}</td>
                  <td style={{ ...S.tdR, color: m.tauxConf < SEUIL_CONF_REPAIR ? PALETTE.danger : m.tauxConf >= SEUIL_CONF_SCALE ? PALETTE.win : PALETTE.textDim, fontWeight: 600 }}>
                    {pct(m.tauxConf)}
                  </td>
                  <td style={{ ...S.tdR, color: m.tauxLivr < SEUIL_LIVR_REPAIR ? PALETTE.danger : m.tauxLivr >= SEUIL_LIVR_SCALE ? PALETTE.win : PALETTE.textDim, fontWeight: 600 }}>
                    {pct(m.tauxLivr)}
                  </td>
                  <td style={S.tdR}>{m.velocite.toFixed(1)}</td>
                  <td style={S.tdR}>{m.cacLivre > 0 ? fmt(m.cacLivre) : "—"}</td>
                  <td style={{ ...S.tdR, color: m.margeNetteUnite > 0 ? PALETTE.win : PALETTE.danger, fontWeight: 600 }}>
                    {fmt(m.margeNetteUnite)}
                  </td>
                  <td style={{ ...S.tdR, color: m.margeTotale > 0 ? PALETTE.win : PALETTE.danger, fontWeight: 700 }}>
                    {fmt(m.margeTotale)}
                  </td>
                  <td style={S.td}>
                    <span style={{ color: PALETTE.textMuted, fontSize: 16 }}>›</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ═══ ZONE 3 — DRILL PRODUIT SÉLECTIONNÉ ═══ */}
      {sel && (
        <Section num="02" title={`Diagnostic — ${sel.nom}`} sub={`Décision : ${sel.decision}`}>
          <div style={S.drillGrid}>

            {/* FUNNEL */}
            <div>
              <Funnel m={sel} />
            </div>

            {/* DROITE : action + courbe */}
            <div>
              {/* Action prescrite */}
              <div style={{
                padding: "18px 20px",
                borderRadius: 12,
                background: `linear-gradient(135deg, ${COLORS[sel.color]}18 0%, ${COLORS[sel.color]}08 100%)`,
                border: `1px solid ${COLORS[sel.color]}40`,
                boxShadow: `0 0 32px ${COLORS[sel.color]}10`,
                marginBottom: 18,
              }}>
                <p style={{ color: COLORS[sel.color], fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 8px" }}>
                  Action recommandée
                </p>
                <p style={{ color: PALETTE.textHi, fontSize: 14, fontWeight: 500, margin: 0, lineHeight: 1.55 }}>
                  {sel.action}
                </p>
              </div>

              {/* Courbe */}
              <p style={{ color: PALETTE.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
                Marge nette 30 jours
              </p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={dailyData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={PALETTE.border} />
                  <XAxis dataKey="date" tick={{ fill: PALETTE.textMuted, fontSize: 10 }} interval={6} />
                  <YAxis tick={{ fill: PALETTE.textMuted, fontSize: 10 }} width={40} />
                  <Tooltip
                    contentStyle={{ background: PALETTE.surface2, border: `1px solid ${PALETTE.borderHi}`, borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: PALETTE.textDim }}
                    itemStyle={{ color: PALETTE.textHi }}
                  />
                  <ReferenceLine y={0} stroke={PALETTE.danger} strokeDasharray="3 3" strokeWidth={1} />
                  <Line type="monotone" dataKey="marge" stroke={PALETTE.accent} strokeWidth={2.5} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

          </div>
        </Section>
      )}

      {/* ═══ ZONE 4 — CASHFLOW ═══ */}
      <Section num="03" title="Cashflow 30 jours" sub="Cash réel sorti vs entré">
        <div style={S.cashGrid}>
          <CashCard label="Cash sorti (ads)" value={`−${fmt(cashflow.sortie)}`} color={PALETTE.danger} />
          <CashCard label="Cash entré (livré)" value={`+${fmt(cashflow.entree)}`} color={PALETTE.win} />
          <CashCard label="Cash en transit" value={fmt(cashflow.transit)} color={PALETTE.warn} subtitle="Expédié, pas encore livré" />
          <CashCard label="Cash flow net" value={fmt(cashflow.netFlow)} color={cashflow.netFlow >= 0 ? PALETTE.win : PALETTE.danger} big />
          <CashCard label="ROI cash" value={`${cashflow.roi.toFixed(2)}x`} color={cashflow.roi >= 1.5 ? PALETTE.win : cashflow.roi >= 1 ? PALETTE.warn : PALETTE.danger} big />
        </div>
      </Section>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ═══════════════════════════════════════════════════════════════════════════════

function Hero({ label, value, subtitle, delta, color }) {
  return (
    <div style={S.hero}>
      <p style={S.heroLabel}>{label}</p>
      <p style={{ ...S.heroValue, color: color || PALETTE.textHi }}>{value}</p>
      {delta !== null && delta !== undefined && (
        <p style={{
          fontSize: 11, fontWeight: 600, margin: "6px 0 0",
          color: delta >= 0 ? PALETTE.win : PALETTE.danger,
          letterSpacing: "0.02em",
        }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs 7j précédents
        </p>
      )}
      {subtitle && <p style={S.heroSub}>{subtitle}</p>}
    </div>
  );
}

function Section({ num, title, sub, children }) {
  return (
    <div style={S.section}>
      <div style={S.sectionHead}>
        <div>
          <p style={S.sectionNum}>{num}</p>
          <h2 style={S.sectionTitle}>{title}</h2>
          {sub && <p style={S.sectionSub}>{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── PALETTE PREMIUM 2026 ─────────────────────────────────────────────────────
const COLORS = {
  scale:    "#4ade80",  // lime électrique
  optimize: "#a78bfa",  // violet vif
  test:     "#22d3ee",  // cyan néon
  repair:   "#fbbf24",  // amber doré
  stop:     "#fb7185",  // rose corail
};

const PALETTE = {
  bg:        "#0b0a14",      // fond très sombre teinté violet
  surface:   "#16142a",      // cards
  surface2:  "#1d1a36",      // cards hover
  border:    "#2a2647",      // borders
  borderHi:  "#3d3866",      // borders hover/active
  textHi:    "#fafaff",      // text primary
  text:      "#c4c1e0",      // text body
  textDim:   "#8b87b3",      // text secondary
  textMuted: "#5a567f",      // text tertiary
  accent:    "#a78bfa",      // violet (focus, sections)
  accentHi:  "#c4b5fd",      // violet vif (hover accent)
  cash:      "#22d3ee",      // cyan (cashflow)
  win:       "#4ade80",      // lime (gains)
  warn:      "#fbbf24",      // amber (warnings)
  danger:    "#fb7185",      // corail (pertes)
};

function Pill({ decision, colorKey }) {
  const c = COLORS[colorKey] || PALETTE.textDim;
  return (
    <span style={{
      display: "inline-block",
      padding: "4px 11px",
      borderRadius: 6,
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: c,
      background: `${c}18`,
      border: `1px solid ${c}50`,
      whiteSpace: "nowrap",
      boxShadow: `0 0 16px ${c}15`,
    }}>{decision}</span>
  );
}

function Funnel({ m }) {
  const steps = [
    { label: "Ads spend",  value: fmt(m.adsTotal), sub: `CPL réel ${fmt(m.cplReel)}`, fuite: m.fuiteEtape === "ads" },
    { label: "Leads",      value: m.totalLeads,    sub: null, fuite: false },
    { label: "Confirmés",  value: m.nbConfirmes,   sub: `${pct(m.tauxConf)} conv`, fuite: m.fuiteEtape === "confirmation" },
    { label: "Expédiés",   value: m.nbExpedies + m.nbLivres, sub: null, fuite: false },
    { label: "Livrés",     value: m.nbLivres,      sub: `${pct(m.tauxLivr)} livr · CA ${fmt(m.caLivre)}`, fuite: m.fuiteEtape === "livraison" },
  ];

  return (
    <div>
      <p style={{ color: PALETTE.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>
        Funnel COD
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
            <div style={{
              flex: 1,
              padding: "13px 16px",
              background: step.fuite
                ? `linear-gradient(90deg, ${PALETTE.danger}18 0%, ${PALETTE.danger}05 100%)`
                : PALETTE.surface2,
              border: `1px solid ${step.fuite ? PALETTE.danger + "60" : PALETTE.border}`,
              borderRadius: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: step.fuite ? `0 0 24px ${PALETTE.danger}15` : "none",
            }}>
              <div>
                <p style={{ color: PALETTE.textDim, fontSize: 11, fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {step.label}
                </p>
                {step.sub && <p style={{ color: PALETTE.textMuted, fontSize: 11, margin: "3px 0 0" }}>{step.sub}</p>}
              </div>
              <p style={{ color: PALETTE.textHi, fontSize: 20, fontWeight: 700, margin: 0, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                {step.value}
              </p>
            </div>
            {step.fuite && (
              <div style={{ display: "flex", alignItems: "center", color: PALETTE.danger, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
                ← FUITE
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CashCard({ label, value, color, subtitle, big }) {
  return (
    <div style={{
      padding: big ? "20px 22px" : "16px 18px",
      borderRadius: 12,
      background: `linear-gradient(180deg, ${PALETTE.surface2} 0%, ${PALETTE.surface} 100%)`,
      border: `1px solid ${PALETTE.border}`,
      boxShadow: big ? `0 0 24px ${color}10, 0 1px 0 rgba(255,255,255,0.03) inset` : "0 1px 0 rgba(255,255,255,0.03) inset",
    }}>
      <p style={{ color: PALETTE.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>
        {label}
      </p>
      <p style={{
        color: color || PALETTE.textHi,
        fontSize: big ? 28 : 20,
        fontWeight: 700,
        margin: 0,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.025em",
      }}>
        {value}
      </p>
      {subtitle && <p style={{ color: PALETTE.textMuted, fontSize: 11, margin: "5px 0 0" }}>{subtitle}</p>}
    </div>
  );
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function fmt(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const n = Math.round(v);
  return n.toLocaleString("fr-MA").replace(/\u00a0/g, " ") + " MAD";
}
function pct(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return (v * 100).toFixed(0) + "%";
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  page: {
    padding: "24px 20px",
    maxWidth: 1180,
    margin: "0 auto",
    fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
    color: PALETTE.textHi,
    background: PALETTE.bg,
    minHeight: "100vh",
    backgroundImage: "radial-gradient(ellipse at top, rgba(167,139,250,0.06), transparent 60%)",
  },

  // Zone 1 — Pouls
  zonePouls: {
    marginBottom: 24,
  },
  pulseGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 12,
  },
  hero: {
    padding: "18px 20px",
    background: `linear-gradient(180deg, ${PALETTE.surface} 0%, rgba(22,20,42,0.6) 100%)`,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: 12,
    boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.25)",
  },
  heroLabel: {
    color: PALETTE.textMuted,
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    margin: "0 0 8px",
  },
  heroValue: {
    fontSize: 30,
    fontWeight: 700,
    margin: 0,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.025em",
  },
  heroSub: {
    color: PALETTE.textMuted,
    fontSize: 11,
    margin: "4px 0 0",
  },

  // Alert bar
  alertBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 18px",
    background: `linear-gradient(90deg, rgba(251,113,133,0.12) 0%, rgba(251,113,133,0.04) 100%)`,
    border: `1px solid ${PALETTE.danger}40`,
    borderRadius: 12,
    boxShadow: `0 0 0 1px ${PALETTE.danger}10, 0 8px 32px rgba(251,113,133,0.08)`,
  },
  alertBtn: {
    padding: "7px 16px",
    borderRadius: 8,
    border: `1px solid ${PALETTE.danger}`,
    background: `${PALETTE.danger}15`,
    color: PALETTE.danger,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  },

  // Section
  section: {
    background: PALETTE.surface,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: 14,
    padding: "22px 24px 24px",
    marginBottom: 16,
    boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
  },
  sectionHead: {
    marginBottom: 20,
  },
  sectionNum: {
    fontSize: 10,
    color: PALETTE.accent,
    fontWeight: 700,
    letterSpacing: "0.12em",
    margin: "0 0 4px",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: PALETTE.textHi,
    margin: 0,
    letterSpacing: "-0.01em",
  },
  sectionSub: {
    fontSize: 12,
    color: PALETTE.textMuted,
    margin: "4px 0 0",
  },

  // Table
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    color: PALETTE.textMuted,
    fontWeight: 600,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    padding: "12px 12px 12px 16px",
    borderBottom: `1px solid ${PALETTE.border}`,
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: `1px solid ${PALETTE.border}50`,
    cursor: "pointer",
    transition: "background 0.12s",
    height: 46,
  },
  td: {
    padding: "11px 12px 11px 16px",
    color: PALETTE.text,
    verticalAlign: "middle",
  },
  tdR: {
    padding: "11px 12px",
    color: PALETTE.textDim,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  nomP: {
    fontWeight: 600,
    color: PALETTE.textHi,
    fontSize: 13,
  },

  // Drill
  drillGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
    gap: 24,
  },

  // Cashflow
  cashGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },

  // Loading
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 400,
  },
  spinner: {
    width: 30,
    height: 30,
    border: `2px solid ${PALETTE.border}`,
    borderTop: `2px solid ${PALETTE.accent}`,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  btnSm: {
    padding: "7px 14px",
    borderRadius: 8,
    border: `1px solid ${PALETTE.border}`,
    background: PALETTE.surface,
    color: PALETTE.text,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    marginTop: 12,
  },
};
