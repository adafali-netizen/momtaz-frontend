import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function getDecision(p) {
  if (p.decision === "SCALE") return { label: "SCALE",     color: "#16A34A", bg: "#F0FDF4" };
  if (p.decision === "STOP")  return { label: "STOP",      color: "#DC2626", bg: "#FEF2F2" };
  return                             { label: "OPTIMISER", color: "#D97706", bg: "#FFFBEB" };
}

// ── Modal ajout produit / ajout stock
function ModalAjout({ produits, onClose }) {
  const noms   = [...new Set(produits.map(p => p.nom))].sort();
  const fourns = [...new Set(produits.map(p => p.fournisseur).filter(Boolean))].sort();

  const [nomMode,    setNomMode]    = useState(noms.length > 0 ? "existant" : "nouveau");
  const [nomSelect,  setNomSelect]  = useState(noms[0] || "");
  const [nomNouveau, setNomNouveau] = useState("");
  const [fournMode,  setFournMode]  = useState(fourns.length > 0 ? "existant" : "nouveau");
  const [fournSel,   setFournSel]   = useState(fourns[0] || "");
  const [fournNouv,  setFournNouv]  = useState("");
  const [cout,       setCout]       = useState("");
  const [stock,      setStock]      = useState("");

  const nomFinal   = nomMode   === "existant" ? nomSelect  : nomNouveau;
  const fournFinal = fournMode === "existant" ? fournSel   : fournNouv;
  const existant   = produits.find(p => p.nom === nomFinal);

  const submit = async () => {
    if (!nomFinal) return;
    if (existant) {
      const ajout = +stock || 0;
      if (ajout > 0) {
        await supabase.from("produits").update({ stock_disponible: existant.stock_disponible + ajout }).eq("id", existant.id);
        await supabase.from("stock_movements").insert([{ produit_id: existant.id, type: "entree", quantite: ajout, source: "ajout_manuel" }]);
      }
      if (fournFinal) await supabase.from("produits").update({ fournisseur: fournFinal }).eq("id", existant.id);
    } else {
      await supabase.from("produits").insert([{
        nom: nomFinal, cout_achat: +cout || 0, fournisseur: fournFinal || null,
        stock_disponible: +stock || 0, stock_minimum: 5, decision: "OPTIMISER",
      }]);
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{existant ? "Ajouter du stock" : "Nouveau produit"}</span>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">

          {/* Produit */}
          <div className="form-group">
            <label className="form-label">Produit *</label>
            {noms.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <button className={`btn btn-sm ${nomMode === "existant" ? "btn-primary" : "btn-secondary"}`} onClick={() => setNomMode("existant")}>Existant</button>
                <button className={`btn btn-sm ${nomMode === "nouveau" ? "btn-primary" : "btn-secondary"}`} onClick={() => setNomMode("nouveau")}>+ Nouveau</button>
              </div>
            )}
            {nomMode === "existant" && noms.length > 0
              ? <select className="form-select" value={nomSelect} onChange={e => setNomSelect(e.target.value)}>{noms.map(n => <option key={n}>{n}</option>)}</select>
              : <input className="form-input" value={nomNouveau} onChange={e => setNomNouveau(e.target.value)} placeholder="Nom du produit..." />
            }
          </div>

          {/* Fournisseur */}
          <div className="form-group">
            <label className="form-label">Fournisseur</label>
            {fourns.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <button className={`btn btn-sm ${fournMode === "existant" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFournMode("existant")}>Existant</button>
                <button className={`btn btn-sm ${fournMode === "nouveau" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFournMode("nouveau")}>+ Nouveau</button>
              </div>
            )}
            {fournMode === "existant" && fourns.length > 0
              ? <select className="form-select" value={fournSel} onChange={e => setFournSel(e.target.value)}><option value="">— Aucun —</option>{fourns.map(f => <option key={f}>{f}</option>)}</select>
              : <input className="form-input" value={fournNouv} onChange={e => setFournNouv(e.target.value)} placeholder="Nom du fournisseur..." />
            }
          </div>

          {/* Prix achat seulement si nouveau */}
          {!existant && (
            <div className="form-group">
              <label className="form-label">Prix achat (MAD)</label>
              <input className="form-input" type="number" value={cout} onChange={e => setCout(e.target.value)} placeholder="80" />
            </div>
          )}

          {/* Stock */}
          <div className="form-group">
            <label className="form-label">{existant ? "Quantité à ajouter" : "Stock initial"}</label>
            <input className="form-input" type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="50" />
          </div>

          {existant && (
            <div style={{ padding: "8px 12px", background: "var(--blue-lt)", borderRadius: 8, fontSize: 12, color: "var(--blue)" }}>
              ℹ️ Produit existant — le stock sera ajouté au stock actuel ({existant.stock_disponible} u)
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit}>{existant ? "Ajouter le stock" : "Créer"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal édition produit
function ModalEdit({ produit, fourns, onClose }) {
  const [form, setForm] = useState({
    nom:              produit.nom || "",
    cout_achat:       produit.cout_achat || "",
    prix_vente:       produit.prix_vente || "",
    fournisseur:      produit.fournisseur || "",
    stock_minimum:    produit.stock_minimum || 5,
    decision:         produit.decision || "OPTIMISER",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [fournMode, setFournMode] = useState(fourns.includes(produit.fournisseur) ? "existant" : "nouveau");

  const submit = async () => {
    await supabase.from("produits").update({
      nom:           form.nom,
      cout_achat:    +form.cout_achat || 0,
      prix_vente:    +form.prix_vente || 0,
      fournisseur:   form.fournisseur || null,
      stock_minimum: +form.stock_minimum || 5,
      decision:      form.decision,
    }).eq("id", produit.id);
    onClose();
  };

  const marge = form.prix_vente && form.cout_achat ? +form.prix_vente - +form.cout_achat : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Modifier — {produit.nom}</span>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">

          <div className="form-group">
            <label className="form-label">Nom du produit</label>
            <input className="form-input" value={form.nom} onChange={e => set("nom", e.target.value)} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Prix achat (MAD)</label>
              <input className="form-input" type="number" value={form.cout_achat} onChange={e => set("cout_achat", e.target.value)} placeholder="80" />
            </div>
            <div className="form-group">
              <label className="form-label">Prix vente (MAD)</label>
              <input className="form-input" type="number" value={form.prix_vente} onChange={e => set("prix_vente", e.target.value)} placeholder="299" />
            </div>
          </div>

          {marge !== null && (
            <div style={{ padding: "8px 12px", background: marge > 0 ? "var(--green-lt)" : "var(--red-lt)", borderRadius: 8, fontSize: 12, color: marge > 0 ? "var(--green)" : "var(--red)", marginBottom: 4 }}>
              Marge : <strong>{marge} MAD</strong>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Fournisseur</label>
            {fourns.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <button className={`btn btn-sm ${fournMode === "existant" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFournMode("existant")}>Existant</button>
                <button className={`btn btn-sm ${fournMode === "nouveau" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFournMode("nouveau")}>+ Nouveau</button>
              </div>
            )}
            {fournMode === "existant" && fourns.length > 0
              ? <select className="form-select" value={form.fournisseur} onChange={e => set("fournisseur", e.target.value)}><option value="">— Aucun —</option>{fourns.map(f => <option key={f}>{f}</option>)}</select>
              : <input className="form-input" value={form.fournisseur} onChange={e => set("fournisseur", e.target.value)} placeholder="Nom du fournisseur..." />
            }
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Seuil minimum (u)</label>
              <input className="form-input" type="number" value={form.stock_minimum} onChange={e => set("stock_minimum", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Décision</label>
              <select className="form-select" value={form.decision} onChange={e => set("decision", e.target.value)}>
                <option>SCALE</option>
                <option>OPTIMISER</option>
                <option>STOP</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal
export default function Produits() {
  const [produits,    setProduits]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filtre,      setFiltre]      = useState("tous");
  const [showAjout,   setShowAjout]   = useState(false);
  const [editProduit, setEditProduit] = useState(null);

  useEffect(() => {
    fetchProduits();
    const ch = supabase.channel("produits-rt3")
      .on("postgres_changes", { event: "*", schema: "public", table: "produits" }, fetchProduits)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchProduits() {
    const { data, error } = await supabase.from("produits").select("*").order("nom");
    if (!error) setProduits(data);
    setLoading(false);
  }

  async function toggleDecision(id, current) {
    const seq  = ["OPTIMISER", "SCALE", "STOP"];
    const next = seq[(seq.indexOf(current) + 1) % seq.length];
    await supabase.from("produits").update({ decision: next }).eq("id", id);
  }

  const fourns    = [...new Set(produits.map(p => p.fournisseur).filter(Boolean))].sort();
  const DECISIONS = ["tous", "SCALE", "OPTIMISER", "STOP"];
  const count     = d => d === "tous" ? produits.length : produits.filter(p => getDecision(p).label === d).length;
  const filtered  = produits.filter(p => filtre === "tous" || getDecision(p).label === filtre);

  return (
    <>
      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className="kpi-card"><div className="kpi-value">{produits.length}</div><div className="kpi-label">Produits</div></div>
        <div className="kpi-card kpi-success"><div className="kpi-value">{count("SCALE")}</div><div className="kpi-label">SCALE</div></div>
        <div className="kpi-card kpi-warn"><div className="kpi-value">{count("OPTIMISER")}</div><div className="kpi-label">OPTIMISER</div></div>
        <div className={`kpi-card${count("STOP") > 0 ? " kpi-alert" : ""}`}><div className="kpi-value">{count("STOP")}</div><div className="kpi-label">STOP</div></div>
      </div>

      <div className="toolbar">
        <div className="filter-tabs">
          {DECISIONS.map(d => (
            <button key={d} className={`filter-tab${filtre === d ? " active" : ""}`} onClick={() => setFiltre(d)}>
              {d} <span className="filter-count">{count(d)}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAjout(true)}>+ Produit</button>
      </div>

      {loading ? (
        <div className="state-wrap"><div className="spinner" /> Chargement...</div>
      ) : produits.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏷️</div>
          <div className="empty-title">Aucun produit</div>
          <div className="empty-sub">Ajoute tes produits pour suivre coûts et décisions</div>
          <button className="btn btn-primary" onClick={() => setShowAjout(true)}>+ Nouveau produit</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Prix achat</th>
                <th>Prix vente</th>
                <th>Marge</th>
                <th>Fournisseur</th>
                <th>Stock</th>
                <th>Décision</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const marge = (p.prix_vente || 0) - (p.cout_achat || 0);
                const d     = getDecision(p);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nom}</td>
                    <td className="col-mono">{p.cout_achat ? `${p.cout_achat} MAD` : <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td className="col-mono">{p.prix_vente ? `${p.prix_vente} MAD` : <span style={{ color: "var(--muted2)" }}>à définir</span>}</td>
                    <td>
                      {p.prix_vente && p.cout_achat
                        ? <span style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: marge > 0 ? "var(--green)" : "var(--red)" }}>{marge} MAD</span>
                        : <span style={{ color: "var(--muted2)", fontSize: 12 }}>—</span>}
                    </td>
                    <td className="col-muted">{p.fournisseur || <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td>
                      <span className="col-mono" style={{ fontWeight: 700, color: p.stock_disponible <= 0 ? "var(--red)" : p.stock_disponible < p.stock_minimum ? "var(--orange)" : "var(--green)" }}>
                        {p.stock_disponible} u
                      </span>
                    </td>
                    <td>
                      <span className="decision-badge" onClick={() => toggleDecision(p.id, p.decision)}
                        style={{ color: d.color, background: d.bg, cursor: "pointer" }} title="Cliquer pour changer">
                        {d.label}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditProduit(p)}>✏️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted2)", borderTop: "1px solid var(--border)" }}>
            💡 Cliquer sur ✏️ pour modifier · Cliquer sur Décision pour changer le statut
          </div>
        </div>
      )}

      {showAjout   && <ModalAjout produits={produits} onClose={() => setShowAjout(false)} />}
      {editProduit && <ModalEdit  produit={editProduit} fourns={fourns} onClose={() => setEditProduit(null)} />}
    </>
  );
}
