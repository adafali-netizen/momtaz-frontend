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

export default function Commandes() {
  const [commandes, setCommandes] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filtre,    setFiltre]    = useState("tous");
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [tracking,  setTracking]  = useState({});
  const [saving,    setSaving]    = useState(false);
  const [fraisLivr, setFraisLivr] = useState("");
  const [fraisRet,  setFraisRet]  = useState("");

  useEffect(() => {
    fetchCommandes();
    const ch = supabase.channel("commandes-rt3")
      .on("postgres_changes", { event: "*", schema: "public", table: "commandes" }, fetchCommandes)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchCommandes() {
    const { data, error } = await supabase.from("commandes").select("*").order("created_at", { ascending: false });
    if (!error) setCommandes(data);
    setLoading(false);
  }

  async function createCommande(form) {
    await supabase.from("commandes").insert([{ client_nom: form.client_nom, telephone: form.telephone, produit: form.produit, ville: form.ville, quantite: form.quantite, prix: form.prix || null, transporteur: form.transporteur, statut: "À expédier" }]);
  }

  async function updateStatut(id, statut) {
    setSaving(true);
    const updates = { statut };
    if (statut === "Expédiée") updates.date_expedition = new Date().toISOString();
    if (statut === "Livrée" || statut === "Facturée") updates.date_livraison = new Date().toISOString();
    if (statut === "Retour reçu") updates.date_retour = new Date().toISOString();
    if (STATUTS_LIVRAISON.includes(statut) && fraisLivr) {
      updates.frais_livraison = +fraisLivr;
      const cmd = commandes.find(c => c.id === id);
      await supabase.from("releve_bancaire").insert([{ date: new Date().toISOString().split("T")[0], mois: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), mode_paiement: cmd?.transporteur || "—", categorie: "Logistique", intitule: "Frais livraison", debit: +fraisLivr, commande_id: id, produit: cmd?.produit || null, observation: `CMD ${id.slice(0, 8)}` }]);
    }
    if (STATUTS_RETOUR.includes(statut) && fraisRet) {
      updates.frais_retour = +fraisRet;
      const cmd = commandes.find(c => c.id === id);
      await supabase.from("releve_bancaire").insert([{ date: new Date().toISOString().split("T")[0], mois: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), mode_paiement: cmd?.transporteur || "—", categorie: "Logistique", intitule: "Frais retour", debit: +fraisRet, commande_id: id, produit: cmd?.produit || null, observation: `CMD ${id.slice(0, 8)}` }]);
    }
    await supabase.from("commandes").update(updates).eq("id", id);
    try { await fetch(WEBHOOK + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }); } catch {}
    if (selected?.id === id) setSelected(s => ({ ...s, ...updates }));
    setFraisLivr(""); setFraisRet("");
    setSaving(false);
  }

  async function saveTracking(id) {
    const val = tracking[id] || "";
    await supabase.from("commandes").update({ tracking: val }).eq("id", id);
    if (selected?.id === id) setSelected(s => ({ ...s, tracking: val }));
  }

  const total  = commandes.length;
  const cnt    = s => commandes.filter(c => c.statut === s).length;
  const pct    = s => total > 0 ? Math.round((cnt(s) / total) * 100) : 0;
  const livrees  = cnt("Livrée") + cnt("Facturée");
  const tauxLivr = total > 0 ? Math.round((livrees / total) * 100) : 0;
  const retours  = cnt("Retour en cours") + cnt("Demande de retour");

  const heroColor  = tauxLivr >= 60 ? "#16A34A" : tauxLivr >= 45 ? "#D97706" : total > 0 ? "#DC2626" : "#CBD5E1";
  const heroBg     = tauxLivr >= 60 ? "#F0FDF4" : tauxLivr >= 45 ? "#FFFBEB" : total > 0 ? "#FEF2F2" : "#fff";
  const heroBorder = tauxLivr >= 60 ? "#BBF7D0" : tauxLivr >= 45 ? "#FDE68A" : total > 0 ? "#FECACA" : "#E2E8F0";
  const heroIcon   = tauxLivr >= 60 ? "✓" : tauxLivr >= 45 ? "~" : total > 0 ? "!" : "—";
  const heroIconBg = tauxLivr >= 60 ? "#DCFCE7" : tauxLivr >= 45 ? "#FEF3C7" : total > 0 ? "#FEE2E2" : "#F1F5F9";

  const kpiStatutsTries = [...KPI_STATUTS_CMD]
    .map(s => ({ ...s, n: cnt(s.key), p: pct(s.key) }))
    .sort((a, b) => b.p - a.p || b.n - a.n);

  const filtered = commandes.filter(c => {
    const matchFiltre = filtre === "tous" ? c.statut !== "Annulée" : c.statut === filtre;
    if (!matchFiltre) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (c.client_nom||"").toLowerCase().includes(q) || (c.telephone||"").includes(q) || (c.ville||"").toLowerCase().includes(q) || (c.produit||"").toLowerCase().includes(q) || (c.tracking||"").toLowerCase().includes(q);
  });

  return (
    <>
      {retours > 0 && (
        <div style={{ margin: "16px 24px 0", padding: "10px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 13, color: "#DC2626", fontWeight: 600 }}>
          🔴 {retours} retour{retours > 1 ? "s" : ""} en cours
        </div>
      )}

      {/* ══ BANDEAU KPI ══ */}
      <div style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "20px 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }}>

          {/* HÉRO */}
          <div style={{ padding: "28px 32px", minWidth: 200, height: 130, background: heroBg, border: `1px solid ${heroBorder}`, borderTop: `4px solid ${heroColor}`, borderRadius: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box" }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#94A3B8" }}>Taux de livraison</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
              <span style={{ fontSize: 64, fontWeight: 800, color: heroColor, fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>{tauxLivr}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: heroColor, paddingBottom: 9 }}>%</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: heroIconBg, fontSize: 10, color: heroColor, fontWeight: 700 }}>{heroIcon}</span>
              <span style={{ fontSize: 11, color: "#64748B" }}>{livrees} livrées / {total}</span>
            </div>
          </div>

          <div style={{ width: 1, background: "#E2E8F0", margin: "8px 0", alignSelf: "stretch" }} />

          {/* TOTAL — reset filtre */}
          <div
            onClick={() => setFiltre("tous")}
            style={{ padding: "24px 28px", minWidth: 140, height: 130, background: filtre === "tous" ? "#F0F7FF" : "#fff", border: `1px solid ${filtre === "tous" ? "#BFDBFE" : "#E2E8F0"}`, borderRadius: 16, boxShadow: filtre === "tous" ? "0 0 0 3px #2563EB15" : "0 4px 12px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box", cursor: "pointer", transition: "all .15s" }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#94A3B8" }}>Total</div>
            <div style={{ fontSize: 42, fontWeight: 800, color: filtre === "tous" ? "#2563EB" : "#0F172A", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>{total}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{filtre === "tous" ? "✓ Tous affichés" : "Cliquer pour tout voir"}</div>
          </div>

          <div style={{ width: 1, background: "#E2E8F0", margin: "8px 0", alignSelf: "stretch" }} />

          {/* STATUTS */}
          <div style={{ display: "flex", gap: 10, alignItems: "stretch", flex: 1, flexWrap: "wrap" }}>
            {kpiStatutsTries.filter(s => s.n > 0).map(s => {
              const isActive = filtre === s.key;
              return (
                <div key={s.key} onClick={() => setFiltre(isActive ? "tous" : s.key)} style={{ padding: "20px 18px", minWidth: 88, height: 130, background: isActive ? s.color + "12" : "#fff", border: `1px solid ${isActive ? s.color : "#E2E8F0"}`, borderLeft: `4px solid ${s.color}`, borderRadius: 14, boxShadow: isActive ? `0 0 0 3px ${s.color}20` : "0 2px 8px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box", cursor: "pointer", transition: "all .15s" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: s.color + "99", whiteSpace: "nowrap" }}>{s.label}</div>
<div style={{ fontSize: 32, fontWeight: 800, color: s.color, fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>{s.p}<span style={{ fontSize: 16, fontWeight: 700 }}>%</span></div>
<div style={{ fontSize: 13, color: s.color + "99", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{s.n} leads</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ BARRE RECHERCHE ══ */}
      <div style={{ background: "#fff", borderBottom: "2px solid #E2E8F0", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", padding: "12px 24px", flexShrink: 0, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#94A3B8", pointerEvents: "none" }}>🔍</span>
          <input
            style={{ width: "100%", padding: "9px 14px 9px 36px", background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, color: "#0F172A", outline: "none", boxSizing: "border-box", transition: "border-color .15s", fontFamily: "inherit" }}
            placeholder="Rechercher par client, téléphone, ville, produit, tracking..."
            value={search} onChange={e => setSearch(e.target.value)}
            onFocus={e => e.target.style.borderColor = "#2563EB"}
            onBlur={e => e.target.style.borderColor = "#E2E8F0"}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
          )}
        </div>
        <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: "auto", whiteSpace: "nowrap" }}>
          {filtered.length} commande{filtered.length > 1 ? "s" : ""}
          {filtre !== "tous" && <span style={{ marginLeft: 6, fontSize: 11, color: "#2563EB", fontWeight: 600 }}>· filtre actif</span>}
        </span>
        <button onClick={() => setShowModal(true)} style={{ padding: "8px 16px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          + Commande
        </button>
      </div>

      {/* ══ CONTENU ══ */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48, gap: 10, color: "#94A3B8", fontSize: 13 }}>
          <div style={{ width: 22, height: 22, border: "2px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
          Chargement...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 12, textAlign: "center" }}>
          <div style={{ fontSize: 40, opacity: .4 }}>📦</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aucune commande</div>
          <div style={{ fontSize: 13, color: "#94A3B8" }}>Les commandes apparaissent automatiquement quand un lead est confirmé</div>
          <button style={{ padding: "10px 20px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => setShowModal(true)}>+ Commande manuelle</button>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Client</th><th>Téléphone</th><th>Produit</th><th>Ville</th><th>Transporteur</th><th>Tracking</th><th>Frais livr.</th><th>Statut</th><th>Créé le</th></tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const m = S_CMD[c.statut] || {};
                  return (
                    <tr key={c.id} className={selected?.id === c.id ? "selected" : ""} onClick={() => { setSelected(c); setFraisLivr(c.frais_livraison || ""); setFraisRet(c.frais_retour || ""); }}>
                      <td style={{ fontWeight: 600 }}>{c.client_nom || "—"}</td>
                      <td className="col-mono">{c.telephone}</td>
                      <td>{c.produit || "—"}</td>
                      <td className="col-muted">{c.ville || "—"}</td>
                      <td className="col-muted">{c.transporteur || "—"}</td>
                      <td className="col-mono col-muted">{c.tracking || "—"}</td>
                      <td className="col-mono">{c.frais_livraison ? `${c.frais_livraison} MAD` : <span style={{ color: "#CBD5E1" }}>—</span>}</td>
                      <td><span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: m.color, background: m.bg, border: `1px solid ${m.color}33`, whiteSpace: "nowrap" }}>{m.emoji} {c.statut}</span></td>
                      <td className="col-muted">{c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selected && (
            <aside style={{ width: 320, flexShrink: 0, background: "#fff", borderLeft: "1px solid #E2E8F0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #E2E8F0", background: "#FAFAFA", flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>{selected.client_nom || "Sans nom"}</div>
                  <button onClick={() => setSelected(null)} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, color: "#64748B", fontSize: 16, cursor: "pointer", padding: "2px 8px", lineHeight: 1 }}>×</button>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, color: S_CMD[selected.statut]?.color, background: S_CMD[selected.statut]?.bg, border: `1px solid ${S_CMD[selected.statut]?.color}33`, marginBottom: 10 }}>
                  {S_CMD[selected.statut]?.emoji} {selected.statut}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 14, color: "#2563EB", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>📞 {selected.telephone}</div>
                  {selected.ville   && <div style={{ fontSize: 12, color: "#64748B" }}>📍 {selected.ville}</div>}
                  {selected.produit && <div style={{ fontSize: 12, color: "#64748B" }}>🛒 {selected.produit} × {selected.quantite || 1}</div>}
                  {selected.prix    && <div style={{ fontSize: 12, color: "#64748B" }}>💰 {selected.prix} MAD</div>}
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                {(STATUTS_LIVRAISON.includes(selected.statut) || selected.frais_livraison > 0) && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", marginBottom: 8 }}>Frais livraison (MAD)</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="form-input" type="number" placeholder="25" value={fraisLivr} onChange={e => setFraisLivr(e.target.value)} style={{ flex: 1 }} />
                      <button onClick={async () => {
                        if (!fraisLivr) return;
                        await supabase.from("commandes").update({ frais_livraison: +fraisLivr }).eq("id", selected.id);
                        await supabase.from("releve_bancaire").insert([{ date: new Date().toISOString().split("T")[0], mois: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), mode_paiement: selected.transporteur || "—", categorie: "Logistique", intitule: "Frais livraison", debit: +fraisLivr, commande_id: selected.id, produit: selected.produit || null, observation: `CMD ${selected.id.slice(0, 8)}` }]);
                        setSelected(s => ({ ...s, frais_livraison: +fraisLivr }));
                      }} style={{ padding: "8px 12px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>💾</button>
                    </div>
                  </div>
                )}
                {(STATUTS_RETOUR.includes(selected.statut) || selected.frais_retour > 0) && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", marginBottom: 8 }}>Frais retour (MAD)</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="form-input" type="number" placeholder="15" value={fraisRet} onChange={e => setFraisRet(e.target.value)} style={{ flex: 1 }} />
                      <button onClick={async () => {
                        if (!fraisRet) return;
                        await supabase.from("commandes").update({ frais_retour: +fraisRet }).eq("id", selected.id);
                        await supabase.from("releve_bancaire").insert([{ date: new Date().toISOString().split("T")[0], mois: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), mode_paiement: selected.transporteur || "—", categorie: "Logistique", intitule: "Frais retour", debit: +fraisRet, commande_id: selected.id, produit: selected.produit || null, observation: `CMD ${selected.id.slice(0, 8)}` }]);
                        setSelected(s => ({ ...s, frais_retour: +fraisRet }));
                      }} style={{ padding: "8px 12px", background: "#D97706", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>💾</button>
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", marginBottom: 8 }}>Statut expédition</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {STATUTS_CMD.map(s => {
                      const m = S_CMD[s]; const active = selected.statut === s;
                      return (
                        <button key={s} onClick={() => updateStatut(selected.id, s)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left", border: `1px solid ${active ? m.color + "50" : "#E2E8F0"}`, background: active ? m.bg : "#F8FAFC", color: active ? m.color : "#64748B", fontSize: 12, fontWeight: active ? 700 : 400 }}>
                          <span>{m.emoji}</span><span>{s}</span>
                          {active && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", marginBottom: 8 }}>Transporteur</div>
                  <select className="form-select" value={selected.transporteur || "Sendit"} onChange={async e => { const val = e.target.value; await supabase.from("commandes").update({ transporteur: val }).eq("id", selected.id); setSelected(s => ({ ...s, transporteur: val })); }}>
                    {TRANSPORTEURS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", marginBottom: 8 }}>N° Tracking</div>
                  <input className="form-input" placeholder="Numéro de suivi..." value={tracking[selected.id] ?? selected.tracking ?? ""} onChange={e => setTracking(t => ({ ...t, [selected.id]: e.target.value }))} />
                  <button onClick={() => saveTracking(selected.id)} disabled={saving} style={{ marginTop: 8, width: "100%", padding: "8px", background: saving ? "#F8FAFC" : "#0F172A", color: saving ? "#94A3B8" : "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {saving ? "⏳ Sauvegarde..." : "💾 Enregistrer"}
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}
      {showModal && <Modal onClose={() => setShowModal(false)} onCreate={createCommande} />}
    </>
  );
}
