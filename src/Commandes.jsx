import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const STATUTS_CMD = [
  "À expédier", "Expédiée", "Injoignable", "Reportée",
  "Annulée", "Refusée", "Changement de dest",
  "Livrée", "Facturée",
  "Demande de retour", "Retour en cours", "Retour reçu"
];

const S_CMD = {
  "À expédier":         { color: "#2563EB", bg: "#EFF6FF", emoji: "📦" },
  "Expédiée":           { color: "#0891B2", bg: "#ECFEFF", emoji: "🚚" },
  "Injoignable":        { color: "#D97706", bg: "#FFFBEB", emoji: "📵" },
  "Reportée":           { color: "#7C3AED", bg: "#F5F3FF", emoji: "🔔" },
  "Annulée":            { color: "#DC2626", bg: "#FEF2F2", emoji: "❌" },
  "Refusée":            { color: "#DC2626", bg: "#FEF2F2", emoji: "🚫" },
  "Changement de dest": { color: "#D97706", bg: "#FFFBEB", emoji: "📍" },
  "Livrée":             { color: "#16A34A", bg: "#F0FDF4", emoji: "✅" },
  "Facturée":           { color: "#16A34A", bg: "#F0FDF4", emoji: "🧾" },
  "Demande de retour":  { color: "#D97706", bg: "#FFFBEB", emoji: "📝" },
  "Retour en cours":    { color: "#DC2626", bg: "#FEF2F2", emoji: "↩️" },
  "Retour reçu":        { color: "#7C3AED", bg: "#F5F3FF", emoji: "✅" },
};

const KPI_STATUTS_CMD = [
  { key: "À expédier",         label: "À expédier",   color: "#2563EB" },
  { key: "Expédiée",           label: "Expédiée",     color: "#0891B2" },
  { key: "Livrée",             label: "Livrée",       color: "#16A34A" },
  { key: "Facturée",           label: "Facturée",     color: "#16A34A" },
  { key: "Retour en cours",    label: "Retour cours", color: "#DC2626" },
  { key: "Demande de retour",  label: "Dem. retour",  color: "#D97706" },
  { key: "Retour reçu",        label: "Retour reçu",  color: "#7C3AED" },
  { key: "Injoignable",        label: "Injoignable",  color: "#D97706" },
  { key: "Reportée",           label: "Reportée",     color: "#7C3AED" },
  { key: "Refusée",            label: "Refusée",      color: "#DC2626" },
  { key: "Annulée",            label: "Annulée",      color: "#DC2626" },
  { key: "Changement de dest", label: "Chg. dest",    color: "#D97706" },
];

const TRANSPORTEURS = ["Sendit", "Digylog", "Ameex", "Autre"];
const WEBHOOK = "https://momtaz-webhook.onrender.com/api/lead/";
const STATUTS_LIVRAISON = ["Livrée", "Facturée"];
const STATUTS_RETOUR    = ["Retour reçu"];
const STATUTS_NEED_EXPEDITION = ["Expédiée", "En cours de livraison", "Livrée", "Facturée"];

function Modal({ onClose, onCreate }) {
  const [form, setForm] = useState({ client_nom: "", telephone: "", produit: "", ville: "", quantite: 1, prix: "", transporteur: "Sendit" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => { if (!form.client_nom || !form.telephone) return; await onCreate(form); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">Nouvelle commande</span><button className="btn-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group"><label className="form-label">Client *</label><input className="form-input" value={form.client_nom} onChange={e => set("client_nom", e.target.value)} placeholder="Nom complet" /></div>
            <div className="form-group"><label className="form-label">Téléphone *</label><input className="form-input" value={form.telephone} onChange={e => set("telephone", e.target.value)} placeholder="06XX XX XX XX" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Produit</label><input className="form-input" value={form.produit} onChange={e => set("produit", e.target.value)} placeholder="Nom du produit" /></div>
            <div className="form-group"><label className="form-label">Ville</label><input className="form-input" value={form.ville} onChange={e => set("ville", e.target.value)} placeholder="Casablanca" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Qté</label><input className="form-input" type="number" min="1" value={form.quantite} onChange={e => set("quantite", +e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Prix (MAD)</label><input className="form-input" type="number" value={form.prix} onChange={e => set("prix", e.target.value)} placeholder="299" /></div>
          </div>
          <div className="form-group">
            <label className="form-label">Transporteur</label>
            <select className="form-select" value={form.transporteur} onChange={e => set("transporteur", e.target.value)}>{TRANSPORTEURS.map(t => <option key={t}>{t}</option>)}</select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit}>Créer la commande</button>
        </div>
      </div>
    </div>
  );
}

export default function Commandes({ role, nom, navigate }) {
  const [commandes,    setCommandes]   = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [filtre,       setFiltre]      = useState("tous");
  const [search,       setSearch]      = useState("");
  const [selected,     setSelected]    = useState(null);
  const [showModal,    setShowModal]   = useState(false);
  const [saving,       setSaving]      = useState(false);

  // Champs panneau droit
  const [newStatut,    setNewStatut]   = useState("");
  const [transporteur, setTransporteur]= useState("");
  const [trackingVal,  setTrackingVal] = useState("");
  const [fraisLivr,    setFraisLivr]  = useState("");
  const [fraisRet,     setFraisRet]   = useState("");
  const [fraisEmb,     setFraisEmb]   = useState("");
  const [dateStatut,   setDateStatut] = useState(new Date().toISOString().split("T")[0]);

  const [errors, setErrors] = useState({});
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!role) return;
    fetchCommandes();
    const ch = supabase.channel("commandes-rt4")
      .on("postgres_changes", { event: "*", schema: "public", table: "commandes" }, fetchCommandes)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [role, nom]);

  async function fetchCommandes() {
    let q = supabase.from("commandes").select("*").order("created_at", { ascending: false });
    if (role !== "admin") q = q.eq("conseillere", nom);
    const { data, error } = await q;
    if (!error) setCommandes(data);
    setLoading(false);
  }

  async function selectCommande(c) {
    setSelected(c);
    setNewStatut(c.statut);
    setTransporteur(c.transporteur || "Sendit");
    setTrackingVal(c.tracking || "");
    setFraisLivr(c.frais_livraison || "");
    setFraisRet(c.frais_retour || "");
    setFraisEmb(c.frais_emballage_stockage || "");
    setErrors({});
    setDateStatut(new Date().toISOString().split("T")[0]);
    setEvents([]);
    const { data } = await supabase
      .from("commande_events")
      .select("*")
      .eq("commande_id", c.id)
      .order("created_at", {
