import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const STATUTS_CMD = [
  "À expédier", "Expédiée", "Injoignable", "Reportée",
  "Annulée", "Refusée", "Changement de dest",
  "Livrée", "Facturée",
  "Demande de retour", "Retour en cours", "Retour reçu"
];

const S_CMD = {
  "À expédier":        { color: "#2563EB", bg: "#EFF6FF", emoji: "📦" },
  "Expédiée":          { color: "#0891B2", bg: "#ECFEFF", emoji: "🚚" },
  "Injoignable":       { color: "#D97706", bg: "#FFFBEB", emoji: "📵" },
  "Reportée":          { color: "#7C3AED", bg: "#F5F3FF", emoji: "🔔" },
  "Annulée":           { color: "#DC2626", bg: "#FEF2F2", emoji: "❌" },
  "Refusée":           { color: "#DC2626", bg: "#FEF2F2", emoji: "🚫" },
  "Changement de dest":{ color: "#D97706", bg: "#FFFBEB", emoji: "📍" },
  "Livrée":            { color: "#16A34A", bg: "#F0FDF4", emoji: "✅" },
  "Facturée":          { color: "#16A34A", bg: "#F0FDF4", emoji: "🧾" },
  "Demande de retour": { color: "#D97706", bg: "#FFFBEB", emoji: "📝" },
  "Retour en cours":   { color: "#DC2626", bg: "#FEF2F2", emoji: "↩️" },
  "Retour reçu":       { color: "#7C3AED", bg: "#F5F3FF", emoji: "✅" },
};

const TRANSPORTEURS = ["Sendit", "Digylog", "Ameex","Autre"];
const WEBHOOK = "https://momtaz-webhook-production.up.railway.app/api/commande/";

// Statuts qui déclenchent la saisie des frais livraison
const STATUTS_LIVRAISON = ["Livrée", "Facturée"];
// Statuts qui déclenchent la saisie des frais retour
const STATUTS_RETOUR = ["Retour reçu"];

function Modal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    client_nom: "", telephone: "", produit: "", ville: "",
    quantite: 1, prix: "", transporteur: "Sendit"
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.client_nom || !form.telephone) return;
    await onCreate(form); onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Nouvelle commande</span>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
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
            <select className="form-select" value={form.transporteur} onChange={e => set("transporteur", e.target.value)}>
              {TRANSPORTEURS.map(t => <option key={t}>{t}</option>)}
            </select>
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
  const [selected,  setSelected]  = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [tracking,  setTracking]  = useState({});
  const [saving,    setSaving]    = useState(false);
  // Frais inline
  const [fraisLivr, setFraisLivr] = useState("");
  const [fraisRet,  setFraisRet]  = useState("");

  useEffect(() => {
    fetchCommandes();
    const ch = supabase.channel("commandes-rt")
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
    await supabase.from("commandes").insert([{
      client_nom: form.client_nom, telephone: form.telephone,
      produit: form.produit, ville: form.ville,
      quantite: form.quantite, prix: form.prix || null,
      transporteur: form.transporteur, statut: "À expédier"
    }]);
  }

  async function updateStatut(id, statut) {
    setSaving(true);
    const updates = { statut };
    if (statut === "Expédiée")  updates.date_expedition = new Date().toISOString();
    if (statut === "Livrée" || statut === "Facturée") updates.date_livraison = new Date().toISOString();
    if (statut === "Retour reçu") updates.date_retour  = new Date().toISOString();

    // Frais livraison
    if (STATUTS_LIVRAISON.includes(statut) && fraisLivr) {
      updates.frais_livraison = +fraisLivr;
      // Enregistre dans releve_bancaire
      const cmd = commandes.find(c => c.id === id);
      await supabase.from("releve_bancaire").insert([{
        date:          new Date().toISOString().split("T")[0],
        mois:          new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        mode_paiement: cmd?.transporteur || "—",
        categorie:     "Logistique",
        intitule:      "Frais livraison",
        debit:         +fraisLivr,
        commande_id:   id,
        produit:       cmd?.produit || null,
        observation:   `CMD ${id.slice(0, 8)}`,
      }]);
    }

    // Frais retour
    if (STATUTS_RETOUR.includes(statut) && fraisRet) {
      updates.frais_retour = +fraisRet;
      const cmd = commandes.find(c => c.id === id);
      await supabase.from("releve_bancaire").insert([{
        date:          new Date().toISOString().split("T")[0],
        mois:          new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        mode_paiement: cmd?.transporteur || "—",
        categorie:     "Logistique",
        intitule:      "Frais retour",
        debit:         +fraisRet,
        commande_id:   id,
        produit:       cmd?.produit || null,
        observation:   `CMD ${id.slice(0, 8)}`,
      }]);
    }

    await supabase.from("commandes").update(updates).eq("id", id);
    try {
      await fetch(WEBHOOK + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
    } catch (e) {}

    if (selected?.id === id) setSelected(s => ({ ...s, ...updates }));
    setFraisLivr("");
    setFraisRet("");
    setSaving(false);
  }

  async function saveTracking(id) {
    const val = tracking[id] || "";
    await supabase.from("commandes").update({ tracking: val }).eq("id", id);
    if (selected?.id === id) setSelected(s => ({ ...s, tracking: val }));
  }

const count    = s => s === "tous" ? commandes.length : commandes.filter(c => c.statut === s).length;
const filtered = commandes.filter(c => {
  if (filtre === "tous") return c.statut !== "Annulée";
  return c.statut === filtre;
});
  const retours  = count("Retour en cours") + count("Demande de retour");

  // Affichage conditionnel frais selon statut sélectionné dans le panel
  const showFraisLivr = selected && STATUTS_LIVRAISON.includes(selected.statut);
  const showFraisRet  = selected && STATUTS_RETOUR.includes(selected.statut);

  return (
    <>
      {retours > 0 && (
        <div className="alert-banner danger" style={{ margin: "16px 24px 0" }}>
          🔴 {retours} retour{retours > 1 ? "s" : ""} en cours
        </div>
      )}

      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className={`kpi-card${count("À expédier") > 0 ? " kpi-alert" : ""}`}><div className="kpi-value">{count("À expédier")}</div><div className="kpi-label">À expédier</div></div>
        <div className="kpi-card"><div className="kpi-value">{count("Expédiée")}</div><div className="kpi-label">Expédiées</div></div>
        <div className="kpi-card kpi-success"><div className="kpi-value">{count("Livrée") + count("Facturée")}</div><div className="kpi-label">Livrées</div></div>
        <div className={`kpi-card${retours > 0 ? " kpi-warn" : ""}`}><div className="kpi-value">{retours}</div><div className="kpi-label">Retours</div></div>
      </div>

      <div className="toolbar">
        <div className="filter-tabs">
          {["tous", ...STATUTS_CMD].map(f => (
            <button key={f} className={`filter-tab${filtre === f ? " active" : ""}`} onClick={() => setFiltre(f)}>
              {f === "tous" ? "Tous" : (S_CMD[f]?.emoji || "")} {f} <span className="filter-count">{count(f)}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Commande</button>
      </div>

      {loading ? (
        <div className="state-wrap"><div className="spinner" /> Chargement...</div>
) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <div className="empty-title">Aucune commande</div>
          <div className="empty-sub">Les commandes apparaissent automatiquement quand un lead est confirmé</div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Commande manuelle</button>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th><th>Téléphone</th><th>Produit</th><th>Ville</th>
                  <th>Transporteur</th><th>Tracking</th><th>Frais livr.</th><th>Statut</th><th>Créé le</th>
                </tr>
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
                      <td className="col-mono">{c.frais_livraison ? `${c.frais_livraison} MAD` : <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                      <td><span className="status-badge" style={{ color: m.color, background: m.bg }}>{m.emoji} {c.statut}</span></td>
                      <td className="col-muted">{c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selected && (
            <aside className="detail-panel">
              <div className="panel-header">
                <div className="panel-header-top">
                  <div className="panel-name">{selected.client_nom || "Sans nom"}</div>
                  <button className="btn-close" onClick={() => setSelected(null)}>×</button>
                </div>
                <span className="status-badge" style={{ color: S_CMD[selected.statut]?.color, background: S_CMD[selected.statut]?.bg }}>
                  {S_CMD[selected.statut]?.emoji} {selected.statut}
                </span>
                <div style={{ marginTop: 8 }}>
                  <div className="panel-info-row">📞 <span className="panel-phone">{selected.telephone}</span></div>
                  {selected.ville   && <div className="panel-info-row">📍 {selected.ville}</div>}
                  {selected.produit && <div className="panel-info-row">🛒 {selected.produit} × {selected.quantite || 1}</div>}
                  {selected.prix    && <div className="panel-info-row">💰 {selected.prix} MAD</div>}
                </div>
              </div>

              <div className="panel-body">
                {/* Frais livraison — affiché si statut livraison */}
                {(STATUTS_LIVRAISON.includes(selected.statut) || selected.frais_livraison > 0) && (
                  <div className="panel-section">
                    <div className="panel-label">💸 Frais livraison (MAD)</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="form-input" type="number" placeholder="25"
                        value={fraisLivr} onChange={e => setFraisLivr(e.target.value)} />
                      <button className="btn btn-secondary btn-sm" onClick={async () => {
                        if (!fraisLivr) return;
                        await supabase.from("commandes").update({ frais_livraison: +fraisLivr }).eq("id", selected.id);
                        const cmd = selected;
                        await supabase.from("releve_bancaire").insert([{
                          date: new Date().toISOString().split("T")[0],
                          mois: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
                          mode_paiement: cmd.transporteur || "—",
                          categorie: "Logistique", intitule: "Frais livraison",
                          debit: +fraisLivr, commande_id: selected.id,
                          produit: cmd.produit || null,
                          observation: `CMD ${selected.id.slice(0, 8)}`,
                        }]);
                        setSelected(s => ({ ...s, frais_livraison: +fraisLivr }));
                      }}>💾</button>
                    </div>
                  </div>
                )}

                {/* Frais retour — affiché si statut retour */}
                {(STATUTS_RETOUR.includes(selected.statut) || selected.frais_retour > 0) && (
                  <div className="panel-section">
                    <div className="panel-label">↩️ Frais retour (MAD)</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="form-input" type="number" placeholder="15"
                        value={fraisRet} onChange={e => setFraisRet(e.target.value)} />
                      <button className="btn btn-secondary btn-sm" onClick={async () => {
                        if (!fraisRet) return;
                        await supabase.from("commandes").update({ frais_retour: +fraisRet }).eq("id", selected.id);
                        const cmd = selected;
                        await supabase.from("releve_bancaire").insert([{
                          date: new Date().toISOString().split("T")[0],
                          mois: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
                          mode_paiement: cmd.transporteur || "—",
                          categorie: "Logistique", intitule: "Frais retour",
                          debit: +fraisRet, commande_id: selected.id,
                          produit: cmd.produit || null,
                          observation: `CMD ${selected.id.slice(0, 8)}`,
                        }]);
                        setSelected(s => ({ ...s, frais_retour: +fraisRet }));
                      }}>💾</button>
                    </div>
                  </div>
                )}

                <div className="panel-section">
                  <div className="panel-label">Statut expédition</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {STATUTS_CMD.map(s => {
                      const m = S_CMD[s]; const active = selected.statut === s;
                      return (
                        <button key={s} className={`status-btn${active ? " active" : ""}`}
                          onClick={() => updateStatut(selected.id, s)}
                          style={active ? { borderColor: m.color + "50", background: m.bg, color: m.color } : {}}>
                          {m.emoji} {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="panel-section">
                  <div className="panel-label">Transporteur</div>
                  <select className="form-select" value={selected.transporteur || "Sendit"}
                    onChange={async e => {
                      const val = e.target.value;
                      await supabase.from("commandes").update({ transporteur: val }).eq("id", selected.id);
                      setSelected(s => ({ ...s, transporteur: val }));
                    }}>
                    {TRANSPORTEURS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                <div className="panel-section">
                  <div className="panel-label">N° Tracking</div>
                  <input className="form-input" placeholder="Numéro de suivi..."
                    value={tracking[selected.id] ?? selected.tracking ?? ""}
                    onChange={e => setTracking(t => ({ ...t, [selected.id]: e.target.value }))} />
                  <button className="btn-save" style={{ marginTop: 7 }} onClick={() => saveTracking(selected.id)} disabled={saving}>
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
