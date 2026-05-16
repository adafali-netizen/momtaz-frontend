import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Dashboard({ role, nom, setModule }) {
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    const fetch = async () => {
      let q = supabase.from("leads").select("*");
      if (role !== "admin") q = q.eq("conseillere", nom);
      const { data } = await q;
      if (data) setLeads(data);
    };
    fetch();
  }, []);

  const count = s => leads.filter(l => l.statut === s).length;
  const today = new Date().toDateString();
  const todayLeads = leads.filter(l => new Date(l.created_at).toDateString() === today);

  const rappelsRetard = leads.filter(l => l.statut === "Demande de rappel").length;
  const hasAlerts = rappelsRetard > 4;

  // Top produits par volume leads confirmés
  const produitMap = {};
  leads.filter(l => l.produit).forEach(l => {
    if (!produitMap[l.produit]) produitMap[l.produit] = { total: 0, confirms: 0 };
    produitMap[l.produit].total++;
    if (l.statut === "Confirmé") produitMap[l.produit].confirms++;
  });
  const topProduits = Object.entries(produitMap)
    .sort((a, b) => b[1].confirms - a[1].confirms)
    .slice(0, 4);

  // Conseillères perf
  const consMap = {};
  leads.forEach(l => {
    if (!l.conseillere) return;
    if (!consMap[l.conseillere]) consMap[l.conseillere] = { total: 0, conf: 0 };
    consMap[l.conseillere].total++;
    if (l.statut === "Confirmé") consMap[l.conseillere].conf++;
  });
  const consStats = Object.entries(consMap)
    .sort((a, b) => b[1].conf - a[1].conf)
    .slice(0, 4);

  const tauxConf = leads.length > 0 ? Math.round((count("Confirmé") / leads.length) * 100) : 0;

  return (
    <div className="dashboard-content">

      {/* Alerte */}
      {hasAlerts && (
        <div className="alert-banner warning">
          ⚠️ {rappelsRetard} rappels en attente ·{" "}
          <span onClick={() => setModule("leads")} style={{ cursor: "pointer", textDecoration: "underline", fontWeight: 700 }}>
            Voir les leads →
          </span>
        </div>
      )}

      {/* KPI Hero */}
      <div className="kpi-hero">
        <div className="kpi-hero-card">
          <div className="kpi-hero-value">{leads.length}</div>
          <div className="kpi-hero-label">Total leads</div>
        </div>
        <div className="kpi-hero-card">
          <div className="kpi-hero-value">{todayLeads.length}</div>
          <div className="kpi-hero-label">Leads aujourd'hui</div>
        </div>
        <div className={`kpi-hero-card${tauxConf >= 40 ? " good" : tauxConf >= 25 ? "" : " warn"}`}>
          <div className="kpi-hero-value">{tauxConf}%</div>
          <div className="kpi-hero-label">Taux confirmation</div>
        </div>
        <div className="kpi-hero-card good">
          <div className="kpi-hero-value">{count("Confirmé")}</div>
          <div className="kpi-hero-label">Confirmés total</div>
        </div>
        <div className={`kpi-hero-card${count("À appeler") > 10 ? " warn" : ""}`}>
          <div className="kpi-hero-value">{count("À appeler")}</div>
          <div className="kpi-hero-label">À appeler</div>
        </div>
        <div className={`kpi-hero-card${count("Annulé") > 20 ? " alert" : ""}`}>
          <div className="kpi-hero-value">{count("Annulé")}</div>
          <div className="kpi-hero-label">Annulés</div>
        </div>
      </div>

      {/* Grid 2x2 */}
      <div className="dashboard-grid">

        {/* Top produits */}
        <div className="dash-block" onClick={() => setModule("produits")}>
          <div className="dash-block-title">
            🏷️ Top Produits
            <span className="dash-block-arrow">→</span>
          </div>
          {topProduits.length === 0 ? (
            <div style={{ color: "var(--muted2)", fontSize: 13 }}>Aucune donnée</div>
          ) : topProduits.map(([nom, s]) => (
            <div key={nom} className="dash-row">
              <span className="dash-row-label">{nom}</span>
              <span className="dash-row-value">{s.conf} confirmés / {s.total}</span>
            </div>
          ))}
        </div>

        {/* Conseillères */}
        <div className="dash-block" onClick={() => setModule("leads")}>
          <div className="dash-block-title">
            👥 Conseillères
            <span className="dash-block-arrow">→</span>
          </div>
          {consStats.length === 0 ? (
            <div style={{ color: "var(--muted2)", fontSize: 13 }}>Aucune donnée</div>
          ) : consStats.map(([n, s]) => (
            <div key={n} className="dash-row">
              <span className="dash-row-label">{n}</span>
              <span className="dash-row-value">{s.total > 0 ? Math.round(s.conf / s.total * 100) : 0}% conf · {s.total} leads</span>
            </div>
          ))}
        </div>

        {/* Stock */}
        <div className="dash-block" onClick={() => setModule("stock")}>
          <div className="dash-block-title">
            🏪 Stock
            <span className="dash-block-arrow">→</span>
          </div>
          <div style={{ color: "var(--muted2)", fontSize: 13, lineHeight: 1.6 }}>
            Aucune alerte stock.<br />
            <span style={{ color: "var(--blue)", cursor: "pointer" }} onClick={() => setModule("stock")}>
              Gérer le stock →
            </span>
          </div>
        </div>

        {/* Ads */}
        <div className="dash-block" onClick={() => setModule("ads")}>
          <div className="dash-block-title">
            📣 Ads
            <span className="dash-block-arrow">→</span>
          </div>
          <div style={{ color: "var(--muted2)", fontSize: 13, lineHeight: 1.6 }}>
            Aucune campagne enregistrée.<br />
            <span style={{ color: "var(--blue)", cursor: "pointer" }} onClick={() => setModule("ads")}>
              Ajouter une dépense →
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
