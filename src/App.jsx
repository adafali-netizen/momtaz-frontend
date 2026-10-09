import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import Layout from "./Layout";
import Dashboard from "./Dashboard";
import Leads from "./Leads";
import Commandes from "./Commandes";
import Produits from "./Produits";
import Ads from "./Ads";
import StockHistorique from "./StockHistorique";
import DashboardAnalytique from "./DashboardAnalytique";
import ReleveBancaire from "./Finances";
import PaiementsConseilleres from "./pages/PaiementsConseilleres";
import Veille from "./Veille";
import "./App.css";

const VALID_MODULES = ["dashboard", "leads", "commandes", "produits", "ads", "stock-historique", "finances", "releve-bancaire", "dashboard-analytique", "paiements-conseilleres", "veille"];

// Modules accessibles par rôle. Une conseillère ne voit que ses leads, ses commandes et ses paiements.
const MODULES_CONSEILLERE = ["leads", "commandes", "paiements-conseilleres"];

function allowedModules(role) {
  return role === "admin" ? VALID_MODULES : MODULES_CONSEILLERE;
}

function defaultModule(role) {
  return role === "admin" ? "dashboard" : "leads";
}

function getModuleFromHash() {
  const hash = window.location.hash.replace("#", "");
  return VALID_MODULES.includes(hash) ? hash : "dashboard";
}

export default function App() {
  const [session,      setSession]      = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [module,       setModule]       = useState(getModuleFromHash);
  const [moduleParams, setModuleParams] = useState({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onHashChange = () => setModule(getModuleFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(mod, params = {}) {
    setModule(mod);
    setModuleParams(params);
    window.location.hash = mod;
  }

  // Le rôle vient de app_metadata : ce champ n'est modifiable que côté serveur (SQL ou clé service).
  // user_metadata est modifiable par l'utilisateur lui-même, il ne doit jamais porter un droit.
  const role = session?.user?.app_metadata?.role === "admin" ? "admin" : "conseillere";
  const nom  = session?.user?.app_metadata?.nom || session?.user?.user_metadata?.nom || session?.user?.email;
  const allowed = allowedModules(role);
  const activeModule = allowed.includes(module) ? module : defaultModule(role);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    window.location.hash = "";
  };

  if (authLoading) return <div className="loading-screen"><span className="loading-dot" />Connexion...</div>;
  if (!session)    return <Login />;

  const MODULES = {
    dashboard:                  Dashboard,
    leads:                      Leads,
    commandes:                  Commandes,
    produits:                   Produits,
    ads:                        Ads,
    "stock-historique":         StockHistorique,
    "finances":                 ReleveBancaire,
    "releve-bancaire":          ReleveBancaire,
    "dashboard-analytique":     DashboardAnalytique,
    "paiements-conseilleres":   PaiementsConseilleres,
    veille:                     Veille,
  };

  const Active = MODULES[activeModule];

  return (
    <Layout
      currentModule={activeModule}
      setModule={mod => navigate(mod)}
      allowedModules={allowed}
      role={role}
      nom={nom}
      onLogout={handleLogout}
    >
      <Active
        role={role}
        nom={nom}
        params={moduleParams}
        navigate={navigate}
        setModule={mod => navigate(mod)}
      />
    </Layout>
  );
}
