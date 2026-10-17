// Process : la recherche de produits gagnants en 5 étapes, dans l'ordre, un bouton par étape.
import { useEffect, useMemo, useState } from "react";
import { pagesDues, candidatTest } from "./veilleLib";
import { cleMot, topProduits, jugerMots, propositionsMots, PAGES_PAR_SESSION, TOP_N } from "./motsLib";
import { loadRecherche } from "./veilleData";

const carte = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 };
const JOUR = 86400000;
const fmt = d => d ? new Date(d).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "jamais";
const ilYa = d => {
  if (!d) return null;
  const j = Math.floor((Date.now() - new Date(d).getTime()) / JOUR);
  return j <= 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} jours`;
};

export default function Process({ groups, pages, latest, releves, ext, run, version, onCollecter, onAnalyser, onRelever, onOuvrir }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState("");
  const [maxPages, setMaxPages] = useState(() => { try { return Number(localStorage.getItem("momtaz_pages_session")) || PAGES_PAR_SESSION; } catch { return PAGES_PAR_SESSION; } });
  const choisirMax = v => { setMaxPages(v); try { localStorage.setItem("momtaz_pages_session", String(v)); } catch { /* stockage indisponible */ } };

  useEffect(() => {
    loadRecherche().then(r => { setD(r); setErreur(""); }).catch(e => setErreur("Impossible de charger la recherche : " + (e.message || e)));
  }, [version]);

  const top = useMemo(() => topProduits(groups), [groups]);
  const mots = useMemo(() => {
    if (!d) return null;
    const juges = jugerMots(d.motscles.filter(m => m.actif), d.stats || {}, d.candidats, top);
    const props = propositionsMots(top, new Set(d.motscles.map(m => cleMot(m.mot))));
    return { aDesactiver: Object.values(juges).filter(j => j.verdict === "desactiver").length, propositions: props.length, actifs: Object.keys(juges).length };
  }, [d, top]);

  if (erreur) return <div className="alert-banner" style={{ background: "var(--red-lt)", color: "var(--red)", border: "1px solid #FECACA" }}>{erreur}</div>;
  if (!d || !mots) return <div style={{ padding: 24 }} className="col-muted"><span className="loading-dot" /> Chargement…</div>;

  const nbFile = Object.keys(d.file || {}).length;
  const collectes = d.recherches.filter(r => (r.nb_mots || 0) > 0);
  const analyses = d.recherches.filter(r => (r.nb_gardees || 0) + (r.nb_a_valider || 0) + (r.nb_eliminees || 0) > 0);
  const derniereCollecte = collectes[0]?.created_at || null;
  const derniereAnalyse = analyses[0] ? (analyses[0].fin || analyses[0].created_at) : null;
  const { dues } = pagesDues(pages, latest);
  const actives = pages.filter(p => p.actif).length;
  const dernierReleve = releves[0]?.created_at || null;
  const aValider = d.candidats.filter(c => c.decision === "a_valider").length;
  const candidats = groups.filter(candidatTest).length;
  const occupe = !!run || !ext;

  const etapes = [
    {
      n: 1, titre: "Trouver des pages", frequence: "1 fois par semaine, quand la file est presque vide",
      etat: `File d'attente : ${nbFile} pages · dernière collecte : ${fmt(derniereCollecte)}`,
      aFaire: nbFile < 60 && (!derniereCollecte || Date.now() - new Date(derniereCollecte).getTime() >= 7 * JOUR),
      action: `Collecter avec ${mots.actifs} mots-clés`, detail: `environ ${Math.round(mots.actifs * 1.6 / 60 * 10) / 10} h`,
      bouton: <button className="btn btn-secondary" disabled={occupe} onClick={() => { if (window.confirm(`Collecter des pages avec tes ${mots.actifs} mots-clés actifs ? Environ ${Math.round(mots.actifs * 1.6 / 60 * 10) / 10} h. Les pages vont dans la file, sans analyse.`)) onCollecter(); }}>Collecter</button>,
    },
    {
      n: 2, titre: "Trier les pages", frequence: "chaque nuit tant que la file n'est pas vide",
      etat: `${nbFile} pages à analyser · dernière analyse : ${fmt(derniereAnalyse)}${aValider ? ` · ${aValider} à valider à la main` : ""}`,
      aFaire: nbFile > 0,
      action: `Analyser ${Math.min(maxPages, nbFile) || maxPages} pages`, detail: `environ ${Math.round(Math.min(maxPages, nbFile || maxPages) * 1.8 / 60 * 10) / 10} h · les pages gardées rejoignent tes pages suivies`,
      bouton: (
        <span style={{ display: "flex", gap: 6 }}>
          <select className="form-select" style={{ width: "auto" }} value={maxPages} disabled={occupe} onChange={e => choisirMax(Number(e.target.value))}>
            {[60, 120, 200, 300].map(n => <option key={n} value={n}>{n} pages{n === 300 ? " (une nuit)" : ""}</option>)}
          </select>
          <button className="btn btn-primary" disabled={occupe || !nbFile} onClick={() => onAnalyser(maxPages)}>Analyser</button>
        </span>
      ),
      lien: aValider ? { label: `Voir les ${aValider} pages à valider`, vue: "trouver" } : { label: "Voir les résultats", vue: "trouver" },
    },
    {
      n: 3, titre: "Suivre les concurrents", frequence: "2 fois par semaine",
      etat: `${dues.length} pages à relever sur ${actives} · dernier relevé : ${fmt(dernierReleve)}`,
      aFaire: dues.length > 0,
      action: `Relever ${dues.length || actives} pages`, detail: "prix et photos des nouveaux produits lus à la fin",
      bouton: <button className="btn btn-primary" disabled={occupe || !actives} onClick={() => {
        const ids = (dues.length ? dues : pages.filter(p => p.actif)).map(p => p.fb_page_id);
        if (window.confirm(`Relever ${ids.length} pages maintenant ? Une page toutes les 30 à 60 secondes, puis prix et photos.`)) onRelever(ids);
      }}>Relever</button>,
      lien: { label: "Pages suivies", vue: "suivies" },
    },
    {
      n: 4, titre: "Classer les produits et régler les mots-clés", frequence: "après chaque relevé",
      etat: `Top ${TOP_N} calculé sur le dernier relevé (${ilYa(dernierReleve) || "aucun relevé"}) · ${mots.aDesactiver} mot${mots.aDesactiver > 1 ? "s" : ""}-clé${mots.aDesactiver > 1 ? "s" : ""} à désactiver · ${mots.propositions} nouveau${mots.propositions > 1 ? "x" : ""} mot${mots.propositions > 1 ? "s" : ""}-clé${mots.propositions > 1 ? "s" : ""} proposé${mots.propositions > 1 ? "s" : ""}`,
      aFaire: mots.aDesactiver > 0 || mots.propositions > 0,
      action: "Nettoyer et choisir les mots-clés", detail: `jugés sur les pages qui vendent un produit du top ${TOP_N}`,
      bouton: <button className="btn btn-primary" onClick={() => onOuvrir("motscles")}>Ouvrir les mots-clés</button>,
      lien: { label: `Voir le top ${TOP_N}`, vue: "classement" },
    },
    {
      n: 5, titre: "Décider quoi tester", frequence: "après l'étape 4",
      etat: `${candidats} produit${candidats > 1 ? "s" : ""} candidat${candidats > 1 ? "s" : ""} au test (signal fort, 230 DH et plus)`,
      aFaire: false,
      action: "Choisir les produits", detail: "prix d'achat livrés → GO ou STOP",
      bouton: <button className="btn btn-primary" onClick={() => onOuvrir("decision")}>Ouvrir Décision</button>,
      lien: { label: "Classement", vue: "classement" },
    },
  ];
  const prochaine = run ? null : etapes.find(e => e.aFaire) || etapes[4];

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...carte, padding: "14px 16px", background: run ? "var(--blue-lt)" : "var(--surface)", borderColor: run ? "#BFDBFE" : "var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>Prochaine action</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
          {run ? "Une tâche est en cours : laisse cet onglet et la fenêtre de l'extension ouverts."
            : !ext ? "Ouvre l'ERP dans le Chrome où l'extension Momtaz Veille est installée."
            : `Étape ${prochaine.n} · ${prochaine.action}`}
        </div>
        {!run && ext && <div className="col-muted">{prochaine.detail}</div>}
      </div>

      {etapes.map(e => {
        const estProchaine = prochaine && prochaine.n === e.n && !!ext;
        return (
          <div key={e.n} style={{ ...carte, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
            borderColor: estProchaine ? "var(--blue)" : "var(--border)", boxShadow: estProchaine ? "0 0 0 1px var(--blue)" : "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: 99, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
              background: e.aFaire ? "var(--orange-lt)" : "var(--green-lt)", color: e.aFaire ? "var(--orange)" : "var(--green)" }}>{e.n}</div>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{e.titre}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: e.aFaire ? "var(--orange)" : "var(--green)" }}>{e.aFaire ? "à faire" : "à jour"}</span>
                <span className="col-muted" style={{ fontSize: 12 }}>· {e.frequence}</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{e.etat}</div>
              {e.lien && <button onClick={() => onOuvrir(e.lien.vue)} style={{ border: "none", background: "none", padding: 0, marginTop: 2, color: "var(--blue)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{e.lien.label} →</button>}
            </div>
            <div style={{ flex: "none" }}>{e.bouton}</div>
          </div>
        );
      })}
      <div className="col-muted" style={{ fontSize: 12 }}>Les réglages (mots-clés, filtre de la file, critères pour garder une page) sont dans l'onglet Réglages.</div>
    </div>
  );
}
