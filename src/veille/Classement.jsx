import { Fragment, useMemo, useState } from "react";
import { STATUTS, STATUT_COULEURS, toSheetTsv } from "./veilleLib";

const FILTRES_PRIX = [
  { id: "tous",   label: "Tous les prix" },
  { id: "250",    label: "250 DH ou plus" },
  { id: "sans",   label: "Sans prix" },
  { id: "moins",  label: "Moins de 250 DH" },
];

const adLink = id => "https://www.facebook.com/ads/library/?id=" + id;
const fmtPrix = g => !g.prixMax ? "Prix ?" : g.prixMin === g.prixMax ? `${g.prixMax} DH` : `${g.prixMin}–${g.prixMax} DH`;

function PrixInput({ vendor, onSave }) {
  const [val, setVal] = useState(vendor.prix ?? "");
  const save = () => {
    const n = val === "" ? null : Number(val);
    if (n === vendor.prix || (n !== null && Number.isNaN(n))) return;
    onSave(n);
  };
  return (
    <input
      type="number" value={val} placeholder="Prix"
      onChange={e => setVal(e.target.value)} onBlur={save}
      onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
      onClick={e => e.stopPropagation()}
      style={{ width: 72, padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: vendor.prix ? "var(--surface)" : "var(--orange-lt)" }}
    />
  );
}

function TexteInput({ value, onSave, width = 200, list }) {
  const [val, setVal] = useState(value || "");
  return (
    <input
      className="form-input" value={val} list={list} style={{ width, padding: "5px 8px" }}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val.trim() && val.trim() !== (value || "")) onSave(val.trim()); }}
      onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function Details({ g, nomsGroupes, onPatch }) {
  return (
    <div style={{ padding: "12px 4px 4px", display: "flex", flexDirection: "column", gap: 14, cursor: "default" }} onClick={e => e.stopPropagation()}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Vendeurs</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", fontSize: 11, textAlign: "left" }}>
              <th style={{ padding: 4 }}>Page</th><th style={{ padding: 4 }}>Lien</th><th style={{ padding: 4 }}>Prix</th><th style={{ padding: 4 }}>Nom du produit</th>
              <th style={{ padding: 4 }}>Groupe (même nom = même produit)</th><th style={{ padding: 4 }}>Promesse santé</th>
            </tr>
          </thead>
          <tbody>
            {g.items.map(v => (
              <tr key={v.fb_page_id + v.produit_key}>
                <td style={{ padding: 4, fontWeight: 600 }}>{v.page}</td>
                <td style={{ padding: 4, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.produit_key}</a> : <span className="col-muted">sans lien</span>}</td>
                <td style={{ padding: 4 }}>{v.row && <PrixInput vendor={v} onSave={prix => onPatch([v.row.id], { prix })} />}</td>
                <td style={{ padding: 4 }}>{v.row && <TexteInput value={v.nom} onSave={nom => onPatch([v.row.id], { nom })} />}</td>
                <td style={{ padding: 4 }}>{v.row && <TexteInput value={v.groupe} list="veille-groupes" width={240} onSave={groupe => onPatch([v.row.id], { groupe, statut: g.statut })} />}</td>
                <td style={{ padding: 4 }}>{v.row && <input type="checkbox" checked={v.sante} onChange={e => onPatch([v.row.id], { risque_sante: e.target.checked })} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="veille-groupes">{nomsGroupes.map(n => <option key={n} value={n} />)}</datalist>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
          Toutes les créatives ({g.cartes.length}) · les liens expirent après 2 à 4 jours, télécharge-les vite
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {g.cartes.map(c => (
            <div key={c.library_id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: 12, background: "var(--surface)" }}>
              {c.thumb
                ? <img src={c.thumb} alt="" loading="lazy" style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 6, background: "var(--surface2)" }} onError={e => { e.currentTarget.style.visibility = "hidden"; }} />
                : <div style={{ height: 110, borderRadius: 6, background: "var(--surface2)" }} />}
              <div style={{ fontWeight: 600 }}>{c.format} · {c.nb} pub{c.nb > 1 ? "s" : ""}{c.low ? " · faible" : ""}</div>
              <div className="col-muted">{c.page} · depuis {c.started_on ? new Date(c.started_on).toLocaleDateString("fr-FR") : "?"}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={adLink(c.library_id)} target="_blank" rel="noreferrer">Pub</a>
                {c.media && <a href={c.media} target="_blank" rel="noreferrer">Télécharger</a>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Classement({ groups, pages, pageInfo, onPatch, dateReleve }) {
  const [fPage,   setFPage]   = useState("");
  const [fStatut, setFStatut] = useState("actifs");
  const [fPrix,   setFPrix]   = useState("tous");
  const [q,       setQ]       = useState("");
  const [ouvert,  setOuvert]  = useState(null);
  const [limite,  setLimite]  = useState(50);

  const visibles = useMemo(() => groups.filter(g => {
    if (fPage && !g.vendors.some(v => v.fb_page_id === fPage)) return false;
    if (fStatut === "actifs" && g.statut === "Testé, abandonné") return false;
    if (fStatut !== "actifs" && fStatut !== "tous" && g.statut !== fStatut) return false;
    if (fPrix === "250" && g.tier !== 0) return false;
    if (fPrix === "sans" && g.tier !== 1) return false;
    if (fPrix === "moins" && g.tier !== 2) return false;
    if (q && !(g.nom + " " + g.vendors.map(v => v.page + " " + v.nom).join(" ")).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [groups, fPage, fStatut, fPrix, q]);

  const nomsGroupes = useMemo(() => groups.map(g => g.nom).sort((a, b) => a.localeCompare(b)), [groups]);
  const pagesTriees = useMemo(() => [...pages].filter(p => p.actif).sort((a, b) => pageInfo(a.fb_page_id).nom.localeCompare(pageInfo(b.fb_page_id).nom)), [pages, pageInfo]);

  const exporter = () => {
    const tsv = toSheetTsv(visibles, pageInfo, dateReleve ? new Date(dateReleve).toLocaleDateString("fr-FR") : "");
    const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `veille_${new Date().toISOString().slice(0, 10)}.tsv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!groups.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔎</div>
        <div className="empty-title">Aucun relevé pour l'instant</div>
        <div className="empty-sub">Clique sur « Importer des fichiers .mhtml » pour ajouter tes pages Ad Library enregistrées.</div>
      </div>
    );
  }

  return (
    <>
      <div className="toolbar">
        <div style={{ position: "relative", minWidth: 220 }}>
          <input className="search-input" style={{ paddingLeft: 12 }} placeholder="Rechercher un produit ou une page" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: "auto" }} value={fPrix} onChange={e => setFPrix(e.target.value)}>
          {FILTRES_PRIX.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select className="form-select" style={{ width: "auto" }} value={fStatut} onChange={e => setFStatut(e.target.value)}>
          <option value="actifs">Tous sauf abandonnés</option>
          <option value="tous">Tous les statuts</option>
          {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-select" style={{ width: "auto", maxWidth: 220 }} value={fPage} onChange={e => setFPage(e.target.value)}>
          <option value="">Toutes les pages</option>
          {pagesTriees.map(p => <option key={p.fb_page_id} value={p.fb_page_id}>{pageInfo(p.fb_page_id).nom}</option>)}
        </select>
        <div className="spacer" style={{ flex: 1 }} />
        <span className="col-muted">{visibles.length} produits</span>
        <button className="btn btn-secondary" onClick={exporter}>Exporter vers le Sheet</button>
      </div>

      <div className="table-wrap" style={{ paddingTop: 12 }}>
        <table className="data-table" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th>#</th><th>Produit et vendeurs</th><th>Score</th>
              <th style={{ textAlign: "right" }}>Pubs</th><th style={{ textAlign: "right" }}>Âge</th>
              <th style={{ textAlign: "right" }}>Ajouts 7 j</th><th>Créatives</th><th>Risques</th><th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {visibles.slice(0, limite).map((g, i) => {
              const cle = g.nom.toLowerCase();
              const [coul, fond] = STATUT_COULEURS[g.statut] || STATUT_COULEURS.Nouveau;
              const premieres = g.cartes.filter(c => c.media).slice(0, 3);
              return (
                <Fragment key={cle}>
                <tr style={{ verticalAlign: "top" }} onClick={() => setOuvert(ouvert === cle ? null : cle)}>
                  <td className="col-mono col-muted">{i + 1}</td>
                  <td style={{ minWidth: 340 }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      {g.thumb
                        ? <img src={g.thumb} alt="" loading="lazy" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flex: "none", background: "var(--surface2)" }} onError={e => { e.currentTarget.style.visibility = "hidden"; }} />
                        : <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--surface2)", flex: "none" }} />}
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700 }}>{g.nom}</span>
                          <span className="col-muted">{fmtPrix(g)} · {g.nbPages} page{g.nbPages > 1 ? "s" : ""}</span>
                        </div>
                        {g.vendors.map(v => (
                          <div key={v.fb_page_id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                            <span style={{ fontWeight: 600 }}>{v.page}</span>
                            {v.prixDifferents
                              ? <span className="col-mono" title="Plusieurs prix : modifie-les dans Détails">{v.prixMin}–{v.prix} DH</span>
                              : v.ids.length > 0 && <PrixInput vendor={v} onSave={prix => onPatch(v.ids, { prix })} />}
                            <span className="col-muted">{v.pubs} pubs</span>
                            {v.url && <a href={v.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontWeight: 600 }}>Page produit</a>}
                            {v.urls.length > 1 && <span className="col-muted">+{v.urls.length - 1} lien{v.urls.length > 2 ? "s" : ""}</span>}
                          </div>
                        ))}
                        <span style={{ fontSize: 11, color: "var(--blue)" }}>{ouvert === cle ? "Fermer" : "Détails, regrouper, toutes les créatives"}</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ minWidth: 110 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 7, borderRadius: 99, background: "var(--surface3)", overflow: "hidden" }}>
                        <div style={{ height: 7, width: g.score + "%", background: "var(--blue)" }} />
                      </div>
                      <span className="col-mono" style={{ fontWeight: 700 }}>{g.score}</span>
                    </div>
                  </td>
                  <td className="col-mono" style={{ textAlign: "right", fontWeight: 700 }}>{g.pubs}</td>
                  <td className="col-muted" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{g.age} j</td>
                  <td className="col-mono" style={{ textAlign: "right", color: g.recent ? "var(--green)" : "var(--muted2)" }}>{g.recent ? "+" + g.recent : "0"}</td>
                  <td style={{ fontSize: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {premieres.map((c, k) => <a key={c.library_id} href={c.media} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontWeight: 600 }}>{c.format} {k + 1}</a>)}
                      {g.crea > premieres.length && <span className="col-muted">+{g.crea - premieres.length} autres</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, fontWeight: 600, color: g.sante ? "var(--orange)" : "var(--green)" }}>{g.sante ? "Promesse santé" : "Aucun"}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <select value={g.statut} onChange={e => onPatch(g.ids, { statut: e.target.value })}
                      style={{ fontSize: 12, fontWeight: 600, padding: "4px 8px", borderRadius: 99, border: "1px solid transparent", color: coul, background: fond, cursor: "pointer" }}>
                      {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
                {ouvert === cle && (
                  <tr style={{ cursor: "default", background: "var(--bg)" }}>
                    <td />
                    <td colSpan={8}><Details g={g} nomsGroupes={nomsGroupes} onPatch={onPatch} /></td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {visibles.length > limite && (
          <div style={{ textAlign: "center", padding: 16 }}>
            <button className="btn btn-secondary" onClick={() => setLimite(limite + 50)}>Afficher 50 de plus ({visibles.length - limite} restants)</button>
          </div>
        )}
      </div>
    </>
  );
}
