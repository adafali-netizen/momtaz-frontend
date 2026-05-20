import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import Layout from "./Layout";
import Dashboard from "./Dashboard";
import Leads from "./Leads";
import Commandes from "./Commandes";
import Produits from "./Produits";
import Stock from "./Stock";
import Ads from "./Ads";
import StockHistorique from "./StockHistorique";
import "./App.css";

export default function App() {
  const [session,     setSession]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [module,      setModule]      = useState("dashboard");
  const [moduleParams,setModuleParams]= useState({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Navigation centralisée avec params optionnels
  function navigate(mod, params = {}) {
    setModule(mod);
    setModuleParams(params);
  }

  const role = session?.user?.user_metadata?.role || "conseillere";
  const nom  = session?.user?.user_metadata?.nom  || session?.user?.email;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (authLoading) return <div className="loading-screen"><span className="loading-dot" />Connexion...</div>;
  if (!session)    return <Login />;

  const MODULES = {
    dashboard:        Dashboard,
    leads:            Leads,
    commandes:        Commandes,
    produits:         Produits,
    stock:            Stock,
    ads:              Ads,
    "stock-historique": StockHistorique,
  };

  const Active = MODULES[module] || Dashboard;

  return (
    <Layout
      currentModule={module}
      setModule={mod => navigate(mod)}
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
