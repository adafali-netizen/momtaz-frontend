import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const C = {
  purple: { bg: "#EEEDFE", border: "#AFA9EC", text: "#534AB7", dark: "#3C3489" },
  green:  { bg: "#EAF3DE", border: "#97C459", text: "#3B6D11", dark: "#27500A" },
  amber:  { bg: "#FAEEDA", border: "#EF9F27", text: "#854F0B", dark: "#633806" },
  red:    { bg: "#FCEBEB", border: "#F09595", text: "#A32D2D", dark: "#791F1F" },
  slate:  { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b", dark: "#1e293b" },
};

function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }

function ProgressBar({ value, max = 100, color = "#534AB7", thin = false }) {
  const w = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ height: thin ? 3 : 5, background: "#f1f5f9", borderRadius: 99, overflow: "hidden", marginTop: thin ? 4 : 6 }}>
      <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99, transition: "width .4s ease" }} />
    </div>
  );
}

function KpiHero({ value, label, sub, color = C.slate, large = false, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: `0.5px solid ${color.border}`,
        borderRadius: 12,
        padding: large ? "22px 24px" : "16px 20px",
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: large ? 110 : 90,
        transition: "box-shadow .15s",
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: color.text }}>{label}</div>
      <div style={{ fontSize: large ? 42 : 28, fontWeight: 700, color: color.dark, lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard({ role, nom, setModule }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      let q = supabase.from("leads").select("*");
      if (role !== "admin") q = q.eq("conseillere", nom);
      const { data } = await q;
      if (data) setLeads(data);
      setLoading(false);
    };
    load();
  }, []);

  const count = s => leads.filter(l => l.statut === s).length;
  const today = new Date().toDateString();
  const todayLeads = leads.filter(l => new Date(l.created_at).toDateString() === today);
  const rappels = leads.filter(l => l.statut === "Demande de rappel").length;
  const tauxConf = pct(count("Confirmé"), leads.length);
  const confColor = tauxConf >= 40 ? C.green : tauxConf >= 25 ? C.amber : C.red;

  // Top produits
  const prodMap = {};
  leads.filter(l => l.produit).forEach(l => {
    if (!prodMap[l.produit]) prodMap[l.produit] = { total: 0, conf: 0 };
    prodMap[l.produit].total++;
    if (l.statut === "Confirmé") prodMap[l.produit].conf++;
  });
  const topProduits = Object.entries(prodMap)
    .sort((a, b) => b[1].conf - a[1].conf)
    .slice(0, 5);
  const maxConf = topProduits[0]?.[1].conf || 1;

  // Conseillères
  const consMap = {};
  leads.forEach(l => {
    if (!l.conseillere) return;
    if (!consMap[l.conseillere]) consMap[l.conseillere] = { total: 0, conf: 0 };
    consMap[l.conseillere].total++;
    if (l.statut === "Confirmé") consMap[l.conseillere].conf++;
  });
  const consStats = Object.entries(consMap)
    .map(([n, s]) => ({ nom: n, ...s, taux: pct(s.conf, s.total) }))
    .sort((a, b) => b.taux - a.taux)
    .slice(0, 5);

  const now = new Date();
  const dateLabel = now.toLocaleDateString("fr", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "#94a3b8", fontSize: 14 }}>
      Chargement…
    </div>
  );

  return (
    <div style={{ fontFamily: "var(--font-sans, system-ui)", padding: "0 0 48px", maxWidth: "100%" }}>

      {/* ── Topbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 24px", borderBottom: "0.5px solid #e2e8f0", marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Vue d'ensemble</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, textTransform: "capitalize" }}>{dateLabel}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {rappels > 0 && (
            <div
              onClick={() => setModule("leads")}
              style={{ display: "flex", alignItems: "center", gap: 6, background: C.amber.bg, border: `0.5px solid ${C.amber.border}`, borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 600, color: C.amber.dark, cursor: "pointer" }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber.text, display: "inline-block" }} />
              {rappels} rappel{rappels > 1 ? "s" : ""} en attente
            </div>
          )}
          <button
            onClick={() => setModule("dashboard-analytique")}
            style={{ padding: "6px 14px", border: "0.5px solid #AFA9EC", borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.purple.dark, background: C.purple.bg, cursor: "pointer" }}
          >
            Cockpit analytique →
          </button>
        </div>
      </div>

      {/* ── KPI Hero ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
        {/* Grande carte héro */}
        <div style={{ background: "#fff", border: `1.5px solid ${C.purple.border}`, borderRadius: 14, padding: "24px 28px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 130 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: C.purple.text }}>Total leads</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>cumul global</div>
          </div>
          <div style={{ fontSize: 56, fontWeight: 800, color: C.purple.dark, lineHeight: 1, margin: "8px 0 4px" }}>{leads.length}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              Aujourd'hui : <span style={{ fontWeight: 700, color: "#0f172a" }}>{todayLeads.length}</span>
            </div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              Confirmés : <span style={{ fontWeight: 700, color: C.green.dark }}>{count("Confirmé")}</span>
            </div>
          </div>
        </div>

        {/* Taux confirmation */}
        <div style={{ background: "#fff", border: `0.5px solid ${confColor.border}`, borderRadius: 12, padding: "18px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 130 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: confColor.text }}>Taux conf.</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: confColor.dark, lineHeight: 1 }}>{tauxConf}%</div>
          <div>
            <ProgressBar value={tauxConf} color={confColor.text} />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Seuil bon &gt; 40%</div>
          </div>
        </div>

        {/* À appeler */}
        <KpiHero
          value={count("À appeler")}
          label="À appeler"
          sub="En attente de traitement"
          color={count("À appeler") > 10 ? C.amber : C.slate}
          onClick={() => setModule("leads")}
        />

        {/* Annulés */}
        <KpiHero
          value={count("Annulé")}
          label="Annulés"
          sub="Total période"
          color={count("Annulé") > 20 ? C.red : C.slate}
          onClick={() => setModule("leads")}
        />

        {/* Rappels */}
        <KpiHero
          value={rappels}
          label="Rappels"
          sub="Demandes actives"
          color={rappels > 4 ? C.amber : C.slate}
          onClick={() => setModule("leads")}
        />
      </div>

      {/* ── Corps : 3 colonnes ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 20 }}>

        {/* Colonne 1 : Top Produits (plus large) */}
        <div
          style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", cursor: "pointer" }}
          onClick={() => setModule("produits")}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Top produits</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Classés par confirmations</div>
            </div>
            <span style={{ fontSize: 12, color: C.purple.text, fontWeight: 600 }}>Voir tout →</span>
          </div>

          {topProduits.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 13, padding: "12px 0" }}>Aucune donnée produit</div>
          ) : topProduits.map(([nom, s], i) => {
            const t = pct(s.conf, s.total);
            const barColor = t >= 40 ? C.green.text : t >= 25 ? C.amber.text : C.red.text;
            return (
              <div key={nom} style={{ marginBottom: i < topProduits.length - 1 ? 14 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", width: 16 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={nom}>{nom}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{s.conf}/{s.total}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: barColor, minWidth: 34, textAlign: "right" }}>{t}%</span>
                  </div>
                </div>
                <ProgressBar value={s.conf} max={maxConf} color={barColor} thin />
              </div>
            );
          })}
        </div>

        {/* Colonne 2 : Conseillères */}
        <div
          style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", cursor: "pointer" }}
          onClick={() => setModule("leads")}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Conseillères</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Performance confirmation</div>
            </div>
            <span style={{ fontSize: 12, color: C.purple.text, fontWeight: 600 }}>Leads →</span>
          </div>

          {consStats.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 13, padding: "12px 0" }}>Aucune donnée</div>
          ) : consStats.map((c, i) => {
            const color = c.taux >= 40 ? C.green : c.taux >= 25 ? C.amber : C.red;
            return (
              <div key={c.nom} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: i < consStats.length - 1 ? "0.5px solid #f1f5f9" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: color.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: color.dark, flexShrink: 0 }}>
                    {c.nom.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{c.nom}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.total} leads</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: color.dark }}>{c.taux}%</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.conf} conf.</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Colonne 3 : Stock + Ads empilés */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Stock */}
          <div
            style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: "18px 22px", cursor: "pointer", flex: 1 }}
            onClick={() => setModule("produits")}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Stock</div>
              <span style={{ fontSize: 12, color: C.purple.text, fontWeight: 600 }}>Produits →</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: C.green.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.green.dark }}>Aucune alerte stock</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>Tous les niveaux sont normaux</div>
              </div>
            </div>
          </div>

          {/* Ads */}
          <div
            style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: "18px 22px", cursor: "pointer", flex: 1 }}
            onClick={() => setModule("ads")}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Ads</div>
              <span style={{ fontSize: 12, color: C.purple.text, fontWeight: 600 }}>Gérer →</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: C.purple.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.purple.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>Aucune campagne</div>
                <div style={{ fontSize: 12, color: C.purple.text, marginTop: 1, fontWeight: 500 }}>Ajouter une dépense →</div>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
