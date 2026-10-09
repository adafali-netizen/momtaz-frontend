import { useState } from "react";
import { readMhtml, extractAds } from "./veilleLib";
import { saveReleve } from "./veilleData";

const fmtNb = n => n.toLocaleString("fr-FR");

export default function ImportModal({ pages, produits, onClose, onSaved }) {
  const [fichiers, setFichiers] = useState([]);
  const [lecture,  setLecture]  = useState(false);
  const [envoi,    setEnvoi]    = useState(false);
  const [erreur,   setErreur]   = useState("");

  const lire = async e => {
    const liste = [...e.target.files];
    if (!liste.length) return;
    setLecture(true); setErreur("");
    const out = [];
    for (const file of liste) {
      try {
        const raw = await file.text();
        const r = readMhtml(raw);
        const nomFichier = file.name.replace(/\.(mhtml|mht|html?)$/i, "").replace(/_/g, " ");
        const a = extractAds(r.html, r.url, nomFichier);
        out.push({ fichier: file.name, ...a, date: r.date, incomplet: r.incomplet });
      } catch (err) {
        out.push({ fichier: file.name, pageId: null, pageNom: null, cartes: [], date: new Date(), erreurLecture: String(err.message || err) });
      }
    }
    // Contrôles
    const vus = new Map();
    for (let i = out.length - 1; i >= 0; i--) {
      const f = out[i];
      if (f.pageId && vus.has(f.pageId)) { f.ignore = "Même page qu'un autre fichier de cet import : fichier ignoré"; continue; }
      if (f.pageId) vus.set(f.pageId, f);
    }
    for (const f of out) {
      if (f.ignore) continue;
      if (f.erreurLecture) { f.ignore = "Fichier illisible"; continue; }
      if (!f.pageId) { f.ignore = "Numéro de la page introuvable : ce n'est pas une page Ad Library"; continue; }
      if (!f.cartes.length) { f.ignore = "Aucune publicité trouvée dans ce fichier"; continue; }
      const alertes = [];
      if (f.incomplet) alertes.push("Enregistré en « HTML uniquement » : seules les ~30 premières pubs sont lues. Réenregistre en « Page Web, un seul fichier ».");
      const homonyme = pages.find(p => p.fb_page_id !== f.pageId && !p.nom_interne && p.nom && f.pageNom && p.nom.toLowerCase() === f.pageNom.toLowerCase());
      if (homonyme) alertes.push(`Une autre page suivie s'appelle aussi « ${f.pageNom} » (ID ${homonyme.fb_page_id}). Donne-leur un nom interne dans « Pages suivies ».`);
      if (!pages.some(p => p.fb_page_id === f.pageId)) alertes.push("Nouvelle page : elle sera ajoutée à tes pages suivies.");
      f.alertes = alertes;
    }
    setFichiers(out);
    setLecture(false);
  };

  const valides = fichiers.filter(f => !f.ignore);

  const enregistrer = async () => {
    setEnvoi(true); setErreur("");
    try {
      const res = await saveReleve(valides, pages, produits);
      onSaved(res);
    } catch (err) {
      setErreur("Erreur pendant l'enregistrement : " + (err.message || err));
      setEnvoi(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={envoi ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 860, maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Importer des pages Ad Library (.mhtml)</span>
          {!envoi && <button className="btn-close" onClick={onClose}>×</button>}
        </div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Sélectionne tous les fichiers d'un coup. Ils forment un seul relevé, comparé ensuite au relevé précédent de chaque page.
          </div>
          <input type="file" multiple accept=".mhtml,.mht" onChange={lire} disabled={lecture || envoi} />
          {lecture && <div style={{ fontSize: 13 }}><span className="loading-dot" /> Lecture des fichiers…</div>}

          {fichiers.length > 0 && (
            <table className="data-table">
              <thead>
                <tr><th>Fichier</th><th>Page</th><th style={{ textAlign: "right" }}>Créatives</th><th style={{ textAlign: "right" }}>Pubs</th><th>Contrôle</th></tr>
              </thead>
              <tbody>
                {fichiers.map(f => (
                  <tr key={f.fichier} style={{ cursor: "default" }}>
                    <td className="col-muted" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.fichier}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{f.pageNom || "—"}</div>
                      <div className="col-mono col-muted">{f.pageId ? "ID " + f.pageId : ""}</div>
                    </td>
                    <td className="col-mono" style={{ textAlign: "right" }}>{fmtNb(f.cartes.length)}</td>
                    <td className="col-mono" style={{ textAlign: "right" }}>{fmtNb(f.cartes.filter(c => !c.low).reduce((s, c) => s + c.nb, 0))}</td>
                    <td style={{ fontSize: 12 }}>
                      {f.ignore
                        ? <span style={{ color: "var(--red)", fontWeight: 600 }}>{f.ignore}</span>
                        : f.alertes.length
                          ? f.alertes.map((a, i) => <div key={i} style={{ color: a.startsWith("Nouvelle") ? "var(--blue)" : "var(--orange)" }}>{a}</div>)
                          : <span style={{ color: "var(--green)", fontWeight: 600 }}>OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {erreur && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{erreur}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={envoi}>Annuler</button>
          <button className="btn btn-primary" onClick={enregistrer} disabled={!valides.length || envoi || lecture}>
            {envoi ? "Enregistrement…" : `Enregistrer le relevé (${valides.length} page${valides.length > 1 ? "s" : ""})`}
          </button>
        </div>
      </div>
    </div>
  );
}
