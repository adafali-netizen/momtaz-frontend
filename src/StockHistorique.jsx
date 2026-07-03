import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const TYPE_LABELS = {
  entree: { label: "Entrée",  color: "#16A34A", bg: "#F0FDF4" },
  sortie: { label: "Sortie",  color: "#DC2626", bg: "#FEF2F2" },
  retour: { label: "Retour",  color: "#2563EB", bg: "#EFF6FF" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function StockHistorique({ params = {}, navigate }) {
  const [mouvements, setMouvements] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState(params.produit_nom || "");
  const [typeFiltre, setTypeFiltre] = useState("tous");

  useEffect(() => {
    fetchMouvements();
    const ch = supabase.channel("movements-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, fetchMouvements)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchMouvements() {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("*, produits(nom, cout_achat)")
      .order("created_at", { ascending: false });
    if (!error) setMouvements(data || []);
    setLoading(false);
  }

  // "searched" = base filtrée uniquement par la recherche (produit/source) — sert aux KPIs
  const searched = mouvements.filter(m => {
    const nom = m.produits?.nom || "";
    return search === "" ||
      nom.toLowerCase().includes(search.toLowerCase()) ||
      (m.source || "").toLowerCase().includes(search.toLowerCase());
  });
  // "filtered" = searched + filtre par type — sert à la table
  const filtered = searched.filter(m => typeFiltre === "tous" || m.type === typeFiltre);

  const count = t => t === "tous" ? searched.length : searched.filter(m => m.type === t).length;

  const valeurMvt = m => (parseInt(m.quantite) || 0) * (m.prix_achat_unitaire || m.produits?.cout_achat || 0);
  const entreesQte    = searched.filter(m => m.type === "entree").reduce((s, m) => s + (parseInt(m.quantite) || 0), 0);
  const sortiesQte    = searched.filter(m => m.type === "sortie").reduce((s, m) => s + (parseInt(m.quantite) || 0), 0);
  const retoursQte    = searched.filter(m => m.type === "retour").reduce((s, m) => s + (parseInt(m.quantite) || 0), 0);
  const entreesValeur = searched.filter(m => m.type === "entree").reduce((s, m) => s + valeurMvt(m), 0);
  const sortiesValeur = searched.filter(m => m.type === "sortie").reduce((s, m) => s + valeurMvt(m), 0);
  const retoursValeur = searched.filter(m => m.type === "retour").reduce((s, m) => s + valeurMvt(m), 0);
  const dispoQte    = entreesQte + retoursQte - sortiesQte;
  const dispoValeur = entreesValeur + retoursValeur - sortiesValeur;
  const tauxRotation = entreesQte > 0 ? Math.round((sortiesQte / entreesQte) * 100) : 0;

  // À approvisionner : par produit, besoin de couverture 48h (vélocité moyenne sorties/jour × 2) vs disponible réel
  const produitIds = [...new Set(searched.map(m => m.produit_id))];
  const aApprovisionner = produitIds.reduce((total, pid) => {
    const mvtsProduit  = searched.filter(m => m.produit_id === pid);
    const sortiesP     = mvtsProduit.filter(m => m.type === "sortie");
    if (sortiesP.length === 0) return total;
    const jours        = new Set(sortiesP.map(m => new Date(m.created_at).toDateString())).size;
    const totalSortiesP = sortiesP.reduce((s, m) => s + (parseInt(m.quantite) || 0), 0);
    const moyParJour   = totalSortiesP / Math.max(jours, 1);
    const dispoP = mvtsProduit.reduce((s, m) => s + (parseInt(m.quantite) || 0) * (m.type === "sortie" ? -1 : 1), 0);
    const besoin48h = moyParJour * 2;
    return total + Math.max(0, Math.round(besoin48h - dispoP));
  }, 0);

  return (
    <>
      {/* ── Header avec retour ── */}
      <div style={{ padding: "16px 24px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => navigate("produits")}
          style={{ fontSize: 13 }}
        >
          ← Produits
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          Historique des mouvements de stock
          {params.produit_nom && (
            <span style={{ fontWeight: 400, color: "var(--muted2)", marginLeft: 8 }}>
              — {params.produit_nom}
            </span>
          )}
        </span>
      </div>

      {/* ── KPIs rapides ── */}
      <div className="kpi-row" style={{ padding: "12px 24px 8px" }}>
        <div className="kpi-card kpi-success">
          <div className="kpi-value">+{entreesQte} u</div>
          <div className="kpi-label">Entrées — {entreesValeur.toLocaleString()} MAD</div>
        </div>
        <div className="kpi-card kpi-alert">
          <div className="kpi-value">−{sortiesQte} u</div>
          <div className="kpi-label">Sorties — {sortiesValeur.toLocaleString()} MAD</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: dispoQte <= 0 ? "#DC2626" : "#16A34A" }}>{dispoQte} u</div>
          <div className="kpi-label">Disponible — {dispoValeur.toLocaleString()} MAD</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{tauxRotation}%</div>
          <div className="kpi-label">Rotation stock</div>
        </div>
        <div className={`kpi-card${aApprovisionner > 0 ? " kpi-alert" : ""}`}>
          <div className="kpi-value">{aApprovisionner} u</div>
          <div className="kpi-label">À approvisionner</div>
        </div>
      </div>

      {/* ── Toolbar : search + filtres type ── */}
      <div className="toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <input
            className="form-input"
            style={{ maxWidth: 280, margin: 0 }}
            placeholder="🔍  Rechercher produit ou source..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="btn btn-secondary btn-sm" onClick={() => setSearch("")}>✕</button>
          )}
        </div>
        <div className="filter-tabs">
          {["tous", "entree", "sortie", "retour"].map(t => (
            <button
              key={t}
              className={`filter-tab${typeFiltre === t ? " active" : ""}`}
              onClick={() => setTypeFiltre(t)}
            >
              {t === "tous" ? "Tous" : TYPE_LABELS[t]?.label} <span className="filter-count">{count(t)}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="state-wrap"><div className="spinner" /> Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <div className="empty-title">Aucun mouvement</div>
          <div className="empty-sub">
            {search ? `Aucun résultat pour "${search}"` : "Aucun mouvement de stock enregistré"}
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Produit</th>
                <th>Type</th>
                <th>Quantité</th>
                <th>Source / Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const t = TYPE_LABELS[m.type] || { label: m.type, color: "#6B7280", bg: "#F9FAFB" };
                return (
                  <tr key={m.id}>
                    <td style={{ fontSize: 12, color: "var(--muted2)", whiteSpace: "nowrap" }}>
                      {fmtDate(m.created_at)}
                    </td>
                    <td style={{ fontWeight: 600 }}>{m.produits?.nom || "—"}</td>
                    <td>
                      <span className="decision-badge" style={{ color: t.color, background: t.bg }}>
                        {t.label}
                      </span>
                    </td>
                    <td>
                      <span className="col-mono" style={{ fontWeight: 700, color: m.type === "entree" ? "var(--green)" : m.type === "retour" ? "var(--blue)" : "var(--red)" }}>
                        {m.type === "entree" || m.type === "retour" ? "+" : "-"}{m.quantite} u
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted2)" }}>
                      {m.source || m.commande_id
                        ? <span>{m.source || ""}{m.commande_id ? ` · CMD ${m.commande_id.slice(0, 8)}` : ""}</span>
                        : <span style={{ color: "var(--muted2)" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted2)", borderTop: "1px solid var(--border)" }}>
            {filtered.length} mouvement{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
          </div>
        </div>
      )}
    </>
  );
}
