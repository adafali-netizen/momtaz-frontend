import { useMemo, useState } from "react";
import { construireEtude, resumePages } from "./etudeLib";

// Gardé en mémoire tant que l'onglet du navigateur reste ouvert (changer d'onglet dans l'ERP ne l'efface pas)
export const etudeEtat = { resultats: [], mots: "" };

const carte = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 };

async function telechargerExcel(lignes, pages) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(lignes);
  ws1["!cols"] = Object.keys(lignes[0] || {}).map(k => ({ wch: k.startsWith("Texte") ? 60 : k.startsWith("Lien") ? 40 : 18 }));
  XLSX.utils.book_append_sheet(wb, ws1, "Pubs");
  const ws2 = XLSX.utils.json_to_sheet(pages);
  ws2["!cols"] = Object.keys(pages[0] || {}).map(k => ({ wch: k.startsWith("Lien") ? 40 : 20 }));
  XLSX.utils.book_append_sheet(wb, ws2, "Pages");
  XLSX.writeFile(wb, `etude_marche_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.xlsx`);
}

export default function EtudeMarche({ ext, run, onLancer, onStop, version }) {
  const [mots, setMots] = useState(etudeEtat.mots);
  const [statut, setStatut] = useState("all");
  const [maxPubs, setMaxPubs] = useState(300);
  const [, setTick] = useState(0);
  const [erreur, setErreur] = useState("");

  // version change à chaque mot-clé terminé : on recalcule le tableau
  const lignes = useMemo(() => construireEtude(etudeEtat.resultats), [version, run]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = useMemo(() => resumePages(lignes), [lignes]);
  const enCours = run && run.type === "etude";
  const liste = mots.split(/\n+/).map(m => m.trim()).filter(Boolean);

  const lancer = () => {
    etudeEtat.mots = mots;
    onLancer([...new Set(liste)], { statut, pays: "MA", maxPubs: Number(maxPubs) || 300 });
  };

  const vider = () => {
    if (!window.confirm("Effacer les résultats de l'étude en cours ?")) return;
    etudeEtat.resultats = [];
    setTick(t => t + 1);
  };

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      {!ext && (
        <div className="alert-banner" style={{ margin: 0, background: "var(--orange-lt)", color: "var(--orange)", border: "1px solid #FDE68A" }}>
          Extension « Momtaz Veille » non détectée. Ouvre l'ERP dans le profil Chrome « Veille » où l'extension est installée.
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <section style={{ ...carte, flex: "1 1 360px", maxWidth: 520, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Mots-clés de l'étude</div>
          <div className="col-muted">Un mot-clé par ligne, en français, arabe ou darija. Chaque mot-clé prend 1 à 3 minutes.</div>
          <textarea className="form-input" rows={8} value={mots} onChange={e => { setMots(e.target.value); etudeEtat.mots = e.target.value; }}
            placeholder={"coussin de voyage\nوسادة السفر\nbas de contention"} style={{ resize: "vertical" }} disabled={!!enCours} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 13 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Pubs
              <select className="form-select" style={{ width: "auto" }} value={statut} onChange={e => setStatut(e.target.value)} disabled={!!enCours}>
                <option value="all">Actives et inactives</option>
                <option value="active">Actives seulement</option>
              </select>
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Maximum par mot-clé
              <input type="number" min={30} max={1000} step={10} className="form-input" style={{ width: 80 }} value={maxPubs} onChange={e => setMaxPubs(e.target.value)} disabled={!!enCours} />
            </label>
            <span className="col-muted">Pays : Maroc</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {enCours
              ? <button className="btn btn-danger" onClick={onStop}>Arrêter (les résultats déjà relevés sont gardés)</button>
              : <button className="btn btn-primary" disabled={!ext || !!run || !liste.length} onClick={lancer}>Lancer l'étude ({liste.length} mot{liste.length > 1 ? "s" : ""}-clé{liste.length > 1 ? "s" : ""})</button>}
          </div>
        </section>

        <section style={{ ...carte, flex: "1 1 300px", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Résultats</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            <div className="kpi-card" style={{ maxWidth: "none" }}><div className="kpi-value">{etudeEtat.resultats.length}</div><div className="kpi-label">Mots-clés relevés</div></div>
            <div className="kpi-card" style={{ maxWidth: "none" }}><div className="kpi-value">{lignes.length}</div><div className="kpi-label">Pubs</div></div>
            <div className="kpi-card" style={{ maxWidth: "none" }}><div className="kpi-value">{pages.length}</div><div className="kpi-label">Pages</div></div>
          </div>
          {etudeEtat.resultats.map(r => (
            <div key={r.mot} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
              <span style={{ fontWeight: 600 }}>{r.mot}</span>
              <span className="col-muted">{r.ads.length} pubs · {new Set(r.ads.map(a => a.page_id)).size} pages</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={!lignes.length} onClick={() => telechargerExcel(lignes, pages).catch(e => setErreur("Téléchargement impossible : " + e.message))}>Télécharger le fichier Excel</button>
            <button className="btn btn-secondary" disabled={!lignes.length || !!enCours} onClick={vider}>Nouvelle étude</button>
          </div>
          <div className="col-muted">Le fichier contient 2 onglets : « Pubs » (une ligne par pub) et « Pages » (une ligne par page). Les liens vidéo expirent après 2 à 4 jours. Pense à télécharger le fichier avant de fermer l'onglet.</div>
          {erreur && <div style={{ color: "var(--red)", fontWeight: 600 }}>{erreur}</div>}
        </section>
      </div>

      {pages.length > 0 && (
        <section style={{ ...carte, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>Pages du marché ({pages.length})</div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ minWidth: 900 }}>
              <thead><tr><th>Page</th><th style={{ textAlign: "right" }}>Pubs actives</th><th style={{ textAlign: "right" }}>Pubs relevées</th><th>Première diffusion</th><th>Prix vus</th><th>Boutons</th><th>Mots-clés</th></tr></thead>
              <tbody>
                {pages.slice(0, 100).map(p => (
                  <tr key={p["Lien de la page"]} style={{ cursor: "default" }}>
                    <td><a href={p["Lien de la page"]} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{p["Nom de la page"]}</a></td>
                    <td className="col-mono" style={{ textAlign: "right", fontWeight: 700 }}>{p["Pubs actives"]}</td>
                    <td className="col-mono" style={{ textAlign: "right" }}>{p["Pubs relevées"]}</td>
                    <td className="col-muted">{p["Première diffusion"]}</td>
                    <td className="col-muted">{p["Prix vus"]}</td>
                    <td className="col-muted">{p["Boutons"]}</td>
                    <td className="col-muted">{p["Mots-clés"]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
