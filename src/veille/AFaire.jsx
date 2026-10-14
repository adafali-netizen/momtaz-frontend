import { useState } from "react";

// Bandeau « À faire » : ce qui reste à faire à la main, avec un bouton qui mène au bon endroit.
// Une ligne disparaît dès que la tâche est faite.

const COULEURS = { rouge: "var(--red)", orange: "var(--orange)", bleu: "var(--blue)" };
const BOUTONS = {
  releve: "Relever ces pages",
  ecarts: "Voir les écarts",
  regroupements: "Valider ou refuser",
  saisir: "Voir les produits",
  lire: "Lire maintenant",
  homonymes: "Nommer les pages",
};

const fmtProchaine = t => new Date(t).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function AFaire({ taches, prochaine, onAction, occupe }) {
  // Replié d'office quand rien n'est urgent (seulement des tâches bleues)
  const [reduit, setReduit] = useState(() => !taches.some(t => t.niveau === "rouge" || t.niveau === "orange"));
  if (!taches.length && !prochaine) return null;

  return (
    <div style={{ margin: "12px 24px 0", background: "var(--surface)", border: `1px solid ${taches.length ? "#FDE68A" : "var(--border)"}`, borderLeft: `4px solid ${taches.length ? "var(--orange)" : "var(--green)"}`, borderRadius: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {taches.length ? `À faire (${taches.length})` : "Rien à faire à la main"}
          {reduit && taches.length > 0 && <span className="col-muted" style={{ fontWeight: 400, fontSize: 12 }}> · {taches.map(t => t.nb ? `${t.nb} ${({ releve: "pages à relever", ecarts: "écarts de prix", regroupements: "regroupements", saisir: "prix à saisir", lire: "pages produit à lire", homonymes: "pages à nommer" })[t.id] || ""}` : "extension").join(" · ")}</span>}
          {prochaine && <span className="col-muted" style={{ fontWeight: 400, fontSize: 12 }}> · prochain relevé utile : {fmtProchaine(prochaine)}</span>}
        </span>
        {taches.length > 0 && <button className="btn btn-sm btn-secondary" onClick={() => setReduit(r => !r)}>{reduit ? "Afficher" : "Réduire"}</button>}
      </div>
      {!reduit && taches.map(t => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: "1px solid var(--border)", fontSize: 13 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: COULEURS[t.niveau] || "var(--muted)", flex: "none" }} />
          <span style={{ flex: 1, minWidth: 0 }}>{t.texte}</span>
          {BOUTONS[t.id] && (
            <button className="btn btn-sm btn-primary" disabled={occupe && (t.id === "releve" || t.id === "lire")} onClick={() => onAction(t)}>{BOUTONS[t.id]}</button>
          )}
        </div>
      ))}
    </div>
  );
}
