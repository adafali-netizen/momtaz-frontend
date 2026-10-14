import { useMemo, useState } from "react";
import { candidatTest, PHASE_COULEURS } from "./veilleLib";
import { NICHE_LABEL } from "./nichesLib";
import { params, compteProduit, lignesCompte, ficheTexte, ETATS, PARAMS_DEFAUT } from "./decisionLib";

// Module Décision de test : les candidats du Classement, ton prix d'achat, le compte par colis livré, GO ou STOP,
// le coût d'un test et la file de test (un produit à la fois).

const carte = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 };
const dh = v => (v == null ? "—" : `${Math.round(v * 100) / 100} DH`);
const STATUT_ETAT = { file: "À tester", test: "Test lancé", gagnant: "En production", abandon: "Testé, abandonné" };
const ORDRE_ETAT = { test: 0, file: 1, "": 2, gagnant: 3, abandon: 4 };
// Classement des produits : le critère choisi d'abord, puis les ajouts sur 7 jours, les créatives et les pages
const TRIS = {
  recent: ["Ajouts 7 j", x => x.g.recent],
  score:  ["Score", x => x.g.score],
  crea:   ["Créatives", x => x.g.crea],
  pages:  ["Pages vendeuses", x => x.g.nbPages],
  net:    ["Marge nette par colis", x => x.c.netAuCplReference ?? -1e9],
  age:    ["Ancienneté", x => x.g.age],
  prix:   ["Prix le plus bas", x => x.g.prixMin ?? -1e9],
};
const VERDICTS = {
  go:    ["GO", "var(--green)", "var(--green-lt)"],
  stop:  ["STOP", "var(--red)", "var(--red-lt)"],
  achat: ["À compléter", "var(--orange)", "var(--orange-lt)"],
  prix:  ["À compléter", "var(--orange)", "var(--orange-lt)"],
};

function Champ({ label, valeur, placeholder, onSave, largeur = 90, suffixe = "DH" }) {
  const [v, setV] = useState(valeur ?? "");
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
      {label}
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input type="number" className="form-input" style={{ width: largeur, padding: "5px 8px" }} value={v} placeholder={placeholder}
          onChange={e => setV(e.target.value)} onBlur={() => { if (String(v) !== String(valeur ?? "")) onSave(v === "" ? null : Number(v)); }}
          onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()} />
        {suffixe && <span style={{ fontSize: 12 }}>{suffixe}</span>}
      </span>
    </label>
  );
}

function Reglages({ p, onSave }) {
  const [fixes, setFixes] = useState(p.fraisFixes || []);
  const champ = (k, label, suffixe = "DH") => <Champ key={k} label={label} valeur={p[k]} placeholder={String(PARAMS_DEFAUT[k])} suffixe={suffixe} largeur={80}
    onSave={v => onSave({ ...p, [k]: v ?? PARAMS_DEFAUT[k] })} />;
  const sauverFixes = l => { setFixes(l); onSave({ ...p, fraisFixes: l }); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {champ("livraison", "Livraison par colis")}{champ("emballage", "Emballage et stockage")}{champ("confirmation", "Confirmation et suivi")}{champ("securite", "Sécurité")}
        {champ("tauxConfirmation", "Taux de confirmation", "%")}{champ("tauxLivraison", "Taux de livraison", "%")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {champ("cplReference", "CPL de référence")}{champ("netMinimum", "Marge nette minimum / colis")}
        {champ("creativesParTest", "Créatives par test", "")}{champ("prixCreative", "Prix d'une créative")}{champ("leadsTest", "Leads pour juger", "")}{champ("budgetTest", "Budget de test")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Frais fixes par mois</span>
        {fixes.map((f, i) => (
          <span key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className="form-input" style={{ width: 220, padding: "5px 8px" }} defaultValue={f.nom} placeholder="Abonnement Claude, Shopify…"
              onBlur={e => sauverFixes(fixes.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} />
            <input type="number" className="form-input" style={{ width: 100, padding: "5px 8px" }} defaultValue={f.montant} placeholder="Montant"
              onBlur={e => sauverFixes(fixes.map((x, j) => (j === i ? { ...x, montant: e.target.value === "" ? null : Number(e.target.value) } : x)))} />
            <span style={{ fontSize: 12 }}>DH</span>
            <button className="btn-close" title="Retirer" onClick={() => sauverFixes(fixes.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
        <button className="btn btn-sm btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setFixes([...fixes, { nom: "", montant: null }])}>Ajouter un frais fixe</button>
      </div>
    </div>
  );
}

function Fiche({ g, d, p, rang, place, onDecision, onEtat }) {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);
  const c = compteProduit(d, g.prixMin, p);
  const [libelle, coul, fond] = VERDICTS[c.verdict];
  const photo = (g.images && g.images[0]) || g.thumb;
  const lien = (g.vendors.find(v => v.urls && v.urls.length) || { urls: [] }).urls[0];
  const [pc, pf] = PHASE_COULEURS[g.phase.phase] || PHASE_COULEURS["Trop tôt"];
  const copier = async () => {
    try { await navigator.clipboard.writeText(ficheTexte(g, d, c, p)); setCopie(true); setTimeout(() => setCopie(false), 2500); } catch { /* presse-papiers indisponible */ }
  };
  return (
    <div style={{ ...carte, padding: 14, display: "flex", flexDirection: "column", gap: 10, borderLeft: `4px solid ${coul}`, opacity: d?.etat === "abandon" ? 0.6 : 1 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {photo
          ? <a href={lien || photo} target="_blank" rel="noreferrer" style={{ flex: "none" }}><img src={photo} alt="" loading="lazy" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, background: "var(--surface2)" }} onError={e => { e.currentTarget.style.visibility = "hidden"; }} /></a>
          : <div style={{ width: 96, height: 96, borderRadius: 8, background: "var(--surface2)", flex: "none" }} />}
        <div style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: "var(--blue)" }}>#{place}</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{g.nom}</span>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 99, color: coul, background: fond }}>{libelle}</span>
            {rang && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)" }}>n° {rang} dans la file</span>}
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, color: pc, background: pf }}>{g.phase.phase}</span>
          </span>
          <span className="col-muted" style={{ fontSize: 12 }}>
            {g.crea} créatives · {g.pubs} pubs · +{g.recent} sur 7 jours · plus ancienne : {g.age} jours · {g.nbPages} page{g.nbPages > 1 ? "s" : ""}
            {g.prixMin ? ` · prix le plus bas du marché : ${g.prixMin} DH${g.prixMax !== g.prixMin ? ` (le plus haut : ${g.prixMax} DH)` : ""}` : " · prix du marché : à vérifier"}
            {g.niche ? ` · ${NICHE_LABEL[g.niche] || g.niche}` : ""}
            {g.sante ? " · angle santé chez le concurrent : à changer" : ""}
          </span>
          <span style={{ fontSize: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {g.vendors.map(v => (
              <span key={v.fb_page_id}>
                <b>{v.page}</b> {v.prix ? `${v.prix} DH` : "prix ?"}{" "}
                {v.urls && v.urls[0] && <a href={v.urls[0]} target="_blank" rel="noreferrer">page produit ↗</a>}
              </span>
            ))}
          </span>
          <span style={{ fontSize: 13, color: coul, fontWeight: 600 }}>{c.raison}</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Champ label="Prix d'achat livré" valeur={d?.achat} placeholder={c.achatMax != null ? `≤ ${c.achatMax}` : ""} onSave={v => onDecision({ achat: v })} />
          <Champ label="Ton prix de vente" valeur={d?.prixVente} placeholder={g.prixMin ? String(g.prixMin) : "Prix"} onSave={v => onDecision({ prixVente: v })} />
          <Champ label="Livraison (grand produit)" valeur={d?.livraison} placeholder={String(p.livraison)} onSave={v => onDecision({ livraison: v })} largeur={70} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select className="form-select" style={{ width: "auto" }} value={d?.etat || ""} onChange={e => onEtat(e.target.value)}>
          {Object.entries(ETATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {(!d?.etat) && c.verdict === "go" && <button className="btn btn-sm btn-primary" style={{ background: "var(--green)" }} onClick={() => onEtat("file")}>Mettre dans la file de test</button>}
        <button className="btn btn-sm btn-secondary" onClick={() => setOuvert(o => !o)}>{ouvert ? "Masquer le compte" : "Compte par colis et coût du test"}</button>
        <button className="btn btn-sm btn-secondary" onClick={copier}>{copie ? "Fiche copiée" : "Copier la fiche pour Claude"}</button>
        <input className="form-input" style={{ flex: "1 1 220px", padding: "5px 8px" }} defaultValue={d?.note || ""} placeholder="Note (fournisseur, délai, remarque…)"
          onBlur={e => { if (e.target.value !== (d?.note || "")) onDecision({ note: e.target.value }); }} />
      </div>

      {ouvert && (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 320 }}>
            <tbody>
              {lignesCompte(c, p).map(l => (
                <tr key={l.label} style={{ borderTop: l.total ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "3px 12px 3px 0", fontWeight: l.total || l.fort ? 700 : 400 }}>{l.label}</td>
                  <td className="col-mono" style={{ textAlign: "right", fontWeight: l.total || l.fort ? 700 : 400, color: l.total && l.v < 0 ? "var(--red)" : undefined }}>{dh(l.v)}</td>
                </tr>
              ))}
              {!lignesCompte(c, p).length && <tr><td className="col-muted">Saisis le prix d'achat livré pour voir le compte.</td></tr>}
            </tbody>
          </table>
          {c.test && (
            <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              <b>Coût du test ({p.leadsTest} leads à {p.cplReference} DH, {p.creativesParTest} créatives)</b>
              <span>Créatives : {dh(c.test.creatives)} · publicité : {dh(c.test.pub)}</span>
              <span>Pire cas, aucun colis livré : <b style={{ color: "var(--red)" }}>−{dh(c.test.pire)}</b></span>
              <span>Cas prévu : environ {c.test.colis} colis livrés, {dh(c.test.recupere)} récupérés → <b>{c.test.probable > 0 ? "−" : "+"}{dh(Math.abs(c.test.probable))}</b></span>
              <span>CPL plafond (il reste {p.netMinimum} DH par colis) : <b>{dh(c.cplPlafond)}</b> · point mort : {dh(c.cplPointMort)}</span>
              {c.colisPourFixes && <span>Colis livrés par mois pour couvrir tes frais fixes ({dh(c.fraisFixes)}) : <b>{c.colisPourFixes}</b></span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Decision({ groups, parametres, decisions, onSaveParams, onSaveDecisions, onPatch }) {
  const p = params(parametres);
  const [filtre, setFiltre] = useState("tous");
  const [voirReglages, setVoirReglages] = useState(false);
  const [tri, setTri] = useState(() => { try { return localStorage.getItem("momtaz_decision_tri") || "recent"; } catch { return "recent"; } });
  const [niche, setNiche] = useState("");
  const choisirTri = v => { setTri(v); try { localStorage.setItem("momtaz_decision_tri", v); } catch { /* stockage indisponible */ } };

  // Produits du module : candidats au test (signal fort, 230 DH et plus) et produits déjà décidés ou mis à l'essai
  const liste = useMemo(() => groups
    .filter(g => candidatTest(g) || decisions[g.cle] || ["À tester", "Test lancé", "En production"].includes(g.statut))
    .map(g => ({ g, d: decisions[g.cle] || {}, c: compteProduit(decisions[g.cle], g.prixMin, p) })),
  [groups, decisions, p]);

  // File de test : dans l'ordre où les produits y sont entrés
  const file = liste.filter(x => x.d.etat === "file").sort((a, b) => String(a.d.le).localeCompare(String(b.d.le)));
  const val = (TRIS[tri] || TRIS.recent)[1];
  const classes = [...liste].sort((a, b) => (val(b) - val(a)) || (b.g.recent - a.g.recent) || (b.g.crea - a.g.crea) || (b.g.nbPages - a.g.nbPages) || (b.g.age - a.g.age));
  const place = new Map(classes.map((x, i) => [x.g.cle, i + 1]));
  const niches = [...new Set(liste.map(x => x.g.niche).filter(Boolean))].sort((a, b) => (NICHE_LABEL[a] || a).localeCompare(NICHE_LABEL[b] || b));
  const visibles = classes.filter(x => !niche || x.g.niche === niche).filter(({ d, c }) => filtre === "tous" ? d.etat !== "abandon"
    : filtre === "go" ? c.verdict === "go" && !d.etat
    : filtre === "stop" ? c.verdict === "stop"
    : filtre === "completer" ? c.verdict === "achat" || c.verdict === "prix"
    : filtre === "file" ? d.etat === "file" || d.etat === "test"
    : d.etat === "abandon");

  const enregistrer = (cle, champs) => onSaveDecisions({ ...decisions, [cle]: { ...(decisions[cle] || {}), ...champs } });
  const changerEtat = (x, etat) => {
    enregistrer(x.g.cle, { etat, le: etat === "file" ? new Date().toISOString() : (decisions[x.g.cle] || {}).le });
    if (STATUT_ETAT[etat] && x.g.ids.length) onPatch(x.g.ids, { statut: STATUT_ETAT[etat] });
  };

  const pireTest = p.creativesParTest * p.prixCreative + p.leadsTest * p.cplReference;
  const nb = k => liste.filter(k).length;

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...carte }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
          <span style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 2 }}>
            <b>Budget de test : {dh(p.budgetTest)} · un test coûte au pire {dh(pireTest)} → {Math.floor(p.budgetTest / pireTest)} tests possibles dans le pire cas</b>
            <span className="col-muted">
              GO = il reste au moins {p.netMinimum} DH nets par colis livré à {p.cplReference} DH de CPL ({p.tauxConfirmation} % confirmés × {p.tauxLivraison} % livrés).
              Frais par colis livré : {dh(p.livraison + p.emballage + p.confirmation + p.securite)} (livraison, emballage, confirmation, sécurité).
            </span>
          </span>
          <button className="btn btn-sm btn-secondary" onClick={() => setVoirReglages(v => !v)}>{voirReglages ? "Fermer les réglages" : "Réglages et frais fixes"}</button>
        </div>
        {voirReglages && <Reglages p={p} onSave={onSaveParams} />}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[["tous", `Tous (${nb(x => x.d.etat !== "abandon")})`], ["go", `GO à lancer (${nb(x => x.c.verdict === "go" && !x.d.etat)})`],
          ["completer", `À compléter (${nb(x => x.c.verdict === "achat" || x.c.verdict === "prix")})`], ["stop", `STOP (${nb(x => x.c.verdict === "stop")})`],
          ["file", `File et test (${nb(x => x.d.etat === "file" || x.d.etat === "test")})`], ["abandon", `Abandonnés (${nb(x => x.d.etat === "abandon")})`]]
          .map(([id, l]) => <button key={id} className={`filter-tab${filtre === id ? " active" : ""}`} onClick={() => setFiltre(id)}>{l}</button>)}
        <span style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center", fontSize: 13 }}>
          Classer par
          <select className="form-select" style={{ width: "auto" }} value={tri} onChange={e => choisirTri(e.target.value)}>
            {Object.entries(TRIS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="form-select" style={{ width: "auto" }} value={niche} onChange={e => setNiche(e.target.value)}>
            <option value="">Toutes les niches</option>
            {niches.map(n => <option key={n} value={n}>{NICHE_LABEL[n] || n}</option>)}
          </select>
        </span>
      </div>
      <div className="col-muted" style={{ fontSize: 12 }}>
        « Ton prix de vente » vide = le prix le plus bas vu chez les concurrents. Le n° # est la place du produit dans le classement choisi.
      </div>

      {!liste.length && (
        <div className="col-muted" style={{ ...carte, padding: 16 }}>
          Aucun candidat pour l'instant. Un produit arrive ici quand il a plus de 3 créatives actives, que la plus ancienne a 10 jours ou plus, et qu'il est vendu 230 DH ou plus.
          Tu peux aussi y amener un produit en passant son statut à « À tester » dans le Classement.
        </div>
      )}
      {visibles.map(x => (
        <Fiche key={x.g.cle} g={x.g} d={x.d} p={p} place={place.get(x.g.cle)} rang={x.d.etat === "file" ? file.indexOf(x) + 1 : null}
          onDecision={champs => enregistrer(x.g.cle, champs)} onEtat={etat => changerEtat(x, etat)} />
      ))}
    </div>
  );
}
