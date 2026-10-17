import { useEffect, useState } from "react";
import { CATEGORIES, CRITERES_DEFAUT } from "./veilleLib";
import { CLE_MOTS, CLE_FILE, CLE_FILTRE_FILE, CLE_ECARTEES, FILTRE_FILE_DEFAUT, filtrerFile, fusionnerEcartees, ajouterAFile, lireListe, typeDe, trierMots, ajouterGardee, reactiver, changerType, cleMot, RECHERCHES_AVANT_NETTOYAGE, ANALYSEES_AVANT_NETTOYAGE, MOTS_PAR_SESSION, PAGES_PAR_SESSION } from "./motsLib";
import {
  saveConfig,
  loadRecherche, addMotCle, updateMotCle, deleteMotCle, saveCriteres,
  loadCandidatCartes, decideCandidat, saveReleve, addPages, updatePage,
} from "./veilleData";
import { nicheMot, NICHE_LABEL, NICHES } from "./nichesLib";

const carte = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 };
const libUrl = id => "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=MA&view_all_page_id=" + id;
const fmtDate = d => d ? new Date(d).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function Criteres({ valeur, onSave }) {
  const [c, setC] = useState({ ...CRITERES_DEFAUT, ...(valeur || {}) });
  const [ok, setOk] = useState(false);
  useEffect(() => { setC({ ...CRITERES_DEFAUT, ...(valeur || {}) }); }, [valeur]);
  const set = (k, v) => { setC(x => ({ ...x, [k]: v })); setOk(false); };
  const ligne = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 13 };
  const nb = (k, w = 64) => <input type="number" min={0} className="form-input" style={{ width: w, padding: "4px 8px" }} value={c[k]} onChange={e => set(k, Number(e.target.value))} />;
  return (
    <section style={{ ...carte, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Critères pour garder une page</div>
      <div style={ligne}>
        <span className="col-muted">Expression exacte pour les anciens mots-clés sans type (chaque mot-clé a maintenant son type : Phrase ou Produit)</span>
        <input type="checkbox" checked={!!c.expressionExacte} onChange={e => set("expressionExacte", e.target.checked)} />
      </div>
      <div style={ligne}><span className="col-muted">Pubs actives minimum</span>{nb("minPubs")}</div>
      <div style={ligne}><span className="col-muted">Produits différents minimum</span>{nb("minProduits")}</div>
      <div style={ligne}><span className="col-muted">Pubs vers un site e-commerce obligatoires</span><input type="checkbox" checked={c.siteObligatoire} onChange={e => set("siteObligatoire", e.target.checked)} /></div>
      <div style={ligne}><span className="col-muted">Signe de paiement à la livraison obligatoire</span><input type="checkbox" checked={c.codObligatoire} onChange={e => set("codObligatoire", e.target.checked)} /></div>
      <div style={ligne}><span className="col-muted">Vêtements : gardée à partir de (pubs)</span>{nb("vetementsMinPubs")}</div>
      <div style={{ ...ligne, alignItems: "flex-start", flexDirection: "column" }}>
        <span className="col-muted">Catégories éliminées</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {Object.entries(CATEGORIES).filter(([k]) => k !== "vetements").map(([k, cat]) => (
            <label key={k} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={c.exclues.includes(k)}
                onChange={e => set("exclues", e.target.checked ? [...c.exclues, k] : c.exclues.filter(x => x !== k))} />
              {cat.label}
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-sm btn-primary" onClick={async () => { await onSave(c); setOk(true); }}>Enregistrer les critères</button>
        {ok && <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 600 }}>Enregistré</span>}
      </div>
    </section>
  );
}

// Filtre de la file avant analyse : écarte vite les pages sans intérêt, sans ouvrir Facebook
function FiltreFile({ valeur, nbFile, onSave, onApercu, onAppliquer, apercu, occupe }) {
  const [f, setF] = useState({ ...FILTRE_FILE_DEFAUT, ...(valeur || {}) });
  const [ok, setOk] = useState(false);
  useEffect(() => { setF({ ...FILTRE_FILE_DEFAUT, ...(valeur || {}) }); }, [valeur]);
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setOk(false); };
  const ligne = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 13 };
  return (
    <section style={{ ...carte, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Filtre de la file avant analyse</div>
      <div className="col-muted">
        Appliqué automatiquement à la fin de chaque collecte. Les pages écartées ne sont pas supprimées : tu peux les remettre dans la file.
        Les pages collectées avant le 17 oct. 2026 ne sont jugées que sur le nombre de pubs (leurs textes n'avaient pas été gardés).
      </div>
      <div style={ligne}>
        <span className="col-muted">Pubs vues à la collecte, minimum</span>
        <input type="number" min={0} className="form-input" style={{ width: 64, padding: "4px 8px" }} value={f.minPubs} onChange={e => set("minPubs", Number(e.target.value))} />
      </div>
      <div style={ligne}><span className="col-muted">Signe Maroc (arabe, DH, site .ma, ville)</span><span style={{ fontWeight: 600 }}>Toujours exigé</span></div>
      <div style={ligne}>
        <span className="col-muted">Écarter les catégories éliminées (liste des critères ci-dessous)</span>
        <input type="checkbox" checked={!!f.categories} onChange={e => set("categories", e.target.checked)} />
      </div>
      <div style={ligne}><span className="col-muted">Pages déjà suivies ou déjà analysées</span><span style={{ fontWeight: 600 }}>Toujours retirées</span></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-sm btn-secondary" onClick={async () => { await onSave(f); setOk(true); }}>Enregistrer</button>
        <button className="btn btn-sm btn-secondary" disabled={!nbFile} onClick={() => onApercu(f)}>Aperçu</button>
        <button className="btn btn-sm btn-primary" disabled={!nbFile || occupe} onClick={() => onAppliquer(f)}>Appliquer à la file</button>
        {ok && <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 600 }}>Enregistré</span>}
      </div>
      {apercu && (
        <div style={{ fontSize: 13, background: "var(--surface2)", borderRadius: 8, padding: "8px 10px" }}>
          <b>{apercu.avant} → {apercu.apres} pages</b> à analyser · {apercu.ecartees} écartées
          ({apercu.detail.pubs} avec trop peu de pubs, {apercu.detail.maroc} sans signe Maroc, {apercu.detail.categorie} de catégorie exclue{apercu.connues ? `, ${apercu.connues} déjà suivies ou analysées` : ""})
          {apercu.fait && <span style={{ color: "var(--green)", fontWeight: 600 }}> · appliqué</span>}
        </div>
      )}
    </section>
  );
}

function Apercus({ apercus }) {
  return (
    <div style={{ display: "flex", gap: 6, flex: "none" }}>
      {[0, 1, 2].map(i => {
        const a = (apercus || [])[i];
        return a && a.thumb
          ? <a key={i} href={"https://www.facebook.com/ads/library/?id=" + a.id} target="_blank" rel="noreferrer">
              <img src={a.thumb} alt="" loading="lazy" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", background: "var(--surface2)", border: "1px solid var(--border)" }} onError={e => { e.currentTarget.style.visibility = "hidden"; }} />
            </a>
          : <div key={i} style={{ width: 56, height: 56, borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--border)" }} />;
      })}
    </div>
  );
}

export default function Recherche({ ext, run, onLancer, onStop, pages, produits, onReloadVeille, version }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState("");
  const [liste, setListe] = useState("");
  const [typeListe, setTypeListe] = useState("phrase");
  const [voirInactifs, setVoirInactifs] = useState(false);
  // Pages analysées par session, mémorisé dans ce navigateur
  const [maxPages, setMaxPages] = useState(() => { try { return Number(localStorage.getItem("momtaz_pages_session")) || PAGES_PAR_SESSION; } catch { return PAGES_PAR_SESSION; } });
  const choisirMax = v => { setMaxPages(v); try { localStorage.setItem("momtaz_pages_session", String(v)); } catch { /* stockage indisponible */ } };
  const [voirElim, setVoirElim] = useState(false);
  const [niche, setNiche] = useState("");   // recherche ciblée : mots-clés d'une seule niche
  const [occupe, setOccupe] = useState(null);
  const [apercuFiltre, setApercuFiltre] = useState(null);
  const [voirEcartees, setVoirEcartees] = useState(false);

  const charger = async () => {
    try { setD(await loadRecherche()); setErreur(""); }
    catch (e) { setErreur("Impossible de charger la recherche : " + (e.message || e) + ". As-tu lancé le SQL « supabase_veille_recherche.sql » ?"); }
  };
  useEffect(() => { charger(); }, [version]);

  if (erreur) return <div className="alert-banner" style={{ background: "var(--red-lt)", color: "var(--red)", border: "1px solid #FECACA" }}>{erreur}</div>;
  if (!d) return <div style={{ padding: 24 }} className="col-muted"><span className="loading-dot" /> Chargement…</div>;

  const derniere = d.recherches[0];
  const aValider = d.candidats.filter(c => c.decision === "a_valider");
  const eliminees = d.candidats.filter(c => c.decision === "eliminee");
  const gardees = d.candidats.filter(c => c.decision === "gardee");
  // Gardées absentes de tes pages suivies (analyse interrompue avant leur ajout)
  const suivies = new Set(pages.map(p => p.fb_page_id));
  const manquantes = gardees.filter(c => !suivies.has(c.fb_page_id));
  const enCours = run && run.type === "recherche";

  const exacteGlobal = !!{ ...CRITERES_DEFAUT, ...(d.criteres || {}) }.expressionExacte;
  const nbFile = Object.keys(d.file || {}).length;
  const statsMots = d.stats || {};
  const sauverStats = async st => { try { await saveConfig(CLE_MOTS, st); } catch (e) { setErreur("Rendement des mots-clés non enregistré : " + (e.message || e)); } };

  // Liste collée : un mot-clé par ligne, tous du même type ; les mots déjà présents changent seulement de type
  const ajouterListe = async () => {
    const mots = lireListe(liste);
    if (!mots.length) return;
    let st = statsMots;
    const existants = new Map(d.motscles.map(m => [cleMot(m.mot), m]));
    for (const m of mots) {
      const ex = existants.get(cleMot(m));
      if (!ex) await addMotCle(m, "manuel");
      else if (!ex.actif) await updateMotCle(ex.id, { actif: true });
      st = changerType(st, m, typeListe);
      if (ex && !ex.actif) st = reactiver(st, m);
    }
    await sauverStats(st);
    setListe("");
    await charger();
  };

  const basculerActif = async (m, actif) => {
    await updateMotCle(m.id, { actif });
    if (actif) await sauverStats(reactiver(statsMots, m.mot));
    await charger();
  };

  const basculerType = async m => {
    await sauverStats(changerType(statsMots, m.mot, typeDe(m, statsMots, exacteGlobal) === "phrase" ? "produit" : "phrase"));
    await charger();
  };

  const garder = async c => {
    setOccupe(c.fb_page_id);
    try {
      const full = await loadCandidatCartes(c.fb_page_id);
      if (full && full.cartes && full.cartes.length) {
        await saveReleve([{ pageId: c.fb_page_id, pageNom: c.nom, cartes: full.cartes, date: new Date(full.created_at) }], pages, produits);
      } else {
        await addPages([c.fb_page_id]);
        await updatePage(c.fb_page_id, { nom: c.nom, sites: c.sites });
      }
      await decideCandidat(c.fb_page_id, "gardee", "Gardée par toi");
      // La page gardée compte pour le rendement des mots-clés qui l'ont fait trouver
      if (c.mots_cles) await sauverStats(ajouterGardee(statsMots, c.mots_cles));
      await charger();
      await onReloadVeille();
    } catch (e) { setErreur("Impossible de garder cette page : " + (e.message || e)); }
    finally { setOccupe(null); }
  };

  // Ajoute à tes pages suivies, avec leurs pubs, les pages gardées qui n'y sont pas
  const ajouterManquantes = async liste => {
    setOccupe("manquantes");
    let faites = 0;
    const echecs = [];
    try {
      const fichiers = [];
      for (const c of liste) {
        try {
          const full = await loadCandidatCartes(c.fb_page_id);
          if (full && full.cartes && full.cartes.length) fichiers.push({ pageId: c.fb_page_id, pageNom: c.nom, cartes: full.cartes, date: new Date(full.created_at) });
          else { await addPages([c.fb_page_id]); await updatePage(c.fb_page_id, { nom: c.nom, sites: c.sites }); faites++; }
        } catch (e) { echecs.push(c.nom); }
      }
      if (fichiers.length) { await saveReleve(fichiers, pages, produits, "extension"); faites += fichiers.length; }
      await onReloadVeille();
      await charger();
      window.alert(`${faites} page(s) gardée(s) ajoutée(s) à tes pages suivies.${echecs.length ? ` ${echecs.length} en échec (réessaie) : ${echecs.join(", ")}` : ""}`);
    } catch (e) { setErreur("Ajout des gardées manquantes impossible : " + (e.message || e)); }
    finally { setOccupe(null); }
  };

  const rejeter = async c => {
    setOccupe(c.fb_page_id);
    try { await decideCandidat(c.fb_page_id, "eliminee", "Rejetée par toi"); await charger(); }
    finally { setOccupe(null); }
  };

  // Filtre avant analyse
  const labelsCat = Object.fromEntries(Object.entries(CATEGORIES).map(([k, c]) => [k, c.label]));
  const exclues = { ...CRITERES_DEFAUT, ...(d.criteres || {}) }.exclues;
  const connues = new Set([...pages.map(p => p.fb_page_id), ...d.candidats.map(c => c.fb_page_id)]);
  const calculerFiltre = f => {
    const sansConnues = ajouterAFile(d.file || {}, [], connues);
    const r = filtrerFile(sansConnues, f, exclues, labelsCat);
    return { ...r, avant: nbFile, apres: Object.keys(r.file).length, ecartees: Object.keys(r.ecartees).length, connues: nbFile - Object.keys(sansConnues).length };
  };
  const apercuFiltreFile = f => { const r = calculerFiltre(f); setApercuFiltre({ ...r, fait: false }); };
  const appliquerFiltre = async f => {
    const r = calculerFiltre(f);
    if (!window.confirm(`Garder ${r.apres} pages dans la file et en écarter ${r.ecartees + r.connues} ? Les pages écartées restent récupérables.`)) return;
    setOccupe("filtre");
    try {
      await saveConfig(CLE_FILTRE_FILE, f);
      await saveConfig(CLE_ECARTEES, fusionnerEcartees(d.ecartees, r.ecartees, r.file));
      await saveConfig(CLE_FILE, r.file);
      setApercuFiltre({ ...r, fait: true });
      await charger();
    } catch (e) { setErreur("Filtre non appliqué : " + (e.message || e)); }
    finally { setOccupe(null); }
  };
  const listeEcartees = Object.entries(d.ecartees || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => (b.pubs || 0) - (a.pubs || 0));
  // Remise dans la file : marquée « force », le filtre ne la retire plus
  const remettre = async ids => {
    setOccupe("filtre");
    try {
      const file = { ...(d.file || {}) };
      const ec = { ...(d.ecartees || {}) };
      for (const id of ids) {
        const x = ec[id];
        if (!x) continue;
        file[id] = { nom: x.nom, mots: x.mots || [], pubs: x.pubs || 0, le: new Date().toISOString(), ...(x.maroc != null ? { maroc: x.maroc } : {}), force: true };
        delete ec[id];
      }
      await saveConfig(CLE_FILE, file);
      await saveConfig(CLE_ECARTEES, ec);
      await charger();
    } catch (e) { setErreur("Remise dans la file impossible : " + (e.message || e)); }
    finally { setOccupe(null); }
  };

  const actifsRecherche = d.motscles.filter(m => m.actif && m.source !== "produit");
  const parNiche = {};
  for (const m of actifsRecherche) { const n = nicheMot(m.mot); if (n) parNiche[n] = (parNiche[n] || 0) + 1; }

  const stats = [
    { label: "Mots-clés", value: derniere ? derniere.nb_mots : d.motscles.filter(m => m.actif).length, color: "var(--text)" },
    { label: "Pages trouvées", value: derniere ? derniere.nb_trouvees : 0, color: "var(--text)" },
    { label: "File d'attente", value: Object.keys(d.file || {}).length, color: "var(--blue)" },
    { label: "Gardées", value: derniere ? derniere.nb_gardees : 0, color: "var(--green)" },
    { label: "À valider", value: aValider.length, color: "var(--orange)" },
    { label: "Éliminées", value: derniere ? derniere.nb_eliminees : 0, color: "var(--red)" },
  ];

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      {!ext && (
        <div className="alert-banner" style={{ margin: 0, background: "var(--orange-lt)", color: "var(--orange)", border: "1px solid #FDE68A" }}>
          Extension « Momtaz Veille » non détectée dans ce navigateur. Ouvre l'ERP dans le Chrome sans compte Facebook où l'extension est installée, puis recharge la page.
        </div>
      )}

      <div style={{ ...carte, padding: "14px 16px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 700 }}>
            {derniere ? `Dernière recherche : ${fmtDate(derniere.created_at)} · ${derniere.statut}` : "Aucune recherche lancée pour l'instant"}
          </span>
          <span className="col-muted">
            {nbFile >= maxPages
              ? `File d'attente : ${nbFile} pages trouvées à analyser. La prochaine analyse en traite ${maxPages} (celles vues avec le plus de mots-clés et de pubs), environ ${Math.round(maxPages * 1.6 / 60 * 10) / 10} h.`
              : `Une recherche = ${MOTS_PAR_SESSION} mots-clés au plus (jamais utilisés d'abord, puis les plus rentables), puis ${maxPages} pages analysées au plus.${nbFile ? ` File d'attente : ${nbFile} pages.` : ""}`}
            {" "}« Collecter les pages » interroge tous tes mots-clés actifs ({d.motscles.filter(m => m.actif).length}) et met les pages trouvées dans la file, sans les analyser : environ {Math.round(d.motscles.filter(m => m.actif).length * 1.6 / 60 * 10) / 10} h.
            {" "}Laisse cet onglet et la fenêtre de l'extension ouverts.
          </span>
        </div>
        <span style={{ display: "flex", gap: 8 }}>
          {!enCours && nbFile > 0 && (
            <button className="btn btn-secondary" disabled={!!run} title="Oublier les pages trouvées pas encore analysées"
              onClick={async () => { if (window.confirm(`Vider la file d'attente (${nbFile} pages pas encore analysées) ?`)) { await saveConfig(CLE_FILE, {}); await charger(); } }}>
              Vider la file
            </button>
          )}
          {!enCours && (
            <select className="form-select" style={{ width: "auto" }} value={maxPages} onChange={e => choisirMax(Number(e.target.value))} disabled={!!run} title="Pages analysées par session">
              {[60, 120, 200, 300].map(n => <option key={n} value={n}>{n} pages{n === 300 ? " (une nuit)" : ""}</option>)}
            </select>
          )}
          {!enCours && (
            <select className="form-select" style={{ width: "auto" }} value={niche} onChange={e => setNiche(e.target.value)} disabled={!!run}
              title="Recherche ciblée : seulement les mots-clés de cette niche (les phrases générales comme « livraison gratuite » ne sont pas utilisées)">
              <option value="">Toutes niches</option>
              {NICHES.filter(n => parNiche[n.id]).map(n => <option key={n.id} value={n.id}>{n.label} ({parNiche[n.id]} mots-clés)</option>)}
            </select>
          )}
          {!enCours && (
            <button className="btn btn-secondary" disabled={!ext || !!run} onClick={() => onLancer(d, charger, { mode: "collecte", niche })}
              title="Interroge tous les mots-clés actifs et remplit la file d'attente, sans analyser les pages">Collecter les pages</button>
          )}
          {enCours
            ? <button className="btn btn-danger" onClick={onStop}>Arrêter</button>
            : <button className="btn btn-primary" disabled={!ext || !!run} onClick={() => onLancer(d, charger, { maxPages, niche })}>{nbFile >= maxPages ? `Analyser ${maxPages} pages de la file` : "Lancer une recherche maintenant"}</button>}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} className="kpi-card" style={{ maxWidth: "none" }}>
            <div className="kpi-value" style={{ color: s.color }}>{s.value}</div>
            <div className="kpi-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 340px", maxWidth: 440, display: "flex", flexDirection: "column", gap: 16 }}>
          <section style={{ ...carte, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Mots-clés ({d.motscles.filter(m => m.actif).length} actifs)</div>
            <div className="col-muted">
              La recherche lit le texte des pubs (texte et titre). Après chaque recherche, jusqu'à 10 expressions vues dans les pubs d'au moins 3 pages s'ajoutent toutes seules (« Tiré des pubs ») ; le nettoyage garde celles qui rapportent.
              Les noms de produits ajoutés automatiquement (« Produit suivi ») ne sont pas utilisés : la recherche sert à découvrir des produits nouveaux.
              Un mot-clé est désactivé automatiquement s'il n'a fait garder aucune page sur {ANALYSEES_AVANT_NETTOYAGE} pages analysées, ou s'il ne trouve aucune nouvelle page en {RECHERCHES_AVANT_NETTOYAGE} recherches.
            </div>
            <textarea className="form-input" rows={5} value={liste} onChange={e => setListe(e.target.value)}
              placeholder={"Un mot-clé par ligne\nالدفع عند الاستلام\nlivraison gratuite\ndéfroisseur vapeur"} style={{ resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select className="form-select" style={{ width: "auto" }} value={typeListe} onChange={e => setTypeListe(e.target.value)}>
                <option value="phrase">Phrases de pub (expression exacte)</option>
                <option value="produit">Noms de produits (recherche large)</option>
              </select>
              <button className="btn btn-sm btn-primary" disabled={!lireListe(liste).length} onClick={ajouterListe}>
                Ajouter {lireListe(liste).length || ""} mot{lireListe(liste).length > 1 ? "s" : ""}-clé{lireListe(liste).length > 1 ? "s" : ""}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--muted2)", borderTop: "1px solid var(--border)", paddingTop: 7 }}>
              <span>Triés par pages gardées · gardées / analysées / nouvelles · recherches</span>
              <button className="btn btn-sm btn-secondary" onClick={() => setVoirInactifs(v => !v)}>{voirInactifs ? "Masquer les inactifs" : `Voir les inactifs (${d.motscles.filter(m => !m.actif).length})`}</button>
            </div>
            {trierMots(d.motscles, statsMots).filter(m => voirInactifs || m.actif).map(m => {
              const st = statsMots[cleMot(m.mot)] || {};
              const type = typeDe(m, statsMots, exacteGlobal);
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 7, opacity: m.actif ? 1 : 0.5 }}>
                  <input type="checkbox" checked={m.actif} title={m.actif ? "Désactiver" : "Réactiver (2 nouvelles recherches pour faire ses preuves)"} onChange={e => basculerActif(m, e.target.checked)} />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.mot}</span>
                    {!m.actif && st.desactive && <span style={{ fontSize: 11, color: "var(--red)" }}>Désactivé : {st.desactive.raison}</span>}
                  </div>
                  <span className="col-mono" title="Pages gardées / pages analysées / nouvelles pages trouvées · nombre de recherches" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                    {st.recherches ? <><b style={{ color: st.gardees ? "var(--green)" : "var(--muted)" }}>{st.gardees}</b> / {st.analysees || 0} / {st.nouvelles} · {st.recherches}×</> : <span className="col-muted">jamais</span>}
                  </span>
                  {st.origine === "texte" && <span className="tag" title={`Expression trouvée dans les pubs d'au moins 3 pages${st.le ? ", ajoutée le " + new Date(st.le).toLocaleDateString("fr-FR") : ""}`} style={{ opacity: 0.8 }}>Tiré des pubs</span>}
                  {nicheMot(m.mot) && <span className="col-muted" style={{ fontSize: 11 }}>{NICHE_LABEL[nicheMot(m.mot)]}</span>}
                  {m.source === "produit" && <span className="tag" title="Nom de produit ajouté automatiquement : pas utilisé par la recherche" style={{ opacity: 0.7 }}>Produit suivi · non utilisé</span>}
                  <button className={`tag ${type === "phrase" ? "blue" : "green"}`} style={{ border: "none", cursor: "pointer" }} title="Changer de type" onClick={() => basculerType(m)}>
                    {type === "phrase" ? "Phrase" : "Produit"}
                  </button>
                  <button className="btn-close" title="Supprimer" onClick={async () => { await deleteMotCle(m.id); charger(); }}>×</button>
                </div>
              );
            })}
          </section>
          <FiltreFile valeur={d.filtreFile} nbFile={nbFile} apercu={apercuFiltre} occupe={occupe === "filtre" || !!run}
            onSave={async f => { await saveConfig(CLE_FILTRE_FILE, f); await charger(); }}
            onApercu={apercuFiltreFile} onAppliquer={appliquerFiltre} />
          <Criteres valeur={d.criteres} onSave={async v => { await saveCriteres(v); await charger(); }} />
        </div>

        <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <section style={{ ...carte, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, color: "var(--orange)" }}>À valider ({aValider.length})</div>
              <div className="col-muted">Pages qui ressemblent aux tiennes mais ne remplissent pas tous les critères</div>
            </div>
            {!aValider.length && <div className="col-muted" style={{ padding: 16 }}>Rien à valider.</div>}
            {aValider.map(c => (
              <div key={c.fb_page_id} style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: "14px 16px", borderTop: "1px solid var(--border)" }}>
                <Apercus apercus={c.apercus} />
                <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontWeight: 700 }}>{c.nom}</span>
                  <span className="col-mono col-muted">ID {c.fb_page_id} · {c.sites || "aucun site"}</span>
                  <span style={{ fontSize: 13 }}>{c.nb_pubs} pubs · {c.nb_produits} produits{c.categorie ? " · " + (CATEGORIES[c.categorie]?.label || c.categorie) : ""}</span>
                  <span style={{ fontSize: 13, color: "var(--orange)" }}>{c.raison}</span>
                  {c.mots_cles && <span className="col-muted">Trouvée avec : {c.mots_cles}</span>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>
                  <a href={libUrl(c.fb_page_id)} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600 }}>Ad Library</a>
                  <button className="btn btn-sm btn-danger" disabled={occupe === c.fb_page_id} onClick={() => rejeter(c)}>Rejeter</button>
                  <button className="btn btn-sm btn-primary" style={{ background: "var(--green)" }} disabled={occupe === c.fb_page_id} onClick={() => garder(c)}>Garder</button>
                </div>
              </div>
            ))}
          </section>

          <section style={{ ...carte, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 700, color: "var(--green)" }}>Gardées ({gardees.length})</div>
            <div className="col-muted">Ajoutées à tes pages suivies, leurs produits sont dans le classement.</div>
            {manquantes.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", background: "var(--red-lt)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
                <span><b>{manquantes.length}</b> page{manquantes.length > 1 ? "s" : ""} gardée{manquantes.length > 1 ? "s" : ""} absente{manquantes.length > 1 ? "s" : ""} de tes pages suivies</span>
                <button className="btn btn-sm btn-primary" disabled={occupe === "manquantes" || !!run} onClick={() => ajouterManquantes(manquantes)}>
                  {occupe === "manquantes" ? "Ajout en cours…" : "Ajouter les gardées manquantes"}
                </button>
              </div>
            )}
            {gardees.slice(0, 8).map(c => (
              <div key={c.fb_page_id} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 7, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{c.nom}</span>
                <span className="col-muted">{c.nb_pubs} pubs · {c.nb_produits} produits</span>
              </div>
            ))}
          </section>

          <section style={{ ...carte, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, color: "var(--muted)" }}>Écartées avant analyse ({listeEcartees.length})</span>
              <span style={{ display: "flex", gap: 8 }}>
                {listeEcartees.length > 0 && <button className="btn btn-sm btn-secondary" disabled={occupe === "filtre" || !!run}
                  onClick={() => { if (window.confirm(`Remettre les ${listeEcartees.length} pages écartées dans la file ?`)) remettre(listeEcartees.map(x => x.id)); }}>Tout remettre</button>}
                {listeEcartees.length > 8 && <button className="btn btn-sm btn-secondary" onClick={() => setVoirEcartees(!voirEcartees)}>{voirEcartees ? "Réduire" : "Tout voir"}</button>}
              </span>
            </div>
            <div className="col-muted">Pages retirées de la file par le filtre, sans analyse. Triées par pubs vues.</div>
            {(voirEcartees ? listeEcartees.slice(0, 500) : listeEcartees.slice(0, 8)).map(x => (
              <div key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 7, fontSize: 13 }}>
                <a href={libUrl(x.id)} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.nom || x.id}</a>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>
                  <span className="col-muted" style={{ textAlign: "right" }}>{x.raison}</span>
                  <button className="btn btn-sm btn-secondary" disabled={occupe === "filtre" || !!run} onClick={() => remettre([x.id])}>Remettre</button>
                </span>
              </div>
            ))}
            {voirEcartees && listeEcartees.length > 500 && <div className="col-muted">500 premières affichées sur {listeEcartees.length}.</div>}
          </section>

          <section style={{ ...carte, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "var(--red)" }}>Éliminées ({eliminees.length})</span>
              {eliminees.length > 8 && <button className="btn btn-sm btn-secondary" onClick={() => setVoirElim(!voirElim)}>{voirElim ? "Réduire" : "Tout voir"}</button>}
            </div>
            {(voirElim ? eliminees : eliminees.slice(0, 8)).map(c => (
              <div key={c.fb_page_id} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 7, fontSize: 13 }}>
                <a href={libUrl(c.fb_page_id)} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "var(--text)" }}>{c.nom}</a>
                <span className="col-muted" style={{ textAlign: "right" }}>{c.raison}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
