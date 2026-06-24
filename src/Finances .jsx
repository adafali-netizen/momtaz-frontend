import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const CATEGORIES = ["Logistique", "Ads", "Stock", "OPS", "Remboursement", "Recette", "Autre"];

function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReleveBancaire({ role }) {
  const [mouvements, setMouvements] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    intitule: "", categorie: "Autre", montant: "", type: "debit",
  });

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function fetchMouvements() {
    const { data } = await supabase
      .from("releve_bancaire")
      .select("*")
      .order("date", { ascending: false })
      .limit(200);
    if (data) setMouvements(data);
    setLoading(false);
  }

  useEffect(() => { fetchMouvements(); }, []);

  async function handleSave() {
    if (!form.intitule || !form.montant || !form.date) return;
    setSaving(true);
    const montantSigne = form.type === "debit"
      ? -Math.abs(+form.montant)
      : Math.abs(+form.montant);
    await supabase.from("releve_bancaire").insert([{
      date: form.date,
      mois: new Date(form.date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      intitule: form.intitule,
      categorie: form.categorie,
      montant: montantSigne,
      [form.type === "debit" ? "debit" : "credit"]: Math.abs(+form.montant),
    }]);
    setForm({ date: new Date().toISOString().split("T")[0], intitule: "", categorie: "Autre", montant: "", type: "debit" });
    setShowForm(false);
    setSaving(false);
    fetchMouvements();
  }

  // Calculs synthèse
  const recettes  = mouvements.filter(m => parseFloat(m.montant) > 0).reduce((s, m) => s + parseFloat(m.montant), 0);
  const depenses  = mouvements.filter(m => parseFloat(m.montant) < 0).reduce((s, m) => s + Math.abs(parseFloat(m.montant)), 0);
  const solde     = recettes - depenses;
  const soldeClr  = solde >= 0 ? "#16A34A" : "#DC2626";

  // Ventilation par catégorie (dépenses uniquement)
  const catMap = {};
  mouvements.filter(m => parseFloat(m.montant) < 0).forEach(m => {
    const cat = m.categorie || "Autre";
    catMap[cat] = (catMap[cat] || 0) + Math.abs(parseFloat(m.montant));
  });
  const catColors = { Logistique: "#7C3AED", Ads: "#2563EB", Stock: "#D97706", OPS: "#0891B2", Remboursement: "#16A34A", Recette: "#16A34A", Autre: "#94A3B8" };

  return (
    <div style={{ fontFamily: "var(--font-sans, system-ui)", padding: "0 0 48px" }}>

      {/* Topbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0 20px", borderBottom: "0.5px solid #e2e8f0", marginBottom: 24 }}>
        <div>
<div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Finances</div>
<div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Relevé bancaire · Journal des mouvements</div>
        </div>
        <button onClick={() => setShowForm(s => !s)} style={{ padding: "8px 16px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          + Mouvement
        </button>
      </div>

      {/* Formulaire saisie */}
      {showForm && (
        <div style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Nouveau mouvement</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Date *</div>
              <input type="date" value={form.date} onChange={e => setF("date", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Libellé *</div>
              <input type="text" value={form.intitule} placeholder="Description du mouvement" onChange={e => setF("intitule", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Catégorie</div>
              <select value={form.categorie} onChange={e => setF("categorie", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box" }}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Montant (MAD) *</div>
              <div style={{ display: "flex", gap: 6 }}>
                <select value={form.type} onChange={e => setF("type", e.target.value)}
                  style={{ padding: "8px 8px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", background: form.type === "debit" ? "#FEF2F2" : "#F0FDF4", color: form.type === "debit" ? "#DC2626" : "#16A34A", fontWeight: 700, cursor: "pointer" }}>
                  <option value="debit">−</option>
                  <option value="credit">+</option>
                </select>
                <input type="number" value={form.montant} placeholder="0" onChange={e => setF("montant", e.target.value)}
                  style={{ flex: 1, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <button onClick={handleSave} disabled={saving || !form.intitule || !form.montant}
              style={{ padding: "9px 18px", background: saving || !form.intitule || !form.montant ? "#e2e8f0" : "#2563EB", color: saving || !form.intitule || !form.montant ? "#94a3b8" : "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              {saving ? "…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {/* Synthèse */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
        {/* Solde net */}
        <div style={{ background: "#fff", border: `1.5px solid ${solde >= 0 ? "#97C459" : "#F09595"}`, borderRadius: 12, padding: "18px 22px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".07em", color: soldeClr, marginBottom: 4 }}>Solde net</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: soldeClr, lineHeight: 1 }}>
            {solde >= 0 ? "+" : ""}{Math.round(solde).toLocaleString("fr")} MAD
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>tous mouvements enregistrés</div>
        </div>
        {[
          { label: "Recettes", val: recettes, color: "#16A34A" },
          { label: "Dépenses", val: depenses, color: "#DC2626" },
          { label: "Mouvements", val: mouvements.length, color: "#1e293b", isCount: true },
        ].map(k => (
          <div key={k.label} style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: "18px 22px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".07em", color: "#94a3b8", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>
              {k.isCount ? k.val : `${Math.round(k.val).toLocaleString("fr")} MAD`}
            </div>
          </div>
        ))}
      </div>

      {/* Ventilation dépenses */}
      {Object.keys(catMap).length > 0 && (
        <div style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 12 }}>Ventilation des dépenses</div>
          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 1, marginBottom: 12 }}>
            {Object.entries(catMap).map(([cat, val]) => (
              <div key={cat} title={`${cat} : ${Math.round(val)} MAD`}
                style={{ flex: val / depenses * 100, background: catColors[cat] || "#94a3b8", minWidth: 2 }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(catMap).map(([cat, val]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: catColors[cat] || "#94a3b8", display: "inline-block" }} />
                <span>{cat}</span>
                <span style={{ fontWeight: 600, color: "#1e293b" }}>{Math.round(val).toLocaleString("fr")} MAD · {Math.round(val / depenses * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Journal */}
      <div style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Journal des mouvements</span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{mouvements.length} entrées</span>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Chargement…</div>
        ) : mouvements.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Aucun mouvement enregistré. <button onClick={() => setShowForm(true)} style={{ color: "#2563EB", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Ajouter le premier →</button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Date", "Libellé", "Catégorie", "Produit", "Commande", "Montant"].map(h => (
                  <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "#94a3b8", textAlign: h === "Montant" ? "right" : "left", borderBottom: "0.5px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mouvements.map((m, i) => {
                const val = parseFloat(m.montant) || (m.credit ? +m.credit : -(+m.debit || 0));
                const isIn = val > 0;
                return (
                  <tr key={m.id || i} style={{ borderBottom: "0.5px solid #f1f5f9" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{fmt(m.date)}</td>
                    <td style={{ padding: "9px 14px", fontSize: 13, color: "#1e293b", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.intitule || m.libelle || m.observation || "—"}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: catColors[m.categorie] || "#94a3b8", background: (catColors[m.categorie] || "#94a3b8") + "15", padding: "2px 7px", borderRadius: 4 }}>
                        {m.categorie || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: "#64748b" }}>{m.produit || "—"}</td>
                    <td style={{ padding: "9px 14px", fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{m.commande_id ? m.commande_id.slice(0, 8) + "…" : "—"}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isIn ? "#16A34A" : "#DC2626" }}>
                        {isIn ? "+" : ""}{Math.round(Math.abs(val)).toLocaleString("fr")} MAD
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
