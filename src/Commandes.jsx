import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

// ─── Constantes métier ────────────────────────────────────────────────────────

const TRANSPORTEURS_DEFAUT = ["Sendit", "Digylog", "Ameex", "Autre"];
const WEBHOOK = "https://momtaz-webhook.onrender.com/api/lead/";

// Statuts avec méta
const S_CMD = {
  "À expédier":            { color: "#2563EB", bg: "#EFF6FF",  emoji: "📦" },
  "Expédiée":              { color: "#0891B2", bg: "#ECFEFF",  emoji: "🚚" },
  "En cours de livraison": { color: "#7C3AED", bg: "#F5F3FF",  emoji: "🛵" },
  "Livrée":                { color: "#16A34A", bg: "#F0FDF4",  emoji: "✅" },
  "Retour en cours":       { color: "#DC2626", bg: "#FEF2F2",  emoji: "↩️" },
  "Retour reçu":           { color: "#7C3AED", bg: "#F5F3FF",  emoji: "📥" },
  "Annulée":               { color: "#DC2626", bg: "#FEF2F2",  emoji: "❌" },
  "Refusée à la livraison":{ color: "#DC2626", bg: "#FEF2F2",  emoji: "🚫" },
  "Injoignable":           { color: "#D97706", bg: "#FFFBEB",  emoji: "📵" },
  "Doublon":               { color: "#94A3B8", bg: "#F8FAFC",  emoji: "⊘"  },
  "Fausse commande":       { color: "#94A3B8", bg: "#F8FAFC",  emoji: "⊘"  },
};

// Transitions autorisées par statut courant
const TRANSITIONS = {
  "À expédier":            ["Expédiée", "Annulée", "Doublon", "Fausse commande"],
  "Expédiée":              ["En cours de livraison", "Livrée", "Retour en cours", "Injoignable"],
  "En cours de livraison": ["Livrée", "Retour en cours", "Injoignable", "Refusée à la livraison"],
  "Livrée":                ["Retour en cours"],
  "Retour en cours":       ["Retour reçu"],
  "Retour reçu":           [],
  "Annulée":               [], // admin only : ["À expédier"]
  "Refusée à la livraison":["Retour en cours"],
  "Injoignable":           ["En cours de livraison", "Retour en cours"],
  "Doublon":               [],
  "Fausse commande":       [],
};

// Statuts nécessitant transporteur + tracking
const STATUTS_EXPEDITION = ["Expédiée", "En cours de livraison", "Livrée", "Retour en cours", "Retour reçu", "Refusée à la livraison", "Injoignable"];
const STATUTS_TERMINAUX  = ["Retour reçu", "Doublon", "Fausse commande"];
const STATUTS_LIVRES     = ["Livrée"];
const STATUTS_RETOURS    = ["Retour en cours", "Retour reçu", "Refusée à la livraison"];

// KPI bandeau
const KPI_STATUTS = Object.keys(S_CMD);

// ─── SQL à créer dans Supabase si absent ─────────────────────────────────────
/*
CREATE TABLE IF NOT EXISTS commande_events (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  commande_id     uuid REFERENCES commandes(id) ON DELETE CASCADE,
  ancien_statut   text,
  nouveau_statut  text NOT NULL,
  user_nom        text,
  user_id         uuid,
  transporteur    text,
  tracking        text,
  note            text,
  created_at      timestamptz DEFAULT now()
);
*/

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtHeure(d) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Badge statut ─────────────────────────────────────────────────────────────
function BadgeStatut({ statut, size = "sm" }) {
  const m = S_CMD[statut] || { color: "#94A3B8", bg: "#F8FAFC", emoji: "•" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: size === "lg" ? 13 : 11, fontWeight: 700,
      padding: size === "lg" ? "5px 12px" : "3px 9px",
      borderRadius: 20, color: m.color, background: m.bg,
      border: `1px solid ${m.color}33`, whiteSpace: "nowrap",
    }}>
      {m.emoji} {statut}
    </span>
  );
}

// ─── Timeline événements ──────────────────────────────────────────────────────
function Timeline({ events }) {
  if (!events || events.length === 0) return (
    <div style={{ fontSize: 12, color: "#94A3B8", padding: "8px 0", fontStyle: "italic" }}>Aucun événement enregistré</div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {events.map((ev, i) => (
        <div key={ev.id || i} style={{ display: "flex", gap: 10, paddingBottom: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: S_CMD[ev.nouveau_statut]?.color || "#94A3B8", marginTop: 3, flexShrink: 0 }} />
            {i < events.length - 1 && <div style={{ width: 1, flex: 1, background: "#E2E8F0", marginTop: 4 }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <BadgeStatut statut={ev.nouveau_statut} />
              {ev.ancien_statut && <span style={{ fontSize: 10, color: "#94A3B8" }}>← {ev.ancien_statut}</span>}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>
              {ev.user_nom || "Système"} · {fmt(ev.created_at)} {fmtHeure(ev.created_at)}
            </div>
            {ev.tracking && <div style={{ fontSize: 11, color: "#64748B", fontFamily: "monospace", marginTop: 2 }}>🔍 {ev.tracking}</div>}
            {ev.transporteur && <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>🚚 {ev.transporteur}</div>}
            {ev.note && <div style={{ fontSize: 11, color: "#475569", marginTop: 2, fontStyle: "italic" }}>"{ev.note}"</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Modal nouvelle commande ──────────────────────────────────────────────────
function Modal({ onClose, onCreate, transporteurs }) {
  const [form, setForm] = useState({
    client_nom: "", telephone: "", produit: "", ville: "",
    quantite: 1, prix: "", transporteur: transporteurs[0] || "Sendit",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.client_nom || !form.telephone) return;
    await onCreate(form);
    onClose();
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, width: 520, boxShadow: "0 20px 60px rgba(0,0,0,.18)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>Nouvelle commande</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94A3B8", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["client_nom","Client *","Nom complet","text"],["telephone","Téléphone *","06XX XX XX XX","text"],["produit","Produit","Nom du produit","text"],["ville","Ville","Casablanca","text"]].map(([k,l,p,t]) => (
              <div key={k}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>{l}</div>
                <input type={t} value={form[k]} placeholder={p} onChange={e => set(k, e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Qté</div>
              <input type="number" min="1" value={form.quantite} onChange={e => set("quantite", +e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Prix (MAD)</div>
              <input type="number" value={form.prix} placeholder="299" onChange={e => set("prix", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Transporteur</div>
              <select value={form.transporteur} onChange={e => set("transporteur", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box" }}>
                {transporteurs.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid #E2E8F0", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>Annuler</button>
          <button onClick={submit} disabled={!form.client_nom || !form.telephone}
            style={{ padding: "9px 18px", background: !form.client_nom || !form.telephone ? "#E2E8F0" : "#2563EB", color: !form.client_nom || !form.telephone ? "#94A3B8" : "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: !form.client_nom || !form.telephone ? "not-allowed" : "pointer" }}>
            Créer la commande
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panneau droit : formulaire unifié ───────────────────────────────────────
function PanneauCommande({ selected, role, nom, transporteurs, events, onValider, onClose, saving }) {
  const isAdmin = role === "admin";
  const statutActuel = selected.statut;
  const meta = S_CMD[statutActuel] || { color: "#94A3B8", bg: "#F8FAFC", emoji: "•" };
  const isTerminal = STATUTS_TERMINAUX.includes(statutActuel);

  // Transitions disponibles
  const transitionsBase = TRANSITIONS[statutActuel] || [];
  const transitions = isAdmin
    ? [...new Set([...transitionsBase, ...(statutActuel === "Annulée" ? ["À expédier"] : [])])]
    : transitionsBase;

  // État formulaire
  const [nouveauStatut, setNouveauStatut] = useState(statutActuel);
  const [transporteur,  setTransporteur]  = useState(selected.transporteur || transporteurs[0] || "");
  const [tracking,      setTracking]      = useState(selected.tracking || "");
  const [fraisLivr,     setFraisLivr]     = useState(selected.frais_livraison || "");
  const [fraisRet,      setFraisRet]      = useState(selected.frais_retour || "");
  const [note,          setNote]          = useState("");
  const [activeTab,     setActiveTab]     = useState("traitement");

  // Sync si on change de commande sélectionnée
  useEffect(() => {
    setNouveauStatut(statutActuel);
    setTransporteur(selected.transporteur || transporteurs[0] || "");
    setTracking(selected.tracking || "");
    setFraisLivr(selected.frais_livraison || "");
    setFraisRet(selected.frais_retour || "");
    setNote("");
  }, [selected.id]);

  // Règles de visibilité champs expédition
  const needsExpedition = STATUTS_EXPEDITION.includes(nouveauStatut);
  const needsExpeditionRequired = nouveauStatut === "Expédiée";
  const needsRetour = STATUTS_RETOURS.includes(nouveauStatut) || (selected.frais_retour > 0);

  // Champs modifiables après expédition
  const dejaExpediee = STATUTS_EXPEDITION.includes(statutActuel);
  const expeditionLocked = dejaExpediee && !isAdmin;

  // Validation
  const statutChange = nouveauStatut !== statutActuel;
  const expeditionValide = !needsExpeditionRequired || (transporteur && tracking);
  const peutValider = statutChange && expeditionValide;

  const labelBouton = saving ? "Enregistrement…"
    : `Valider — ${S_CMD[nouveauStatut]?.emoji || ""} ${nouveauStatut}`;

  return (
    <aside style={{ width: 380, flexShrink: 0, background: "#fff", borderLeft: "1px solid #E2E8F0", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── En-tête client ── */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #E2E8F0", background: "#FAFAFA", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selected.client_nom || "Sans nom"}
            </div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
              {fmt(selected.created_at)}{selected.transporteur ? ` · 🚚 ${selected.transporteur}` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, color: "#64748B", fontSize: 16, cursor: "pointer", padding: "2px 8px", lineHeight: 1, flexShrink: 0, marginLeft: 8 }}>×</button>
        </div>

        <BadgeStatut statut={statutActuel} size="lg" />

        {/* Contact */}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <a href={`tel:${selected.telephone}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#2563EB", fontWeight: 700, textDecoration: "none", padding: "7px 11px", background: "#EFF6FF", borderRadius: 8, border: "1px solid #BFDBFE" }}>
            📞 {selected.telephone}
          </a>
          <a href={`https://wa.me/212${selected.telephone?.replace(/^0/, "")}`} target="_blank" rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#16A34A", fontWeight: 700, textDecoration: "none", padding: "7px 11px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0" }}>
            💬 WA
          </a>
        </div>

        {/* Tags */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {selected.ville    && <span style={{ fontSize: 11, color: "#64748B", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, padding: "2px 7px" }}>📍 {selected.ville}</span>}
          {selected.produit  && <span style={{ fontSize: 11, color: "#2563EB", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6, padding: "2px 7px", fontWeight: 600 }}>{selected.produit} × {selected.quantite || 1}</span>}
          {selected.prix     && <span style={{ fontSize: 11, color: "#64748B", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, padding: "2px 7px", fontFamily: "monospace" }}>{selected.prix} MAD</span>}
        </div>
      </div>

      {/* ── Onglets ── */}
      <div style={{ display: "flex", borderBottom: "1px solid #E2E8F0", flexShrink: 0 }}>
        {[["traitement", "Traitement"], ["historique", "Historique"]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            flex: 1, padding: "10px", background: activeTab === key ? "#fff" : "#FAFAFA",
            border: "none", borderBottom: activeTab === key ? "2px solid #2563EB" : "2px solid transparent",
            fontSize: 12, fontWeight: 700, color: activeTab === key ? "#2563EB" : "#94A3B8",
            cursor: "pointer", transition: "all .15s",
          }}>
            {label}
            {key === "historique" && events.length > 0 && (
              <span style={{ marginLeft: 5, fontSize: 10, background: "#EFF6FF", color: "#2563EB", borderRadius: 10, padding: "1px 5px" }}>{events.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Onglet Traitement ── */}
      {activeTab === "traitement" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 20px", flex: 1 }}>

            {/* Statut terminal */}
            {isTerminal ? (
              <div style={{ padding: "12px 14px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 13, color: "#94A3B8", textAlign: "center" }}>
                Statut final — aucune action possible
                {isAdmin && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#D97706" }}>Mode admin : rechargez la page pour débloquer</div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* ── 1. Statut ── */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#94A3B8", marginBottom: 6 }}>
                    Nouveau statut *
                  </div>
                  {transitions.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>Aucune transition disponible depuis ce statut</div>
                  ) : (
                    <select
                      value={nouveauStatut}
                      onChange={e => setNouveauStatut(e.target.value)}
                      disabled={saving}
                      style={{
                        width: "100%", padding: "10px 12px",
                        background: S_CMD[nouveauStatut]?.bg || "#F8FAFC",
                        border: `1.5px solid ${S_CMD[nouveauStatut]?.color || "#E2E8F0"}55`,
                        borderRadius: 9, fontSize: 13, fontWeight: 600,
                        color: S_CMD[nouveauStatut]?.color || "#1e293b",
                        cursor: "pointer", outline: "none", fontFamily: "inherit",
                      }}
                    >
                      <option value={statutActuel} disabled>
                        {S_CMD[statutActuel]?.emoji} {statutActuel} (actuel)
                      </option>
                      {transitions.map(s => (
                        <option key={s} value={s}>{S_CMD[s]?.emoji} {s}</option>
                      ))}
                    </select>
                  )}
                  {isAdmin && dejaExpediee && (
                    <div style={{ marginTop: 5, fontSize: 11, color: "#D97706", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, padding: "4px 8px" }}>
                      ⚠ Mode admin — toutes les transitions sont disponibles
                    </div>
                  )}
                </div>

                {/* ── 2. Expédition (conditionnel) ── */}
                {needsExpedition && (
                  <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#94A3B8" }}>
                      Expédition {needsExpeditionRequired && <span style={{ color: "#DC2626" }}>*</span>}
                    </div>

                    {/* Bandeau admin si après expédition */}
                    {expeditionLocked && (
                      <div style={{ fontSize: 11, color: "#94A3B8", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, padding: "6px 10px" }}>
                        🔒 Champs en lecture seule — commande déjà expédiée
                      </div>
                    )}
                    {dejaExpediee && isAdmin && (
                      <div style={{ fontSize: 11, color: "#D97706", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, padding: "6px 10px" }}>
                        ⚠ Admin — modification après expédition sera tracée
                      </div>
                    )}

                    {/* Transporteur */}
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>
                        Société de livraison {needsExpeditionRequired && <span style={{ color: "#DC2626" }}>*</span>}
                      </div>
                      {expeditionLocked ? (
                        <div style={{ padding: "9px 12px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, color: "#64748B" }}>
                          {transporteur || "—"}
                        </div>
                      ) : (
                        <select value={transporteur} onChange={e => setTransporteur(e.target.value)} disabled={saving}
                          style={{ width: "100%", padding: "9px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, background: "#fff", outline: "none", fontFamily: "inherit" }}>
                          <option value="">— Choisir —</option>
                          {transporteurs.map(t => <option key={t}>{t}</option>)}
                        </select>
                      )}
                    </div>

                    {/* Tracking */}
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>
                        N° de tracking {needsExpeditionRequired && <span style={{ color: "#DC2626" }}>*</span>}
                      </div>
                      {expeditionLocked ? (
                        <div style={{ padding: "9px 12px", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, color: "#64748B", fontFamily: "monospace" }}>
                          {tracking || "—"}
                        </div>
                      ) : (
                        <input
                          type="text" placeholder="Ex: SD123456789MA" value={tracking}
                          onChange={e => setTracking(e.target.value)} disabled={saving}
                          style={{ width: "100%", padding: "9px 12px", border: `1px solid ${needsExpeditionRequired && !tracking ? "#FCA5A5" : "#E2E8F0"}`, borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }}
                        />
                      )}
                    </div>

                    {/* Frais livraison */}
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Frais de livraison (MAD)</div>
                      <input
                        type="number" placeholder="25" value={fraisLivr}
                        onChange={e => setFraisLivr(e.target.value)} disabled={saving || expeditionLocked}
                        style={{ width: "100%", padding: "9px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: expeditionLocked ? "#F8FAFC" : "#fff" }}
                      />
                    </div>

                    {/* Frais retour si applicable */}
                    {needsRetour && (
                      <div>
                        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>Frais de retour (MAD)</div>
                        <input
                          type="number" placeholder="15" value={fraisRet}
                          onChange={e => setFraisRet(e.target.value)} disabled={saving}
                          style={{ width: "100%", padding: "9px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* ── 3. Note opérateur ── */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "#94A3B8", marginBottom: 6 }}>Note opérateur</div>
                  <textarea
                    value={note} onChange={e => setNote(e.target.value)} disabled={saving}
                    placeholder="Observation, contexte, instruction…"
                    rows={2}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", color: "#374151" }}
                  />
                </div>

                {/* ── Message validation ── */}
                {needsExpeditionRequired && !expeditionValide && (
                  <div style={{ fontSize: 12, color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7, padding: "8px 12px" }}>
                    ⚠ Transporteur et numéro de tracking requis pour passer en "Expédiée"
                  </div>
                )}

                {!statutChange && transitions.length > 0 && (
                  <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center" }}>
                    Sélectionnez un nouveau statut pour valider
                  </div>
                )}

                {/* ── Bouton unique ── */}
                <button
                  onClick={() => onValider({ id: selected.id, ancien_statut: statutActuel, nouveau_statut: nouveauStatut, transporteur, tracking, frais_livraison: fraisLivr, frais_retour: fraisRet, note })}
                  disabled={saving || !peutValider}
                  style={{
                    width: "100%", padding: "13px",
                    background: saving || !peutValider ? "#E2E8F0" : S_CMD[nouveauStatut]?.color || "#2563EB",
                    color: saving || !peutValider ? "#94A3B8" : "#fff",
                    border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
                    cursor: saving || !peutValider ? "not-allowed" : "pointer",
                    transition: "background .15s",
                  }}
                >
                  {labelBouton}
                </button>

              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Onglet Historique ── */}
      {activeTab === "historique" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <Timeline events={events} />
        </div>
      )}
    </aside>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Commandes({ role, nom }) {
  const [commandes,    setCommandes]   = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [filtre,       setFiltre]      = useState("tous");
  const [search,       setSearch]      = useState("");
  const [selected,     setSelected]    = useState(null);
  const [events,       setEvents]      = useState([]);
  const [showModal,    setShowModal]   = useState(false);
  const [saving,       setSaving]      = useState(false);
  const [transporteurs, setTransporteurs] = useState(TRANSPORTEURS_DEFAUT);

  // Fetch commandes
  const fetchCommandes = useCallback(async () => {
    const { data } = await supabase.from("commandes").select("*").order("created_at", { ascending: false });
    if (data) setCommandes(data);
    setLoading(false);
  }, []);

  // Fetch transporteurs depuis Supabase si la table existe
  const fetchTransporteurs = useCallback(async () => {
    const { data } = await supabase.from("transporteurs").select("nom").order("nom");
    if (data && data.length > 0) setTransporteurs(data.map(t => t.nom));
  }, []);

  // Fetch events pour commande sélectionnée
  const fetchEvents = useCallback(async (commandeId) => {
    const { data } = await supabase
      .from("commande_events")
      .select("*")
      .eq("commande_id", commandeId)
      .order("created_at", { ascending: false });
    if (data) setEvents(data);
  }, []);

  useEffect(() => {
    fetchCommandes();
    fetchTransporteurs();
    const ch = supabase.channel("commandes-rt5")
      .on("postgres_changes", { event: "*", schema: "public", table: "commandes" }, fetchCommandes)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  useEffect(() => {
    if (selected?.id) fetchEvents(selected.id);
    else setEvents([]);
  }, [selected?.id]);

  // Sélectionner commande
  function selectCommande(c) {
    setSelected(c);
  }

  // Créer commande
  async function createCommande(form) {
    await supabase.from("commandes").insert([{
      client_nom: form.client_nom, telephone: form.telephone,
      produit: form.produit, ville: form.ville,
      quantite: form.quantite, prix: form.prix || null,
      transporteur: form.transporteur, statut: "À expédier",
    }]);
    fetchCommandes();
  }

  // ── Valider commande (logique unifiée) ────────────────────────────────────
  async function handleValider({ id, ancien_statut, nouveau_statut, transporteur, tracking, frais_livraison, frais_retour, note }) {
    setSaving(true);
    try {
      // 1. Construire les updates commande
      const updates = { statut: nouveau_statut };
      if (transporteur) updates.transporteur = transporteur;
      if (tracking)     updates.tracking = tracking;
      if (frais_livraison !== "" && frais_livraison != null) updates.frais_livraison = +frais_livraison;
      if (frais_retour    !== "" && frais_retour    != null) updates.frais_retour    = +frais_retour;

      // Timestamps automatiques
      if (nouveau_statut === "Expédiée")              updates.date_expedition = new Date().toISOString();
      if (STATUTS_LIVRES.includes(nouveau_statut))    updates.date_livraison  = new Date().toISOString();
      if (nouveau_statut === "Retour reçu")            updates.date_retour     = new Date().toISOString();

      // 2. Update commande
      await supabase.from("commandes").update(updates).eq("id", id);

      // 3. Log événement dans commande_events
      const eventData = {
        commande_id:    id,
        ancien_statut,
        nouveau_statut,
        user_nom:       nom || "Utilisateur",
        transporteur:   transporteur || null,
        tracking:       tracking || null,
        note:           note || null,
      };
      // Tentative d'insert — ne bloque pas si table absente
      try { await supabase.from("commande_events").insert([eventData]); } catch {}

      // 4. Relevé bancaire si frais
      const cmd = commandes.find(c => c.id === id);
      const dateAujourd = new Date().toISOString().split("T")[0];
      const mois = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

      if (frais_livraison && +frais_livraison > 0) {
        await supabase.from("releve_bancaire").insert([{
          date: dateAujourd, mois,
          mode_paiement: transporteur || cmd?.transporteur || "—",
          categorie: "Logistique", intitule: "Frais livraison",
          debit: +frais_livraison, commande_id: id,
          produit: cmd?.produit || null,
          observation: `CMD ${id.slice(0, 8)} · ${nouveau_statut}`,
        }]);
      }
      if (frais_retour && +frais_retour > 0) {
        await supabase.from("releve_bancaire").insert([{
          date: dateAujourd, mois,
          mode_paiement: transporteur || cmd?.transporteur || "—",
          categorie: "Logistique", intitule: "Frais retour",
          debit: +frais_retour, commande_id: id,
          produit: cmd?.produit || null,
          observation: `CMD ${id.slice(0, 8)} · ${nouveau_statut}`,
        }]);
      }

      // 5. Webhook
      try {
        await fetch(WEBHOOK + id, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
      } catch {}

      // 6. Mise à jour locale
      const updated = { ...cmd, ...updates };
      setCommandes(prev => prev.map(c => c.id === id ? updated : c));
      setSelected(updated);
      await fetchEvents(id);

    } finally {
      setSaving(false);
    }
  }

  // ── KPI ───────────────────────────────────────────────────────────────────
  const total    = commandes.length;
  const cnt      = s => commandes.filter(c => c.statut === s).length;
  const livrees  = cnt("Livrée");
  const retours  = cnt("Retour en cours") + cnt("Retour reçu");
  const tauxLivr = pct(livrees, commandes.filter(c => !["Doublon","Fausse commande"].includes(c.statut)).length);

  const heroColor  = tauxLivr >= 60 ? "#16A34A" : tauxLivr >= 45 ? "#D97706" : total > 0 ? "#DC2626" : "#CBD5E1";
  const heroBg     = tauxLivr >= 60 ? "#F0FDF4" : tauxLivr >= 45 ? "#FFFBEB" : total > 0 ? "#FEF2F2" : "#fff";
  const heroBorder = tauxLivr >= 60 ? "#BBF7D0" : tauxLivr >= 45 ? "#FDE68A" : total > 0 ? "#FECACA" : "#E2E8F0";

  const kpiTries = KPI_STATUTS
    .map(k => ({ key: k, n: cnt(k), p: pct(cnt(k), total), ...S_CMD[k] }))
    .filter(s => s.n > 0)
    .sort((a, b) => b.p - a.p);

  // ── Filtrage ──────────────────────────────────────────────────────────────
  const filtered = commandes.filter(c => {
    const matchFiltre = filtre === "tous"
      ? !["Doublon","Fausse commande"].includes(c.statut)
      : c.statut === filtre;
    if (!matchFiltre) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.client_nom || "").toLowerCase().includes(q) ||
      (c.telephone  || "").includes(q) ||
      (c.ville      || "").toLowerCase().includes(q) ||
      (c.produit    || "").toLowerCase().includes(q) ||
      (c.tracking   || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Alerte retours */}
      {retours > 0 && (
        <div style={{ margin: "12px 24px 0", padding: "9px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 13, color: "#DC2626", fontWeight: 600 }}>
          🔴 {retours} retour{retours > 1 ? "s" : ""} en cours
        </div>
      )}

      {/* ── KPI Bandeau ── */}
      <div style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "18px 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
          {/* Héro */}
          <div style={{ padding: "22px 28px", minWidth: 180, height: 124, background: heroBg, border: `1px solid ${heroBorder}`, borderTop: `4px solid ${heroColor}`, borderRadius: 14, boxShadow: "0 4px 16px rgba(0,0,0,.07)", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box" }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "#94A3B8" }}>Taux de livraison</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3 }}>
              <span style={{ fontSize: 56, fontWeight: 800, color: heroColor, lineHeight: 1 }}>{tauxLivr}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: heroColor, paddingBottom: 7 }}>%</span>
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>{livrees} livrées / {total}</div>
          </div>

          <div style={{ width: 1, background: "#E2E8F0", margin: "6px 0", alignSelf: "stretch" }} />

          {/* Total */}
          <div onClick={() => setFiltre("tous")} style={{ padding: "20px 24px", minWidth: 120, height: 124, background: filtre === "tous" ? "#EFF6FF" : "#fff", border: `1px solid ${filtre === "tous" ? "#BFDBFE" : "#E2E8F0"}`, borderRadius: 14, boxShadow: filtre === "tous" ? "0 0 0 3px #2563EB15" : "0 2px 8px rgba(0,0,0,.05)", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box", cursor: "pointer" }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "#94A3B8" }}>Total</div>
            <div style={{ fontSize: 38, fontWeight: 800, color: filtre === "tous" ? "#2563EB" : "#0F172A", lineHeight: 1 }}>{total}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{filtre === "tous" ? "✓ Tous" : "Tout voir"}</div>
          </div>

          <div style={{ width: 1, background: "#E2E8F0", margin: "6px 0", alignSelf: "stretch" }} />

          {/* Statuts */}
          <div style={{ display: "flex", gap: 8, alignItems: "stretch", flex: 1, flexWrap: "wrap" }}>
            {kpiTries.map(s => {
              const active = filtre === s.key;
              return (
                <div key={s.key} onClick={() => setFiltre(active ? "tous" : s.key)} style={{ padding: "16px 16px", minWidth: 80, height: 124, background: active ? s.color + "12" : "#fff", border: `1px solid ${active ? s.color : "#E2E8F0"}`, borderLeft: `4px solid ${s.color}`, borderRadius: 12, display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box", cursor: "pointer", transition: "all .15s" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: s.color + "99", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.key}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.p}<span style={{ fontSize: 13, fontWeight: 700 }}>%</span></div>
                  <div style={{ fontSize: 12, color: s.color + "99", fontWeight: 600 }}>{s.n} cmd</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Barre recherche ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "10px 24px", flexShrink: 0, display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#94A3B8", pointerEvents: "none" }}>🔍</span>
          <input
            style={{ width: "100%", padding: "8px 12px 8px 32px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 9, fontSize: 13, outline: "none", boxSizing: "border-box" }}
            placeholder="Client, téléphone, ville, produit, tracking…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>}
        </div>
        <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: "auto" }}>
          {filtered.length} commande{filtered.length > 1 ? "s" : ""}
          {filtre !== "tous" && <span style={{ marginLeft: 6, color: "#2563EB", fontWeight: 600 }}>· filtre actif</span>}
        </span>
        <button onClick={() => setShowModal(true)} style={{ padding: "8px 14px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          + Commande
        </button>
      </div>

      {/* ── Corps ── */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48, color: "#94A3B8", fontSize: 13, gap: 10 }}>
          <div style={{ width: 20, height: 20, border: "2px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 12, textAlign: "center" }}>
          <div style={{ fontSize: 40, opacity: .4 }}>📦</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aucune commande</div>
          <div style={{ fontSize: 13, color: "#94A3B8" }}>Les commandes apparaissent automatiquement quand un lead est confirmé</div>
          <button onClick={() => setShowModal(true)} style={{ padding: "10px 20px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Commande manuelle
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Table */}
          <div className="table-wrap" style={{ flex: 1, overflow: "auto" }}>
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Client", "Téléphone", "Produit", "Ville", "Transporteur", "Tracking", "Frais livr.", "Statut", "Créé le"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#94A3B8", borderBottom: "1px solid #E2E8F0", textAlign: "left", whiteSpace: "nowrap", background: "#FAFAFA" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const m = S_CMD[c.statut] || {};
                  const isActive = selected?.id === c.id;
                  return (
                    <tr key={c.id}
                      onClick={() => selectCommande(c)}
                      style={{ cursor: "pointer", background: isActive ? "#EFF6FF" : "transparent", borderLeft: isActive ? "3px solid #2563EB" : "3px solid transparent" }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F8FAFC"; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#0F172A", borderBottom: "1px solid #F1F5F9" }}>{c.client_nom || "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748B", fontFamily: "monospace", borderBottom: "1px solid #F1F5F9" }}>{c.telephone}</td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #F1F5F9", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.produit || "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748B", borderBottom: "1px solid #F1F5F9" }}>{c.ville || "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748B", borderBottom: "1px solid #F1F5F9" }}>{c.transporteur || "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748B", fontFamily: "monospace", borderBottom: "1px solid #F1F5F9" }}>{c.tracking || <span style={{ color: "#CBD5E1" }}>—</span>}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#64748B", fontFamily: "monospace", borderBottom: "1px solid #F1F5F9" }}>{c.frais_livraison ? `${c.frais_livraison} MAD` : <span style={{ color: "#CBD5E1" }}>—</span>}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #F1F5F9" }}>
                        <BadgeStatut statut={c.statut} />
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#94A3B8", borderBottom: "1px solid #F1F5F9", whiteSpace: "nowrap" }}>{fmt(c.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Panneau droit */}
          {selected && (
            <PanneauCommande
              selected={selected}
              role={role}
              nom={nom}
              transporteurs={transporteurs}
              events={events}
              onValider={handleValider}
              onClose={() => setSelected(null)}
              saving={saving}
            />
          )}
        </div>
      )}

      {showModal && (
        <Modal
          onClose={() => setShowModal(false)}
          onCreate={createCommande}
          transporteurs={transporteurs}
        />
      )}
    </>
  );
}
