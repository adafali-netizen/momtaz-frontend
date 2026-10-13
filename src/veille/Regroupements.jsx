import { useState } from "react";
import { PHASE_COULEURS, clePaire, versionAuMoins, nomRegroupement } from "./veilleLib";

// Regroupements proposés par le module, validés ou refusés par toi après un coup d'œil aux pages produit.
// Valider : les deux produits prennent le même nom de groupe (celui qui a le plus de pubs).
// Refuser : la paire est mémorisée et ne revient plus.

const carte = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 };
const fmtPrix = g => !g.prixMax ? "Prix ?" : g.prixMin === g.prixMax ? `${g.prixMax} DH` : `${g.prixMin}–${g.prixMax} DH`;

function Badge({ phase }) {
  if (!phase) return null;
  const [coul, fond] = PHASE_COULEURS[phase.phase] || PHASE_COULEURS["Trop tôt"];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, color: coul, background: fond, whiteSpace: "nowrap" }}>
      {phase.phase}{phase.phase !== "Trop tôt" ? (phase.actif ? " · actif" : " · à l'arrêt") : ""}
    </span>
  );
}

function Produit({ g }) {
  const photo = g.images[0] || g.thumb;
  const lien = (g.vendors.find(v => v.urls.length) || { urls: [] }).urls[0];
  return (
    <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", gap: 12 }}>
      {photo
        ? <a href={lien || photo} target="_blank" rel="noreferrer" style={{ flex: "none" }} title={lien ? "Ouvrir la page produit" : "Agrandir la photo"}>
            <img src={photo} alt="" loading="lazy" style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--border)" }}
              onError={e => { e.currentTarget.style.visibility = "hidden"; }} />
          </a>
        : <div style={{ width: 160, height: 160, borderRadius: 8, background: "var(--surface2)", flex: "none" }} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontWeight: 700 }}>{g.nom}</span>
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
          <Badge phase={g.phase} />
          <span className="col-muted">{fmtPrix(g)} · {g.pubs} pubs · {g.crea} créatives</span>
        </span>
        {g.vendors.map(v => (
          <div key={v.fb_page_id} style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
            <span style={{ fontWeight: 600 }}>{v.page} · {v.pubs} pubs{v.prix ? ` · ${v.prix} DH` : ""}</span>
            {v.urls.map(u => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary"
                style={{ alignSelf: "flex-start", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                Ouvrir la page produit ↗ <span className="col-muted" style={{ fontWeight: 400 }}>{u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 45)}</span>
              </a>
            ))}
            {!v.urls.length && <span className="col-muted">Pas de page produit (lien WhatsApp ou sans lien)</span>}
          </div>
        ))}
        {!g.images.length && <span className="col-muted" style={{ fontSize: 11 }}>Photo de la pub (page produit pas encore lue)</span>}
      </div>
    </div>
  );
}

export default function Regroupements({ suggestions, ext, onPatch, onRefuser, nbPhotos, nbProduits }) {
  const [occupe, setOccupe] = useState(null);
  const [limite, setLimite] = useState(20);

  const valider = async s => {
    const garde = s.a.pubs >= s.b.pubs ? s.a : s.b;
    setOccupe(clePaire(s.a, s.b));
    try { await onPatch([...s.a.ids, ...s.b.ids], { groupe: nomRegroupement(s.a, s.b), statut: garde.statut }); }
    finally { setOccupe(null); }
  };

  const refuser = async s => {
    setOccupe(clePaire(s.a, s.b));
    try { await onRefuser(clePaire(s.a, s.b)); }
    finally { setOccupe(null); }
  };

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      {ext && !versionAuMoins(ext.version, "1.0.8") && (
        <div className="alert-banner" style={{ margin: 0, background: "var(--orange-lt)", color: "var(--orange)", border: "1px solid #FDE68A" }}>
          Extension v{ext.version} : installe la version 1.0.8 pour lire les photos des pages produit. Sans elle, seuls les noms proches sont proposés.
        </div>
      )}
      <div style={{ ...carte, padding: "12px 16px", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
        <span><b>Même produit chez deux pages ?</b> Ouvre les pages produit, compare, puis valide ou refuse. Un regroupement validé compte pour le recoupement du score.</span>
        <span className="col-muted">
          Indices : même photo sur la page produit (marche entre un nom français et un nom arabe), ou mots communs dans le nom.
          Photos lues pour {nbPhotos} produit{nbPhotos > 1 ? "s" : ""} sur {nbProduits} : les autres sont lues au prochain relevé, ou avec « Capturer les prix et photos » dans le Classement.
        </span>
      </div>

      {!suggestions.length && <div className="col-muted" style={{ padding: 8 }}>Aucun regroupement à valider.</div>}

      {suggestions.slice(0, limite).map(s => {
        const cle = clePaire(s.a, s.b);
        return (
          <div key={cle} style={{ ...carte, padding: 14, display: "flex", flexDirection: "column", gap: 10, borderLeft: `4px solid ${s.photo ? "var(--green)" : "var(--blue)"}` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: s.photo ? "var(--green)" : "var(--blue)" }}>{s.raison}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
              <Produit g={s.a} />
              <Produit g={s.b} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-sm btn-secondary" disabled={occupe === cle} onClick={() => refuser(s)}>Refuser</button>
              <button className="btn btn-sm btn-primary" style={{ background: "var(--green)" }} disabled={occupe === cle || !s.a.ids.length || !s.b.ids.length}
                title={!s.a.ids.length || !s.b.ids.length ? "Produit sans fiche enregistrée : relance un relevé" : "Les deux produits prennent le même nom de groupe"}
                onClick={() => valider(s)}>Valider le regroupement</button>
            </div>
          </div>
        );
      })}
      {suggestions.length > limite && (
        <div style={{ textAlign: "center" }}>
          <button className="btn btn-secondary" onClick={() => setLimite(limite + 20)}>Afficher 20 de plus ({suggestions.length - limite} restants)</button>
        </div>
      )}
    </div>
  );
}
