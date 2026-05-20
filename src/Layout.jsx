import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function getStatut(p, stats) {
  if (stats.joursRest !== null && stats.joursRest < 2)   return { label: "RÉAPPRO URGENT",  color: "#DC2626", bg: "#FEF2F2" };
  if (stats.joursRest !== null && stats.joursRest < 4)   return { label: "RÉAPPRO BIENTÔT", color: "#D97706", bg: "#FFFBEB" };
  if (stats.capital > 500 && stats.rotation < 20)        return { label: "LIQUIDER",        color: "#DC2626", bg: "#FEF2F2" };
  if (stats.capital > 200 && stats.rotation < 30)        return { label: "SURVEILLER",      color: "#D97706", bg: "#FFFBEB" };
  if ((p.stock_disponible || 0) <= 0)                    return { label: "RUPTURE",         color: "#DC2626", bg: "#FEF2F2" };
  return                                                        { label: "OK",              color: "#16A34A", bg: "#F0FDF4" };
}

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
      await supabase.from("produits").insert([{ nom: nomFinal, cout_achat: +cout || 0, fournisseur: fournFinal || null, stock_disponible: +stock || 0, stock_minimum: 5, decision: "OPTIMISER" }]);
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
              <label className="form-label">Prix achat (MAD)</label>
              <input className="form-input" type="number" value={cout} onChange={e => setCout(e.target.value)} placeholder="80" />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{existant ? "Quantité à ajouter" : "Stock initial"}</label>
            <input className="form-input" type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="50" />
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
  const [form, setForm] = useState({ nom: produit.nom || "", cout_achat: produit.cout_achat || "", fournisseur: produit.fournisseur || "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [fournMode, setFournMode] = useState(fourns.includes(produit.fournisseur) ? "existant" : "nouveau");
  const submit = async () => {
    await supabase.from("produits").update({ nom: form.nom, cout_achat: +form.cout_achat || 0, fournisseur: form.fournisseur || null }).eq("id", produit.id);
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
  const [produits,     setProduits]     = useState([]);
  const [commandes,    setCommandes]    = useState([]);
  const [lastEntrees,  setLastEntrees]  = useState({}); // { produit_id: created_at }
  const [loading,      setLoading]      = useState(true);
  const [showAjout,    setShowAjout]    = useState(false);
  const [editProduit,  setEditProduit]  = useState(null);
  // Seuil min inline edit
  const [editSeuil,    setEditSeuil]    = useState(null);
  const [seuilVal,     setSeuilVal]     = useState("");
  // Stock rapide par ligne
  const [stockRapide,  setStockRapide]  = useState(null);
  const [stockQte,     setStockQte]     = useState("");

  useEffect(() => {
    fetchAll();
    const ch = supabase.channel("produits-rt6")
      .on("postgres_changes", { event: "*", schema: "public", table: "produits" },        fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "commandes" },       fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, fetchAll)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchAll() {
    // 1. Produits
    const { data: p } = await supabase.from("produits").select("*").order("nom");
    if (!p) { setLoading(false); return; }
    setProduits(p);

    // 2. Dernière entrée stock par produit
    const { data: mvts } = await supabase
      .from("stock_movements")
      .select("produit_id, created_at")
      .eq("type", "entree")
      .order("created_at", { ascending: false });

    // Garder seulement la plus récente par produit_id
    const entrees = {};
    if (mvts) {
      mvts.forEach(m => {
        if (!entrees[m.produit_id]) entrees[m.produit_id] = m.created_at;
      });
    }
    setLastEntrees(entrees);

    // 3. Commandes depuis la plus ancienne date de dernier réappro
    //    (ou depuis 90j max si aucun mouvement)
    const dates = Object.values(entrees);
    const oldest = dates.length > 0
      ? dates.reduce((min, d) => d < min ? d : min, dates[0])
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: c } = await supabase
      .from("commandes")
      .select("produit, statut, created_at")
      .gte("created_at", oldest)
      .in("statut", ["Expédié", "En livraison", "Livré", "Demande de retour", "Retour en cours"]);

    if (c) setCommandes(c);
    setLoading(false);
  }

  // Matching ILIKE identique au trigger Supabase
  function matchProduit(nomProduit, nomCommande) {
    if (!nomCommande) return false;
    return (
      nomProduit.toLowerCase().includes(nomCommande.toLowerCase()) ||
      nomCommande.toLowerCase().includes(nomProduit.toLowerCase())
    );
  }

  function getStats(p) {
    const dateEntree = lastEntrees[p.id] || null;
    const stock      = p.stock_disponible || 0;
    const capital    = stock * (p.cout_achat || 0);

    if (!dateEntree) {
      // Pas de mouvement enregistré → rotation inconnue
      return { expéd: 0, rotation: 0, joursRest: null, qtéSugg: 0, capital, joursDepuis: null, dateEntree: null };
    }

    const dateRef    = new Date(dateEntree);
    const now        = new Date();
    const joursDepuis = Math.max(1, Math.round((now - dateRef) / (1000 * 60 * 60 * 24)));

    // Expéditions depuis le dernier réappro
    const expéd = commandes.filter(c =>
      new Date(c.created_at) >= dateRef && matchProduit(p.nom, c.produit)
    ).length;

    // Stock initial = stock actuel + expéditions depuis réappro
    const stockInitial = stock + expéd;

    // % Rotation = expéditions / stock initial × 100
    const rotation = stockInitial > 0 ? (expéd / stockInitial) * 100 : 0;

    // Rythme réel depuis le réappro
    const moyParJour = expéd / joursDepuis;
    const joursRest  = moyParJour > 0 ? stock / moyParJour : null;
    const qtéSugg    = moyParJour > 0 ? Math.max(0, Math.ceil(moyParJour * 7) - stock) : 0;

    return { expéd, rotation, joursRest, qtéSugg, capital, joursDepuis, dateEntree };
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const stockTotal  = produits.reduce((s, p) => s + (p.stock_disponible || 0), 0);
  const valeurImmo  = produits.reduce((s, p) => s + (p.stock_disponible || 0) * (p.cout_achat || 0), 0);
  const nbAlertes   = produits.filter(p => (p.stock_disponible || 0) < (p.stock_minimum || 0)).length;
  const rotations   = produits.map(p => getStats(p).rotation).filter(r => r > 0);
  const rotationMoy = rotations.length > 0 ? rotations.reduce((s, r) => s + r, 0) / rotations.length : 0;

  // Tri par priorité d'action
  const ORDER = ["RÉAPPRO URGENT", "RUPTURE", "RÉAPPRO BIENTÔT", "LIQUIDER", "SURVEILLER", "OK"];
  const produitsTriés = [...produits].sort((a, b) => {
    const sa = getStatut(a, getStats(a)).label;
    const sb = getStatut(b, getStats(b)).label;
    return ORDER.indexOf(sa) - ORDER.indexOf(sb);
  });

  const fourns = [...new Set(produits.map(p => p.fournisseur).filter(Boolean))].sort();

  async function saveSeuil(id) {
    await supabase.from("produits").update({ stock_minimum: +seuilVal }).eq("id", id);
    setEditSeuil(null);
  }

  async function addStockRapide() {
    const qte = +stockQte;
    if (!stockRapide || qte <= 0) return;
    await supabase.from("produits").update({ stock_disponible: stockRapide.stock_disponible + qte }).eq("id", stockRapide.id);
    await supabase.from("stock_movements").insert([{ produit_id: stockRapide.id, type: "entree", quantite: qte, source: "ajout_manuel" }]);
    setStockRapide(null);
    setStockQte("");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  }

  return (
    <>
      {/* ── KPI Row ── */}
      <div className="kpi-row" style={{ padding: "16px 24px 12px" }}>
        <div className="kpi-card">
          <div className="kpi-value">{stockTotal}</div>
          <div className="kpi-label">Stock total (u)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{valeurImmo.toLocaleString()} MAD</div>
          <div className="kpi-label">Valeur immobilisée</div>
        </div>
        <div className={`kpi-card${nbAlertes > 0 ? " kpi-alert" : ""}`}>
          <div className="kpi-value">{nbAlertes}</div>
          <div className="kpi-label">Produits en alerte</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{rotationMoy.toFixed(0)}%</div>
          <div className="kpi-label">% Rotation moy.</div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar" style={{ justifyContent: "flex-end" }}>
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
                <th>Fournisseur</th>
                <th>Stock</th>
                <th>Seuil min.</th>
                <th>Capital mobilisé</th>
                <th>Dernier réappro</th>
                <th>Rotation</th>
                <th>Jours restants</th>
                <th>Qté réappro</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {produitsTriés.map(p => {
                const stats  = getStats(p);
                const statut = getStatut(p, stats);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nom}</td>
                    <td className="col-mono">
                      {p.cout_achat ? `${p.cout_achat} MAD` : <span style={{ color: "var(--muted2)" }}>—</span>}
                    </td>
                    <td className="col-muted">
                      {p.fournisseur || <span style={{ color: "var(--muted2)" }}>—</span>}
                    </td>
                    <td>
                      <span className="col-mono" style={{ fontWeight: 700, color: (p.stock_disponible || 0) <= 0 ? "var(--red)" : (p.stock_disponible || 0) < (p.stock_minimum || 0) ? "var(--orange)" : "var(--green)" }}>
                        {p.stock_disponible} u
                      </span>
                    </td>
                    <td>
                      {editSeuil === p.id ? (
                        <input className="inline-edit" value={seuilVal}
                          onChange={e => setSeuilVal(e.target.value)}
                          onBlur={() => saveSeuil(p.id)}
                          onKeyDown={e => e.key === "Enter" && saveSeuil(p.id)}
                          autoFocus style={{ width: 52 }} />
                      ) : (
                        <span className="col-mono col-muted" style={{ cursor: "text" }}
                          title="Double-cliquer pour modifier"
                          onDoubleClick={() => { setEditSeuil(p.id); setSeuilVal(String(p.stock_minimum || 5)); }}>
                          {p.stock_minimum || 5} u
                        </span>
                      )}
                    </td>
                    <td className="col-mono" style={{ color: stats.capital > 500 ? "var(--red)" : stats.capital > 200 ? "var(--orange)" : "var(--text)" }}>
                      {stats.capital > 0 ? `${stats.capital.toLocaleString()} MAD` : <span style={{ color: "var(--muted2)" }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted2)" }}>
                      {stats.dateEntree
                        ? <span title={`il y a ${stats.joursDepuis}j`}>{fmtDate(stats.dateEntree)}</span>
                        : <span style={{ color: "var(--red)", fontSize: 11 }}>non enregistré</span>}
                    </td>
                    <td>
                      {stats.dateEntree ? (
                        <>
                          <span style={{ fontFamily: "JetBrains Mono", fontSize: 13, color: stats.rotation >= 50 ? "var(--green)" : stats.rotation >= 20 ? "var(--orange)" : "var(--red)" }}>
                            {stats.rotation.toFixed(0)}%
                          </span>
                          <span style={{ fontSize: 11, color: "var(--muted2)", marginLeft: 4 }}>({stats.expéd} exp. / {stats.joursDepuis}j)</span>
                        </>
                      ) : <span style={{ color: "var(--muted2)" }}>—</span>}
                    </td>
                    <td className="col-mono" style={{ fontWeight: 600, color: stats.joursRest === null ? "var(--muted2)" : stats.joursRest < 2 ? "var(--red)" : stats.joursRest < 4 ? "var(--orange)" : "var(--green)" }}>
                      {stats.joursRest !== null ? `${stats.joursRest.toFixed(1)}j` : "—"}
                    </td>
                    <td>
                      {stats.qtéSugg > 0
                        ? <span style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: "var(--blue)" }}>+{stats.qtéSugg} u</span>
                        : <span style={{ color: "var(--muted2)" }}>—</span>}
                    </td>
                    <td>
                      <span className="decision-badge" style={{ color: statut.color, background: statut.bg }}>
                        {statut.label}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setStockRapide(p)} title="Ajouter stock">+ Stock</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditProduit(p)} title="Modifier">✏️</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => navigate("stock-historique", { produit_id: p.id, produit_nom: p.nom })} title="Historique mouvements">📋</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted2)", borderTop: "1px solid var(--border)" }}>
            💡 Double-cliquer sur Seuil min. pour modifier · Rotation = expéditions depuis dernier réappro ÷ stock initial
          </div>
        </div>
      )}

      {showAjout   && <ModalAjout produits={produits} onClose={() => setShowAjout(false)} />}
      {editProduit && <ModalEdit  produit={editProduit} fourns={fourns} onClose={() => setEditProduit(null)} />}

      {/* ── Modal Stock Rapide ── */}
      {stockRapide && (
        <div className="modal-overlay" onClick={() => setStockRapide(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">+ Stock — {stockRapide.nom}</span>
              <button className="btn-close" onClick={() => setStockRapide(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ padding: "8px 12px", background: "var(--blue-lt)", borderRadius: 8, fontSize: 12, color: "var(--blue)", marginBottom: 12 }}>
                Stock actuel : <strong>{stockRapide.stock_disponible} u</strong>
              </div>
              <div className="form-group">
                <label className="form-label">Quantité à ajouter *</label>
                <input className="form-input" type="number" min="1" autoFocus
                  value={stockQte} onChange={e => setStockQte(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addStockRapide()}
                  placeholder="ex: 20" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setStockRapide(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={addStockRapide}>Ajouter</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
