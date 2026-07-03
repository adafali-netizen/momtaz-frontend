import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function getStatut(p, entrees, sorties, mvts) {
  const dispo = entrees - sorties;

  if (dispo <= 0) return { label: "RUPTURE", color: "#DC2626", bg: "#FEF2F2" };

  if (sorties === 0 && dispo > 0) return { label: "LIQUIDER", color: "#7C3AED", bg: "#F5F3FF" };

  // Calcul moyenne sorties/jour
  const sortiesMvts = mvts.filter(m => m.type === "sortie");
  if (sortiesMvts.length > 0) {
    const dates = sortiesMvts.map(m => new Date(m.created_at).toDateString());
    const joursActifs = new Set(dates).size;
    const moyParJour = sorties / Math.max(joursActifs, 1);
    const seuil2j = moyParJour * 2;
    if (dispo < seuil2j) return { label: "SURVEILLER", color: "#D97706", bg: "#FFFBEB" };
  }

  return { label: "OK", color: "#16A34A", bg: "#F0FDF4" };
}

const COULEURS_PRESET = ["Rouge", "Bleu", "Noir", "Blanc", "Vert", "Jaune", "Rose", "Gris", "Orange", "Violet"];

function ModalAjout({ produits, onClose }) {
  const noms   = [...new Set(produits.map(p => p.nom))].sort();
  const fourns = [...new Set(produits.map(p => p.fournisseur).filter(Boolean))].sort();
  const [nomMode,      setNomMode]      = useState(noms.length > 0 ? "existant" : "nouveau");
  const [nomSelect,    setNomSelect]    = useState(noms[0] || "");
  const [nomNouveau,   setNomNouveau]   = useState("");
  const [fournMode,    setFournMode]    = useState(fourns.length > 0 ? "existant" : "nouveau");
  const [fournSel,     setFournSel]     = useState(fourns[0] || "");
  const [fournNouv,    setFournNouv]    = useState("");
  const [cout,         setCout]         = useState("");
  const [stock,        setStock]        = useState("");
  const [variante,     setVariante]     = useState("");
  const [titreShopify, setTitreShopify] = useState("");
  const [varianteMode, setVarianteMode] = useState("preset");
  const [fraisEmb,     setFraisEmb]     = useState("");

  const nomFinal      = nomMode   === "existant" ? nomSelect  : nomNouveau;
  const fournFinal    = fournMode === "existant" ? fournSel   : fournNouv;
  const varianteFinal = varianteMode === "aucune" ? null : variante || null;
  const existant      = nomMode === "existant"
    ? produits.find(p => p.nom === nomFinal && (p.variante || null) === varianteFinal)
    : null;

  const submit = async () => {
    if (!nomFinal) return;
    if (existant) {
      const ajout = +stock || 0;
      if (ajout > 0) {
        await supabase.from("produits").update({ stock_disponible: (existant.stock_disponible || 0) + ajout }).eq("id", existant.id);
        await supabase.from("stock_movements").insert([{ produit_id: existant.id, type: "entree", quantite: ajout, source: "ajout_manuel", prix_achat_unitaire: +cout || existant.cout_achat || 0 }]);
      }
      if (fournFinal) await supabase.from("produits").update({ fournisseur: fournFinal }).eq("id", existant.id);
      if (fraisEmb)   await supabase.from("produits").update({ frais_emballage_stockage: +fraisEmb }).eq("id", existant.id);
      if (cout)       await supabase.from("produits").update({ cout_achat: +cout }).eq("id", existant.id);
    } else {
      const { data: newProd } = await supabase.from("produits").insert([{
        nom: nomFinal, cout_achat: +cout || 0, fournisseur: fournFinal || null,
        stock_disponible: +stock || 0, stock_minimum: 5, decision: "OPTIMISER",
        variante: varianteFinal, titre_shopify: titreShopify || null,
        frais_emballage_stockage: +fraisEmb || 0,
      }]).select().single();
      if (newProd && +stock > 0) {
        await supabase.from("stock_movements").insert([{ produit_id: newProd.id, type: "entree", quantite: +stock, source: "ajout_manuel", prix_achat_unitaire: +cout || 0 }]);
      }
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
              : <input className="form-input" value={nomNouveau} onChange={e => setNomNouveau(e.target.value)} placeholder="Nom du produit..." />}
          </div>

          <div className="form-group">
            <label className="form-label">Variante / Couleur</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button className={`btn btn-sm ${varianteMode === "preset" ? "btn-primary" : "btn-secondary"}`} onClick={() => setVarianteMode("preset")}>Couleur</button>
              <button className={`btn btn-sm ${varianteMode === "custom" ? "btn-primary" : "btn-secondary"}`} onClick={() => setVarianteMode("custom")}>Autre</button>
              <button className={`btn btn-sm ${varianteMode === "aucune" ? "btn-primary" : "btn-secondary"}`} onClick={() => { setVarianteMode("aucune"); setVariante(""); }}>Aucune</button>
            </div>
            {varianteMode === "preset" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {COULEURS_PRESET.map(c => (
                  <button key={c} onClick={() => setVariante(c)} style={{ padding: "4px 12px", borderRadius: 20, border: variante === c ? "2px solid var(--blue)" : "1px solid var(--border)", background: variante === c ? "var(--blue-lt)" : "var(--bg)", color: variante === c ? "var(--blue)" : "var(--text)", cursor: "pointer", fontSize: 13, fontWeight: variante === c ? 600 : 400 }}>{c}</button>
                ))}
              </div>
            )}
            {varianteMode === "custom" && <input className="form-input" value={variante} onChange={e => setVariante(e.target.value)} placeholder="ex: XL, 500ml..." />}
          </div>

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
              : <input className="form-input" value={fournNouv} onChange={e => setFournNouv(e.target.value)} placeholder="Nom du fournisseur..." />}
          </div>

          {!existant && (
            <div className="form-group">
              <label className="form-label">Titre Shopify</label>
              <input className="form-input" value={titreShopify} onChange={e => setTitreShopify(e.target.value)} placeholder="Titre exact de la page produit Shopify..." />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">{existant ? "Prix achat unitaire ce lot (MAD)" : "Prix achat (MAD)"}</label>
            <input className="form-input" type="number" value={cout} onChange={e => setCout(e.target.value)} placeholder={existant ? String(existant.cout_achat || "") : "80"} />
            {existant && <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 4 }}>Dernier prix : {existant.cout_achat || "—"} MAD</div>}
          </div>

          <div className="form-group">
            <label className="form-label">{existant ? "Quantité à ajouter" : "Stock initial"}</label>
            <input className="form-input" type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="50" />
          </div>

          <div className="form-group">
            <label className="form-label">Frais emballage / stockage (MAD/livraison)</label>
            <input className="form-input" type="number" value={fraisEmb} onChange={e => setFraisEmb(e.target.value)} placeholder={existant ? String(existant.frais_emballage_stockage || "5") : "5"} />
            <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 4 }}>Coût fixe déduit par unité livrée</div>
          </div>

          {existant && (
            <div style={{ padding: "8px 12px", background: "var(--blue-lt)", borderRadius: 8, fontSize: 12, color: "var(--blue)" }}>
              ℹ️ Produit existant — stock actuel : {existant.stock_disponible} u
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

function ModalEdit({ produit, fourns, onClose }) {
  const [form, setForm] = useState({
    nom:                      produit.nom                      || "",
    cout_achat:               produit.cout_achat               || "",
    fournisseur:              produit.fournisseur              || "",
    variante:                 produit.variante                 || "",
    titre_shopify:            produit.titre_shopify            || "",
    frais_emballage_stockage: produit.frais_emballage_stockage || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [fournMode,    setFournMode]    = useState(fourns.includes(produit.fournisseur) ? "existant" : "nouveau");
  const [varianteMode, setVarianteMode] = useState(!produit.variante ? "aucune" : COULEURS_PRESET.includes(produit.variante) ? "preset" : "custom");

  const submit = async () => {
    await supabase.from("produits").update({
      nom:                      form.nom,
      cout_achat:               +form.cout_achat || 0,
      fournisseur:              form.fournisseur || null,
      variante:                 varianteMode === "aucune" ? null : form.variante || null,
      titre_shopify:            form.titre_shopify || null,
      frais_emballage_stockage: +form.frais_emballage_stockage || 0,
    }).eq("id", produit.id);
    onClose();
  };

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
          <div className="form-group">
            <label className="form-label">Variante / Couleur</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button className={`btn btn-sm ${varianteMode === "preset" ? "btn-primary" : "btn-secondary"}`} onClick={() => setVarianteMode("preset")}>Couleur</button>
              <button className={`btn btn-sm ${varianteMode === "custom" ? "btn-primary" : "btn-secondary"}`} onClick={() => setVarianteMode("custom")}>Autre</button>
              <button className={`btn btn-sm ${varianteMode === "aucune" ? "btn-primary" : "btn-secondary"}`} onClick={() => { setVarianteMode("aucune"); set("variante", ""); }}>Aucune</button>
            </div>
            {varianteMode === "preset" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {COULEURS_PRESET.map(c => (
                  <button key={c} onClick={() => set("variante", c)} style={{ padding: "4px 12px", borderRadius: 20, border: form.variante === c ? "2px solid var(--blue)" : "1px solid var(--border)", background: form.variante === c ? "var(--blue-lt)" : "var(--bg)", color: form.variante === c ? "var(--blue)" : "var(--text)", cursor: "pointer", fontSize: 13, fontWeight: form.variante === c ? 600 : 400 }}>{c}</button>
                ))}
              </div>
            )}
            {varianteMode === "custom" && <input className="form-input" value={form.variante} onChange={e => set("variante", e.target.value)} placeholder="ex: XL, 500ml..." />}
          </div>
          <div className="form-group">
            <label className="form-label">Prix achat (MAD)</label>
            <input className="form-input" type="number" value={form.cout_achat} onChange={e => set("cout_achat", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Frais emballage / stockage (MAD/livraison)</label>
            <input className="form-input" type="number" value={form.frais_emballage_stockage} onChange={e => set("frais_emballage_stockage", e.target.value)} placeholder="5" />
          </div>
          <div className="form-group">
            <label className="form-label">Titre Shopify</label>
            <input className="form-input" value={form.titre_shopify} onChange={e => set("titre_shopify", e.target.value)} />
          </div>
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
              : <input className="form-input" value={form.fournisseur} onChange={e => set("fournisseur", e.target.value)} placeholder="Nom du fournisseur..." />}
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

export default function Produits({ navigate }) {
  const [produits,      setProduits]      = useState([]);
  const [stockMvts,     setStockMvts]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showAjout,     setShowAjout]     = useState(false);
  const [editProduit,   setEditProduit]   = useState(null);
  const [stockRapide,   setStockRapide]   = useState(null);
  const [stockQte,      setStockQte]      = useState("");
  const [stockPrix,     setStockPrix]     = useState("");
  const [stockFraisEmb, setStockFraisEmb] = useState("");

  useEffect(() => {
    fetchAll();
    const ch = supabase.channel("produits-rt8")
      .on("postgres_changes", { event: "*", schema: "public", table: "produits" },        fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, fetchAll)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchAll() {
    const [{ data: p }, { data: mvts }] = await Promise.all([
      supabase.from("produits").select("*").order("nom"),
      supabase.from("stock_movements").select("produit_id, type, quantite, created_at, prix_achat_unitaire"),
    ]);
    if (p)    setProduits(p);
    if (mvts) setStockMvts(mvts);
    setLoading(false);
  }

  function getStockStats(produitId) {
    const mvts = stockMvts.filter(m => m.produit_id === produitId);
    const entrees = mvts.filter(m => m.type === "entree").reduce((s, m) => s + (parseInt(m.quantite) || 0), 0);
    const sorties = mvts.filter(m => m.type === "sortie").reduce((s, m) => s + (parseInt(m.quantite) || 0), 0);
    const disponible = entrees - sorties;
    return { entrees, sorties, disponible };
  }

  async function addStockRapide() {
    const qte = +stockQte;
    if (!stockRapide || qte <= 0) return;
    const prix     = +stockPrix || stockRapide.cout_achat || 0;
    const fraisEmb = +stockFraisEmb;
    await supabase.from("produits").update({
      stock_disponible: (stockRapide.stock_disponible || 0) + qte,
      cout_achat: prix,
      ...(fraisEmb > 0 ? { frais_emballage_stockage: fraisEmb } : {}),
    }).eq("id", stockRapide.id);
    await supabase.from("stock_movements").insert([{
      produit_id: stockRapide.id, type: "entree", quantite: qte,
      source: "ajout_manuel", prix_achat_unitaire: prix,
    }]);
    setStockRapide(null); setStockQte(""); setStockPrix(""); setStockFraisEmb("");
  }

const fourns = [...new Set(produits.map(p => p.fournisseur).filter(Boolean))].sort();
const nbRuptures  = produits.filter(p => (p.stock_disponible || 0) <= 0).length;
const coutProduit = id => produits.find(p => p.id === id)?.cout_achat || 0;
const valeurMvt   = m => (parseInt(m.quantite) || 0) * (m.prix_achat_unitaire || coutProduit(m.produit_id) || 0);
const totalEntrees       = stockMvts.filter(m => m.type === "entree").reduce((s, m) => s + (parseInt(m.quantite)||0), 0);
const totalSorties       = stockMvts.filter(m => m.type === "sortie").reduce((s, m) => s + (parseInt(m.quantite)||0), 0);
const valeurEntrees      = stockMvts.filter(m => m.type === "entree").reduce((s, m) => s + valeurMvt(m), 0);
const valeurSorties      = stockMvts.filter(m => m.type === "sortie").reduce((s, m) => s + valeurMvt(m), 0);
const stockTotal  = produits.reduce((s, p) => s + (p.stock_disponible || 0), 0);
const valeurImmo  = produits.reduce((s, p) => s + (p.stock_disponible || 0) * (p.cout_achat || 0), 0);
const tauxRotation = totalEntrees > 0 ? Math.round((totalSorties / totalEntrees) * 100) : 0;
return (
    <>
      {/* ── KPI héros ── */}
      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
  <div className="kpi-card kpi-success">
    <div className="kpi-value" style={{ color: "#16A34A" }}>+{totalEntrees} u</div>
    <div className="kpi-label">Entrées — {valeurEntrees.toLocaleString()} MAD</div>
  </div>
  <div className="kpi-card kpi-alert">
    <div className="kpi-value" style={{ color: "#DC2626" }}>−{totalSorties} u</div>
    <div className="kpi-label">Sorties — {valeurSorties.toLocaleString()} MAD</div>
  </div>
  <div className="kpi-card">
    <div className="kpi-value" style={{ color: stockTotal <= 0 ? "#DC2626" : "#16A34A" }}>{stockTotal} u</div>
    <div className="kpi-label">Disponible — {valeurImmo.toLocaleString()} MAD</div>
  </div>
  <div className="kpi-card">
    <div className="kpi-value">{tauxRotation}%</div>
    <div className="kpi-label">Rotation stock</div>
  </div>
  <div className={`kpi-card${nbRuptures > 0 ? " kpi-alert" : ""}`}>
    <div className="kpi-value">{nbRuptures}</div>
    <div className="kpi-label">Produits en rupture</div>
  </div>
</div>

      {/* ── Toolbar ── */}
      <div className="toolbar" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAjout(true)}>+ Produit</button>
      </div>

      {/* ── Tableau ── */}
      {loading ? (
        <div className="state-wrap"><div className="spinner" /> Chargement...</div>
      ) : produits.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏷️</div>
          <div className="empty-title">Aucun produit</div>
          <button className="btn btn-primary" onClick={() => setShowAjout(true)}>+ Nouveau produit</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Variante</th>
                <th>Prix achat</th>
                <th>Fournisseur</th>
<th>Entrées</th>
                <th>Sorties</th>
                <th>Disponible</th>
                <th>Valeur stock</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {produits.map(p => {
                const stats  = getStockStats(p.id);
                const statut = getStatut(p, stats.entrees, stats.sorties, stockMvts.filter(m => m.produit_id === p.id));
                const valeur = stats.disponible * (p.cout_achat || 0);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nom}</td>
                    <td>
                      {p.variante
                        ? <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, background: "var(--blue-lt)", color: "var(--blue)", fontSize: 12, fontWeight: 600 }}>{p.variante}</span>
                        : <span style={{ color: "var(--muted2)" }}>—</span>}
                    </td>
                    <td className="col-mono">{p.cout_achat ? `${p.cout_achat} MAD` : <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td className="col-muted">{p.fournisseur || <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: "#16A34A", fontFamily: "monospace" }}>
                        {stats.entrees > 0 ? `+${stats.entrees} u` : <span style={{ color: "var(--muted2)" }}>—</span>}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: stats.sorties > 0 ? "#DC2626" : "var(--muted2)", fontFamily: "monospace" }}>
                        {stats.sorties > 0 ? `−${stats.sorties} u` : "—"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: stats.disponible <= 0 ? "#DC2626" : stats.disponible <= (p.stock_minimum || 5) ? "#D97706" : "#16A34A", fontFamily: "monospace" }}>
                        {stats.disponible} u
                      </span>
                    </td>
                    <td className="col-mono" style={{ color: valeur > 0 ? "#0F172A" : "var(--muted2)" }}>
                      {valeur > 0 ? `${valeur.toLocaleString()} MAD` : "—"}
                    </td>

                    <td>
                      <span className="decision-badge" style={{ color: statut.color, background: statut.bg }}>
                        {statut.label}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setStockRapide(p)}>+ Stock</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditProduit(p)}>✏️</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => navigate("stock-historique", { produit_id: p.id, produit_nom: p.nom })}>📋</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modals ── */}
      {showAjout   && <ModalAjout produits={produits} onClose={() => { setShowAjout(false); fetchAll(); }} />}
      {editProduit && <ModalEdit  produit={editProduit} fourns={fourns} onClose={() => { setEditProduit(null); fetchAll(); }} />}

      {stockRapide && (
        <div className="modal-overlay" onClick={() => { setStockRapide(null); setStockQte(""); setStockPrix(""); setStockFraisEmb(""); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">+ Stock — {stockRapide.nom}{stockRapide.variante ? ` (${stockRapide.variante})` : ""}</span>
              <button className="btn-close" onClick={() => { setStockRapide(null); setStockQte(""); setStockPrix(""); setStockFraisEmb(""); }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ padding: "8px 12px", background: "var(--blue-lt)", borderRadius: 8, fontSize: 12, color: "var(--blue)", marginBottom: 12 }}>
                Stock actuel : <strong>{stockRapide.stock_disponible} u</strong> · Prix achat actuel : <strong>{stockRapide.cout_achat || "—"} MAD</strong>
              </div>
              <div className="form-group">
                <label className="form-label">Quantité à ajouter *</label>
                <input className="form-input" type="number" min="1" autoFocus value={stockQte} onChange={e => setStockQte(e.target.value)} placeholder="ex: 20" />
              </div>
              <div className="form-group">
                <label className="form-label">Prix achat unitaire ce lot (MAD) *</label>
                <input className="form-input" type="number" min="0" value={stockPrix} onChange={e => setStockPrix(e.target.value)} placeholder={String(stockRapide.cout_achat || "")} />
                <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 4 }}>Mettra à jour le prix achat du produit</div>
              </div>
              <div className="form-group">
                <label className="form-label">Frais emballage / stockage (MAD/livraison)</label>
                <input className="form-input" type="number" min="0" value={stockFraisEmb} onChange={e => setStockFraisEmb(e.target.value)} placeholder={String(stockRapide.frais_emballage_stockage || "5")} />
                <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 4 }}>Laisser vide pour conserver ({stockRapide.frais_emballage_stockage || 0} MAD)</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setStockRapide(null); setStockQte(""); setStockPrix(""); setStockFraisEmb(""); }}>Annuler</button>
              <button className="btn btn-primary" onClick={addStockRapide}>Ajouter</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
