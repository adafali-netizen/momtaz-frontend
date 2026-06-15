import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const WEBHOOK = "https://momtaz-webhook-production.up.railway.app/api/lead/";

const STATUTS = [
  { key: "À appeler",         emoji: "📋", color: "#2563EB", bg: "#EFF6FF", group: "actif" },
  { key: "Confirmé",          emoji: "✅", color: "#16A34A", bg: "#F0FDF4", group: "positif" },
  { key: "Injoignable",       emoji: "📵", color: "#D97706", bg: "#FFFBEB", group: "actif" },
  { key: "Demande de rappel", emoji: "🔔", color: "#7C3AED", bg: "#F5F3FF", group: "actif" },
  { key: "Pas intéressé",     emoji: "🚫", color: "#64748B", bg: "#F8FAFC", group: "fermé" },
  { key: "Numéro faux",       emoji: "⚠️", color: "#DC2626", bg: "#FEF2F2", group: "fermé" },
  { key: "Annulé",            emoji: "❌", color: "#DC2626", bg: "#FEF2F2", group: "fermé" },
];

const S = Object.fromEntries(STATUTS.map(s => [s.key, s]));
const FILTRES_STATUT = ["tous", "À appeler", "Confirmé", "Injoignable", "Demande de rappel", "Annulé"];

// ─── UTILS ────────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  const h    = Math.floor(diff / 3600000);
  const d    = Math.floor(diff / 86400000);
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
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit"
  });
}

function isUrgent(lead) {
  if (lead.statut !== "À appeler") return false;
  return Date.now() - new Date(lead.created_at).getTime() > 60 * 60 * 1000;
}

function isOverdue(lead) {
  if (lead.statut !== "Demande de rappel" || !lead.rappel_at) return false;
  return new Date(lead.rappel_at) < new Date();
}

function getMainCTA(statut) {
  switch (statut) {
    case "À appeler":         return { label: "✅ Confirmer la commande", next: "Confirmé",          color: "#16A34A", shadow: "#16A34A" };
    case "Injoignable":       return { label: "🔔 Demande de rappel",    next: "Demande de rappel", color: "#7C3AED", shadow: "#7C3AED" };
    case "Demande de rappel": return { label: "✅ Confirmer la commande", next: "Confirmé",          color: "#16A34A", shadow: "#16A34A" };
    default:                  return null;
  }
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────

function StatusBadge({ statut, size = "sm" }) {
  const m = S[statut] || { color: "#64748B", bg: "#F8FAFC", emoji: "•" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: size === "lg" ? 12 : size === "md" ? 11 : 10,
      fontWeight: 700,
      padding: size === "lg" ? "5px 12px" : size === "md" ? "3px 10px" : "2px 8px",
      borderRadius: 20, color: m.color, background: m.bg,
      border: `1px solid ${m.color}33`, whiteSpace: "nowrap",
      letterSpacing: ".01em",
    }}>
      {m.emoji} {statut}
    </span>
  );
}

// ─── CONSEILLERE PILLS (admin header) ─────────────────────────────────────────

function ConseillereStats({ leads, filtreConseillere, setFiltreConseillere }) {
  const today = new Date().toDateString();
  const agents = [...new Set(leads.map(l => l.conseillere).filter(Boolean))].sort();

  if (agents.length === 0) return null;

  return (
    <div style={{
      display: "flex", gap: 8, padding: "10px 24px",
      background: "#F8FAFC", borderBottom: "1px solid var(--border)",
      flexShrink: 0, flexWrap: "wrap", alignItems: "center",
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: ".08em", marginRight: 4 }}>Conseillères</span>

      {/* Tous */}
      <button
        onClick={() => setFiltreConseillere("tous")}
        style={{
          padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: filtreConseillere === "tous" ? 700 : 500,
          background: filtreConseillere === "tous" ? "var(--blue)" : "var(--surface)",
          color: filtreConseillere === "tous" ? "#fff" : "var(--muted)",
          border: `1px solid ${filtreConseillere === "tous" ? "var(--blue)" : "var(--border)"}`,
          cursor: "pointer",
        }}
      >Toutes · {leads.length}</button>

      {agents.map(agent => {
        const agentLeads    = leads.filter(l => l.conseillere === agent);
        const confirmes     = agentLeads.filter(l => l.statut === "Confirmé" && new Date(l.updated_at || l.created_at).toDateString() === today).length;
        const urgents       = agentLeads.filter(isUrgent).length;
        const aTraiter      = agentLeads.filter(l => ["À appeler", "Demande de rappel", "Injoignable"].includes(l.statut)).length;
        const active        = filtreConseillere === agent;

        return (
          <button
            key={agent}
            onClick={() => setFiltreConseillere(agent)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 12px", borderRadius: 20, cursor: "pointer",
              background: active ? "#0F172A" : "var(--surface)",
              border: `1px solid ${active ? "#0F172A" : urgents > 0 ? "#FCA5A5" : "var(--border)"}`,
              transition: "all .12s",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: active ? "#fff" : "var(--text)" }}>
              {agent.trim().split(" ")[0]}
            </span>
            <span style={{ display: "flex", gap: 4 }}>
              <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: active ? "rgba(255,255,255,.7)" : "var(--muted2)" }}>
                {agentLeads.length}
              </span>
              {confirmes > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: active ? "#86EFAC" : "#16A34A", background: active ? "rgba(255,255,255,.1)" : "#F0FDF4", padding: "0 5px", borderRadius: 8 }}>
                  ✅{confirmes}
                </span>
              )}
              {urgents > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: active ? "#FCA5A5" : "#DC2626", background: active ? "rgba(255,255,255,.1)" : "#FEF2F2", padding: "0 5px", borderRadius: 8 }}>
                  ⚡{urgents}
                </span>
              )}
              {aTraiter > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: active ? "rgba(255,255,255,.6)" : "var(--muted2)", background: active ? "rgba(255,255,255,.1)" : "var(--surface2)", padding: "0 5px", borderRadius: 8 }}>
                  {aTraiter}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── LEAD CARD ────────────────────────────────────────────────────────────────

function LeadCard({ lead, selected, onClick }) {
  const urgent   = isUrgent(lead);
  const overdue  = isOverdue(lead);
  const fermé    = ["Annulé", "Pas intéressé", "Numéro faux"].includes(lead.statut);
  const confirmé = lead.statut === "Confirmé";

  const accentColor = overdue ? "#D97706" : urgent ? "#DC2626" : confirmé ? "#16A34A" : selected ? "#2563EB" : "transparent";

  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? "#F0F6FF" : fermé ? "#FAFBFC" : "var(--surface)",
        border: `1px solid ${selected ? "#93C5FD" : urgent ? "#FECACA" : overdue ? "#FDE68A" : "var(--border)"}`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: "var(--radius)",
        padding: "10px 12px",
        marginBottom: 4,
        cursor: "pointer",
        transition: "all .12s",
        opacity: fermé ? 0.55 : 1,
        boxShadow: selected ? "0 0 0 3px #2563EB15" : urgent ? "0 1px 6px #DC262618" : "none",
      }}
    >
      {/* Ligne 1 — Nom + Statut */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
          {(urgent || overdue) && (
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: urgent ? "#DC2626" : "#D97706",
            }} />
          )}
          <span style={{
            fontWeight: 700, fontSize: 13,
            color: fermé ? "var(--muted)" : "var(--text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {lead.client_nom || "Sans nom"}
          </span>
          {urgent  && <span style={{ fontSize: 9, fontWeight: 800, color: "#DC2626", background: "#FEF2F2", padding: "1px 5px", borderRadius: 3, letterSpacing: ".05em", flexShrink: 0 }}>URGENT</span>}
          {overdue && <span style={{ fontSize: 9, fontWeight: 800, color: "#D97706", background: "#FFFBEB", padding: "1px 5px", borderRadius: 3, letterSpacing: ".05em", flexShrink: 0 }}>RETARD</span>}
        </div>
        <StatusBadge statut={lead.statut} />
      </div>

      {/* Ligne 2 — Téléphone + Heure */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--blue)", fontWeight: 600 }}>
          {lead.telephone}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: urgent ? "#DC2626" : overdue ? "#D97706" : "var(--muted2)",
            fontFamily: "JetBrains Mono, monospace",
          }}>
            {fmtHeure(lead.created_at)}
          </span>
          <span style={{ fontSize: 10, color: "var(--muted2)" }}>
            ({timeAgo(lead.created_at)})
          </span>
        </div>
      </div>

      {/* Ligne 3 — Tags */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        {lead.ville && (
          <span style={{ fontSize: 10, color: "var(--muted)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>
            📍 {lead.ville}
          </span>
        )}
        {lead.produit && (
          <span style={{ fontSize: 10, color: "var(--blue)", background: "var(--blue-lt)", border: "1px solid #BFDBFE", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>
            {lead.produit}
          </span>
        )}
        {lead.prix > 0 && (
          <span style={{ fontSize: 10, color: "var(--muted)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px", fontFamily: "JetBrains Mono, monospace" }}>
            {lead.prix} MAD
          </span>
        )}
        {lead.conseillere && (
          <span style={{ fontSize: 10, color: "var(--muted2)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px", marginLeft: "auto" }}>
            👤 {lead.conseillere.trim().split(" ")[0]}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ZONE TRAITEMENT ──────────────────────────────────────────────────────────

function ZoneTraitement({ lead, onUpdate }) {
  const cta = getMainCTA(lead.statut);
  const fermé = ["Annulé", "Pas intéressé", "Numéro faux", "Confirmé"].includes(lead.statut);

  const actifs = STATUTS.filter(s => s.group === "actif" && s.key !== lead.statut);
  const fermés = STATUTS.filter(s => s.group === "fermé" && s.key !== lead.statut);

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
    }}>
      {/* Header bloc */}
      <div style={{
        padding: "10px 14px",
        background: fermé ? "var(--surface2)" : "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: fermé ? "var(--muted2)" : "rgba(255,255,255,.5)" }}>
          Zone de traitement
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: fermé ? "var(--muted)" : "rgba(255,255,255,.9)", marginTop: 2 }}>
          {lead.statut === "Confirmé" ? "✅ Lead confirmé — commande validée" :
           lead.statut === "Annulé" ? "❌ Lead annulé" :
           lead.statut === "Pas intéressé" ? "🚫 Lead clôturé" :
           lead.statut === "Numéro faux" ? "⚠️ Numéro invalide" :
           "Choisir l'issue de cet appel"}
        </div>
      </div>

      <div style={{ padding: "14px" }}>
        {/* CTA Principal */}
        {cta && (
          <button
            onClick={() => onUpdate(cta.next)}
            style={{
              width: "100%", padding: "13px 16px",
              background: cta.color, color: "#fff",
              border: "none", borderRadius: "var(--radius)",
              fontSize: 14, fontWeight: 800, cursor: "pointer",
              boxShadow: `0 4px 14px ${cta.shadow}44`,
              letterSpacing: ".01em",
              transition: "all .15s",
              marginBottom: 10,
            }}
            onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}
          >
            {cta.label}
          </button>
        )}

        {/* Actions actives */}
        {!fermé && actifs.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {actifs.map(s => (
              <button
                key={s.key}
                onClick={() => onUpdate(s.key)}
                style={{
                  flex: 1, padding: "8px 6px",
                  background: s.bg, color: s.color,
                  border: `1px solid ${s.color}33`,
                  borderRadius: 6, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", textAlign: "center",
                  transition: "all .12s",
                }}
                onMouseOver={e => e.currentTarget.style.boxShadow = `0 2px 8px ${s.color}33`}
                onMouseOut={e => e.currentTarget.style.boxShadow = "none"}
              >
                <div style={{ fontSize: 14 }}>{s.emoji}</div>
                <div style={{ fontSize: 10, marginTop: 2 }}>{s.key}</div>
              </button>
            ))}
          </div>
        )}

        {/* Clôture */}
        {!fermé && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted2)", marginBottom: 7 }}>Clôturer</div>
            <div style={{ display: "flex", gap: 6 }}>
              {fermés.map(s => (
                <button
                  key={s.key}
                  onClick={() => onUpdate(s.key)}
                  style={{
                    flex: 1, padding: "7px 6px",
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6, fontSize: 10, fontWeight: 600,
                    color: "var(--muted)", cursor: "pointer",
                    transition: "all .12s",
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = s.bg; e.currentTarget.style.color = s.color; e.currentTarget.style.borderColor = s.color + "44"; }}
                  onMouseOut={e => { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  {s.emoji} {s.key}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Si fermé — réouvrir */}
        {fermé && lead.statut !== "Confirmé" && (
          <button
            onClick={() => onUpdate("À appeler")}
            style={{
              width: "100%", padding: "8px", background: "var(--surface2)",
              border: "1px solid var(--border)", borderRadius: 6,
              fontSize: 12, fontWeight: 600, color: "var(--muted)", cursor: "pointer",
            }}
          >
            🔄 Réouvrir ce lead
          </button>
        )}
      </div>
    </div>
  );
}

// ─── TIMELINE ─────────────────────────────────────────────────────────────────

function LeadTimeline({ events }) {
  if (!events || events.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--muted2)", fontStyle: "italic", padding: "8px 0" }}>Aucun historique</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {events.slice(0, 6).map((ev, i) => (
        <div key={i} style={{ display: "flex", gap: 10, position: "relative", paddingBottom: 10 }}>
          {i < Math.min(events.length - 1, 5) && (
            <div style={{ position: "absolute", left: 5, top: 14, width: 1, height: "calc(100% - 4px)", background: "var(--border)" }} />
          )}
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--blue-lt)", border: "2px solid var(--blue)", flexShrink: 0, marginTop: 3 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{ev.type || ev.statut}</div>
            {ev.note && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{ev.note}</div>}
            <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 1, fontFamily: "JetBrains Mono, monospace" }}>
              {fmtHeure(ev.created_at)} · {timeAgo(ev.created_at)} ago
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── DETAIL PANEL ─────────────────────────────────────────────────────────────

function LeadDetailPanel({ lead, events, onClose, onUpdate }) {
  const [commentaire, setCommentaire] = useState(lead.commentaire || "");
  const [saving,      setSaving]      = useState(false);
  const saveTimeout = useRef(null);

  useEffect(() => { setCommentaire(lead.commentaire || ""); }, [lead.id]);

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

  const urgent  = isUrgent(lead);
  const overdue = isOverdue(lead);

  return (
    <aside style={{
      width: 360, flexShrink: 0,
      background: "var(--surface)",
      borderLeft: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px",
        background: urgent ? "#FFF5F5" : overdue ? "#FFFDF0" : "var(--surface2)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)", letterSpacing: "-.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lead.client_nom || "Sans nom"}
            </div>
            {(urgent || overdue) && (
              <div style={{ fontSize: 10, fontWeight: 800, color: urgent ? "#DC2626" : "#D97706", marginTop: 2, letterSpacing: ".05em" }}>
                {urgent ? "⚡ URGENT — Appeler maintenant" : "⏰ RAPPEL EN RETARD"}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 20, cursor: "pointer", padding: "0 2px", flexShrink: 0, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ marginBottom: 10 }}>
          <StatusBadge statut={lead.statut} size="md" />
        </div>

        {/* Contact */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <a href={`tel:${lead.telephone}`} style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontSize: 15, color: "var(--blue)", fontWeight: 800,
            textDecoration: "none", fontFamily: "JetBrains Mono, monospace",
            padding: "6px 10px", background: "var(--blue-lt)",
            borderRadius: 6, border: "1px solid #BFDBFE",
            width: "fit-content",
          }}>
            📞 {lead.telephone}
          </a>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
            {lead.ville && <span style={{ fontSize: 12, color: "var(--muted)" }}>📍 {lead.ville}{lead.adresse ? ` · ${lead.adresse}` : ""}</span>}
            {lead.conseillere && <span style={{ fontSize: 12, color: "var(--muted)" }}>👤 {lead.conseillere.trim()}</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted2)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
            🕐 {fmtDateComplete(lead.created_at)} · il y a {timeAgo(lead.created_at)}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── ZONE TRAITEMENT (premier, dominant) ── */}
        <ZoneTraitement lead={lead} onUpdate={onUpdate} />

        {/* Commande */}
        {lead.produit && (
          <section>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted2)", marginBottom: 7 }}>Commande</div>
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 6 }}>{lead.produit}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {lead.quantite && <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px" }}>Qté {lead.quantite}</span>}
                {lead.prix > 0 && <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--blue)", background: "var(--blue-lt)", border: "1px solid #BFDBFE", borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>{lead.prix} MAD</span>}
                {lead.source && <span style={{ fontSize: 11, color: "var(--muted2)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px" }}>via {lead.source}</span>}
              </div>
            </div>
          </section>
        )}

        {/* Timeline */}
        <section>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted2)", marginBottom: 7 }}>Historique</div>
          <LeadTimeline events={events} />
        </section>

        {/* Note */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted2)" }}>Note opérateur</div>
            {saving  && <span style={{ fontSize: 10, color: "var(--muted2)", fontStyle: "italic" }}>⏳ Sauvegarde...</span>}
            {!saving && commentaire && <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 600 }}>✓ Sauvegardé</span>}
          </div>
          <textarea
            value={commentaire}
            onChange={e => handleCommentChange(e.target.value)}
            placeholder="Ajouter une note sur ce lead..."
            style={{
              width: "100%", minHeight: 80,
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", color: "var(--text)",
              padding: "9px 11px", fontSize: 12, resize: "vertical",
              outline: "none", lineHeight: 1.6, fontFamily: "Inter, sans-serif",
              transition: "border-color .12s", boxSizing: "border-box",
            }}
            onFocus={e => e.target.style.borderColor = "var(--blue)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </section>
      </div>
    </aside>
  );
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────

export default function Leads({ role, nom }) {
  const [leads,              setLeads]              = useState([]);
  const [events,             setEvents]             = useState([]);
  const [loading,            setLoading]            = useState(true);
  const [filtreStatut,       setFiltreStatut]       = useState("tous");
  const [filtreConseillere,  setFiltreConseillere]  = useState("tous");
  const [search,             setSearch]             = useState("");
  const [selected,           setSelected]           = useState(null);

  useEffect(() => {
    fetchLeads();
    const ch = supabase.channel("leads-rt4")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, fetchLeads)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  useEffect(() => {
    if (selected) fetchEvents(selected.id);
  }, [selected?.id]);

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
    const { data } = await supabase
      .from("lead_events").select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }).limit(6);
    setEvents(data || []);
  }

async function updateStatut(id, statut) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, statut } : l));
    setSelected(prev => prev?.id === id ? { ...prev, statut } : prev);

    await supabase.from("leads").update({ statut }).eq("id", id);
    await supabase.from("lead_events").insert([{
      lead_id: id,
      type: `Statut → ${statut}`,
      created_at: new Date().toISOString()
    }]);

    // Création commande si lead confirmé
    if (statut === "Confirmé") {
      const lead = leads.find(l => l.id === id);
      if (lead) {
        const { data: existing } = await supabase
          .from("commandes")
          .select("id")
          .eq("lead_id", id)
          .maybeSingle();

        if (!existing) {
          await supabase.from("commandes").insert([{
            lead_id:     id,
            client_nom:  lead.client_nom,
            telephone:   lead.telephone,
            ville:       lead.ville,
            adresse:     lead.adresse,
            produit:     lead.produit,
            quantite:    lead.quantite || 1,
            prix:        lead.prix,
            source:      lead.source,
            conseillere: lead.conseillere,
            statut:      "À expédier",
            created_at:  new Date().toISOString(),
          }]);
        }
      }
    }

    if (selected?.id === id) fetchEvents(id);
    try {
      await fetch(WEBHOOK + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut })
      });
    } catch {}
  }

  // ── KPIs globaux ──
  const today = new Date().toDateString();
  const kpis = {
    total:     leads.length,
    aTraiter:  leads.filter(l => ["À appeler", "Demande de rappel", "Injoignable"].includes(l.statut)).length,
    confirmes: leads.filter(l => l.statut === "Confirmé" && new Date(l.updated_at || l.created_at).toDateString() === today).length,
    urgents:   leads.filter(isUrgent).length,
    retards:   leads.filter(isOverdue).length,
  };

  const count = f => f === "tous" ? leads.length : leads.filter(l => l.statut === f).length;

  // ── Filtrage ──
  const filtered = leads
    .filter(l => filtreStatut === "tous" || l.statut === filtreStatut)
    .filter(l => filtreConseillere === "tous" || l.conseillere === filtreConseillere)
    .filter(l => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (l.client_nom||"").toLowerCase().includes(q)
          || (l.telephone||"").includes(q)
          || (l.ville||"").toLowerCase().includes(q)
          || (l.produit||"").toLowerCase().includes(q);
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>

      {/* ── ZONE 1 — KPIs ── */}
      <div style={{
        display: "flex", gap: 8, padding: "12px 24px",
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        flexShrink: 0, flexWrap: "wrap",
      }}>
        {[
          { label: "Total",          val: kpis.total,     alert: false,              color: "var(--text)" },
          { label: "À traiter",      val: kpis.aTraiter,  alert: kpis.aTraiter > 0,  color: "#2563EB" },
          { label: "Confirmés auj.", val: kpis.confirmes, alert: false,              color: "#16A34A" },
          { label: "Urgents",        val: kpis.urgents,   alert: kpis.urgents > 0,   color: "#DC2626" },
          ...(role === "admin" ? [{ label: "Rappels retard", val: kpis.retards, alert: kpis.retards > 0, color: "#D97706" }] : []),
        ].map((k, i) => (
          <div key={i} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "8px 18px",
            background: k.alert ? `${k.color}0D` : "var(--surface2)",
            border: `1px solid ${k.alert ? k.color + "33" : "var(--border)"}`,
            borderRadius: "var(--radius)", minWidth: 85,
          }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: k.alert ? k.color : "var(--text)", fontFamily: "JetBrains Mono, monospace", lineHeight: 1.2 }}>{k.val}</span>
            <span style={{ fontSize: 10, color: "var(--muted2)", fontWeight: 500, marginTop: 2, whiteSpace: "nowrap" }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* ── ZONE 2 — Conseillères (admin only) ── */}
      {role === "admin" && (
        <ConseillereStats
          leads={leads}
          filtreConseillere={filtreConseillere}
          setFiltreConseillere={setFiltreConseillere}
        />
      )}

      {/* ── ZONE 3 — Toolbar ── */}
      <div style={{
        display: "flex", gap: 10, padding: "10px 24px",
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        flexShrink: 0, flexWrap: "wrap", alignItems: "center",
      }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 280 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--muted2)", pointerEvents: "none" }}>🔍</span>
          <input
            style={{
              width: "100%", padding: "7px 12px 7px 32px",
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", fontSize: 13, color: "var(--text)",
              outline: "none", boxSizing: "border-box", transition: "border-color .12s",
            }}
            placeholder="Nom, téléphone, ville..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={e => e.target.style.borderColor = "var(--blue)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {FILTRES_STATUT.map(f => {
            const active = filtreStatut === f;
            const s = S[f];
            return (
              <button key={f} onClick={() => setFiltreStatut(f)} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "5px 10px", borderRadius: 20,
                border: `1px solid ${active && s ? s.color + "44" : "var(--border)"}`,
                background: active && s ? s.bg : active ? "var(--blue-lt)" : "var(--surface)",
                color: active && s ? s.color : active ? "var(--blue)" : "var(--muted)",
                fontSize: 11, fontWeight: active ? 700 : 500, cursor: "pointer",
                transition: "all .12s", whiteSpace: "nowrap",
              }}>
                {active && s?.emoji ? `${s.emoji} ` : ""}{f}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "0 4px", borderRadius: 8,
                  background: "rgba(0,0,0,.06)", color: "inherit",
                  fontFamily: "JetBrains Mono, monospace",
                }}>{count(f)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ZONE 4+5 — Liste + Panel ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* Liste */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "10px 14px",
          scrollbarWidth: "thin", scrollbarColor: "var(--border2) transparent",
        }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48, gap: 10, color: "var(--muted2)", fontSize: 13 }}>
              <div style={{ width: 22, height: 22, border: "2px solid var(--border2)", borderTopColor: "var(--blue)", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 12, textAlign: "center" }}>
              <div style={{ fontSize: 40, opacity: .4 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Aucun lead</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Essaie un autre filtre</div>
            </div>
          ) : filtered.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              selected={selected?.id === lead.id}
              onClick={() => setSelected(lead)}
            />
          ))}
        </div>

        {/* Panel */}
        {selected && (
          <LeadDetailPanel
            lead={selected}
            events={events}
            onClose={() => setSelected(null)}
            onUpdate={statut => updateStatut(selected.id, statut)}
          />
        )}
      </div>
    </div>
  );
}
