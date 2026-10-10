import { useEffect, useState } from "react";
import { CATEGORIES, CRITERES_DEFAUT } from "./veilleLib";
import {
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
  const [mot, setMot] = useState("");
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

  const ajouterMot = async () => {
    const m = mot.trim();
    if (!m) return;
    await addMotCle(m, "manuel");
    setMot("");
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
          <span className="col-muted">Une page toutes les 30 à 60 secondes. Laisse cet onglet et la fenêtre de l'extension ouverts pendant la recherche.</span>
        </div>
        {enCours
          ? <button className="btn btn-danger" onClick={onStop}>Arrêter</button>
          : <button className="btn btn-primary" disabled={!ext || !!run} onClick={() => onLancer(d, charger)}>Lancer une recherche maintenant</button>}
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
            <div style={{ fontWeight: 700 }}>Mots-clés</div>
            <div className="col-muted">Les noms de tes 20 meilleurs produits sont ajoutés automatiquement à chaque recherche.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="form-input" placeholder="Ajouter un mot-clé" value={mot} onChange={e => setMot(e.target.value)} onKeyDown={e => e.key === "Enter" && ajouterMot()} />
              <button className="btn btn-sm btn-secondary" onClick={ajouterMot}>Ajouter</button>
            </div>
            {d.motscles.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 7, opacity: m.actif ? 1 : 0.5 }}>
                <input type="checkbox" checked={m.actif} title="Actif" onChange={async e => { await updateMotCle(m.id, { actif: e.target.checked }); charger(); }} />
                <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{m.mot}</span>
                <span className="col-muted" style={{ whiteSpace: "nowrap" }}>{m.derniere_recherche ? `${m.nb_pages} pages` : "jamais"}</span>
                <span className={`tag ${m.source === "manuel" ? "blue" : "green"}`}>{m.source === "manuel" ? "Manuel" : "Produit suivi"}</span>
                <button className="btn-close" title="Supprimer" onClick={async () => { await deleteMotCle(m.id); charger(); }}>×</button>
              </div>
            ))}
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
