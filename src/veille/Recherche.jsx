import { useEffect, useState } from "react";
import { CATEGORIES, CRITERES_DEFAUT } from "./veilleLib";
import { CLE_MOTS, CLE_FILE, lireListe, typeDe, trierMots, ajouterGardee, reactiver, changerType, cleMot, RECHERCHES_AVANT_NETTOYAGE, ANALYSEES_AVANT_NETTOYAGE, MOTS_PAR_SESSION, PAGES_PAR_SESSION } from "./motsLib";
import {
  saveConfig,
  loadRecherche, addMotCle, updateMotCle, deleteMotCle, saveCriteres,
  loadCandidatCartes, decideCandidat, saveReleve, addPages, updatePage,
} from "./veilleData";

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
  const [occupe, setOccupe] = useState(null);

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

  const rejeter = async c => {
    setOccupe(c.fb_page_id);
    try { await decideCandidat(c.fb_page_id, "eliminee", "Rejetée par toi"); await charger(); }
    finally { setOccupe(null); }
  };

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
            <button className="btn btn-secondary" disabled={!ext || !!run} onClick={() => onLancer(d, charger, { mode: "collecte" })}
              title="Interroge tous les mots-clés actifs et remplit la file d'attente, sans analyser les pages">Collecter les pages</button>
          )}
          {enCours
            ? <button className="btn btn-danger" onClick={onStop}>Arrêter</button>
            : <button className="btn btn-primary" disabled={!ext || !!run} onClick={() => onLancer(d, charger, { maxPages })}>{nbFile >= maxPages ? `Analyser ${maxPages} pages de la file` : "Lancer une recherche maintenant"}</button>}
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
              La recherche lit le texte des pubs (texte et titre). À chaque recherche, les produits à 230 DH et plus qui reçoivent le plus de pubs sur 7 jours sont ajoutés.
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
                  <button className={`tag ${type === "phrase" ? "blue" : "green"}`} style={{ border: "none", cursor: "pointer" }} title="Changer de type" onClick={() => basculerType(m)}>
                    {type === "phrase" ? "Phrase" : "Produit"}
                  </button>
                  <button className="btn-close" title="Supprimer" onClick={async () => { await deleteMotCle(m.id); charger(); }}>×</button>
                </div>
              );
            })}
          </section>
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
            {gardees.slice(0, 8).map(c => (
              <div key={c.fb_page_id} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 7, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{c.nom}</span>
                <span className="col-muted">{c.nb_pubs} pubs · {c.nb_produits} produits</span>
              </div>
            ))}
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
