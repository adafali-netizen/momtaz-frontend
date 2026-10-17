// Réglages → Mots-clés : tableau des mots-clés, jugement sur le top 50 du Classement, propositions tirées des textes de pub.
import { useEffect, useMemo, useState } from "react";
import { CRITERES_DEFAUT } from "./veilleLib";
import {
  CLE_MOTS, cleMot, lireListe, typeDe, changerType, reactiver,
  topProduits, jugerMots, propositionsMots, TOP_N, RECHERCHES_POUR_JUGER,
} from "./motsLib";
import { loadRecherche, addMotCle, updateMotCle, deleteMotCle, saveConfig } from "./veilleData";
import { nicheMot, NICHE_LABEL } from "./nichesLib";
import { useTri, Th } from "./tri";

const carte = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 };
const PAR_PAGE = 50;
const VERDICTS = {
  garder: { label: "Utile", couleur: "var(--green)", titre: `A trouvé au moins une page qui vend un produit du top ${TOP_N}` },
  desactiver: { label: "À désactiver", couleur: "var(--red)", titre: `Testé ${RECHERCHES_POUR_JUGER} fois ou plus, aucune page du top ${TOP_N}` },
  a_tester: { label: "À tester", couleur: "var(--orange)", titre: `Moins de ${RECHERCHES_POUR_JUGER} recherches : pas encore jugé` },
};
const ORIGINES = { toi: "Toi", texte: "Tiré des pubs", propose: "Proposé (top 50)", produit: "Produit suivi" };

export default function MotsCles({ groups, run, version }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState("actifs");
  const [page, setPage] = useState(0);
  const [liste, setListe] = useState("");
  const [typeListe, setTypeListe] = useState("phrase");
  const [choix, setChoix] = useState(new Set());
  const [voirNettoyage, setVoirNettoyage] = useState(false);

  const charger = async () => {
    try { setD(await loadRecherche()); setErreur(""); }
    catch (e) { setErreur("Impossible de charger les mots-clés : " + (e.message || e)); }
  };
  useEffect(() => { charger(); }, [version]);

  const top = useMemo(() => topProduits(groups), [groups]);
  const stats = d?.stats || {};
  const exacteGlobal = !!{ ...CRITERES_DEFAUT, ...(d?.criteres || {}) }.expressionExacte;
  const juges = useMemo(() => d ? jugerMots(d.motscles, d.stats || {}, d.candidats, top) : {}, [d, top]);
  const propositions = useMemo(() => d ? propositionsMots(top, new Set(d.motscles.map(m => cleMot(m.mot)))) : [], [d, top]);
  useEffect(() => { setChoix(new Set(propositions.map(p => p.e))); }, [propositions]);

  const lignes = useMemo(() => (d?.motscles || []).map(m => {
    const k = cleMot(m.mot);
    const s = stats[k] || {};
    const j = juges[k] || { pagesTop: [], produitsTop: [], verdict: null };
    const origine = m.source === "produit" ? "produit" : s.origine === "propose" ? "propose" : s.origine === "texte" ? "texte" : "toi";
    return { m, k, s, j, origine, type: typeDe(m, stats, exacteGlobal), niche: nicheMot(m.mot) };
  }), [d, stats, juges, exacteGlobal]);

  const COLONNES = useMemo(() => ({
    mot: l => l.m.mot,
    top: l => l.j.pagesTop.length,
    gardees: l => l.s.gardees || 0,
    analysees: l => l.s.analysees || 0,
    nouvelles: l => l.s.nouvelles || 0,
    recherches: l => l.s.recherches || 0,
  }), []);
  const filtrees = lignes.filter(l => {
    if (q && !l.m.mot.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (filtre === "actifs") return l.m.actif && l.origine !== "produit";
    if (filtre === "inactifs") return !l.m.actif;
    if (filtre === "jamais") return l.m.actif && !(l.s.recherches > 0) && l.origine !== "produit";
    if (filtre === "desactiver") return l.m.actif && l.j.verdict === "desactiver";
    if (filtre === "utiles") return l.j.verdict === "garder";
    return true;
  });
  const { triees, tri, trier } = useTri(filtrees, COLONNES, { col: "top", sens: "desc" }, ["mot"]);
  const nbPages = Math.max(1, Math.ceil(triees.length / PAR_PAGE));
  const pageCourante = Math.min(page, nbPages - 1);
  const visibles = triees.slice(pageCourante * PAR_PAGE, (pageCourante + 1) * PAR_PAGE);

  if (erreur) return <div className="alert-banner" style={{ background: "var(--red-lt)", color: "var(--red)", border: "1px solid #FECACA" }}>{erreur}</div>;
  if (!d) return <div style={{ padding: 24 }} className="col-muted"><span className="loading-dot" /> Chargement…</div>;

  const actifs = lignes.filter(l => l.m.actif && l.origine !== "produit");
  const aDesactiver = actifs.filter(l => l.j.verdict === "desactiver");
  const utiles = actifs.filter(l => l.j.verdict === "garder").length;
  const aTester = actifs.filter(l => l.j.verdict === "a_tester").length;

  const sauverStats = st => saveConfig(CLE_MOTS, st);
  const agir = async fn => {
    setOccupe(true);
    try { await fn(); await charger(); }
    catch (e) { window.alert("Action impossible : " + (e.message || e)); }
    finally { setOccupe(false); }
  };

  const nettoyer = () => agir(async () => {
    const le = new Date().toISOString();
    const st = { ...stats };
    for (const l of aDesactiver) {
      await updateMotCle(l.m.id, { actif: false });
      st[l.k] = { ...(st[l.k] || {}), desactive: { le, raison: `aucune page du top ${TOP_N} en ${l.s.recherches || 0} recherches` } };
    }
    await sauverStats(st);
    setVoirNettoyage(false);
  });

  const ajouterMots = (mots, type, origine) => agir(async () => {
    let st = stats;
    const existants = new Map(d.motscles.map(m => [cleMot(m.mot), m]));
    for (const mot of mots) {
      const ex = existants.get(cleMot(mot));
      if (!ex) await addMotCle(mot, "manuel");
      else if (!ex.actif) { await updateMotCle(ex.id, { actif: true }); st = reactiver(st, mot); }
      st = changerType(st, mot, type);
      if (origine && !ex) st = { ...st, [cleMot(mot)]: { ...st[cleMot(mot)], origine, le: new Date().toISOString() } };
    }
    await sauverStats(st);
  });

  const basculerActif = (l, actif) => agir(async () => {
    await updateMotCle(l.m.id, { actif });
    if (actif) await sauverStats(reactiver(stats, l.m.mot));
  });
  const basculerType = l => agir(() => sauverStats(changerType(stats, l.m.mot, l.type === "phrase" ? "produit" : "phrase")));
  const supprimer = l => { if (window.confirm(`Supprimer le mot-clé « ${l.m.mot} » ?`)) agir(() => deleteMotCle(l.m.id)); };

  const bloque = occupe || !!run;
  const chiffre = { textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Résumé et nettoyage */}
      <section style={{ ...carte, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>Mots-clés jugés sur le top {TOP_N} du Classement</div>
            <div className="col-muted">
              {actifs.length} actifs : <b style={{ color: "var(--green)" }}>{utiles} utiles</b> (ont trouvé une page qui vend un produit du top {TOP_N}),
              {" "}<b style={{ color: "var(--orange)" }}>{aTester} à tester</b> (moins de {RECHERCHES_POUR_JUGER} recherches),
              {" "}<b style={{ color: "var(--red)" }}>{aDesactiver.length} à désactiver</b>.
            </div>
          </div>
          <button className="btn btn-primary" disabled={bloque || !aDesactiver.length} onClick={() => setVoirNettoyage(v => !v)}>
            {voirNettoyage ? "Masquer la liste" : `Nettoyer (${aDesactiver.length})`}
          </button>
        </div>
        {voirNettoyage && aDesactiver.length > 0 && (
          <div style={{ background: "var(--surface2)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13 }}>Ces {aDesactiver.length} mots-clés seront désactivés (pas supprimés : tu peux les réactiver) :</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflowY: "auto" }}>
              {aDesactiver.map(l => <span key={l.k} dir="auto" className="tag" style={{ fontSize: 13 }}>{l.m.mot}</span>)}
            </div>
            <div><button className="btn btn-sm btn-danger" disabled={bloque} onClick={nettoyer}>Désactiver ces {aDesactiver.length} mots-clés</button></div>
          </div>
        )}
      </section>

      {/* Propositions */}
      <section style={{ ...carte, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>Nouveaux mots-clés proposés ({propositions.length})</div>
            <div className="col-muted">
              Tirés des textes de pub des produits du top {TOP_N} (toutes les pages, y compris celles ajoutées à la main), sans les formules de vente
              (livraison, paiement, prix, promo, urgence). Une expression doit apparaître chez 2 pages ou dans 3 créatives. Coche celles à garder.
            </div>
          </div>
          {propositions.length > 0 && (
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select className="form-select" style={{ width: "auto" }} value={typeListe} onChange={e => setTypeListe(e.target.value)}>
                <option value="phrase">Phrase (expression exacte)</option>
                <option value="produit">Produit (recherche large)</option>
              </select>
              <button className="btn btn-primary" disabled={bloque || !choix.size}
                onClick={() => ajouterMots(propositions.filter(p => choix.has(p.e)).map(p => p.e), typeListe, "propose")}>
                Ajouter les {choix.size} cochés
              </button>
            </span>
          )}
        </div>
        {!propositions.length && <div className="col-muted">Aucune nouvelle expression : relève tes pages suivies pour mettre à jour le top {TOP_N}.</div>}
        {propositions.length > 0 && (
          <div className="table-wrap" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}><input type="checkbox" checked={choix.size === propositions.length}
                    onChange={e => setChoix(e.target.checked ? new Set(propositions.map(p => p.e)) : new Set())} /></th>
                  <th>Expression</th>
                  <th style={{ textAlign: "right" }}>Produits du top</th>
                  <th style={{ textAlign: "right" }}>Pages</th>
                  <th style={{ textAlign: "right" }}>Créatives</th>
                  <th>Produits concernés</th>
                </tr>
              </thead>
              <tbody>
                {propositions.map(p => (
                  <tr key={p.e} onClick={() => setChoix(c => { const n = new Set(c); n.has(p.e) ? n.delete(p.e) : n.add(p.e); return n; })}>
                    <td><input type="checkbox" readOnly checked={choix.has(p.e)} /></td>
                    <td style={{ fontWeight: 600, fontSize: 14 }}><span dir="auto">{p.e}</span></td>
                    <td style={chiffre}>{p.produits.length}</td>
                    <td style={chiffre}>{p.pages}</td>
                    <td style={chiffre}>{p.creas}</td>
                    <td className="col-muted" style={{ fontSize: 12 }}>{p.produits.slice(0, 3).join(", ")}{p.produits.length > 3 ? ` +${p.produits.length - 3}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Ajout à la main */}
      <section style={{ ...carte, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Ajouter à la main</div>
        <div className="col-muted">Un mot-clé par ligne. Facebook cherche dans le texte des pubs (texte, titre, description), pas sur la page produit du site.</div>
        <textarea className="form-input" dir="auto" rows={3} value={liste} onChange={e => setListe(e.target.value)} placeholder={"منظم الثلاجة\nlampe sans fil"} style={{ resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select className="form-select" style={{ width: "auto" }} value={typeListe} onChange={e => setTypeListe(e.target.value)}>
            <option value="phrase">Phrase (expression exacte)</option>
            <option value="produit">Produit (recherche large)</option>
          </select>
          <button className="btn btn-sm btn-primary" disabled={bloque || !lireListe(liste).length}
            onClick={async () => { await ajouterMots(lireListe(liste), typeListe, null); setListe(""); }}>
            Ajouter {lireListe(liste).length || ""}
          </button>
        </div>
      </section>

      {/* Tableau */}
      <section style={{ ...carte, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 700 }}>Tous les mots-clés</span>
          <input className="form-input" dir="auto" style={{ width: 220 }} placeholder="Rechercher un mot-clé" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} />
          <select className="form-select" style={{ width: "auto" }} value={filtre} onChange={e => { setFiltre(e.target.value); setPage(0); }}>
            <option value="actifs">Actifs ({actifs.length})</option>
            <option value="utiles">Utiles ({lignes.filter(l => l.j.verdict === "garder").length})</option>
            <option value="desactiver">À désactiver ({aDesactiver.length})</option>
            <option value="jamais">Jamais utilisés ({actifs.filter(l => !(l.s.recherches > 0)).length})</option>
            <option value="inactifs">Inactifs ({lignes.filter(l => !l.m.actif).length})</option>
            <option value="tous">Tous ({lignes.length})</option>
          </select>
          <span className="col-muted" style={{ marginLeft: "auto", fontSize: 12 }}>{triees.length} mots-clés · clique sur un titre de colonne pour trier</span>
        </div>
        <div className="table-wrap" style={{ padding: 0 }}>
          <table className="data-table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }} title="Actif">Actif</th>
                <Th col="mot" tri={tri} trier={trier}>Mot-clé</Th>
                <th>Origine</th>
                <th>Type</th>
                <th>Niche</th>
                <Th col="top" tri={tri} trier={trier} droite>Pages du top {TOP_N}</Th>
                <Th col="gardees" tri={tri} trier={trier} droite>Gardées</Th>
                <Th col="analysees" tri={tri} trier={trier} droite>Analysées</Th>
                <Th col="nouvelles" tri={tri} trier={trier} droite>Nouvelles</Th>
                <Th col="recherches" tri={tri} trier={trier} droite>Recherches</Th>
                <th>Verdict</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(l => {
                const v = l.j.verdict && VERDICTS[l.j.verdict];
                return (
                  <tr key={l.m.id} style={{ opacity: l.m.actif ? 1 : 0.55, cursor: "default" }}>
                    <td><input type="checkbox" checked={l.m.actif} disabled={bloque} title={l.m.actif ? "Désactiver" : "Réactiver"} onChange={e => basculerActif(l, e.target.checked)} /></td>
                    <td style={{ minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}><span dir="auto">{l.m.mot}</span></div>
                      {!l.m.actif && l.s.desactive && <div style={{ fontSize: 11, color: "var(--red)" }}>Désactivé : {l.s.desactive.raison}</div>}
                      {l.j.produitsTop.length > 0 && (
                        <div className="col-muted" style={{ fontSize: 11 }} title={l.j.pagesTop.map(p => p.nom).join(", ")}>
                          {l.j.produitsTop.slice(0, 3).join(", ")}{l.j.produitsTop.length > 3 ? ` +${l.j.produitsTop.length - 3}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="col-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{ORIGINES[l.origine]}</td>
                    <td>
                      {l.origine === "produit"
                        ? <span className="col-muted" style={{ fontSize: 12 }}>non utilisé</span>
                        : <button className={`tag ${l.type === "phrase" ? "blue" : "green"}`} style={{ border: "none", cursor: "pointer" }} disabled={bloque} title="Changer de type" onClick={() => basculerType(l)}>
                            {l.type === "phrase" ? "Phrase" : "Produit"}
                          </button>}
                    </td>
                    <td className="col-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{l.niche ? NICHE_LABEL[l.niche] : "—"}</td>
                    <td style={{ ...chiffre, fontWeight: 700, color: l.j.pagesTop.length ? "var(--green)" : "var(--muted2)" }}>{l.j.pagesTop.length}</td>
                    <td style={chiffre}>{l.s.gardees || 0}</td>
                    <td style={chiffre}>{l.s.analysees || 0}</td>
                    <td style={chiffre}>{l.s.nouvelles || 0}</td>
                    <td style={chiffre}>{l.s.recherches || 0}</td>
                    <td>{v ? <span title={v.titre} style={{ color: v.couleur, fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{v.label}</span> : <span className="col-muted">—</span>}</td>
                    <td><button className="btn-close" title="Supprimer" disabled={bloque} onClick={() => supprimer(l)}>×</button></td>
                  </tr>
                );
              })}
              {!visibles.length && <tr><td colSpan={12} className="col-muted" style={{ padding: 16 }}>Aucun mot-clé.</td></tr>}
            </tbody>
          </table>
        </div>
        {nbPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: 12, borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-sm btn-secondary" disabled={pageCourante === 0} onClick={() => setPage(pageCourante - 1)}>Précédent</button>
            <span style={{ fontSize: 13 }}>Page {pageCourante + 1} / {nbPages}</span>
            <button className="btn btn-sm btn-secondary" disabled={pageCourante >= nbPages - 1} onClick={() => setPage(pageCourante + 1)}>Suivant</button>
          </div>
        )}
      </section>
    </div>
  );
}
