import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function getStatut(p, entrees, sorties) {
  const dispo = entrees - sorties;
  if (dispo <= 0) return { label: "RUPTURE", color: "#DC2626", bg: "#FEF2F2" };
  if (entrees > 0 && sorties / entrees > 0.8) return { label: "LIQUIDER", color: "#DC2626", bg: "#FEF2F2" };
  if (dispo <= (p.stock_minimum || 5)) return { label: "SURVEILLER", color: "#D97706", bg: "#FFFBEB" };
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
