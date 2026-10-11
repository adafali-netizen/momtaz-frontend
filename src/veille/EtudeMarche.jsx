import { useEffect, useMemo, useState } from "react";
import { construireEtude, resumePages, PAYS, nomPays, paysValide } from "./etudeLib";
import { lireResultats, viderResultats, lireReglages, sauverReglages } from "./etudeStore";

const REGLAGES = lireReglages();

// Partagé avec le relevé (veilleRunner). Les résultats sont aussi sauvegardés dans le navigateur :
// ils reviennent après un rechargement ou une fermeture de l'onglet.
export const etudeEtat = { resultats: [], mots: REGLAGES.mots || "", charge: false, restaure: 0, nonSauve: false };

// Relit la sauvegarde une seule fois par ouverture de l'ERP
let chargement = null;
function chargerSauvegarde() {
  if (!chargement) {
    chargement = lireResultats()
      .then(sauves => {
        const deja = new Set(etudeEtat.resultats.map(r => (r.pays || "MA") + "|" + r.mot));
        const ajout = sauves.filter(r => !deja.has(r.pays + "|" + r.mot));
        etudeEtat.resultats.unshift(...ajout);
        etudeEtat.restaure = ajout.length;
      })
      .catch(() => { /* sauvegarde indisponible : l'étude reste en mémoire comme avant */ })
      .then(() => { etudeEtat.charge = true; });
  }
  return chargement;
}

const carte = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 };

// Durée maximale d'un mot-clé : un défilement toutes les 3,5 s environ, plus la pause entre deux mots-clés
const minutesParMot = max => Math.ceil(((Math.ceil(max / 8) + 10) * 3.5 + 60) / 60);
const fmtDuree = min => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`);

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

// Export de l'étude en mémoire : utilisé ici et par le message de fin d'étude (visible sur tous les onglets)
export async function telechargerEtude() {
  const lignes = construireEtude(etudeEtat.resultats);
  if (!lignes.length) throw new Error("aucune pub à exporter");
  await telechargerExcel(lignes, resumePages(lignes));
}

export default function EtudeMarche({ ext, run, onLancer, onStop, version }) {
  const [mots, setMots] = useState(etudeEtat.mots);
  const [statut, setStatut] = useState(REGLAGES.statut === "active" ? "active" : "all");
  const [maxPubs, setMaxPubs] = useState(REGLAGES.maxPubs || 300);
  const [exact, setExact] = useState(!!REGLAGES.exact);
  const [pays, setPays] = useState(paysValide(REGLAGES.pays));
  const [tick, setTick] = useState(0);
  const [erreur, setErreur] = useState("");

  // Au premier affichage : on récupère l'étude sauvegardée
  useEffect(() => {
    let actif = true;
    chargerSauvegarde().then(() => { if (actif) setTick(t => t + 1); });
    return () => { actif = false; };
  }, []);

  // Les réglages et les mots-clés saisis sont gardés d'une visite à l'autre
  useEffect(() => {
    etudeEtat.mots = mots;
    sauverReglages({ mots, statut, maxPubs: Number(maxPubs) || 300, exact, pays });
  }, [mots, statut, maxPubs, exact, pays]);

  // version change à chaque mot-clé terminé : on recalcule le tableau
  const lignes = useMemo(() => construireEtude(etudeEtat.resultats), [version, run, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = useMemo(() => resumePages(lignes), [lignes]);
  const enCours = run && run.type === "etude";
  const liste = [...new Set(mots.split(/\n+/).map(m => m.trim()).filter(Boolean))];
  const max = Math.min(1000, Math.max(30, Number(maxPubs) || 300));
  const faits = new Set(etudeEtat.resultats.filter(r => (r.pays || "MA") === pays).map(r => r.mot));
  const restants = liste.filter(m => !faits.has(m));
  const parMot = minutesParMot(max);

  const lancer = () => {
    etudeEtat.restaure = 0;
    onLancer(liste, { statut, pays, maxPubs: max, exact });
  };

  const vider = async () => {
    if (!window.confirm("Effacer les résultats de l'étude, y compris la sauvegarde ? Télécharge d'abord le fichier Excel si tu veux les garder.")) return;
    try { await viderResultats(); } catch { /* sauvegarde indisponible */ }
    etudeEtat.resultats = [];
    etudeEtat.restaure = 0;
    etudeEtat.nonSauve = false;
    setTick(t => t + 1);
  };

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      {!ext && (
        <div className="alert-banner" style={{ margin: 0, background: "var(--orange-lt)", color: "var(--orange)", border: "1px solid #FDE68A" }}>
          Extension « Momtaz Veille » non détectée. Ouvre l'ERP dans le profil Chrome « Veille » où l'extension est installée.
        </div>
      )}
      {etudeEtat.restaure > 0 && !enCours && (
        <div className="alert-banner" style={{ margin: 0, background: "var(--blue-lt)", color: "var(--blue)", border: "1px solid #BFDBFE" }}>
          Étude précédente retrouvée : {etudeEtat.restaure} mot{etudeEtat.restaure > 1 ? "s" : ""}-clé{etudeEtat.restaure > 1 ? "s" : ""} déjà relevé{etudeEtat.restaure > 1 ? "s" : ""}.
          {restants.length > 0 ? ` Clique sur « Lancer l'étude » pour continuer avec les ${restants.length} restant${restants.length > 1 ? "s" : ""}.` : " Tu peux télécharger le fichier Excel."}
        </div>
      )}
      {etudeEtat.nonSauve && (
        <div className="alert-banner" style={{ margin: 0, background: "var(--red-lt)", color: "var(--red)", border: "1px solid #FECACA" }}>
          La sauvegarde automatique n'a pas fonctionné pour au moins un mot-clé. Télécharge le fichier Excel avant de fermer ou de recharger cet onglet.
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <section style={{ ...carte, flex: "1 1 360px", maxWidth: 520, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Mots-clés de l'étude</div>
          <div className="col-muted">Un mot-clé par ligne, en français, arabe ou darija. Avec un maximum de {max} pubs, chaque mot-clé prend jusqu'à {parMot} minutes.</div>
          <textarea className="form-input" rows={8} value={mots} onChange={e => setMots(e.target.value)}
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
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Pays
              <select className="form-select" style={{ width: "auto" }} value={pays} onChange={e => setPays(e.target.value)} disabled={!!enCours}>
                {PAYS.map(g => g.groupe
                  ? <optgroup key={g.groupe} label={g.groupe}>{g.liste.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</optgroup>
                  : g.liste.map(([c, n]) => <option key={c} value={c}>{n}</option>))}
              </select>
            </label>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <input type="checkbox" checked={exact} onChange={e => setExact(e.target.checked)} disabled={!!enCours} style={{ marginTop: 3 }} />
            <span>
              <span style={{ fontWeight: 600 }}>Expression exacte</span>
              <span className="col-muted"> · seules les pubs qui contiennent le mot-clé tel quel, mots dans le même ordre. Moins de résultats hors sujet, mais moins de pubs.</span>
            </span>
          </label>
          {restants.length > 0 && (
            <div className="col-muted">
              {restants.length} mot{restants.length > 1 ? "s" : ""}-clé{restants.length > 1 ? "s" : ""} à relever pour {nomPays(pays)}{liste.length > restants.length ? ` (${liste.length - restants.length} déjà fait${liste.length - restants.length > 1 ? "s" : ""}, ignoré${liste.length - restants.length > 1 ? "s" : ""})` : ""} · durée maximale : environ {fmtDuree(restants.length * parMot)}.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {enCours
              ? <button className="btn btn-danger" onClick={onStop}>Arrêter (les résultats déjà relevés sont gardés)</button>
              : <button className="btn btn-primary" disabled={!ext || !!run || !liste.length || !etudeEtat.charge} onClick={lancer}>Lancer l'étude ({liste.length} mot{liste.length > 1 ? "s" : ""}-clé{liste.length > 1 ? "s" : ""})</button>}
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
            <div key={(r.pays || "MA") + "|" + r.mot} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
              <span style={{ fontWeight: 600 }}>{r.mot}<span className="col-muted" style={{ fontWeight: 400 }}> · {nomPays(r.pays)}{r.exact ? " · exacte" : ""}</span></span>
              <span className="col-muted" style={{ whiteSpace: "nowrap" }}>{r.ads.length} pubs · {new Set(r.ads.map(a => a.page_id)).size} pages</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={!lignes.length} onClick={() => telechargerExcel(lignes, pages).catch(e => setErreur("Téléchargement impossible : " + e.message))}>Télécharger le fichier Excel</button>
            <button className="btn btn-secondary" disabled={!etudeEtat.resultats.length || !!enCours} onClick={vider}>Nouvelle étude</button>
          </div>
          <div className="col-muted">
            Le fichier contient 2 onglets : « Pubs » (une ligne par pub) et « Pages » (une ligne par page). Les liens vidéo expirent après 2 à 4 jours.
            Chaque mot-clé terminé est sauvegardé dans ce navigateur : l'étude revient si tu recharges ou fermes l'onglet. « Nouvelle étude » efface cette sauvegarde.
          </div>
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
