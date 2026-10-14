import { useMemo, useState } from "react";
import { PHASE_COULEURS, signalFort } from "./veilleLib";
import { NICHE_LABEL } from "./nichesLib";
import { topProduits, vendeursDuTop, ficheVendeur, texteSynthese, CLE_COMMANDES } from "./syntheseLib";

// Synthèse marché : le top des produits dans ta fourchette de prix, puis la fiche de chaque page qui les vend,
// avec la commande test à remplir. Un bouton copie le tout pour la discussion avec Claude.

const carte = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 };
const lire = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } };

const CHAMPS_COMMANDE = [
  ["le", "Date de la commande", "date", 140],
  ["produit", "Produit commandé", "text", 180],
  ["prixPaye", "Prix payé (DH)", "number", 90],
  ["confirmation", "Appel de confirmation (délai, ton)", "text", 200],
  ["livraison", "Délai de livraison", "text", 120],
  ["livreur", "Livreur", "text", 120],
  ["emballage", "Emballage, qualité", "text", 200],
  ["remarque", "Remarque", "text", 220],
];

function CommandeTest({ valeur, onSave }) {
  const c = valeur || {};
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 0 0" }}>
      {CHAMPS_COMMANDE.map(([k, l, type, w]) => (
        <label key={k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
          {l}
          <input type={type} className="form-input" style={{ width: w, padding: "5px 8px" }} defaultValue={c[k] ?? ""}
            onBlur={e => { const v = e.target.value; if (v !== String(c[k] ?? "")) onSave({ ...c, [k]: v === "" ? null : type === "number" ? Number(v) : v }); }} />
        </label>
      ))}
    </div>
  );
}

function FicheVendeur({ f, auto, commande, onCommande, nicheManuelle, onNiche }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={{ ...carte, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>{f.nom}</b>
        <select className="form-select" style={{ width: "auto", padding: "3px 8px", fontSize: 12 }} value={nicheManuelle || ""} onChange={e => onNiche(e.target.value)}
          title="Niche de la page : calculée sur ses produits, corrigeable à la main">
          <option value="">{auto ? `${NICHE_LABEL[auto]} (auto)` : "Niche (auto)"}</option>
          {Object.entries(NICHE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <a href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=MA&view_all_page_id=${f.pageId}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>pubs ↗</a>
        {commande && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)" }}>commande test notée</span>}
      </div>
      <span style={{ fontSize: 12 }}>
        {f.nbProduits} produit{f.nbProduits > 1 ? "s" : ""} · {f.creatives} créatives · {f.pubs} pubs (+{f.recent} sur 7 j) · prix moyen {f.prixMoyen ? `${f.prixMoyen} DH` : "à vérifier"} · vidéo {f.partVideo ?? "?"} % · {f.plateformes.join(" / ")}
      </span>
      {f.promesses.length > 0 && <span style={{ fontSize: 12 }}><b>Promesses :</b> {f.promesses.map(p => `${p.l} (${p.part} %)`).join(" · ")}</span>}
      {f.accroches.length > 0 && <span style={{ fontSize: 12 }} dir="auto"><b>Accroches fréquentes :</b> {f.accroches.map(a => `« ${a} »`).join(" · ")}</span>}
      <span className="col-muted" style={{ fontSize: 12 }}>
        Produits : {f.produits.slice(0, 6).map(p => `${p.nom}${p.prix ? ` ${p.prix} DH` : ""}${p.signal ? " ★" : ""}`).join(" · ")}{f.produits.length > 6 ? " …" : ""}
      </span>
      <button className="btn btn-sm btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setOuvert(o => !o)}>
        {ouvert ? "Fermer la commande test" : commande ? "Voir la commande test" : "Noter une commande test"}
      </button>
      {ouvert && <CommandeTest valeur={commande} onSave={onCommande} />}
    </div>
  );
}

export default function Synthese({ groups, nichesPages, nichesAuto, nichesManuelles, commandes, onSaveConfig, onVoirProduit }) {
  const [min, setMin] = useState(() => lire("momtaz_synth_min", "300"));
  const [max, setMax] = useState(() => lire("momtaz_synth_max", "600"));
  const [n, setN] = useState(() => lire("momtaz_synth_n", "20"));
  const [niche, setNiche] = useState("");
  const [copie, setCopie] = useState(false);

  const top = useMemo(() => topProduits(groups, { min: Number(min) || 0, max: Number(max) || Infinity, niche, n: Number(n) || 20 }), [groups, min, max, niche, n]);
  const fiches = useMemo(() => vendeursDuTop(top).map(x => ficheVendeur(x.pageId, groups, nichesPages)), [top, groups, nichesPages]);
  const niches = useMemo(() => [...new Set(groups.map(g => g.niche).filter(Boolean))].sort((a, b) => (NICHE_LABEL[a] || a).localeCompare(NICHE_LABEL[b] || b)), [groups]);
  const sansPrix = groups.filter(g => g.prixMax == null && g.prixMin == null && g.recent > 0).length;

  const champ = (val, set, cle, w = 70) => (
    <input type="number" className="form-input" style={{ width: w, padding: "5px 8px" }} value={val}
      onChange={e => { set(e.target.value); ecrire(cle, e.target.value); }} />
  );
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texteSynthese(top, fiches, commandes, { min, max, niche }));
      setCopie(true); setTimeout(() => setCopie(false), 2500);
    } catch { /* presse-papiers indisponible */ }
  };

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...carte, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
        Top {champ(n, setN, "momtaz_synth_n", 60)} produits entre {champ(min, setMin, "momtaz_synth_min")} et {champ(max, setMax, "momtaz_synth_max")} DH
        <select className="form-select" style={{ width: "auto" }} value={niche} onChange={e => setNiche(e.target.value)}>
          <option value="">Toutes les niches</option>
          {niches.map(x => <option key={x} value={x}>{NICHE_LABEL[x] || x}</option>)}
        </select>
        <button className="btn btn-sm btn-primary" style={{ marginLeft: "auto" }} onClick={copier} disabled={!top.length}>{copie ? "Synthèse copiée" : "Copier la synthèse pour Claude"}</button>
        <span className="col-muted" style={{ width: "100%", fontSize: 12 }}>
          Classés par pubs lancées sur 7 jours, puis créatives, pages vendeuses, ancienneté. Un produit entre dans la fourchette si au moins un concurrent le vend à ce prix.
          {sansPrix ? ` ${sansPrix} produits actifs sans prix n'y sont pas : lis leurs prix depuis « Mettre à jour ».` : ""}
        </span>
      </div>

      <div style={{ ...carte, overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%" }}>
          <thead><tr><th>#</th><th></th><th>Produit</th><th>Niche</th><th style={{ textAlign: "right" }}>Prix</th><th style={{ textAlign: "right" }}>Ajouts 7 j</th><th style={{ textAlign: "right" }}>Créatives</th><th style={{ textAlign: "right" }}>Pages</th><th style={{ textAlign: "right" }}>Jours</th><th>Phase</th></tr></thead>
          <tbody>
            {top.map((g, i) => {
              const [pc, pf] = PHASE_COULEURS[g.phase.phase] || PHASE_COULEURS["Trop tôt"];
              const photo = (g.images && g.images[0]) || g.thumb;
              return (
                <tr key={g.cle}>
                  <td style={{ fontWeight: 800, color: "var(--blue)" }}>{i + 1}</td>
                  <td>{photo && <img src={photo} alt="" loading="lazy" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} onError={e => { e.currentTarget.style.visibility = "hidden"; }} />}</td>
                  <td>
                    <button className="btn-link" style={{ background: "none", border: 0, padding: 0, color: "var(--text)", fontWeight: 600, cursor: "pointer", textAlign: "left" }} onClick={() => onVoirProduit(g.nom)}>{g.nom}</button>
                    {signalFort(g) && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--green)", fontWeight: 700 }}>signal fort</span>}
                    {g.sante && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--orange)" }}>angle santé</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>{NICHE_LABEL[g.niche] || "—"}</td>
                  <td className="col-mono" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{g.prixMin === g.prixMax ? `${g.prixMin} DH` : `${g.prixMin}–${g.prixMax} DH`}</td>
                  <td className="col-mono" style={{ textAlign: "right", fontWeight: 700 }}>+{g.recent}</td>
                  <td className="col-mono" style={{ textAlign: "right" }}>{g.crea}</td>
                  <td className="col-mono" style={{ textAlign: "right" }}>{g.nbPages}</td>
                  <td className="col-mono" style={{ textAlign: "right" }}>{g.age}</td>
                  <td><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, color: pc, background: pf }}>{g.phase.phase}</span></td>
                </tr>
              );
            })}
            {!top.length && <tr><td colSpan={10} className="col-muted" style={{ padding: 16 }}>Aucun produit avec un prix dans cette fourchette.</td></tr>}
          </tbody>
        </table>
      </div>

      {fiches.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Pages qui vendent ces produits ({fiches.length})</div>
          <div className="col-muted" style={{ fontSize: 12, marginTop: -6 }}>
            Calculé sur leurs pubs. Achat, confirmation et logistique ne se voient pas dans les pubs : passe une commande test et note-la ici.
          </div>
          {fiches.map(f => (
            <FicheVendeur key={f.pageId} f={f} auto={nichesAuto[f.pageId]} commande={commandes[f.pageId]} nicheManuelle={nichesManuelles[f.pageId]}
              onCommande={c => onSaveConfig(CLE_COMMANDES, "commandesTest", { ...commandes, [f.pageId]: c })}
              onNiche={v => { const m = { ...nichesManuelles }; if (v) m[f.pageId] = v; else delete m[f.pageId]; onSaveConfig("niches_pages", "nichesPages", m); }} />
          ))}
        </>
      )}
    </div>
  );
}
