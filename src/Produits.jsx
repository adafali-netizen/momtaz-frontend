import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function getDecision(p) {
  if (p.decision === "SCALE") return { label: "SCALE",     color: "#16A34A", bg: "#F0FDF4" };
  if (p.decision === "STOP")  return { label: "STOP",      color: "#DC2626", bg: "#FEF2F2" };
  return                             { label: "OPTIMISER", color: "#D97706", bg: "#FFFBEB" };
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

export default function Produits() {
  const [produits,    setProduits]    = useState([]);
  const [commandes7j, setCommandes7j] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showAjout,   setShowAjout]   = useState(false);
  const [editProduit, setEditProduit] = useState(null);

  useEffect(() => {
    fetchAll();
    const ch = supabase.channel("produits-rt4")
      .on("postgres_changes", { event: "*", schema: "public", table: "produits" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "commandes" }, fetchAll)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchAll() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from("produits").select("*").order("nom"),
      supabase.from("commandes")
        .select("produit, statut, created_at")
        .gte("created_at", since)
        .in("statut", ["Expédié", "En livraison", "Livré", "Demande de retour", "Retour en cours"])
    ]);
    if (p) setProduits(p);
    if (c) setCommandes7j(c);
    setLoading(false);
  }

  async function toggleDecision(id, current) {
    const seq  = ["OPTIMISER", "SCALE", "STOP"];
    const next = seq[(seq.indexOf(current) + 1) % seq.length];
    await supabase.from("produits").update({ decision: next }).eq("id", id);
  }

  // Matching ILIKE : même logique que le trigger Supabase
  function getExpéd(produit) {
    return commandes7j.filter(c =>
      c.produit && (
        produit.nom.toLowerCase().includes(c.produit.toLowerCase()) ||
        c.produit.toLowerCase().includes(produit.nom.toLowerCase())
      )
    ).length;
  }

  function getStats(p) {
    const expéd        = getExpéd(p);
    const moyParJour   = expéd / 7;
    const joursRest    = moyParJour > 0 ? p.stock_disponible / moyParJour : null;
    const qtéSugg      = moyParJour > 0 ? Math.max(0, Math.ceil(moyParJour * 7) - p.stock_disponible) : 0;
    const capital      = (p.stock_disponible || 0) * (p.cout_achat || 0);
    const rotation     = p.stock_disponible > 0 ? (expéd / p.stock_disponible) * 100 : 0;
    const score        = capital / (expéd + 1); // Score de blocage : élevé = dangereux
    return { expéd, moyParJour, joursRest, qtéSugg, capital, rotation, score };
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const stockTotal   = produits.reduce((s, p) => s + (p.stock_disponible || 0), 0);
  const valeurImmo   = produits.reduce((s, p) => s + (p.stock_disponible || 0) * (p.cout_achat || 0), 0);
  const nbAlertes    = produits.filter(p => (p.stock_disponible || 0) < (p.stock_minimum || 0)).length;
  const rotationMoy  = produits.length > 0
    ? produits.reduce((s, p) => s + getStats(p).rotation, 0) / produits.length
    : 0;

  // ── Section Réapprovisionnement ──────────────────────────────────────────────
  // Produits avec jours restants < 7, ou stock < minimum si aucune vente
  const réappro = produits
    .map(p => ({ ...p, stats: getStats(p) }))
    .filter(p => p.stats.joursRest !== null ? p.stats.joursRest < 7 : (p.stock_disponible || 0) < (p.stock_minimum || 0))
    .sort((a, b) => {
      const ja = a.stats.joursRest ?? 999;
      const jb = b.stats.joursRest ?? 999;
      return ja - jb;
    });

  function getBadgeJours(jours) {
    if (jours === null) return { label: "Pas de ventes",    color: "#6B7280", bg: "#F9FAFB" };
    if (jours < 2)      return { label: "🔴 Urgent (<2j)", color: "#DC2626", bg: "#FEF2F2" };
    if (jours < 4)      return { label: "🟡 Bientôt (<4j)",color: "#D97706", bg: "#FFFBEB" };
    return { label: `~${jours.toFixed(1)}j restants`,       color: "#16A34A", bg: "#F0FDF4" };
  }

  // ── Section Produits à liquider ──────────────────────────────────────────────
  // Filtre : capital > 200 MAD ET rotation < 30%
  const àLiquider = produits
    .map(p => ({ ...p, stats: getStats(p) }))
    .filter(p => p.stats.capital > 200 && p.stats.rotation < 30)
    .sort((a, b) => b.stats.score - a.stats.score);

  function getLiquidBadge({ capital, rotation }) {
    const capitalEleve = capital > 500;
    if (capitalEleve && rotation < 20) return { label: "LIQUIDER",     color: "#DC2626", bg: "#FEF2F2" };
    if (capitalEleve)                  return { label: "Surveiller",    color: "#D97706", bg: "#FFFBEB" };
    return                                    { label: "Faible risque", color: "#6B7280", bg: "#F9FAFB" };
  }

  const fourns = [...new Set(produits.map(p => p.fournisseur).filter(Boolean))].sort();

  // ── Render ───────────────────────────────────────────────────────────────────
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
          <div className="kpi-label">% Rotation moy. (7j)</div>
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
        <>
          {/* ── Table catalogue ── */}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Prix achat</th>
                  <th>Fournisseur</th>
                  <th>Stock</th>
                  <th>Rotation 7j</th>
                  <th>Décision</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {produits.map(p => {
                  const d     = getDecision(p);
                  const stats = getStats(p);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.nom}</td>
                      <td className="col-mono">{p.cout_achat ? `${p.cout_achat} MAD` : <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                      <td className="col-muted">{p.fournisseur || <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                      <td>
                        <span className="col-mono" style={{ fontWeight: 700, color: p.stock_disponible <= 0 ? "var(--red)" : p.stock_disponible < p.stock_minimum ? "var(--orange)" : "var(--green)" }}>
                          {p.stock_disponible} u
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: "JetBrains Mono", fontSize: 13, color: stats.rotation >= 30 ? "var(--green)" : stats.rotation >= 10 ? "var(--orange)" : "var(--red)" }}>
                          {stats.rotation.toFixed(0)}%
                        </span>
                        <span style={{ fontSize: 11, color: "var(--muted2)", marginLeft: 4 }}>({stats.expéd} exp.)</span>
                      </td>
                      <td>
                        <span className="decision-badge" onClick={() => toggleDecision(p.id, p.decision)} style={{ color: d.color, background: d.bg, cursor: "pointer" }}>
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
              💡 ✏️ pour modifier · Cliquer sur Décision pour changer
            </div>
          </div>

          {/* ── Section Réapprovisionnement ── */}
          {réappro.length > 0 && (
            <div style={{ padding: "20px 24px 0" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--text)" }}>
                ⚡ Réapprovisionnement
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Stock actuel</th>
                      <th>Moy. expéd./jour</th>
                      <th>Jours restants</th>
                      <th>Qté suggérée (7j)</th>
                      <th>Urgence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {réappro.map(p => {
                      const badge = getBadgeJours(p.stats.joursRest);
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.nom}</td>
                          <td className="col-mono">{p.stock_disponible} u</td>
                          <td className="col-mono">{p.stats.moyParJour > 0 ? p.stats.moyParJour.toFixed(1) : <span style={{ color: "var(--muted2)" }}>—</span>}</td>
                          <td className="col-mono" style={{ fontWeight: 700, color: p.stats.joursRest !== null && p.stats.joursRest < 2 ? "var(--red)" : p.stats.joursRest !== null && p.stats.joursRest < 4 ? "var(--orange)" : "var(--muted2)" }}>
                            {p.stats.joursRest !== null ? `${p.stats.joursRest.toFixed(1)}j` : "—"}
                          </td>
                          <td>
                            {p.stats.qtéSugg > 0
                              ? <span style={{ fontFamily: "JetBrains Mono", fontWeight: 700, color: "var(--blue)" }}>+{p.stats.qtéSugg} u</span>
                              : <span style={{ color: "var(--muted2)" }}>—</span>}
                          </td>
                          <td>
                            <span className="decision-badge" style={{ color: badge.color, background: badge.bg }}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Section Produits à liquider ── */}
          {àLiquider.length > 0 && (
            <div style={{ padding: "20px 24px 24px" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--text)" }}>
                🧊 Produits à liquider
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Capital mobilisé</th>
                      <th>Rotation 7j</th>
                      <th>Score blocage</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {àLiquider.map(p => {
                      const badge = getLiquidBadge(p.stats);
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.nom}</td>
                          <td className="col-mono" style={{ fontWeight: 700, color: "var(--red)" }}>
                            {p.stats.capital.toLocaleString()} MAD
                          </td>
                          <td className="col-mono" style={{ color: p.stats.rotation < 10 ? "var(--red)" : "var(--orange)" }}>
                            {p.stats.rotation.toFixed(0)}%
                          </td>
                          <td className="col-mono" style={{ color: "var(--muted2)" }}>
                            {p.stats.score.toFixed(0)}
                          </td>
                          <td>
                            <span className="decision-badge" style={{ color: badge.color, background: badge.bg }}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted2)", borderTop: "1px solid var(--border)" }}>
                  💡 Score blocage = capital mobilisé / (expéditions 7j + 1) — plus élevé = priorité de liquidation
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showAjout   && <ModalAjout produits={produits} onClose={() => setShowAjout(false)} />}
      {editProduit && <ModalEdit  produit={editProduit} fourns={fourns} onClose={() => setEditProduit(null)} />}
    </>
  );
}
