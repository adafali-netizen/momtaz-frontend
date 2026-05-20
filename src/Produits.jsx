function ModalEdit({ produit, fourns, onClose }) {
  const [form, setForm] = useState({
    nom:         produit.nom || "",
    cout_achat:  produit.cout_achat || "",
    fournisseur: produit.fournisseur || "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [fournMode, setFournMode] = useState(fourns.includes(produit.fournisseur) ? "existant" : "nouveau");

  const submit = async () => {
    await supabase.from("produits").update({
      nom:        form.nom,
      cout_achat: +form.cout_achat || 0,
      fournisseur:form.fournisseur || null,
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
            <label className="form-label">Prix achat (MAD)</label>
            <input className="form-input" type="number" value={form.cout_achat} onChange={e => set("cout_achat", e.target.value)} placeholder="80" />
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
              ? <select className="form-select" value={form.fournisseur} onChange={e => set("fournisseur", e.target.value)}>
                  <option value="">— Aucun —</option>
                  {fourns.map(f => <option key={f}>{f}</option>)}
                </select>
              : <input className="form-input" value={form.fournisseur} onChange={e => set("fournisseur", e.target.value)} placeholder="Nom du fournisseur..." />
            }
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
