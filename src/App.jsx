import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import Layout from "./Layout";
import Dashboard from "./modules/Dashboard";
import Leads from "./modules/Leads";
import Commandes from "./modules/Commandes";
import Produits from "./modules/Produits";
import Stock from "./modules/Stock";
import Ads from "./modules/Ads";
import "./App.css";

export default function App() {
  const [session, setSession]         = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [module, setModule]           = useState("dashboard");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const role = session?.user?.user_metadata?.role || "conseillere";
  const nom  = session?.user?.user_metadata?.nom  || session?.user?.email;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (authLoading) return <div className="loading-screen"><span className="loading-dot" />Connexion...</div>;
  if (!session)    return <Login />;

  const MODULES = { dashboard: Dashboard, leads: Leads, commandes: Commandes, produits: Produits, stock: Stock, ads: Ads };
  const Active  = MODULES[module] || Dashboard;

  return (
    <Layout
      currentModule={module}
      setModule={setModule}
      role={role}
      nom={nom}
      onLogout={handleLogout}
    >
      <Active role={role} nom={nom} setModule={setModule} />
    </Layout>
  );
}
