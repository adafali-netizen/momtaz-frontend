import { useMemo, useState } from "react";
import { pageIdFrom } from "./veilleLib";
import { addPages, updatePage } from "./veilleData";

const libUrl = id => "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=" + id;

function idDepuisLigne(l) {
  const id = pageIdFrom(l);
  if (id) return id;
  const m = l.match(/facebook\.com\/(?:profile\.php\?id=)?(\d{8,})/);
  if (m) return m[1];
  return /^\d{8,}$/.test(l.trim()) ? l.trim() : null;
}

function NomInterne({ page, onSave }) {
  const [val, setVal] = useState(page.nom_interne || "");
  return (
    <input className="form-input" style={{ width: 180, padding: "5px 8px" }} placeholder="Facultatif" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val.trim() !== (page.nom_interne || "")) onSave(val.trim() || null); }}
      onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()} />
  );
}

export default function PagesSuivies({ pages, groups, latest, pageInfo, homonymes, onReload, onPatchPage }) {
  const [texte,    setTexte]    = useState("");
  const [verif,    setVerif]    = useState(null);
  const [envoi,    setEnvoi]    = useState(false);
  const [q,        setQ]        = useState("");
  const [retirees, setRetirees] = useState(false);
  const [copie,    setCopie]    = useState(false);

  const stats = useMemo(() => {
    const s = {};
    for (const g of groups) for (const v of g.vendors) {
      const x = (s[v.fb_page_id] = s[v.fb_page_id] || { pubs: 0, produits: 0, recent: 0 });
      x.pubs += v.pubs; x.produits += 1; x.recent += v.recent;
    }
    return s;
  }, [groups]);

  const verifier = () => {
    const lignes = texte.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const vus = new Set();
    const res = lignes.map(l => {
      const id = idDepuisLigne(l);
      if (!id) return { ligne: l, etat: "invalide" };
      if (vus.has(id)) return { ligne: l, id, etat: "doublon" };
      vus.add(id);
      const p = pages.find(x => x.fb_page_id === id);
      if (!p) return { ligne: l, id, etat: "nouvelle" };
      return { ligne: l, id, etat: p.actif ? "suivie" : "retiree", nom: pageInfo(id).nom };
    });
    setVerif(res);
  };

  const aAjouter = (verif || []).filter(r => r.etat === "nouvelle" || r.etat === "retiree").map(r => r.id);

  const ajouter = async () => {
    setEnvoi(true);
    try { await addPages(aAjouter); setTexte(""); setVerif(null); await onReload(); }
    finally { setEnvoi(false); }
  };

  const liste = pages
    .filter(p => retirees ? !p.actif : p.actif)
    .filter(p => !q || [pageInfo(p.fb_page_id).nom, p.nom, p.fb_page_id, p.sites].join(" ").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (stats[b.fb_page_id]?.pubs || 0) - (stats[a.fb_page_id]?.pubs || 0));

  const copierLiens = async () => {
    const liens = pages.filter(p => p.actif).map(p => libUrl(p.fb_page_id)).join("\n");
    try { await navigator.clipboard.writeText(liens); setCopie(true); setTimeout(() => setCopie(false), 2500); } catch { /* presse-papiers indisponible */ }
  };

  const ETATS = {
    nouvelle: ["Nouvelle page", "var(--blue)", "Son nom apparaîtra au premier relevé."],
    suivie:   ["Déjà suivie", "var(--muted)", "Même ID qu'une page de ta liste : ignorée."],
    retiree:  ["Retirée, sera réactivée", "var(--orange)", ""],
    doublon:  ["En double dans ta liste", "var(--muted)", "Ignorée."],
    invalide: ["Lien non reconnu", "var(--red)", "Colle un lien Ad Library contenant view_all_page_id=…"],
  };

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 360px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Ajouter des pages</div>
          <div className="col-muted">Colle les liens Ad Library copiés depuis My Ad Finder, un par ligne. Chaque page est reconnue par son ID, jamais par son nom.</div>
          <textarea className="form-input" rows={5} value={texte} onChange={e => { setTexte(e.target.value); setVerif(null); }}
            placeholder="https://www.facebook.com/ads/library/?…&view_all_page_id=…" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={verifier} disabled={!texte.trim()}>Vérifier les liens</button>
            {aAjouter.length > 0 && <button className="btn btn-primary" onClick={ajouter} disabled={envoi}>{envoi ? "Ajout…" : `Ajouter ${aAjouter.length} page${aAjouter.length > 1 ? "s" : ""}`}</button>}
          </div>
          {verif && verif.map((r, i) => {
            const [label, couleur, msg] = ETATS[r.etat];
            return (
              <div key={i} style={{ borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: couleur }}>{label}</span>
                {r.id && <span className="col-mono col-muted"> · ID {r.id}</span>}
                {r.nom && <span> · {r.nom}</span>}
                {msg && <div className="col-muted">{msg}</div>}
              </div>
            );
          })}
        </div>
        <div style={{ flex: "1 1 300px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Relever tes pages</div>
          <div className="col-muted">
            En attendant l'extension : copie les liens, ouvre-les dans le Chrome sans compte Facebook, fais défiler chaque page jusqu'en bas,
            puis Ctrl+S, type « Page Web, un seul fichier ». Importe ensuite tous les fichiers d'un coup.
          </div>
          <div><button className="btn btn-secondary" onClick={copierLiens}>{copie ? "Liens copiés" : `Copier les ${pages.filter(p => p.actif).length} liens Ad Library`}</button></div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 700 }}>{retirees ? "Pages retirées" : "Pages suivies"} ({liste.length})</div>
          <div style={{ flex: 1 }} />
          <input className="search-input" style={{ paddingLeft: 12, width: 260 }} placeholder="Rechercher par nom, ID ou site" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn btn-sm btn-secondary" onClick={() => setRetirees(!retirees)}>{retirees ? "Voir les pages suivies" : "Voir les pages retirées"}</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>Page</th><th>Nom interne</th><th>Sites</th>
                <th style={{ textAlign: "right" }}>Pubs actives</th><th style={{ textAlign: "right" }}>Produits</th>
                <th style={{ textAlign: "right" }}>Ajouts 7 j</th><th>Dernier relevé</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {liste.map(p => {
                const s = stats[p.fb_page_id] || { pubs: 0, produits: 0, recent: 0 };
                const rel = latest[p.fb_page_id];
                return (
                  <tr key={p.fb_page_id} style={{ cursor: "default" }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.nom || "Nom inconnu (au prochain relevé)"}</div>
                      <div className="col-mono col-muted">ID {p.fb_page_id}</div>
                      {homonymes.has(p.fb_page_id) && <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 600 }}>Même nom qu'une autre page : donne-lui un nom interne</div>}
                    </td>
                    <td><NomInterne page={p} onSave={v => onPatchPage(p.fb_page_id, { nom_interne: v })} /></td>
                    <td className="col-muted" style={{ maxWidth: 220 }}>{p.sites || "—"}</td>
                    <td className="col-mono" style={{ textAlign: "right", fontWeight: 700 }}>{s.pubs}</td>
                    <td className="col-mono" style={{ textAlign: "right" }}>{s.produits}</td>
                    <td className="col-mono" style={{ textAlign: "right", color: s.recent ? "var(--green)" : "var(--muted2)" }}>{s.recent ? "+" + s.recent : "0"}</td>
                    <td className="col-muted">
                      {rel ? new Date(rel.capture_le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Jamais relevée"}
                      {rel?.incomplet && <div style={{ color: "var(--orange)", fontSize: 11, fontWeight: 600 }}>Fichier incomplet</div>}
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                      <a href={libUrl(p.fb_page_id)} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Ad Library</a>
                      {" · "}
                      <a href="#" onClick={async e => { e.preventDefault(); await updatePage(p.fb_page_id, { actif: !p.actif }); await onReload(); }}
                        style={{ color: p.actif ? "var(--red)" : "var(--green)", fontWeight: 600 }}>{p.actif ? "Retirer" : "Réactiver"}</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
