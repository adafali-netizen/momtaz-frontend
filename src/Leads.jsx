import { useEffect, useState, useCallback, useRef } from "react";
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

const FILTRES = ["tous", "À appeler", "Confirmé", "Injoignable", "Demande de rappel", "Annulé"];

// ─── UTILS ────────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  const h    = Math.floor(diff / 3600000);
  const d    = Math.floor(diff / 86400000);
  if (min < 1)  return "à l'instant";
  if (min < 60) return `il y a ${min}min`;
  if (h < 24)   return `il y a ${h}h`;
  return `il y a ${d}j`;
}

function isUrgent(lead) {
  if (lead.statut !== "À appeler") return false;
  const diff = Date.now() - new Date(lead.created_at).getTime();
  return diff > 60 * 60 * 1000;
}

function isOverdue(lead) {
  if (lead.statut !== "Demande de rappel") return false;
  if (!lead.rappel_at) return false;
  return new Date(lead.rappel_at) < new Date();
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

// ─── CTA PRINCIPAL PAR STATUT ─────────────────────────────────────────────────

function getMainCTA(statut) {
  switch (statut) {
    case "À appeler":         return { label: "✅ Confirmer la commande", next: "Confirmé",          color: "#16A34A" };
    case "Injoignable":       return { label: "🔔 Planifier un rappel",   next: "Demande de rappel", color: "#7C3AED" };
    case "Demande de rappel": return { label: "✅ Confirmer la commande", next: "Confirmé",          color: "#16A34A" };
    default:                  return null;
  }
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────

function StatusBadge({ statut, size = "sm" }) {
  const m = S[statut] || { color: "#64748B", bg: "#F8FAFC", emoji: "•" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: size === "sm" ? 10 : 12,
      fontWeight: 700, padding: size === "sm" ? "2px 8px" : "4px 10px",
      borderRadius: 20, color: m.color, background: m.bg,
      border: `1px solid ${m.color}22`, whiteSpace: "nowrap",
    }}>
      {m.emoji} {statut}
    </span>
  );
}

// ─── LEAD CARD ────────────────────────────────────────────────────────────────

function LeadCard({ lead, selected, onClick }) {
  const urgent   = isUrgent(lead);
  const overdue  = isOverdue(lead);
  const fermé    = ["Annulé", "Pas intéressé", "Numéro faux"].includes(lead.statut);
  const confirmé = lead.statut === "Confirmé";

  const borderColor = overdue ? "#D97706" : urgent ? "#DC2626" : confirmé ? "#16A34A" : selected ? "#2563EB" : "transparent";

  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? "#F0F6FF" : fermé ? "#FAFBFC" : "var(--surface)",
        border: `1px solid ${selected ? "#93C5FD" : "var(--border)"}`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: "var(--radius)",
        padding: "10px 14px",
        marginBottom: 4,
        cursor: "pointer",
        transition: "all .12s",
        opacity: fermé ? 0.6 : 1,
        boxShadow: selected ? "0 0 0 3px #2563EB15" : urgent ? "0 1px 4px #DC262615" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {(urgent || overdue) && (
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: urgent ? "#DC2626" : "#D97706", display: "inline-block", flexShrink: 0 }} />
          )}
          <span style={{ fontWeight: 700, fontSize: 13, color: fermé ? "var(--muted)" : "var(--text)" }}>
            {lead.client_nom || "Sans nom"}
          </span>
          {urgent  && <span style={{ fontSize: 9, fontWeight: 800, color: "#DC2626", background: "#FEF2F2", padding: "1px 6px", borderRadius: 4, letterSpacing: ".05em" }}>URGENT</span>}
          {overdue && <span style={{ fontSize: 9, fontWeight: 800, color: "#D97706", background: "#FFFBEB", padding: "1px 6px", borderRadius: 4, letterSpacing: ".05em" }}>RETARD</span>}
        </div>
        <StatusBadge statut={lead.statut} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--blue)", fontWeight: 600 }}>
          {lead.telephone}
        </span>
        <span style={{ fontSize: 10, color: "var(--muted2)", fontStyle: "italic" }}>
          {timeAgo(lead.created_at)}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
        {lead.source && (
          <span style={{ fontSize: 10, color: "var(--muted2)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>
            {lead.source}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── TIMELINE ─────────────────────────────────────────────────────────────────

function LeadTimeline({ events }) {
  if (!events || events.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--muted2)", textAlign: "center", padding: "12px 0", fontStyle: "italic" }}>
        Aucun historique
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {events.slice(0, 5).map((ev, i) => (
        <div key={i} style={{ display: "flex", gap: 10, position: "relative", paddingBottom: 10 }}>
          {i < Math.min(events.length - 1, 4) && (
            <div style={{ position: "absolute", left: 5, top: 14, width: 1, height: "calc(100% - 4px)", background: "var(--border)" }} />
          )}
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--border2)", border: "2px solid var(--surface)", flexShrink: 0, marginTop: 3 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{ev.type || ev.statut}</div>
            {ev.note && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1, wordBreak: "break-word" }}>{ev.note}</div>}
            <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{timeAgo(ev.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── STATUS ACTIONS ───────────────────────────────────────────────────────────

function LeadStatusActions({ lead, onUpdate }) {
  const cta        = getMainCTA(lead.statut);
  const secondaires = STATUTS.filter(s => s.key !== lead.statut && s.group !== "fermé");
  const fermés      = STATUTS.filter(s => s.group === "fermé" && s.key !== lead.statut);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {cta && (
        <button
          onClick={() => onUpdate(cta.next)}
          style={{
            width: "100%", padding: "10px 16px",
            background: cta.color, color: "#fff",
            border: "none", borderRadius: "var(--radius)",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: `0 2px 8px ${cta.color}33`,
            transition: "all .12s",
          }}
        >
          {cta.label}
        </button>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {secondaires.map(s => (
          <button
            key={s.key}
            onClick={() => onUpdate(s.key)}
            style={{
              padding: "6px 10px",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 6, fontSize: 11, fontWeight: 500,
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

      {fermés.length > 0 && (
        <div style={{ display: "flex", gap: 6, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
          {fermés.map(s => (
            <button
              key={s.key}
              onClick={() => onUpdate(s.key)}
              style={{
                padding: "5px 10px",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 6, fontSize: 11,
                color: "var(--muted2)", cursor: "pointer",
              }}
            >
              {s.emoji} {s.key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DETAIL PANEL ─────────────────────────────────────────────────────────────

function LeadDetailPanel({ lead, onClose, onUpdate, events }) {
  const [commentaire, setCommentaire] = useState(lead.commentaire || "");
  const [saving,      setSaving]      = useState(false);
  const saveTimeout = useRef(null);

  useEffect(() => {
    setCommentaire(lead.commentaire || "");
  }, [lead.id]);

  function handleCommentChange(val) {
    setCommentaire(val);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      await supabase.from("leads").update({ commentaire: val }).eq("id", lead.id);
      try {
        await fetch(WEBHOOK + lead.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentaire: val }),
        });
      } catch {}
      setSaving(false);
    }, 1500);
  }

  const urgent  = isUrgent(lead);
  const overdue = isOverdue(lead);

  return (
    <aside style={{
      width: 340, flexShrink: 0,
      background: "var(--surface)",
      borderLeft: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 18px 14px",
        borderBottom: "1px solid var(--border)",
        background: urgent ? "#FFF5F5" : overdue ? "#FFFBEB" : "var(--surface2)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)", letterSpacing: "-.01em" }}>
              {lead.client_nom || "Sans nom"}
            </div>
            {(urgent || overdue) && (
              <div style={{ fontSize: 10, fontWeight: 700, color: urgent ? "#DC2626" : "#D97706", marginTop: 2, letterSpacing: ".04em" }}>
                {urgent ? "⚡ URGENT — À traiter maintenant" : "⏰ RAPPEL EN RETARD"}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 18, cursor: "pointer", padding: "0 2px" }}>×</button>
        </div>

        <StatusBadge statut={lead.statut} size="md" />

        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          <a href={`tel:${lead.telephone}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--blue)", fontWeight: 700, textDecoration: "none", fontFamily: "JetBrains Mono, monospace" }}>
            📞 {lead.telephone}
          </a>
          {lead.ville && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>📍 {lead.ville}{lead.adresse ? ` — ${lead.adresse}` : ""}</div>
          )}
          {lead.conseillere && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>👤 {lead.conseillere}</div>
          )}
          <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 2 }}>
            🕐 {fmtDate(lead.created_at)} · {timeAgo(lead.created_at)}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Commande */}
        {lead.produit && (
          <section>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted2)", marginBottom: 8 }}>Commande</div>
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

        {/* Actions */}
        <section>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted2)", marginBottom: 8 }}>Action</div>
          <LeadStatusActions lead={lead} onUpdate={onUpdate} />
        </section>

        {/* Timeline */}
        <section>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted2)", marginBottom: 8 }}>Historique</div>
          <LeadTimeline events={events} />
        </section>

        {/* Note */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted2)" }}>Note opérateur</div>
            {saving  && <span style={{ fontSize: 10, color: "var(--muted2)", fontStyle: "italic" }}>Sauvegarde...</span>}
            {!saving && commentaire && <span style={{ fontSize: 10, color: "var(--green)" }}>✓ Sauvegardé</span>}
          </div>
          <textarea
            value={commentaire}
            onChange={e => handleCommentChange(e.target.value)}
            placeholder="Ajouter une note..."
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
  const [leads,    setLeads]    = useState([]);
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filtre,   setFiltre]   = useState("tous");
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchLeads();
    const ch = supabase.channel("leads-rt3")
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
      .from("lead_events")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(5);
    setEvents(data || []);
  }

  async function updateStatut(id, statut) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, statut } : l));
    setSelected(prev => prev?.id === id ? { ...prev, statut } : prev);

    await supabase.from("leads").update({ statut }).eq("id", id);

    // Log dans lead_events
    await supabase.from("lead_events").insert([{
      lead_id: id, type: `Statut → ${statut}`, created_at: new Date().toISOString()
    }]);
    if (selected?.id === id) fetchEvents(id);

    try {
      await fetch(WEBHOOK + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut }),
      });
    } catch {}
  }

  // KPIs
  const today = new Date().toDateString();
  const kpis = {
    total:     leads.length,
    aTraiter:  leads.filter(l => ["À appeler", "Demande de rappel", "Injoignable"].includes(l.statut)).length,
    confirmes: leads.filter(l => l.statut === "Confirmé" && new Date(l.updated_at || l.created_at).toDateString() === today).length,
    urgents:   leads.filter(isUrgent).length,
    retards:   leads.filter(isOverdue).length,
  };

  const count = f => f === "tous" ? leads.length : leads.filter(l => l.statut === f).length;

  const filtered = leads
    .filter(l => filtre === "tous" || l.statut === filtre)
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

      {/* ZONE 1 — KPIs */}
      <div style={{
        display: "flex", gap: 8, padding: "12px 24px",
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        flexShrink: 0, flexWrap: "wrap",
      }}>
        {[
          { label: "Total",          val: kpis.total,     color: "var(--text)",    alert: false },
          { label: "À traiter",      val: kpis.aTraiter,  color: "#2563EB",        alert: kpis.aTraiter > 0 },
          { label: "Confirmés auj.", val: kpis.confirmes, color: "#16A34A",        alert: false },
          { label: "Urgents",        val: kpis.urgents,   color: "#DC2626",        alert: kpis.urgents > 0 },
          ...(role === "admin" ? [{ label: "Rappels retard", val: kpis.retards, color: "#D97706", alert: kpis.retards > 0 }] : []),
        ].map((k, i) => (
          <div key={i} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "8px 16px",
            background: k.alert ? `${k.color}0D` : "var(--surface2)",
            border: `1px solid ${k.alert ? k.color + "33" : "var(--border)"}`,
            borderRadius: "var(--radius)", minWidth: 80,
          }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: k.alert ? k.color : "var(--text)", fontFamily: "JetBrains Mono, monospace", lineHeight: 1.2 }}>{k.val}</span>
            <span style={{ fontSize: 10, color: "var(--muted2)", fontWeight: 500, marginTop: 2, whiteSpace: "nowrap" }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* ZONE 2 — TOOLBAR */}
      <div style={{
        display: "flex", gap: 10, padding: "10px 24px",
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        flexShrink: 0, flexWrap: "wrap", alignItems: "center",
      }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 300 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--muted2)", pointerEvents: "none" }}>🔍</span>
          <input
            style={{
              width: "100%", padding: "7px 12px 7px 32px",
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", fontSize: 13, color: "var(--text)",
              outline: "none", boxSizing: "border-box", transition: "border-color .12s",
            }}
            placeholder="Nom, téléphone, ville, produit..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={e => e.target.style.borderColor = "var(--blue)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {FILTRES.map(f => {
            const active = filtre === f;
            const s = S[f];
            return (
              <button key={f} onClick={() => setFiltre(f)} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 20,
                border: `1px solid ${active && s ? s.color + "44" : "var(--border)"}`,
                background: active && s ? s.bg : active ? "var(--blue-lt)" : "var(--surface)",
                color: active && s ? s.color : active ? "var(--blue)" : "var(--muted)",
                fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
                transition: "all .12s",
              }}>
                {active && s?.emoji ? `${s.emoji} ` : ""}{f}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 8,
                  background: "rgba(0,0,0,.06)", color: "inherit",
                  fontFamily: "JetBrains Mono, monospace",
                }}>{count(f)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ZONE 3+4 — LISTE + PANEL */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{
          flex: 1, overflowY: "auto", padding: "12px 16px",
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
              <div style={{ fontSize: 15, fontWeight: 600 }}>Aucun lead trouvé</div>
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

        {selected && (
          <LeadDetailPanel
            lead={selected}
            events={events}
            onClose={() => setSelected(null)}
            onUpdate={(statut) => updateStatut(selected.id, statut)}
          />
        )}
      </div>
    </div>
  );
}
