import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

// ─── Palette ──────────────────────────────────────────────────────────────────
const CLR = {
  bg:          "#F4F5F7",
  card:        "#FFFFFF",
  border:      "#E4E7EC",
  borderRow:   "#F1F5F9",
  text:        "#0D1117",
  textSecond:  "#4B5563",
  textMuted:   "#94A3B8",
  green:       "#16A34A",
  greenBg:     "#F0FDF4",
  greenBorder: "#BBF7D0",
  red:         "#DC2626",
  redBg:       "#FEF2F2",
  redBorder:   "#FECACA",
  amber:       "#D97706",
  amberBg:     "#FFFBEB",
  amberBorder: "#FDE68A",
  indigo:      "#534AB7",
  indigoBg:    "#EEF0FF",
  indigoBorder:"#AFA9EC",
};
const SHADOW = "0 1px 3px rgba(0,0,0,0.06)";
const RADIUS = 10;

// ─── Référentiel Type → Catégorie → Libellés ─────────────────────────────────
const TYPE_META = {
  DEPENSE_ADS: {
    label: "Dépense Ads",
    sens: "debit",
    categories: {
      "Facebook Ads":  ["Budget campagne", "Boost publication", "Réappro compte pub"],
      "TikTok Ads":    ["Budget campagne TikTok", "Boost TikTok"],
      "Google Ads":    ["Budget Google", "Display campagne"],
      "Autre":         ["Dépense ads autre"],
    },
  },
  CREATION_CONTENU: {
    label: "Créatives",
    sens: "debit",
    categories: {
      "Vidéo":    ["Vidéo ads produit", "Tournage UGC", "Motion design"],
      "Photo":    ["Shooting produit", "Retouche photo"],
      "Montage":  ["Montage vidéo", "Sous-titrage"],
      "Autre":    ["Création contenu autre"],
    },
  },
  FRAIS_LIVRAISON: {
    label: "Livraison",
    sens: "debit",
    categories: {
      "Sendit":   ["Frais expédition Sendit", "Retour Sendit"],
      "Amana":    ["Frais expédition Amana", "Retour Amana"],
      "Autre":    ["Frais livraison autre"],
    },
  },
  FRAIS_CONFIRMATION: {
    label: "Frais de confirmation",
    sens: "debit",
    categories: {
      "Paiement conseillère": ["Salaire conseillère — période", "Prime confirmation"],
      "Autre":                ["Frais confirmation autre"],
    },
  },
  ACHAT_STOCK: {
    label: "Stock",
    sens: "debit",
    categories: {
      "Fournisseur local": ["Achat stock produit", "Réappro fournisseur local"],
      "Import":            ["Import fournisseur", "Frais douane", "Frais transport import"],
      "Autre":             ["Achat stock autre"],
    },
  },
  DEPENSE_OPS: {
    label: "Ops",
    sens: "debit",
    categories: {
      "Emballage":   ["Achat emballage", "Scotch / cartons"],
      "Bureautique": ["Fournitures bureau", "Abonnement logiciel"],
      "Télécom":     ["Forfait téléphone", "Internet"],
      "Autre":       ["Dépense ops autre"],
    },
  },
  ENCAISSEMENT_TRANSPORTEUR: {
    label: "Encaissement transporteur",
    sens: "credit",
    categories: {
      "Sendit":  ["Versement Sendit", "Règlement Sendit"],
      "Amana":   ["Versement Amana", "Règlement Amana"],
      "Autre":   ["Versement transporteur"],
    },
  },
  APPORT_CAPITAL: {
    label: "Apport capital",
    sens: "credit",
    categories: {
      "Apport personnel": ["Apport personnel", "Injection capital"],
      "Prêt":             ["Prêt personnel", "Avance associé"],
      "Autre":            ["Apport autre"],
    },
  },
  AJUSTEMENT: {
    label: "Ajustement",
    sens: "both",
    categories: {
      "Correction":    ["Correction erreur saisie", "Régularisation"],
      "Écart caisse":  ["Écart caisse", "Différence rapprochement"],
      "Autre":         ["Ajustement autre"],
    },
  },
};

const TYPES_ORDRE = [
  "DEPENSE_ADS","CREATION_CONTENU","FRAIS_LIVRAISON","FRAIS_CONFIRMATION",
  "ACHAT_STOCK","DEPENSE_OPS","ENCAISSEMENT_TRANSPORTEUR","APPORT_CAPITAL","AJUSTEMENT",
];

const STATUT_RAPPROCHEMENT_META = {
  a_verifier: { label: "À vérifier", bg: CLR.amberBg,  color: CLR.amber,  border: CLR.amberBorder },
  rapproche:  { label: "Rapproché",  bg: CLR.greenBg,  color: CLR.green,  border: CLR.greenBorder },
  litige:     { label: "Litige",     bg: CLR.redBg,    color: CLR.red,    border: CLR.redBorder },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMAD(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(Math.abs(n)).toLocaleString("fr")} MAD`;
}
function getMontant(m) {
  if (m.credit && +m.credit > 0) return +m.credit;
  if (m.debit  && +m.debit  > 0) return -Math.abs(+m.debit);
  return parseFloat(m.montant) || 0;
}

// ─── Composants UI ────────────────────────────────────────────────────────────
function Badge({ label, bg, color, border }) {
  return (
    <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:4,
                   fontSize:11, fontWeight:600, background:bg, color, border:`1px solid ${border}` }}>
      {label}
    </span>
  );
}

function KpiCard({ label, value, color, sub, border }) {
  return (
    <div style={{ background: CLR.card, border: `1.5px solid ${border || CLR.border}`,
                  borderRadius: RADIUS, padding:"18px 22px", boxShadow: SHADOW }}>
      <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase",
                    letterSpacing:".07em", color: color || CLR.textMuted, marginBottom:6 }}>
        {label}
      </div>
      <div style={{ fontSize:28, fontWeight:800, color: color || CLR.text,
                    lineHeight:1, fontVariantNumeric:"tabular-nums",
                    fontFamily:"'JetBrains Mono','Fira Code','Courier New',monospace" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize:11, color: CLR.textMuted, marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding:"8px 18px", border:"none", borderRadius:7, fontSize:13, fontWeight:600,
      cursor:"pointer", transition:"all .15s",
      background: active ? CLR.indigo : "transparent",
      color: active ? "#fff" : CLR.textSecond,
    }}>
      {children}
    </button>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize:13, fontWeight:700, color: CLR.text, marginBottom:14 }}>
      {children}
    </div>
  );
}

function inputSt(extra = {}) {
  return {
    width:"100%", padding:"8px 10px", border:`1px solid ${CLR.border}`,
    borderRadius:8, fontSize:13, outline:"none", background:"#fff",
    fontFamily:"inherit", boxSizing:"border-box", color: CLR.text, ...extra,
  };
}

// ─── Formulaire nouveau mouvement ─────────────────────────────────────────────
function FormulaireNouveauMouvement({ conseilleres, produits, onSaved, onCancel }) {
  const [form, setForm] = useState({
    type: "DEPENSE_ADS",
    categorie: "",
    libelle: "",
    observation: "",
    montant: "",
    sens: "debit",
    date: new Date().toISOString().split("T")[0],
    conseillere: "",
    produit_id: "",
  });
  const [saving, setSaving] = useState(false);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const meta      = TYPE_META[form.type] || {};
  const categories = Object.keys(meta.categories || {});
  const libelles   = meta.categories?.[form.categorie] || [];

  // Quand le type change : reset catégorie + libellé + sens
  function handleTypeChange(type) {
    const m = TYPE_META[type];
    const firstCat = Object.keys(m.categories || {})[0] || "";
    const firstLib = m.categories?.[firstCat]?.[0] || "";
    const sens = m.sens === "credit" ? "credit" : "debit";
    setForm(f => ({ ...f, type, categorie: firstCat, libelle: firstLib, sens }));
  }

  // Quand la catégorie change : reset libellé
  function handleCatChange(cat) {
    const firstLib = meta.categories?.[cat]?.[0] || "";
    setForm(f => ({ ...f, categorie: cat, libelle: firstLib }));
  }

  // Init au montage
  useEffect(() => { handleTypeChange(form.type); }, []);

  async function handleSave() {
    if (!form.libelle || !form.montant || !form.date) return;
    setSaving(true);
    const montant = parseFloat(form.montant);
    const isCredit = form.sens === "credit" || TYPE_META[form.type]?.sens === "credit";
    const row = {
      date:       form.date,
      mois:       new Date(form.date).toLocaleDateString("fr-FR", { month:"long", year:"numeric" }),
      type:       form.type,
      categorie:  form.categorie,
      intitule:   form.libelle,
      observation:form.observation || null,
      debit:      isCredit ? 0 : montant,
      credit:     isCredit ? montant : 0,
      statut_rapprochement: "a_verifier",
      ...(form.produit_id ? { produit_id: form.produit_id } : {}),
    };
    await supabase.from("releve_bancaire").insert([row]);
    setSaving(false);
    onSaved();
  }

  const isDebit  = TYPE_META[form.type]?.sens === "debit";
  const isCredit = TYPE_META[form.type]?.sens === "credit";
  const isBoth   = TYPE_META[form.type]?.sens === "both";

  return (
    <div style={{ background: CLR.card, border: `1px solid ${CLR.border}`,
                  borderRadius: RADIUS, padding:"22px 24px", marginBottom:20, boxShadow: SHADOW }}>
      <SectionTitle>Nouveau mouvement</SectionTitle>

      {/* Ligne 1 : Date + Type */}
      <div style={{ display:"grid", gridTemplateColumns:"160px 1fr", gap:12, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Date *</div>
          <input type="date" value={form.date} onChange={e => setF("date", e.target.value)} style={inputSt()} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Type *</div>
          <select value={form.type} onChange={e => handleTypeChange(e.target.value)} style={inputSt()}>
            {TYPES_ORDRE.map(t => (
              <option key={t} value={t}>{TYPE_META[t].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Ligne 2 : Catégorie + Libellé */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Catégorie</div>
          <select value={form.categorie} onChange={e => handleCatChange(e.target.value)} style={inputSt()}>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Libellé *</div>
          <div style={{ display:"flex", gap:6 }}>
            <select value={form.libelle} onChange={e => setF("libelle", e.target.value)}
              style={{ ...inputSt(), flex:1 }}>
              {libelles.map(l => <option key={l}>{l}</option>)}
              <option value="__custom__">Autre (saisie libre)</option>
            </select>
          </div>
          {(form.libelle === "__custom__" || !libelles.includes(form.libelle)) && (
            <input type="text" placeholder="Libellé personnalisé" value={form.libelle === "__custom__" ? "" : form.libelle}
              onChange={e => setF("libelle", e.target.value)}
              style={{ ...inputSt(), marginTop:6 }} />
          )}
        </div>
      </div>

      {/* Ligne 3 : Produit (si ACHAT_STOCK) + Conseillère (si FRAIS_CONFIRMATION) */}
      {form.type === "ACHAT_STOCK" && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Produit lié</div>
          <select value={form.produit_id} onChange={e => setF("produit_id", e.target.value)} style={inputSt()}>
            <option value="">— Sélectionner un produit —</option>
            {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </div>
      )}
      {form.type === "FRAIS_CONFIRMATION" && conseilleres.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Conseillère</div>
          <select value={form.conseillere} onChange={e => setF("conseillere", e.target.value)} style={inputSt()}>
            <option value="">— Sélectionner —</option>
            {conseilleres.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* Ligne 4 : Montant + Sens (si AJUSTEMENT) */}
      <div style={{ display:"grid", gridTemplateColumns: isBoth ? "120px 1fr" : "1fr", gap:12, marginBottom:12 }}>
        {isBoth && (
          <div>
            <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Sens</div>
            <select value={form.sens} onChange={e => setF("sens", e.target.value)} style={inputSt()}>
              <option value="debit">− Dépense</option>
              <option value="credit">+ Recette</option>
            </select>
          </div>
        )}
        <div>
          <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>
            Montant (MAD) *
            {isDebit  && <span style={{ color: CLR.red,   marginLeft:6, fontSize:10 }}>Dépense</span>}
            {isCredit && <span style={{ color: CLR.green, marginLeft:6, fontSize:10 }}>Recette</span>}
          </div>
          <input type="number" value={form.montant} placeholder="0" min="0"
            onChange={e => setF("montant", e.target.value)}
            style={inputSt({ borderColor: isCredit ? CLR.greenBorder : CLR.redBorder })} />
        </div>
      </div>

      {/* Ligne 5 : Observation */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Observation</div>
        <input type="text" value={form.observation} placeholder="Note libre, référence, contexte…"
          onChange={e => setF("observation", e.target.value)} style={inputSt()} />
      </div>

      {/* Actions */}
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={handleSave} disabled={saving || !form.libelle || !form.montant}
          style={{ padding:"9px 20px", background: (!form.libelle || !form.montant) ? CLR.border : CLR.indigo,
                   color: (!form.libelle || !form.montant) ? CLR.textMuted : "#fff",
                   border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button onClick={onCancel} style={{ padding:"9px 16px", background:"transparent",
          border:`1px solid ${CLR.border}`, borderRadius:8, fontSize:13, color: CLR.textSecond, cursor:"pointer" }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ─── Onglet Journal ───────────────────────────────────────────────────────────
function OngletJournal({ mouvements, loading, onRefresh, conseilleres, produits }) {
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("tous");
  const [filterRapprochement, setFilterRapprochement] = useState("tous");

  const recettes = mouvements.filter(m => getMontant(m) > 0).reduce((s, m) => s + getMontant(m), 0);
  const depenses = mouvements.filter(m => getMontant(m) < 0).reduce((s, m) => s + Math.abs(getMontant(m)), 0);
  const solde    = recettes - depenses;

  // Ventilation par catégorie type
  const typeMap = {};
  mouvements.filter(m => getMontant(m) < 0).forEach(m => {
    const t = m.type || "DEPENSE_OPS";
    typeMap[t] = (typeMap[t] || 0) + Math.abs(getMontant(m));
  });

  const mouvementsFiltres = mouvements.filter(m => {
    const matchType = filterType === "tous" || m.type === filterType;
    const matchRappr = filterRapprochement === "tous" || m.statut_rapprochement === filterRapprochement;
    return matchType && matchRappr;
  });

  async function toggleRapprochement(m) {
    const next = m.statut_rapprochement === "a_verifier" ? "rapproche"
               : m.statut_rapprochement === "rapproche"  ? "litige"
               : "a_verifier";
    await supabase.from("releve_bancaire").update({ statut_rapprochement: next }).eq("id", m.id);
    onRefresh();
  }

  async function handleDelete(id) {
    if (!window.confirm("Supprimer ce mouvement ?")) return;
    await supabase.from("releve_bancaire").delete().eq("id", id);
    onRefresh();
  }

  return (
    <div>
      {/* KPI */}
      <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr 1fr 1fr", gap:14, marginBottom:20 }}>
        <KpiCard label="Solde net" value={`${solde >= 0 ? "+" : ""}${Math.round(solde).toLocaleString("fr")} MAD`}
          color={solde >= 0 ? CLR.green : CLR.red}
          border={solde >= 0 ? CLR.greenBorder : CLR.redBorder}
          sub="tous mouvements enregistrés" />
        <KpiCard label="Recettes" value={fmtMAD(recettes)} color={CLR.green} border={CLR.greenBorder} />
        <KpiCard label="Dépenses" value={fmtMAD(depenses)} color={CLR.red}   border={CLR.redBorder} />
        <KpiCard label="Mouvements" value={mouvements.length} color={CLR.text}
          sub={`${mouvements.filter(m => m.statut_rapprochement === "a_verifier").length} à vérifier`} />
      </div>

      {/* Ventilation */}
      {Object.keys(typeMap).length > 0 && (
        <div style={{ background: CLR.card, border:`1px solid ${CLR.border}`, borderRadius: RADIUS,
                      padding:"16px 20px", marginBottom:20, boxShadow: SHADOW }}>
          <div style={{ fontSize:12, fontWeight:700, color: CLR.text, marginBottom:10 }}>Ventilation des dépenses par type</div>
          <div style={{ display:"flex", height:5, borderRadius:3, overflow:"hidden", gap:1, marginBottom:10 }}>
            {Object.entries(typeMap).map(([t, val], i) => (
              <div key={t} style={{ flex: val / (depenses || 1) * 100,
                background: ["#534AB7","#DC2626","#D97706","#16A34A","#0891B2","#7C3AED","#94A3B8","#1877f2","#E11D48"][i % 9],
                minWidth:2 }} />
            ))}
          </div>
          <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
            {Object.entries(typeMap).map(([t, val], i) => (
              <div key={t} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color: CLR.textSecond }}>
                <span style={{ width:7, height:7, borderRadius:2, display:"inline-block",
                  background: ["#534AB7","#DC2626","#D97706","#16A34A","#0891B2","#7C3AED","#94A3B8","#1877f2","#E11D48"][i % 9] }} />
                {TYPE_META[t]?.label || t}
                <strong style={{ color: CLR.text }}>{fmtMAD(val)} · {Math.round(val / (depenses || 1) * 100)}%</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bouton + Filtres */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ padding:"6px 10px", border:`1px solid ${CLR.border}`, borderRadius:7, fontSize:12,
                     color: CLR.textSecond, background:"#fff", outline:"none" }}>
            <option value="tous">Tous les types</option>
            {TYPES_ORDRE.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
          </select>
          <select value={filterRapprochement} onChange={e => setFilterRapprochement(e.target.value)}
            style={{ padding:"6px 10px", border:`1px solid ${CLR.border}`, borderRadius:7, fontSize:12,
                     color: CLR.textSecond, background:"#fff", outline:"none" }}>
            <option value="tous">Tout statut</option>
            <option value="a_verifier">À vérifier</option>
            <option value="rapproche">Rapproché</option>
            <option value="litige">Litige</option>
          </select>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          style={{ padding:"8px 16px", background: CLR.indigo, color:"#fff", border:"none",
                   borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          + Mouvement
        </button>
      </div>

      {showForm && (
        <FormulaireNouveauMouvement
          conseilleres={conseilleres}
          produits={produits}
          onSaved={() => { setShowForm(false); onRefresh(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Journal table */}
      <div style={{ background: CLR.card, border:`1px solid ${CLR.border}`, borderRadius: RADIUS,
                    overflow:"hidden", boxShadow: SHADOW }}>
        <div style={{ padding:"12px 20px", borderBottom:`1px solid ${CLR.border}`,
                      background:"#F9FAFB", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:13, fontWeight:700, color: CLR.text }}>Journal des mouvements</span>
          <span style={{ fontSize:11, color: CLR.textMuted, background: CLR.card, border:`1px solid ${CLR.border}`,
                         borderRadius:5, padding:"2px 8px" }}>{mouvementsFiltres.length} entrées</span>
        </div>
        {loading ? (
          <div style={{ padding:32, textAlign:"center", color: CLR.textMuted, fontSize:13 }}>Chargement…</div>
        ) : mouvementsFiltres.length === 0 ? (
          <div style={{ padding:"36px 20px", textAlign:"center", background:"#F9FAFB",
                        border:`1px dashed ${CLR.border}`, margin:16, borderRadius:8 }}>
            <div style={{ fontSize:22, opacity:.35, marginBottom:8 }}>◎</div>
            <div style={{ fontSize:13, color: CLR.textMuted, fontWeight:500 }}>Aucun mouvement enregistré</div>
            <div style={{ fontSize:11, color:"#CBD5E1", marginTop:4 }}>
              Clique sur "+ Mouvement" pour ajouter le premier
            </div>
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#F9FAFB" }}>
                  {["Date","Type","Catégorie","Libellé","Observation","Rapprochement","Montant",""].map(h => (
                    <th key={h} style={{ padding:"8px 12px", fontSize:10, fontWeight:600,
                      textTransform:"uppercase", letterSpacing:".08em", color: CLR.textMuted,
                      borderBottom:`1px solid ${CLR.border}`, textAlign: h === "Montant" ? "right" : "left",
                      whiteSpace:"nowrap", background:"#F9FAFB" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mouvementsFiltres.map((m, i) => {
                  const val   = getMontant(m);
                  const isIn  = val > 0;
                  const rmeta = STATUT_RAPPROCHEMENT_META[m.statut_rapprochement] || STATUT_RAPPROCHEMENT_META.a_verifier;
                  return (
                    <tr key={m.id || i} style={{ borderBottom:`1px solid ${CLR.borderRow}`,
                      background: i % 2 === 0 ? CLR.card : "#F9FAFB" }}>
                      <td style={{ padding:"9px 12px", fontSize:12, color: CLR.textMuted, whiteSpace:"nowrap" }}>
                        {fmt(m.date)}
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ fontSize:11, fontWeight:500, color: CLR.indigo,
                          background: CLR.indigoBg, padding:"2px 7px", borderRadius:4 }}>
                          {TYPE_META[m.type]?.label || m.type || "—"}
                        </span>
                      </td>
                      <td style={{ padding:"9px 12px", fontSize:12, color: CLR.textSecond }}>
                        {m.categorie || "—"}
                      </td>
                      <td style={{ padding:"9px 12px", fontSize:13, color: CLR.text,
                        maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {m.intitule || m.libelle || "—"}
                      </td>
                      <td style={{ padding:"9px 12px", fontSize:11, color: CLR.textMuted,
                        maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {m.observation || "—"}
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <button onClick={() => toggleRapprochement(m)}
                          title="Cliquer pour changer le statut"
                          style={{ background:"none", border:"none", cursor:"pointer", padding:0 }}>
                          <Badge {...rmeta} />
                        </button>
                      </td>
                      <td style={{ padding:"9px 12px", textAlign:"right",
                        fontFamily:"'JetBrains Mono','Courier New',monospace" }}>
                        <span style={{ fontSize:13, fontWeight:700, color: isIn ? CLR.green : CLR.red }}>
                          {isIn ? "+" : "−"}{fmtMAD(Math.abs(val))}
                        </span>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <button onClick={() => handleDelete(m.id)}
                          style={{ background:"none", border:"none", cursor:"pointer",
                                   color: CLR.textMuted, fontSize:14, padding:"0 4px" }}
                          title="Supprimer">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Onglet Règlements transporteur ──────────────────────────────────────────
function OngletReglements({ onRefresh }) {
  const [reglements, setReglements]       = useState([]);
  const [commandesLivrees, setCommandesLivrees] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [saving, setSaving]               = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    transporteur: "",
    montant_recu: "",
    notes: "",
  });
  const [selectedCmds, setSelectedCmds]   = useState([]);
  const [expandedId, setExpandedId]       = useState(null);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function fetchData() {
    setLoading(true);
    const [{ data: regl }, { data: cmds }] = await Promise.all([
      supabase.from("reglements_transporteur").select("*").order("date", { ascending: false }),
      supabase.from("commandes")
        .select("id, produit, prix, transporteur, created_at, statut")
        .eq("statut", "Livrée")
        .order("created_at", { ascending: false }),
    ]);
    setReglements(regl || []);
    setCommandesLivrees(cmds || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const montantAttendu = selectedCmds.reduce((s, id) => {
    const c = commandesLivrees.find(c => c.id === id);
    return s + (parseFloat(c?.prix) || 0);
  }, 0);

  const ecart = form.montant_recu ? parseFloat(form.montant_recu) - montantAttendu : null;

  async function handleValider() {
    if (!form.transporteur || !form.montant_recu || selectedCmds.length === 0) return;
    setSaving(true);

    // 1. Créer le règlement
    const { data: regl, error } = await supabase.from("reglements_transporteur").insert([{
      date:             form.date,
      transporteur:     form.transporteur,
      montant_recu:     parseFloat(form.montant_recu),
      nb_commandes:     selectedCmds.length,
      montant_attendu:  montantAttendu,
      statut:           "valide",
      notes:            form.notes || null,
      statut_rapprochement: "a_verifier",
    }]).select().single();

    if (error || !regl) { setSaving(false); return; }

    // 2. Créer les liaisons reglement_commandes
    const lignes = selectedCmds.map(cid => {
      const c = commandesLivrees.find(c => c.id === cid);
      return { reglement_id: regl.id, commande_id: cid, montant_commande: parseFloat(c?.prix) || 0 };
    });
    await supabase.from("reglement_commandes").insert(lignes);

    // 3. Passer les commandes Livrée → Facturée
    await supabase.from("commandes").update({ statut: "Facturée" }).in("id", selectedCmds);

    // 4. Créer la ligne dans releve_bancaire
    await supabase.from("releve_bancaire").insert([{
      date:        form.date,
      mois:        new Date(form.date).toLocaleDateString("fr-FR", { month:"long", year:"numeric" }),
      type:        "ENCAISSEMENT_TRANSPORTEUR",
      categorie:   form.transporteur,
      intitule:    `Règlement ${form.transporteur} — ${selectedCmds.length} commandes`,
      credit:      parseFloat(form.montant_recu),
      debit:       0,
      reglement_id: regl.id,
      statut_rapprochement: "a_verifier",
      observation: form.notes || null,
    }]);

    setForm({ date: new Date().toISOString().split("T")[0], transporteur:"", montant_recu:"", notes:"" });
    setSelectedCmds([]);
    setShowForm(false);
    setSaving(false);
    fetchData();
    onRefresh();
  }

  const transporteurs = [...new Set(commandesLivrees.map(c => c.transporteur).filter(Boolean))];

  const cmdsFiltrees = form.transporteur
    ? commandesLivrees.filter(c => c.transporteur === form.transporteur)
    : commandesLivrees;

  function toggleCmd(id) {
    setSelectedCmds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  return (
    <div>
      {/* KPI règlements */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:20 }}>
        <KpiCard
          label="Commandes livrées non réglées"
          value={commandesLivrees.length}
          color={commandesLivrees.length > 0 ? CLR.amber : CLR.green}
          border={commandesLivrees.length > 0 ? CLR.amberBorder : CLR.greenBorder}
          sub="statut Livrée · encaissement attendu"
        />
        <KpiCard
          label="Montant attendu"
          value={fmtMAD(commandesLivrees.reduce((s, c) => s + (parseFloat(c.prix) || 0), 0))}
          color={CLR.amber}
          border={CLR.amberBorder}
          sub="proxy · prix commandes livrées"
        />
        <KpiCard
          label="Règlements validés"
          value={reglements.filter(r => r.statut === "valide").length}
          color={CLR.indigo}
          border={CLR.indigoBorder}
          sub="tous transporteurs"
        />
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
        <button onClick={() => setShowForm(s => !s)} disabled={commandesLivrees.length === 0}
          style={{ padding:"8px 16px",
            background: commandesLivrees.length === 0 ? CLR.border : CLR.indigo,
            color: commandesLivrees.length === 0 ? CLR.textMuted : "#fff",
            border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          + Nouveau règlement
        </button>
      </div>

      {/* Formulaire règlement */}
      {showForm && (
        <div style={{ background: CLR.card, border:`1.5px solid ${CLR.indigoBorder}`,
                      borderRadius: RADIUS, padding:"22px 24px", marginBottom:20, boxShadow: SHADOW }}>
          <SectionTitle>Nouveau règlement transporteur</SectionTitle>

          <div style={{ display:"grid", gridTemplateColumns:"160px 1fr 1fr", gap:12, marginBottom:16 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Date *</div>
              <input type="date" value={form.date} onChange={e => setF("date", e.target.value)} style={inputSt()} />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Transporteur *</div>
              <select value={form.transporteur} onChange={e => { setF("transporteur", e.target.value); setSelectedCmds([]); }} style={inputSt()}>
                <option value="">— Sélectionner —</option>
                {transporteurs.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Montant reçu (MAD) *</div>
              <input type="number" value={form.montant_recu} placeholder="0" min="0"
                onChange={e => setF("montant_recu", e.target.value)}
                style={inputSt({ borderColor: CLR.greenBorder })} />
            </div>
          </div>

          {/* Sélection commandes */}
          {form.transporteur && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:8 }}>
                Commandes livrées — {form.transporteur} ({cmdsFiltrees.length} disponibles)
              </div>
              <div style={{ border:`1px solid ${CLR.border}`, borderRadius:8, overflow:"hidden", maxHeight:260, overflowY:"auto" }}>
                {cmdsFiltrees.length === 0 ? (
                  <div style={{ padding:16, fontSize:13, color: CLR.textMuted, textAlign:"center" }}>
                    Aucune commande livrée pour ce transporteur
                  </div>
                ) : (
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr style={{ background:"#F9FAFB" }}>
                        <th style={{ width:36, padding:"7px 12px", borderBottom:`1px solid ${CLR.border}` }}>
                          <input type="checkbox"
                            checked={cmdsFiltrees.every(c => selectedCmds.includes(c.id))}
                            onChange={e => setSelectedCmds(e.target.checked ? cmdsFiltrees.map(c => c.id) : [])} />
                        </th>
                        {["Produit","Prix","Date"].map(h => (
                          <th key={h} style={{ padding:"7px 12px", fontSize:10, fontWeight:600,
                            textTransform:"uppercase", letterSpacing:".06em", color: CLR.textMuted,
                            textAlign:"left", borderBottom:`1px solid ${CLR.border}`, background:"#F9FAFB" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cmdsFiltrees.map((c, i) => (
                        <tr key={c.id} style={{ background: selectedCmds.includes(c.id) ? CLR.indigoBg : i % 2 === 0 ? CLR.card : "#F9FAFB",
                          borderBottom:`1px solid ${CLR.borderRow}`, cursor:"pointer" }}
                          onClick={() => toggleCmd(c.id)}>
                          <td style={{ padding:"7px 12px" }}>
                            <input type="checkbox" checked={selectedCmds.includes(c.id)}
                              onChange={() => toggleCmd(c.id)} onClick={e => e.stopPropagation()} />
                          </td>
                          <td style={{ padding:"7px 12px", fontSize:13, color: CLR.text }}>{c.produit || "—"}</td>
                          <td style={{ padding:"7px 12px", fontSize:13, fontWeight:600, color: CLR.green,
                            fontFamily:"'JetBrains Mono','Courier New',monospace" }}>
                            {fmtMAD(c.prix)}
                          </td>
                          <td style={{ padding:"7px 12px", fontSize:12, color: CLR.textMuted }}>
                            {fmt(c.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Récap rapprochement */}
          {selectedCmds.length > 0 && form.montant_recu && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16,
                          padding:"14px 16px", background:"#F9FAFB", borderRadius:8, border:`1px solid ${CLR.border}` }}>
              <div>
                <div style={{ fontSize:11, color: CLR.textMuted, marginBottom:2 }}>Commandes sélectionnées</div>
                <div style={{ fontSize:20, fontWeight:700, color: CLR.text }}>{selectedCmds.length}</div>
              </div>
              <div>
                <div style={{ fontSize:11, color: CLR.textMuted, marginBottom:2 }}>Montant attendu</div>
                <div style={{ fontSize:20, fontWeight:700, color: CLR.amber }}>{fmtMAD(montantAttendu)}</div>
              </div>
              <div>
                <div style={{ fontSize:11, color: CLR.textMuted, marginBottom:2 }}>Écart (frais transporteur)</div>
                <div style={{ fontSize:20, fontWeight:700, color: ecart >= 0 ? CLR.green : CLR.red }}>
                  {ecart >= 0 ? "+" : "−"}{fmtMAD(Math.abs(ecart))}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, color: CLR.textMuted, marginBottom:4 }}>Notes</div>
            <input type="text" value={form.notes} placeholder="Référence virement, commentaire…"
              onChange={e => setF("notes", e.target.value)} style={inputSt()} />
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={handleValider}
              disabled={saving || !form.transporteur || !form.montant_recu || selectedCmds.length === 0}
              style={{ padding:"9px 20px",
                background: (!form.transporteur || !form.montant_recu || selectedCmds.length === 0) ? CLR.border : CLR.green,
                color: (!form.transporteur || !form.montant_recu || selectedCmds.length === 0) ? CLR.textMuted : "#fff",
                border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {saving ? "Validation…" : `Valider — ${selectedCmds.length} commandes → Facturée`}
            </button>
            <button onClick={() => { setShowForm(false); setSelectedCmds([]); }}
              style={{ padding:"9px 16px", background:"transparent", border:`1px solid ${CLR.border}`,
                       borderRadius:8, fontSize:13, color: CLR.textSecond, cursor:"pointer" }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Liste règlements */}
      <div style={{ background: CLR.card, border:`1px solid ${CLR.border}`, borderRadius: RADIUS,
                    overflow:"hidden", boxShadow: SHADOW }}>
        <div style={{ padding:"12px 20px", borderBottom:`1px solid ${CLR.border}`, background:"#F9FAFB",
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:13, fontWeight:700, color: CLR.text }}>Historique règlements</span>
          <span style={{ fontSize:11, color: CLR.textMuted }}>{reglements.length} règlements</span>
        </div>
        {loading ? (
          <div style={{ padding:32, textAlign:"center", color: CLR.textMuted, fontSize:13 }}>Chargement…</div>
        ) : reglements.length === 0 ? (
          <div style={{ padding:"36px 20px", textAlign:"center" }}>
            <div style={{ fontSize:22, opacity:.35, marginBottom:8 }}>◎</div>
            <div style={{ fontSize:13, color: CLR.textMuted, fontWeight:500 }}>Aucun règlement enregistré</div>
            <div style={{ fontSize:11, color:"#CBD5E1", marginTop:4 }}>Les règlements apparaissent ici après validation</div>
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"#F9FAFB" }}>
                {["Date","Transporteur","Reçu","Attendu","Écart","Cmds","Statut","Rapprochement"].map(h => (
                  <th key={h} style={{ padding:"8px 12px", fontSize:10, fontWeight:600,
                    textTransform:"uppercase", letterSpacing:".08em", color: CLR.textMuted,
                    borderBottom:`1px solid ${CLR.border}`, textAlign:"left",
                    background:"#F9FAFB", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reglements.map((r, i) => {
                const rmeta = STATUT_RAPPROCHEMENT_META[r.statut_rapprochement] || STATUT_RAPPROCHEMENT_META.a_verifier;
                const ecartR = (r.montant_recu || 0) - (r.montant_attendu || 0);
                return (
                  <tr key={r.id} style={{ borderBottom:`1px solid ${CLR.borderRow}`,
                    background: i % 2 === 0 ? CLR.card : "#F9FAFB" }}>
                    <td style={{ padding:"9px 12px", fontSize:12, color: CLR.textMuted }}>{fmt(r.date)}</td>
                    <td style={{ padding:"9px 12px", fontSize:13, fontWeight:600, color: CLR.text }}>{r.transporteur}</td>
                    <td style={{ padding:"9px 12px", fontSize:13, fontWeight:700, color: CLR.green,
                      fontFamily:"'JetBrains Mono','Courier New',monospace" }}>{fmtMAD(r.montant_recu)}</td>
                    <td style={{ padding:"9px 12px", fontSize:13, color: CLR.textSecond,
                      fontFamily:"'JetBrains Mono','Courier New',monospace" }}>{fmtMAD(r.montant_attendu)}</td>
                    <td style={{ padding:"9px 12px", fontSize:13, fontWeight:600,
                      fontFamily:"'JetBrains Mono','Courier New',monospace",
                      color: ecartR >= 0 ? CLR.green : CLR.red }}>
                      {ecartR >= 0 ? "+" : "−"}{fmtMAD(Math.abs(ecartR))}
                    </td>
                    <td style={{ padding:"9px 12px", fontSize:13, color: CLR.text }}>{r.nb_commandes}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <Badge label={r.statut === "valide" ? "Validé" : "Brouillon"}
                        bg={r.statut === "valide" ? CLR.greenBg : CLR.amberBg}
                        color={r.statut === "valide" ? CLR.green : CLR.amber}
                        border={r.statut === "valide" ? CLR.greenBorder : CLR.amberBorder} />
                    </td>
                    <td style={{ padding:"9px 12px" }}>
                      <Badge {...rmeta} />
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

// ─── Onglet Rapprochement ─────────────────────────────────────────────────────
function OngletRapprochement({ mouvements, onRefresh }) {
  const aVerifier = mouvements.filter(m => m.statut_rapprochement === "a_verifier");
  const litiges   = mouvements.filter(m => m.statut_rapprochement === "litige");

  async function marquerRapproche(id) {
    await supabase.from("releve_bancaire").update({ statut_rapprochement: "rapproche" }).eq("id", id);
    onRefresh();
  }
  async function marquerLitige(id) {
    await supabase.from("releve_bancaire").update({ statut_rapprochement: "litige" }).eq("id", id);
    onRefresh();
  }

  function TableRappr({ rows, title, emptyMsg }) {
    if (rows.length === 0) return (
      <div style={{ padding:"24px 16px", textAlign:"center", background:"#F9FAFB",
                    borderRadius:8, border:`1px dashed ${CLR.border}`, marginBottom:16 }}>
        <div style={{ fontSize:13, color: CLR.textMuted }}>{emptyMsg}</div>
      </div>
    );
    return (
      <div style={{ background: CLR.card, border:`1px solid ${CLR.border}`, borderRadius: RADIUS,
                    overflow:"hidden", marginBottom:20, boxShadow: SHADOW }}>
        <div style={{ padding:"10px 16px", background:"#F9FAFB", borderBottom:`1px solid ${CLR.border}`,
                      fontSize:12, fontWeight:700, color: CLR.text }}>{title} ({rows.length})</div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              {["Date","Type","Libellé","Montant","Actions"].map(h => (
                <th key={h} style={{ padding:"7px 12px", fontSize:10, fontWeight:600,
                  textTransform:"uppercase", letterSpacing:".06em", color: CLR.textMuted,
                  borderBottom:`1px solid ${CLR.border}`, background:"#F9FAFB", textAlign:"left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const val = getMontant(m);
              const isIn = val > 0;
              return (
                <tr key={m.id} style={{ borderBottom:`1px solid ${CLR.borderRow}`,
                  background: i % 2 === 0 ? CLR.card : "#F9FAFB" }}>
                  <td style={{ padding:"8px 12px", fontSize:12, color: CLR.textMuted }}>{fmt(m.date)}</td>
                  <td style={{ padding:"8px 12px" }}>
                    <span style={{ fontSize:11, color: CLR.indigo, background: CLR.indigoBg,
                      padding:"2px 6px", borderRadius:4 }}>
                      {TYPE_META[m.type]?.label || m.type || "—"}
                    </span>
                  </td>
                  <td style={{ padding:"8px 12px", fontSize:13, color: CLR.text }}>{m.intitule || "—"}</td>
                  <td style={{ padding:"8px 12px", fontSize:13, fontWeight:700,
                    color: isIn ? CLR.green : CLR.red,
                    fontFamily:"'JetBrains Mono','Courier New',monospace" }}>
                    {isIn ? "+" : "−"}{fmtMAD(Math.abs(val))}
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={() => marquerRapproche(m.id)}
                        style={{ padding:"3px 10px", background: CLR.greenBg, color: CLR.green,
                          border:`1px solid ${CLR.greenBorder}`, borderRadius:5, fontSize:11,
                          fontWeight:600, cursor:"pointer" }}>
                        ✓ Rapproché
                      </button>
                      <button onClick={() => marquerLitige(m.id)}
                        style={{ padding:"3px 10px", background: CLR.redBg, color: CLR.red,
                          border:`1px solid ${CLR.redBorder}`, borderRadius:5, fontSize:11,
                          fontWeight:600, cursor:"pointer" }}>
                        ⚠ Litige
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
        <KpiCard label="À vérifier" value={aVerifier.length}
          color={aVerifier.length > 0 ? CLR.amber : CLR.green}
          border={aVerifier.length > 0 ? CLR.amberBorder : CLR.greenBorder}
          sub="mouvements en attente de rapprochement" />
        <KpiCard label="En litige" value={litiges.length}
          color={litiges.length > 0 ? CLR.red : CLR.green}
          border={litiges.length > 0 ? CLR.redBorder : CLR.greenBorder}
          sub="nécessitent une action manuelle" />
      </div>
      <TableRappr rows={aVerifier} title="À vérifier" emptyMsg="Aucun mouvement en attente — tout est rapproché" />
      <TableRappr rows={litiges}   title="Litiges"    emptyMsg="Aucun litige enregistré" />
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Finances({ role }) {
  const [onglet, setOnglet]         = useState("journal");
  const [mouvements, setMouvements] = useState([]);
  const [conseilleres, setConseilleres] = useState([]);
  const [produits, setProduits]     = useState([]);
  const [loading, setLoading]       = useState(true);

  const fetchMouvements = useCallback(async () => {
    setLoading(true);
    const [{ data: mvts }, { data: leads }, { data: prods }] = await Promise.all([
      supabase.from("releve_bancaire").select("*").order("date", { ascending: false }).limit(300),
      supabase.from("leads").select("conseillere").not("conseillere", "is", null),
      supabase.from("produits").select("id, nom"),
    ]);
    if (mvts)  setMouvements(mvts);
    if (leads) setConseilleres([...new Set(leads.map(l => l.conseillere).filter(Boolean))]);
    if (prods) setProduits(prods);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMouvements(); }, [fetchMouvements]);

  const aVerifierCount = mouvements.filter(m => m.statut_rapprochement === "a_verifier").length;

  return (
    <div style={{ fontFamily:"Inter, system-ui, sans-serif", padding:"0 0 48px" }}>

      {/* Topbar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"16px 0 20px", borderBottom:`1px solid ${CLR.border}`, marginBottom:24 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color: CLR.text }}>Finances</div>
          <div style={{ fontSize:12, color: CLR.textMuted, marginTop:2 }}>
            Cash réel · Règlements transporteur · Rapprochement bancaire
          </div>
        </div>
        <div style={{ display:"flex", gap:4, background:"#F1F5F9", padding:4, borderRadius:9 }}>
          <TabBtn active={onglet === "journal"} onClick={() => setOnglet("journal")}>
            Journal
          </TabBtn>
          <TabBtn active={onglet === "reglements"} onClick={() => setOnglet("reglements")}>
            Règlements
          </TabBtn>
          <TabBtn active={onglet === "rapprochement"} onClick={() => setOnglet("rapprochement")}>
            Rapprochement {aVerifierCount > 0 && (
              <span style={{ marginLeft:5, background: CLR.amber, color:"#fff",
                borderRadius:10, fontSize:10, padding:"1px 6px", fontWeight:700 }}>
                {aVerifierCount}
              </span>
            )}
          </TabBtn>
        </div>
      </div>

      {onglet === "journal" && (
        <OngletJournal
          mouvements={mouvements}
          loading={loading}
          onRefresh={fetchMouvements}
          conseilleres={conseilleres}
          produits={produits}
        />
      )}
      {onglet === "reglements" && (
        <OngletReglements onRefresh={fetchMouvements} />
      )}
      {onglet === "rapprochement" && (
        <OngletRapprochement mouvements={mouvements} onRefresh={fetchMouvements} />
      )}
    </div>
  );
}
