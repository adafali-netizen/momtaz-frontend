import { useState } from "react";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "leads",     label: "Leads",     icon: "👥" },
  { id: "commandes", label: "Commandes", icon: "📦" },
  { id: "produits",  label: "Produits",  icon: "🏷️" },
  { id: "ads",       label: "Ads",       icon: "📣" },
  { id: "dashboard-analytique", label: "Analytique", icon: "📈" },
];

const PAGE_TITLES = {
  dashboard:          { title: "Dashboard",        sub: "Vue d'ensemble de l'activité" },
  leads:              { title: "Leads",            sub: "Qui appeler maintenant ?" },
  commandes:          { title: "Commandes",        sub: "Quoi expédier, livrer, retourner ?" },
  produits:           { title: "Produits",         sub: "Coûts, stock et décisions" },
  "stock-historique": { title: "Historique stock", sub: "Tous les mouvements" },
  ads:                { title: "Ads",              sub: "Où part l'argent ?" },
  "dashboard-analytique": { title: "Dashboard Analytique", sub: "CPL MAX, marge nette, décisions" },
};

export default function Layout({ currentModule, setModule, role, nom, onLogout, children }) {
  const page      = PAGE_TITLES[currentModule] || PAGE_TITLES.dashboard;
  const today     = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const activeNav = currentModule === "stock-historique" ? "produits" : currentModule;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">M</div>
          <span className="logo-name">Momtaz</span>
          <span className="logo-version">v3</span>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>
          {NAV.map(item => (
            <button
              key={item.id}
              className={`nav-item${activeNav === item.id ? " active" : ""}`}
              onClick={() => setModule(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <div className="nav-divider" />
          <button className="nav-item" onClick={() => setModule("parametres")}>
            <span className="nav-icon">⚙️</span>
            Paramètres
          </button>
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-page-title">{page.title}</div>
            <span className="topbar-date">{today}</span>
          </div>
          <div className="topbar-right">
            <div className="user-pill">
              <span className={`role-badge${role === "admin" ? " admin" : ""}`}>
                {role === "admin" ? "👑 Admin" : "Agent"}
              </span>
              <span className="user-name">{nom}</span>
            </div>
            <button className="btn-logout" onClick={onLogout}>Déconnexion</button>
          </div>
        </header>
        <div className="module-view">
          <div className="module-content">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
