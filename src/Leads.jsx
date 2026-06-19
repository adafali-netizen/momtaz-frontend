import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";

const WEBHOOK = "https://momtaz-webhook.onrender.com/api/lead/";

const STATUTS = [
  { key: "À appeler",         emoji: "📋", color: "#2563EB", bg: "#EFF6FF" },
  { key: "Confirmé",          emoji: "✅", color: "#16A34A", bg: "#F0FDF4" },
  { key: "Injoignable",       emoji: "📵", color: "#D97706", bg: "#FFFBEB" },
  { key: "Demande de rappel", emoji: "🔔", color: "#7C3AED", bg: "#F5F3FF" },
  { key: "Pas intéressé",     emoji: "🚫", color: "#64748B", bg: "#F8FAFC" },
  { key: "Numéro faux",       emoji: "⚠️", color: "#DC2626", bg: "#FEF2F2" },
  { key: "Annulé",            emoji: "❌", color: "#DC2626", bg: "#FEF2F2" },
];
const S = Object.fromEntries(STATUTS.map(s => [s.key, s]));
const FILTRES_STATUT = ["tous", "À appeler", "Confirmé", "Injoignable", "Demande de rappel", "Annulé"];

const KPI_STATUTS_ORDERED = [
  { key: "À appeler",         label: "À appeler",   color: "#2563EB", tier: "standard" },
  { key: "Injoignable",       label: "Injoignable", color: "#D97706", tier: "standard" },
  { key: "Annulé",            label: "Annulé",      color: "#DC2626", tier: "standard" },
  { key: "Demande de rappel", label: "Rappel",      color: "#7C3AED", tier: "discret"  },
  { key: "Pas intéressé",     label: "Pas int.",    color: "#64748B", tier: "discret"  },
  { key: "Numéro faux",       label: "N° faux",     color: "#94A3B8", tier: "discret"  },
];

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  const h   = Math.floor(diff / 3600000);
  const d   = Math.floor(diff / 86400000);
  if (min < 1)  return "à l'instant";
  if (min < 60) return `${min}min`;
  if (h < 24)   return `${h}h${String(Math.floor((diff % 3600000) / 60000)).padStart(2,"0")}`;
  return `${d}j`;
}
function fmtHeure(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateComplete(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function isUrgent(lead) {
  if (lead.statut !== "À appeler") return false;
  return Date.now() - new Date(lead.created_at).getTime() > 60 * 60 * 1000;
}
function isOverdue(lead) {
  if (lead.statut !== "Demande de rappel" || !lead.rappel_at) return false;
  return new Date(lead.rappel_at) < new Date();
}

function ZoneTraitement({ lead, onUpdate, ancienStatut }) {
  const [newStatut, setNewStatut] = useState(lead.statut);
  const [saving,    setSaving]    = useState(false);
  useEffect(() => { setNewStatut(lead.statut); }, [lead.id, lead.statut]);

  const tousStatuts = [
    { key: "À appeler",         emoji: "📋", color: "#2563EB", bg: "#EFF6FF" },
    { key: "Injoignable",       emoji: "📵", color: "#D97706", bg: "#FFFBEB" },
    { key: "Demande de rappel", emoji: "🔔", color: "#7C3AED", bg: "#F5F3FF" },
    { key: "Confirmé",          emoji: "✅", color: "#16A34A", bg: "#F0FDF4" },
    { key: "Pas intéressé",     emoji: "🚫", color: "#64748B", bg: "#F8FAFC" },
    { key: "Numéro faux",       emoji: "⚠️", color: "#DC2626", bg: "#FEF2F2" },
    { key: "Annulé",            emoji: "❌", color: "#DC2626", bg: "#FEF2F2" },
  ];
  const current  = tousStatuts.find(s => s.key === newStatut) || tousStatuts[0];
  const modified = newStatut !== lead.statut;

  async function handleSave() {
    setSaving(true);
    await onUpdate(newStatut, ancienStatut);
    setSaving(false);
  }

  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "8px 14px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94A3B8" }}>Changer le statut</div>
      </div>
      <div style={{ padding: "12px 14px", background: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
        <select value={newStatut} onChange={e => setNewStatut(e.target.value)} disabled={saving} style={{
          width: "100%", padding: "10px 12px",
          background: current.bg, border: `1.5px solid ${current.color}55`,
          borderRadius: 8, fontSize: 13, fontWeight: 600,
          color: current.color, cursor: "pointer", outline: "none", fontFamily: "inherit",
        }}>
          {tousStatuts.map(s => <option key={s.key} value={s.key}>{s.emoji} {s.key}</option>)}
        </select>
        {modified && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{
              flex: 1, padding: "10px", background: current.color, color: "#fff",
              border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>
              {saving ? "⏳..." : `✓ ${current.emoji} ${newStatut}`}
            </button>
            <button onClick={() => setNewStatut(lead.statut)} disabled={saving} style={{
              padding: "10px 14px", background: "#F8FAFC", color: "#64748B",
              border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, cursor: "pointer",
            }}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

function LeadCard({ lead, selected, onClick }) {
  const urgent  = isUrgent(lead);
  const overdue = isOverdue(lead);
  const fermé   = ["Annulé", "Pas intéressé", "Numéro faux"].includes(lead.statut);
  const confirmé = lead.statut === "Confirmé";
  const m = S[lead.statut] || S["Pas intéressé"];
  const accentColor = overdue ? "#D97706" : urgent ? "#DC2626" : confirmé ? "#16A34A" : selected ? "#2563EB" : "transparent";
  return (
    <div onClick={onClick} style={{
      background: selected ? "#F0F7FF" : fermé ? "#FAFBFC" : "#fff",
      border: `1px solid ${selected ? "#BFDBFE" : urgent ? "#FECACA" : overdue ? "#FDE68A" : "#E2E8F0"}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 8, padding: "10px 12px", marginBottom: 4,
      cursor: "pointer", transition: "all .12s", opacity: fermé ? 0.55 : 1,
      boxShadow: selected ? "0 0 0 3px #2563EB10" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
          {(urgent || overdue) && <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: urgent ? "#DC2626" : "#D97706" }} />}
          <span style={{ fontWeight: 700, fontSize: 13, color: fermé ? "#94A3B8" : "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lead.client_nom || "Sans nom"}
          </span>
          {urgent  && <span style={{ fontSize: 9, fontWeight: 800, color: "#DC2626", background: "#FEF2F2", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>URGENT</span>}
          {overdue && <span style={{ fontSize: 9, fontWeight: 800, color: "#D97706", background: "#FFFBEB", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>RETARD</span>}
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: m.color, background: m.bg, border: `1px solid ${m.color}33`, whiteSpace: "nowrap" }}>
          {m.emoji} {lead.statut}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#2563EB", fontWeight: 600 }}>{lead.telephone}</span>
        <span style={{ fontSize: 10, color: urgent ? "#DC2626" : "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>{fmtHeure(lead.created_at)} ({timeAgo(lead.created_at)})</span>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {lead.ville    && <span style={{ fontSize: 10, color: "#64748B", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 4, padding: "1px 6px" }}>📍 {lead.ville}</span>}
        {lead.produit  && <span style={{ fontSize: 10, color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>{lead.produit}</span>}
        {lead.prix > 0 && <span style={{ fontSize: 10, color: "#64748B", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 4, padding: "1px 6px", fontFamily: "JetBrains Mono, monospace" }}>{lead.prix} MAD</span>}
        {lead.conseillere && <span style={{ fontSize: 10, color: "#94A3B8", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 4, padding: "1px 6px", marginLeft: "auto" }}>👤 {lead.conseillere.trim().split(" ")[0]}</span>}
      </div>
    </div>
  );
}

function LeadDetailPanel({ lead, events, onClose, onUpdate, onEdit }) {
  const [localEvents, setLocalEvents] = useState(null);
  const displayEvents = localEvents ?? events;
  const [commentaire, setCommentaire] = useState(lead.commentaire || "");
  const [saving,      setSaving]      = useState(false);
  const [editMode,    setEditMode]    = useState(false);
  const [editForm,    setEditForm]    = useState({});
  const [savingEdit,  setSavingEdit]  = useState(false);
  const [produits,    setProduits]    = useState([]);
  const saveTimeout = useRef(null);

  useEffect(() => { setCommentaire(lead.commentaire || ""); setLocalEvents(null); }, [lead.id]);
  useEffect(() => { setEditMode(false); }, [lead.id]);
  useEffect(() => {
    supabase.from("produits").select("nom, prix_vente").order("nom").then(({ data }) => setProduits(data || []));
  }, []);

  function openEdit() {
    setEditForm({ client_nom: lead.client_nom || "", telephone: lead.telephone || "", ville: lead.ville || "", adresse: lead.adresse || "", produit: lead.produit || "", quantite: lead.quantite || 1, prix: lead.prix || "" });
    setEditMode(true);
  }

  async function saveEdit() {
    setSavingEdit(true);
    const { error } = await supabase.from("leads").update(editForm).eq("id", lead.id);
    if (error) { alert("Erreur : " + error.message); setSavingEdit(false); return; }
    const champs = [
      { key: "client_nom", label: "Nom" }, { key: "telephone", label: "Tél" },
      { key: "ville", label: "Ville" }, { key: "adresse", label: "Adresse" },
      { key: "produit", label: "Produit" }, { key: "quantite", label: "Qté" }, { key: "prix", label: "Prix" },
    ];
    const modifs = champs.filter(c => String(lead[c.key] ?? "") !== String(editForm[c.key] ?? "")).map(c => `${c.label}: ${lead[c.key] || "—"} → ${editForm[c.key]}`);
    if (modifs.length > 0) await supabase.from("lead_events").insert([{ lead_id: lead.id, type: "✏️ Modification", note: modifs.join(" | "), created_at: new Date().toISOString() }]);
    if (lead.statut === "Confirmé") await supabase.from("commandes").update({ client_nom: editForm.client_nom, telephone: editForm.telephone, ville: editForm.ville, adresse: editForm.adresse, produit: editForm.produit, quantite: editForm.quantite, prix: editForm.prix }).eq("lead_id", lead.id);
    const { data: newEvents } = await supabase.from("lead_events").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(8);
    setLocalEvents(newEvents || []);
    if (onEdit) onEdit(lead.id, editForm);
    setSavingEdit(false);
    setEditMode(false);
  }

  function handleCommentChange(val) {
    setCommentaire(val);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      await supabase.from("leads").update({ commentaire: val }).eq("id", lead.id);
      try { await fetch(WEBHOOK + lead.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentaire: val }) }); } catch {}
      setSaving(false);
    }, 1500);
  }

  const urgent     = isUrgent(lead);
  const overdue    = isOverdue(lead);
  const statutMeta = S[lead.statut] || { color: "#64748B", bg: "#F8FAFC", emoji: "•" };

  function eventColor(ev) {
    const t = (ev.type || "").toLowerCase();
    if (t.includes("confirmé"))     return "#16A34A";
    if (t.includes("annul"))        return "#DC2626";
    if (t.includes("injoignable"))  return "#D97706";
    if (t.includes("rappel"))       return "#7C3AED";
    if (t.includes("modification")) return "#2563EB";
    return "#94A3B8";
  }

  return (
    <aside style={{ width: 380, flexShrink: 0, background: "#fff", borderLeft: "1px solid #E2E8F0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #E2E8F0", background: urgent ? "#FFFBEB" : overdue ? "#FFF7ED" : "#FAFAFA", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.client_nom || "Sans nom"}</span>
              {urgent  && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#DC2626", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>URGENT</span>}
              {overdue && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#D97706", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>RETARD</span>}
            </div>
            <div style={{ fontSize: 10, color: "#64748B" }}>{fmtDateComplete(lead.created_at)}{lead.conseillere ? ` · 👤 ${lead.conseillere.trim().split(" ")[0]}` : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={openEdit} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, color: "#64748B", fontSize: 12, cursor: "pointer", padding: "4px 10px" }}>✏️</button>
            <button onClick={onClose} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, color: "#64748B", fontSize: 16, cursor: "pointer", padding: "2px 8px", lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, color: statutMeta.color, background: statutMeta.bg, border: `1px solid ${statutMeta.color}33` }}>
            {statutMeta.emoji} {lead.statut}
          </span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <a href={`tel:${lead.telephone}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, color: "#2563EB", fontWeight: 800, textDecoration: "none", fontFamily: "JetBrains Mono, monospace", padding: "8px 12px", background: "#EFF6FF", borderRadius: 8, border: "1px solid #BFDBFE" }}>
            📞 {lead.telephone}
          </a>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {lead.ville    && <span style={{ fontSize: 11, color: "#64748B", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, padding: "3px 8px" }}>📍 {lead.ville}{lead.adresse ? ` · ${lead.adresse}` : ""}</span>}
          {lead.produit  && <span style={{ fontSize: 11, color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>{lead.produit}</span>}
          {lead.prix > 0 && <span style={{ fontSize: 11, color: "#64748B", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, padding: "3px 8px", fontFamily: "JetBrains Mono, monospace" }}>{lead.prix} MAD</span>}
        </div>
        {lead.statut === "Confirmé" && lead.produit && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>📦 {lead.produit} · Qté {lead.quantite || 1} · {lead.prix} MAD</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", background: "#DCFCE7", padding: "2px 8px", borderRadius: 4 }}>À expédier</span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", marginBottom: 10 }}>Action</div>
          <ZoneTraitement lead={lead} onUpdate={onUpdate} ancienStatut={lead.statut} />
        </div>

        {editMode && (
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", marginBottom: 10 }}>Modifier le lead</div>
            {[{ label: "Nom", key: "client_nom" }, { label: "Téléphone", key: "telephone" }, { label: "Ville", key: "ville" }, { label: "Adresse", key: "adresse" }].map(({ label, key }) => (
              <div key={key} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 3 }}>{label}</div>
                <input value={editForm[key] || ""} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 12, color: "#0F172A", outline: "none", boxSizing: "border-box" }}
                  onFocus={e => e.target.style.borderColor = "#2563EB"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
              </div>
            ))}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 3 }}>Produit</div>
              <select value={editForm.produit || ""} onChange={e => { const p = produits.find(x => x.nom === e.target.value); setEditForm(f => ({ ...f, produit: e.target.value, prix: p ? p.prix_vente : f.prix })); }}
                style={{ width: "100%", padding: "7px 10px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 12, color: "#0F172A", outline: "none", boxSizing: "border-box" }}>
                <option value="">-- Choisir --</option>
                {produits.map(p => <option key={p.nom} value={p.nom}>{p.nom} — {p.prix_vente} MAD</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 3 }}>Quantité</div>
                <input type="number" min="1" value={editForm.quantite || 1} onChange={e => setEditForm(f => ({ ...f, quantite: +e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 3 }}>Prix (MAD)</div>
                <input type="number" value={editForm.prix || ""} onChange={e => setEditForm(f => ({ ...f, prix: +e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveEdit} disabled={savingEdit} style={{ flex: 1, padding: "8px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {savingEdit ? "⏳ Sauvegarde..." : "💾 Enregistrer"}
              </button>
              <button onClick={() => setEditMode(false)} style={{ padding: "8px 14px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 12, color: "#64748B", cursor: "pointer" }}>Annuler</button>
            </div>
          </div>
        )}

        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", marginBottom: 12 }}>Historique</div>
          {(!displayEvents || displayEvents.length === 0)
            ? <div style={{ fontSize: 12, color: "#CBD5E1", fontStyle: "italic" }}>Aucun événement</div>
            : (
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 2, background: "#E2E8F0", borderRadius: 1 }} />
                {displayEvents.slice(0, 8).map((ev, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 12 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: eventColor(ev), flexShrink: 0, marginTop: 1, zIndex: 1, boxShadow: "0 0 0 3px #fff" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{ev.type}</div>
                      {ev.note && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2, lineHeight: 1.4 }}>{ev.note}</div>}
                      <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3, fontFamily: "JetBrains Mono, monospace" }}>{fmtHeure(ev.created_at)} · {timeAgo(ev.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>Note opérateur</div>
            {saving ? <span style={{ fontSize: 10, color: "#94A3B8" }}>⏳ Sauvegarde...</span> : commentaire ? <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 600 }}>✓ Sauvegardé</span> : null}
          </div>
          <textarea value={commentaire} onChange={e => handleCommentChange(e.target.value)}
            placeholder="Ajouter une note sur ce lead..."
            style={{ width: "100%", minHeight: 88, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, color: "#0F172A", padding: "10px 12px", fontSize: 12, resize: "vertical", outline: "none", lineHeight: 1.6, fontFamily: "Inter, sans-serif", boxSizing: "border-box" }}
            onFocus={e => e.target.style.borderColor = "#2563EB"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
        </div>
      </div>
    </aside>
  );
}

export default function Leads({ role, nom }) {
  const [leads,         setLeads]         = useState([]);
  const [events,        setEvents]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [filtreStatut,  setFiltreStatut]  = useState("tous");
  const [filtreConseil, setFiltreConseil] = useState("tous");
  const [search,        setSearch]        = useState("");
  const [selected,      setSelected]      = useState(null);

  useEffect(() => {
    fetchLeads();
    const ch = supabase.channel("leads-rt8")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, fetchLeads)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  useEffect(() => { if (selected) fetchEvents(selected.id); }, [selected?.id]);

  async function fetchLeads() {
    let q = supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (role !== "admin") q = q.eq("conseillere", nom);
    const { data, error } = await q;
    if (!error && data) {
      setLeads(data);
      setSelected(prev => prev ? (data.find(l => l.id === prev.id) || prev) : null);
    }
    setLoading(false);
  }

  async function fetchEvents(leadId) {
    const { data } = await supabase.from("lead_events").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(8);
    setEvents(data || []);
  }

  async function updateStatut(id, statut, ancienStatut) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, statut } : l));
    setSelected(prev => prev?.id === id ? { ...prev, statut } : prev);
    await supabase.from("leads").update({ statut }).eq("id", id);
    await supabase.from("lead_events").insert([{ lead_id: id, type: `Statut → ${statut}`, created_at: new Date().toISOString() }]);
    if (statut === "Confirmé") {
      await supabase.from("commandes").delete().eq("lead_id", id);
      const { data: lead } = await supabase.from("leads").select("*").eq("id", id).single();
      if (lead) await supabase.from("commandes").insert([{ lead_id: id, client_nom: lead.client_nom, telephone: lead.telephone, ville: lead.ville, adresse: lead.adresse, produit: lead.produit, quantite: lead.quantite || 1, prix: lead.prix, conseillere: lead.conseillere, statut: "À expédier", created_at: new Date().toISOString() }]);
    } else if (ancienStatut === "Confirmé" && statut !== "Confirmé") {
      await supabase.from("commandes").delete().eq("lead_id", id);
    }
    if (selected?.id === id) fetchEvents(id);
    try { await fetch(WEBHOOK + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statut }) }); } catch {}
  }

  const total    = leads.length;
  const cnt      = key => leads.filter(l => l.statut === key).length;
  const pct      = key => total > 0 ? Math.round((cnt(key) / total) * 100) : 0;
  const tauxConf = pct("Confirmé");
  const agents   = [...new Set(leads.map(l => l.conseillere).filter(Boolean))].sort();
  const countF   = f => f === "tous" ? leads.length : leads.filter(l => l.statut === f).length;

  const filtered = leads
    .filter(l => filtreStatut === "tous" || l.statut === filtreStatut)
    .filter(l => filtreConseil === "tous" || l.conseillere === filtreConseil)
    .filter(l => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (l.client_nom||"").toLowerCase().includes(q) || (l.telephone||"").includes(q) || (l.ville||"").toLowerCase().includes(q) || (l.produit||"").toLowerCase().includes(q);
    });

  // Couleurs dynamiques taux conf
  const heroColor  = tauxConf >= 30 ? "#16A34A" : tauxConf >= 20 ? "#D97706" : total > 0 ? "#DC2626" : "#CBD5E1";
  const heroBg     = tauxConf >= 30 ? "#F0FDF4" : tauxConf >= 20 ? "#FFFBEB" : total > 0 ? "#FEF2F2" : "#fff";
  const heroBorder = tauxConf >= 30 ? "#BBF7D0" : tauxConf >= 20 ? "#FDE68A" : total > 0 ? "#FECACA" : "#E2E8F0";
  const heroIcon   = tauxConf >= 30 ? "✓" : tauxConf >= 20 ? "~" : total > 0 ? "!" : "—";
  const heroIconBg = tauxConf >= 30 ? "#DCFCE7" : tauxConf >= 20 ? "#FEF3C7" : total > 0 ? "#FEE2E2" : "#F1F5F9";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>

      {/* ══ BANDEAU KPI PREMIUM ══ */}
      <div style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "20px 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }}>

          {/* ── HÉRO : Taux de confirmation ── */}
          <div style={{
            padding: "28px 32px",
            minWidth: 200,
            height: 130,
            background: heroBg,
            border: `1px solid ${heroBorder}`,
            borderTop: `4px solid ${heroColor}`,
            borderRadius: 16,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
            boxSizing: "border-box",
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#94A3B8" }}>
              Taux de confirmation
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
              <span style={{ fontSize: 64, fontWeight: 800, color: heroColor, fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>{tauxConf}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: heroColor, paddingBottom: 9 }}>%</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: heroIconBg, fontSize: 10, color: heroColor, fontWeight: 700 }}>
                {heroIcon}
              </span>
              <span style={{ fontSize: 11, color: "#64748B" }}>{cnt("Confirmé")} confirmés / {total}</span>
            </div>
          </div>

          {/* Séparateur */}
          <div style={{ width: 1, background: "#E2E8F0", margin: "8px 0", alignSelf: "stretch" }} />

          {/* ── SECONDAIRE : Total leads ── */}
          <div style={{
            padding: "24px 28px",
            minWidth: 140,
            height: 130,
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 16,
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
            boxSizing: "border-box",
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#94A3B8" }}>
              Total leads
            </div>
            <div style={{ fontSize: 42, fontWeight: 800, color: "#0F172A", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>
              {total}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>Leads reçus</div>
          </div>

          {/* Séparateur */}
          <div style={{ width: 1, background: "#E2E8F0", margin: "8px 0", alignSelf: "stretch" }} />

          {/* ── STATUTS ordonnés ── */}
          <div style={{ display: "flex", gap: 10, alignItems: "stretch", flex: 1, flexWrap: "wrap" }}>
            {KPI_STATUTS_ORDERED.map(s => {
              const n = cnt(s.key);
              const p = pct(s.key);
              const isStd = s.tier === "standard";
              return (
                <div key={s.key} style={{
                  padding: isStd ? "20px 20px" : "14px 16px",
                  minWidth: isStd ? 90 : 72,
                  height: 130,
                  background: "#fff",
                  border: "1px solid #E2E8F0",
                  borderLeft: `${isStd ? 4 : 3}px solid ${n > 0 ? s.color : "#E2E8F0"}`,
                  borderRadius: 14,
                  boxShadow: n > 0 && isStd ? "0 2px 8px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.03)",
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                  boxSizing: "border-box",
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: n > 0 ? s.color + "99" : "#CBD5E1", whiteSpace: "nowrap" }}>
                    {s.label}
                  </div>
                  <div>
                    <div style={{ fontSize: isStd ? 30 : 22, fontWeight: 800, color: n > 0 ? s.color : "#CBD5E1", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>{n}</div>
                  </div>
                  <div style={{ fontSize: 11, color: n > 0 ? s.color + "99" : "#CBD5E1", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{p}%</div>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* ══ BARRE DE CONTRÔLE ══ */}
      <div style={{
        background: "#fff",
        borderBottom: "2px solid #E2E8F0",
        boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
        padding: "14px 24px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#94A3B8", pointerEvents: "none" }}>🔍</span>
            <input
              style={{ width: "100%", padding: "9px 14px 9px 36px", background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, color: "#0F172A", outline: "none", boxSizing: "border-box", transition: "border-color .15s", fontFamily: "inherit" }}
              placeholder="Rechercher un lead..."
              value={search} onChange={e => setSearch(e.target.value)}
              onFocus={e => e.target.style.borderColor = "#2563EB"}
              onBlur={e => e.target.style.borderColor = "#E2E8F0"}
            />
          </div>
          {role === "admin" && agents.length > 0 && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>Conseillère</span>
              <button onClick={() => setFiltreConseil("tous")} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: filtreConseil === "tous" ? 700 : 500, background: filtreConseil === "tous" ? "#0F172A" : "#F8FAFC", color: filtreConseil === "tous" ? "#fff" : "#64748B", border: `1px solid ${filtreConseil === "tous" ? "#0F172A" : "#E2E8F0"}`, cursor: "pointer" }}>Toutes</button>
              {agents.map(a => (
                <button key={a} onClick={() => setFiltreConseil(a)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: filtreConseil === a ? 700 : 500, background: filtreConseil === a ? "#0F172A" : "#F8FAFC", color: filtreConseil === a ? "#fff" : "#64748B", border: `1px solid ${filtreConseil === a ? "#0F172A" : "#E2E8F0"}`, cursor: "pointer" }}>
                  {a.trim().split(" ")[0]}
                </button>
              ))}
            </div>
          )}
          <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: "auto", whiteSpace: "nowrap" }}>
            {filtered.length} lead{filtered.length > 1 ? "s" : ""}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTRES_STATUT.map(f => {
            const active = filtreStatut === f;
            const s = S[f];
            const n = countF(f);
            return (
              <button key={f} onClick={() => setFiltreStatut(f)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8,
                border: `1.5px solid ${active && s ? s.color : active ? "#2563EB" : "#E2E8F0"}`,
                background: active && s ? s.bg : active ? "#EFF6FF" : "#F8FAFC",
                color: active && s ? s.color : active ? "#2563EB" : "#64748B",
                fontSize: 12, fontWeight: active ? 700 : 500,
                cursor: "pointer", transition: "all .12s", whiteSpace: "nowrap",
                boxShadow: active ? `0 0 0 3px ${s ? s.color + "15" : "#2563EB15"}` : "none",
              }}>
                {s?.emoji && <span style={{ fontSize: 13 }}>{s.emoji}</span>}
                <span>{f}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                  background: active && s ? s.color : active ? "#2563EB" : "#E2E8F0",
                  color: active ? "#fff" : "#64748B",
                  fontFamily: "JetBrains Mono, monospace", minWidth: 22, textAlign: "center",
                }}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ LISTE + PANNEAU ══ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", scrollbarWidth: "thin", scrollbarColor: "#E2E8F0 transparent" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48, gap: 10, color: "#94A3B8", fontSize: 13 }}>
              <div style={{ width: 22, height: 22, border: "2px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 12, textAlign: "center" }}>
              <div style={{ fontSize: 40, opacity: .4 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Aucun lead</div>
              <div style={{ fontSize: 13, color: "#94A3B8" }}>Essaie un autre filtre</div>
            </div>
          ) : filtered.map(lead => (
            <LeadCard key={lead.id} lead={lead} selected={selected?.id === lead.id} onClick={() => setSelected(lead)} />
          ))}
        </div>

        {selected && (
          <LeadDetailPanel
            lead={selected} events={events}
            onClose={() => setSelected(null)}
            onUpdate={(statut, ancienStatut) => updateStatut(selected.id, statut, ancienStatut)}
            onEdit={(id, form) => {
              setLeads(prev => prev.map(l => l.id === id ? { ...l, ...form } : l));
              setSelected(prev => prev?.id === id ? { ...prev, ...form } : prev);
            }}
          />
        )}
      </div>
    </div>
  );
}
                                                                      
