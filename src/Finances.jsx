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
  textGhost:   "#CBD5E1",
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
const R = 10;

const CATEGORIES = [
  { key: "DEPENSE_ADS",               label: "Ads",                   color: "#1877f2", sens: "debit",  est_bancaire_default: true  },
  { key: "CREATION_CONTENU",          label: "Créatives",             color: "#7C3AED", sens: "debit",  est_bancaire_default: true  },
  { key: "FRAIS_LIVRAISON",           label: "Livraison",             color: "#D97706", sens: "debit",  est_bancaire_default: false },
  { key: "FRAIS_CONFIRMATION",        label: "Frais de confirmation", color: "#0891B2", sens: "debit",  est_bancaire_default: true  },
  { key: "ACHAT_STOCK",               label: "Stock",                 color: "#DC2626", sens: "debit",  est_bancaire_default: false },
  { key: "DEPENSE_OPS",               label: "Ops",                   color: "#94A3B8", sens: "debit",  est_bancaire_default: true  },
  { key: "ENCAISSEMENT_TRANSPORTEUR", label: "Encaissement",          color: "#16A34A", sens: "credit", est_bancaire_default: true  },
  { key: "APPORT_CAPITAL",            label: "Apport capital",        color: "#534AB7", sens: "credit", est_bancaire_default: true  },
  { key: "AJUSTEMENT",                label: "Ajustement",            color: "#64748b", sens: "both",   est_bancaire_default: true  },
];
const CAT_META = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

const TYPE_META = {
  DEPENSE_ADS:               { categories: { "Facebook Ads": ["Budget campagne","Boost publication","Réappro compte pub"], "TikTok Ads": ["Budget campagne TikTok","Boost TikTok"], "Autre": ["Dépense ads autre"] } },
  CREATION_CONTENU:          { categories: { "Vidéo": ["Vidéo ads produit","Tournage UGC","Motion design"], "Photo": ["Shooting produit","Retouche photo"], "Montage": ["Montage vidéo","Sous-titrage"], "Autre": ["Création contenu autre"] } },
  FRAIS_LIVRAISON:           { categories: { "Sendit": ["Frais expédition Sendit","Retour Sendit"], "Amana": ["Frais expédition Amana","Retour Amana"], "Autre": ["Frais livraison autre"] } },
  FRAIS_CONFIRMATION:        { categories: { "Paiement conseillère": ["Salaire conseillère — période","Prime confirmation"], "Autre": ["Frais confirmation autre"] } },
  ACHAT_STOCK:               { categories: { "Fournisseur local": ["Achat stock produit","Réappro fournisseur local"], "Import": ["Import fournisseur","Frais douane"], "Autre": ["Achat stock autre"] } },
  DEPENSE_OPS:               { categories: { "Emballage": ["Achat emballage","Scotch / cartons"], "Bureautique": ["Fournitures bureau","Abonnement logiciel"], "Télécom": ["Forfait téléphone","Internet"], "Autre": ["Dépense ops autre"] } },
  ENCAISSEMENT_TRANSPORTEUR: { categories: { "Sendit": ["Versement Sendit","Règlement Sendit"], "Amana": ["Versement Amana","Règlement Amana"], "Autre": ["Versement transporteur"] } },
  APPORT_CAPITAL:            { categories: { "Apport personnel": ["Apport personnel","Injection capital"], "Prêt": ["Prêt personnel","Avance associé"], "Autre": ["Apport autre"] } },
  AJUSTEMENT:                { categories: { "Correction": ["Correction erreur saisie","Régularisation"], "Écart caisse": ["Écart caisse","Différence rapprochement"], "Autre": ["Ajustement autre"] } },
};

const TRANSPORTEURS = ["Sendit", "Digylog", "Ameex", "Autre"];

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function prevMonth() {
  const d = new Date();
  return {
    start: new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10),
    end:   new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10),
  };
}
const TODAY = new Date().toISOString().slice(0, 10);

function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMAD(n, sign = false) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.round(Math.abs(n)).toLocaleString("fr");
  return sign ? `${n >= 0 ? "+" : "−"}${abs} MAD` : `${abs} MAD`;
}
function getMontant(m) {
  if (m.credit && +m.credit > 0) return +m.credit;
  if (m.debit  && +m.debit  > 0) return -Math.abs(+m.debit);
  return parseFloat(m.montant) || 0;
}
function inputSt(extra = {}) {
  return {
    width: "100%", padding: "7px 10px", border: `1px solid ${CLR.border}`,
    borderRadius: 7, fontSize: 13, outline: "none", background: "#fff",
    fontFamily: "inherit", boxSizing: "border-box", color: CLR.text, ...extra,
  };
}
function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: CLR.textMuted, marginBottom: 4 }}>{children}</div>;
}

function BadgeBancaire({ estBancaire }) {
  return estBancaire ? (
    <span style={{ fontSize: 10, fontWeight: 600, color: CLR.green, background: CLR.greenBg, border: `1px solid ${CLR.greenBorder}`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>Bancaire</span>
  ) : (
    <span style={{ fontSize: 10, fontWeight: 600, color: CLR.amber, background: CLR.amberBg, border: `1px solid ${CLR.amberBorder}`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>Hors banque</span>
  );
}

// ─── Formulaire Nouveau Mouvement ─────────────────────────────────────────────
function FormulaireNouveauMouvement({ conseilleres, produits, onSaved, onCancel }) {
  const firstType = "DEPENSE_ADS";
  const firstCat  = Object.keys(TYPE_META[firstType].categories)[0];
  const firstLib  = TYPE_META[firstType].categories[firstCat][0];

  const [form, setForm] = useState({
    date: TODAY, type: firstType, categorie: firstCat,
    libelle: firstLib, libelle_custom: "",
    observation: "", montant: "", sens: "debit",
    produit_id: "", est_bancaire: true,
  });
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleType(type) {
    const cats = TYPE_META[type]?.categories || {};
    const cat  = Object.keys(cats)[0] || "";
    const lib  = cats[cat]?.[0] || "";
    const sens = CAT_META[type]?.sens === "credit" ? "credit" : "debit";
    const est_bancaire = CAT_META[type]?.est_bancaire_default ?? true;
    setForm(f => ({ ...f, type, categorie: cat, libelle: lib, libelle_custom: "", sens, est_bancaire }));
  }
  function handleCat(cat) {
    const lib = TYPE_META[form.type]?.categories?.[cat]?.[0] || "";
    setForm(f => ({ ...f, categorie: cat, libelle: lib, libelle_custom: "" }));
  }

  const cats     = Object.keys(TYPE_META[form.type]?.categories || {});
  const libelles = TYPE_META[form.type]?.categories?.[form.categorie] || [];
  const isCustom = form.libelle === "__custom__";
  const isBoth   = CAT_META[form.type]?.sens === "both";
  const isCredit = form.sens === "credit" || CAT_META[form.type]?.sens === "credit";

  async function handleSave() {
    const lib = isCustom ? form.libelle_custom : form.libelle;
    if (!lib || !form.montant || !form.date) return;
    setSaving(true);
    await supabase.from("releve_bancaire").insert([{
      date: form.date,
      mois: new Date(form.date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      type: form.type, categorie: form.categorie, intitule: lib,
      observation: form.observation || null,
      debit:        isCredit ? 0 : parseFloat(form.montant),
      credit:       isCredit ? parseFloat(form.montant) : 0,
      est_bancaire: form.est_bancaire,
      statut_rapprochement: "a_verifier",
      ...(form.produit_id ? { produit_id: form.produit_id } : {}),
    }]);
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ background: CLR.card, border: `1px solid ${CLR.indigoBorder}`, borderRadius: R, padding: "20px 22px", marginBottom: 20, boxShadow: SHADOW }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: CLR.text, marginBottom: 14 }}>Nouveau mouvement</div>
      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><Label>Date</Label><input type="date" value={form.date} max={TODAY} onChange={e => setF("date", e.target.value)} style={inputSt()} /></div>
        <div><Label>Type</Label><select value={form.type} onChange={e => handleType(e.target.value)} style={inputSt()}>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        <div><Label>Catégorie</Label><select value={form.categorie} onChange={e => handleCat(e.target.value)} style={inputSt()}>{cats.map(c => <option key={c}>{c}</option>)}</select></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <Label>Libellé</Label>
          <select value={form.libelle} onChange={e => setF("libelle", e.target.value)} style={inputSt()}>
            {libelles.map(l => <option key={l}>{l}</option>)}
            <option value="__custom__">Autre…</option>
          </select>
          {isCustom && <input type="text" value={form.libelle_custom} placeholder="Libellé personnalisé" onChange={e => setF("libelle_custom", e.target.value)} style={{ ...inputSt(), marginTop: 6 }} />}
        </div>
        <div>
          <Label>Montant (MAD) <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: isCredit ? CLR.green : CLR.red }}>{isCredit ? "Recette" : "Dépense"}</span></Label>
          <div style={{ display: "flex", gap: 6 }}>
            {isBoth && <select value={form.sens} onChange={e => setF("sens", e.target.value)} style={inputSt({ width: "auto" })}><option value="debit">−</option><option value="credit">+</option></select>}
            <input type="number" value={form.montant} placeholder="0" min="0" onChange={e => setF("montant", e.target.value)} style={inputSt({ borderColor: isCredit ? CLR.greenBorder : CLR.redBorder })} />
          </div>
        </div>
      </div>
      {form.type === "ACHAT_STOCK" && produits.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Label>Produit lié</Label>
          <select value={form.produit_id} onChange={e => setF("produit_id", e.target.value)} style={inputSt()}>
            <option value="">— Sélectionner —</option>
            {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </div>
      )}
      {form.type === "FRAIS_CONFIRMATION" && conseilleres.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Label>Conseillère</Label>
          <select style={inputSt()}><option value="">— Sélectionner —</option>{conseilleres.map(c => <option key={c}>{c}</option>)}</select>
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <Label>Observation</Label>
        <input type="text" value={form.observation} placeholder="Note libre, référence, contexte…" onChange={e => setF("observation", e.target.value)} style={inputSt()} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, padding: "10px 14px", borderRadius: 8, background: form.est_bancaire ? CLR.greenBg : CLR.amberBg, border: `1px solid ${form.est_bancaire ? CLR.greenBorder : CLR.amberBorder}` }}>
        <button onClick={() => setF("est_bancaire", !form.est_bancaire)} style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: form.est_bancaire ? CLR.green : CLR.amber, position: "relative", flexShrink: 0, transition: "background .2s" }}>
          <span style={{ position: "absolute", top: 2, left: form.est_bancaire ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s", display: "block" }} />
        </button>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: form.est_bancaire ? CLR.green : CLR.amber }}>{form.est_bancaire ? "Mouvement bancaire" : "Mouvement hors banque (analytique)"}</div>
          <div style={{ fontSize: 11, color: CLR.textMuted, marginTop: 1 }}>{form.est_bancaire ? "Ce montant sera inclus dans le solde bancaire réel" : "Ce montant n'affecte pas le solde bancaire — utilisé pour la rentabilité"}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSave} disabled={saving || !form.montant} style={{ padding: "8px 18px", background: !form.montant ? CLR.border : CLR.indigo, color: !form.montant ? CLR.textMuted : "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        <button onClick={onCancel} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${CLR.border}`, borderRadius: 7, fontSize: 13, color: CLR.textSecond, cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}

// ─── Formulaire Facture Transporteur ─────────────────────────────────────────
function FormulaireFactureTransporteur({ onSaved, onCancel }) {
  const [step, setStep] = useState(1); // 1: infos facture, 2: commandes, 3: récap
  const [form, setForm] = useState({
    transporteur: "Sendit",
    numero_facture: "",
    date: TODAY,
    frais_ramassage: "",
    montant_recu: "",
    notes: "",
  });
  const [commandesFacturees, setCommandesFacturees] = useState([]);
  const [searchTracking, setSearchTracking] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Calculs
  const caTotal       = commandesFacturees.reduce((s, c) => s + (+c.prix || 0), 0);
  const fraisLivrTotal= commandesFacturees.reduce((s, c) => s + (+c.frais_livraison || 0), 0);
  const fraisEmbTotal = commandesFacturees.reduce((s, c) => s + (+c.frais_emballage_stockage || 0), 0);
  const fraisRamassage= +form.frais_ramassage || 0;
  const netCalcule    = caTotal - fraisLivrTotal - fraisEmbTotal - fraisRamassage;
  const montantRecu   = +form.montant_recu || 0;
  const ecart         = montantRecu - netCalcule;

  async function searchCommande() {
    setSearchError("");
    setSearchResult(null);
    if (!searchTracking.trim()) return;
    const { data, error } = await supabase
      .from("commandes")
      .select("*")
      .eq("tracking", searchTracking.trim())
      .in("statut", ["Livrée", "Facturée"])
      .single();
    if (error || !data) {
      setSearchError("Commande non trouvée ou statut invalide (doit être Livrée ou Facturée)");
      return;
    }
    if (commandesFacturees.find(c => c.id === data.id)) {
      setSearchError("Cette commande est déjà ajoutée");
      return;
    }
    setSearchResult(data);
  }

  function addCommande() {
    if (!searchResult) return;
    setCommandesFacturees(prev => [...prev, searchResult]);
    setSearchResult(null);
    setSearchTracking("");
  }

  function removeCommande(id) {
    setCommandesFacturees(prev => prev.filter(c => c.id !== id));
  }

  async function handleSave() {
    if (!form.numero_facture || !form.montant_recu) return;
    setSaving(true);
    try {
      // 1. Créer le règlement transporteur
      const { data: reglement, error: errReg } = await supabase
        .from("reglements_transporteur")
        .insert([{
          date: form.date,
          transporteur: form.transporteur,
          numero_facture: form.numero_facture,
          nb_commandes: commandesFacturees.length,
          montant_attendu: netCalcule,
          montant_recu: montantRecu,
          ecart: ecart,
          frais_ramassage: fraisRamassage,
          statut: "brouillon",
          statut_rapprochement: Math.abs(ecart) < 1 ? "reconcilie" : "ecart",
          notes: form.notes || null,
        }])
        .select()
        .single();

      if (errReg) { console.error(errReg); setSaving(false); return; }

      // 2. Lier les commandes au règlement
      if (commandesFacturees.length > 0) {
        await supabase.from("reglement_commandes").insert(
          commandesFacturees.map(c => ({
            reglement_id: reglement.id,
            commande_id: c.id,
            montant_commande: +c.prix || 0,
          }))
        );
        // Mettre les commandes en statut Facturée
        await Promise.all(commandesFacturees.map(c =>
          supabase.from("commandes").update({ statut: "Facturée" }).eq("id", c.id)
        ));
      }

      // 3. Créer l'écriture bancaire — encaissement net reçu
      await supabase.from("releve_bancaire").insert([{
        date: form.date,
        mois: new Date(form.date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        type: "ENCAISSEMENT_TRANSPORTEUR",
        categorie: form.transporteur,
        intitule: `Virement ${form.transporteur} — Fact. ${form.numero_facture}`,
        credit: montantRecu,
        debit: 0,
        est_bancaire: true,
        observation: `${commandesFacturees.length} commandes · Net calculé ${Math.round(netCalcule)} MAD`,
        reglement_id: reglement.id,
      }]);

      // 4. Frais ramassage si > 0
      if (fraisRamassage > 0) {
        await supabase.from("releve_bancaire").insert([{
          date: form.date,
          mois: new Date(form.date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
          type: "FRAIS_LIVRAISON",
          categorie: form.transporteur,
          intitule: `Frais ramassage ${form.transporteur} — Fact. ${form.numero_facture}`,
          debit: fraisRamassage,
          credit: 0,
          est_bancaire: false,
          observation: `Fact. ${form.numero_facture}`,
          reglement_id: reglement.id,
        }]);
      }

      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: CLR.card, border: `1px solid ${CLR.indigoBorder}`, borderRadius: R, padding: "20px 22px", marginBottom: 20, boxShadow: SHADOW }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: CLR.text }}>🧾 Nouvelle facture transporteur</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[1,2,3].map(s => (
            <div key={s} style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: step >= s ? CLR.indigo : CLR.border, color: step >= s ? "#fff" : CLR.textMuted }}>{s}</div>
          ))}
        </div>
      </div>

      {/* STEP 1 — Infos facture */}
      {step === 1 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px", gap: 10, marginBottom: 10 }}>
            <div>
              <Label>Transporteur</Label>
              <select value={form.transporteur} onChange={e => setF("transporteur", e.target.value)} style={inputSt()}>
                {TRANSPORTEURS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label>N° Facture *</Label>
              <input type="text" value={form.numero_facture} onChange={e => setF("numero_facture", e.target.value)} placeholder="ex: INV-2026-001" style={inputSt()} />
            </div>
            <div>
              <Label>Date facture</Label>
              <input type="date" value={form.date} max={TODAY} onChange={e => setF("date", e.target.value)} style={inputSt()} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <Label>Frais ramassage (MAD) — global facture</Label>
              <input type="number" value={form.frais_ramassage} onChange={e => setF("frais_ramassage", e.target.value)} placeholder="0" style={inputSt()} />
              <div style={{ fontSize: 11, color: CLR.textMuted, marginTop: 4 }}>Charge globale par tournée, non liée à une commande</div>
            </div>
            <div>
              <Label>Montant net reçu (MAD) * — virement bancaire réel</Label>
              <input type="number" value={form.montant_recu} onChange={e => setF("montant_recu", e.target.value)} placeholder="0" style={inputSt({ borderColor: CLR.greenBorder })} />
              <div style={{ fontSize: 11, color: CLR.textMuted, marginTop: 4 }}>Montant exact crédité sur ton compte bancaire</div>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <Label>Notes</Label>
            <input type="text" value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Remarques, litiges éventuels…" style={inputSt()} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { if (form.numero_facture && form.montant_recu) setStep(2); }} disabled={!form.numero_facture || !form.montant_recu}
              style={{ padding: "8px 18px", background: !form.numero_facture || !form.montant_recu ? CLR.border : CLR.indigo, color: !form.numero_facture || !form.montant_recu ? CLR.textMuted : "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Suivant →
            </button>
            <button onClick={onCancel} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${CLR.border}`, borderRadius: 7, fontSize: 13, color: CLR.textSecond, cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {/* STEP 2 — Ajouter commandes par tracking */}
      {step === 2 && (
        <div>
          <div style={{ fontSize: 12, color: CLR.textMuted, marginBottom: 12 }}>
            Recherche chaque commande par son numéro de tracking tel qu'il apparaît sur la facture {form.transporteur}.
          </div>

          {/* Barre de recherche tracking */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input type="text" value={searchTracking} onChange={e => setSearchTracking(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchCommande()}
              placeholder="N° tracking (ex: SD123456789MA)" style={{ ...inputSt(), flex: 1 }} />
            <button onClick={searchCommande} style={{ padding: "7px 16px", background: CLR.indigo, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Rechercher</button>
          </div>

          {/* Résultat de recherche */}
          {searchError && <div style={{ padding: "8px 12px", background: CLR.redBg, border: `1px solid ${CLR.redBorder}`, borderRadius: 7, fontSize: 12, color: CLR.red, marginBottom: 10 }}>{searchError}</div>}
          {searchResult && (
            <div style={{ padding: "12px 14px", background: CLR.greenBg, border: `1px solid ${CLR.greenBorder}`, borderRadius: 8, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: CLR.text }}>{searchResult.client_nom}</div>
                <div style={{ fontSize: 11, color: CLR.textMuted, marginTop: 2 }}>
                  {searchResult.produit} · {searchResult.ville} · {searchResult.tracking}
                </div>
                <div style={{ fontSize: 12, color: CLR.green, fontWeight: 600, marginTop: 4 }}>
                  Prix : {searchResult.prix} MAD · Livraison : {searchResult.frais_livraison || 0} MAD · Emballage : {searchResult.frais_emballage_stockage || 0} MAD
                </div>
              </div>
              <button onClick={addCommande} style={{ padding: "6px 14px", background: CLR.green, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Ajouter</button>
            </div>
          )}

          {/* Liste des commandes ajoutées */}
          {commandesFacturees.length > 0 ? (
            <div style={{ border: `1px solid ${CLR.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ padding: "8px 14px", background: "#F9FAFB", borderBottom: `1px solid ${CLR.border}`, fontSize: 11, fontWeight: 600, color: CLR.textMuted }}>
                {commandesFacturees.length} commande{commandesFacturees.length > 1 ? "s" : ""} ajoutée{commandesFacturees.length > 1 ? "s" : ""}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    {["Client", "Produit", "Tracking", "Prix", "Livraison", "Emballage", ""].map(h => (
                      <th key={h} style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: CLR.textMuted, textAlign: "left", borderBottom: `1px solid ${CLR.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {commandesFacturees.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${CLR.borderRow}`, background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                      <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 600 }}>{c.client_nom}</td>
                      <td style={{ padding: "7px 10px", fontSize: 11, color: CLR.textMuted }}>{c.produit}</td>
                      <td style={{ padding: "7px 10px", fontSize: 11, fontFamily: "monospace", color: CLR.textMuted }}>{c.tracking}</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 600, color: CLR.green }}>{c.prix} MAD</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, color: CLR.red }}>−{c.frais_livraison || 0} MAD</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, color: CLR.red }}>−{c.frais_emballage_stockage || 0} MAD</td>
                      <td style={{ padding: "7px 10px" }}>
                        <button onClick={() => removeCommande(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: CLR.textGhost, fontSize: 14 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "20px", textAlign: "center", background: "#F9FAFB", borderRadius: 8, border: `1px dashed ${CLR.border}`, marginBottom: 14, fontSize: 12, color: CLR.textMuted }}>
              Aucune commande ajoutée — recherche par tracking ci-dessus
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(1)} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${CLR.border}`, borderRadius: 7, fontSize: 13, color: CLR.textSecond, cursor: "pointer" }}>← Retour</button>
            <button onClick={() => setStep(3)} style={{ padding: "8px 18px", background: CLR.indigo, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Suivant →</button>
            <button onClick={onCancel} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${CLR.border}`, borderRadius: 7, fontSize: 13, color: CLR.textSecond, cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {/* STEP 3 — Récapitulatif et validation */}
      {step === 3 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: CLR.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".08em" }}>Récapitulatif — Facture {form.numero_facture}</div>

          {/* Tableau de réconciliation */}
          <div style={{ background: "#F9FAFB", border: `1px solid ${CLR.border}`, borderRadius: 8, padding: "16px 20px", marginBottom: 16 }}>
            {[
              { label: "CA brut commandes",     val: caTotal,        color: CLR.green,  sign: "+" },
              { label: "− Frais livraison",      val: fraisLivrTotal, color: CLR.red,    sign: "−" },
              { label: "− Frais emballage",      val: fraisEmbTotal,  color: CLR.red,    sign: "−" },
              { label: "− Frais ramassage",      val: fraisRamassage, color: CLR.red,    sign: "−" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${CLR.borderRow}` }}>
                <span style={{ fontSize: 13, color: CLR.textSecond }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: row.color, fontFamily: "monospace" }}>{row.sign}{Math.round(row.val).toLocaleString("fr")} MAD</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 0" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: CLR.text }}>= Net calculé ERP</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: CLR.indigo, fontFamily: "monospace" }}>{Math.round(netCalcule).toLocaleString("fr")} MAD</span>
            </div>
          </div>

          {/* Comparaison avec virement reçu */}
          <div style={{ background: Math.abs(ecart) < 1 ? CLR.greenBg : CLR.amberBg, border: `1px solid ${Math.abs(ecart) < 1 ? CLR.greenBorder : CLR.amberBorder}`, borderRadius: 8, padding: "14px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: CLR.textSecond }}>Net calculé ERP</span>
              <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>{Math.round(netCalcule).toLocaleString("fr")} MAD</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: CLR.textSecond }}>Virement reçu</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: CLR.green, fontFamily: "monospace" }}>+{Math.round(montantRecu).toLocaleString("fr")} MAD</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${Math.abs(ecart) < 1 ? CLR.greenBorder : CLR.amberBorder}` }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Écart</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: Math.abs(ecart) < 1 ? CLR.green : CLR.amber, fontFamily: "monospace" }}>
                {ecart >= 0 ? "+" : "−"}{Math.round(Math.abs(ecart)).toLocaleString("fr")} MAD
                {Math.abs(ecart) < 1 ? " ✓ Réconcilié" : " ⚠ Écart à vérifier"}
              </span>
            </div>
          </div>

          <div style={{ fontSize: 12, color: CLR.textMuted, marginBottom: 14, padding: "10px 14px", background: CLR.indigoBg, borderRadius: 7, border: `1px solid ${CLR.indigoBorder}` }}>
            En validant, l'ERP va :<br/>
            · Créer une écriture bancaire +{Math.round(montantRecu).toLocaleString("fr")} MAD (encaissement)<br/>
            · Passer les {commandesFacturees.length} commandes en statut "Facturée"<br/>
            · Enregistrer le règlement dans l'historique
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(2)} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${CLR.border}`, borderRadius: 7, fontSize: 13, color: CLR.textSecond, cursor: "pointer" }}>← Retour</button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: "8px 18px", background: saving ? CLR.border : CLR.green, color: saving ? CLR.textMuted : "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Enregistrement…" : "✓ Valider la facture"}
            </button>
            <button onClick={onCancel} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${CLR.border}`, borderRadius: 7, fontSize: 13, color: CLR.textSecond, cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Finances() {
  const [mouvements,     setMouvements]     = useState([]);
  const [conseilleres,   setConseilleres]   = useState([]);
  const [produits,       setProduits]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showForm,       setShowForm]       = useState(false);
  const [showFacture,    setShowFacture]    = useState(false);
  const [filterType,     setFilterType]     = useState("tous");
  const [filterBancaire, setFilterBancaire] = useState("tous");
  const [period,         setPeriod]         = useState({ start: startOfMonth(), end: TODAY });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: mvts }, { data: leads }, { data: prods }] = await Promise.all([
      supabase.from("releve_bancaire").select("*").order("date", { ascending: false }).limit(500),
      supabase.from("leads").select("conseillere").not("conseillere", "is", null),
      supabase.from("produits").select("id, nom"),
    ]);
    if (mvts)  setMouvements(mvts);
    if (leads) setConseilleres([...new Set(leads.map(l => l.conseillere).filter(Boolean))]);
    if (prods) setProduits(prods);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const soldeBancaire = mouvements.filter(m => m.est_bancaire !== false).reduce((s, m) => s + getMontant(m), 0);

  const mvtsPeriode = mouvements.filter(m => {
    const d = m.date?.slice(0, 10);
    return d >= period.start && d <= period.end;
  });

  const mvtsFiltres = mvtsPeriode.filter(m => {
    const matchType = filterType === "tous" || m.type === filterType;
    const matchBanc = filterBancaire === "tous"
      || (filterBancaire === "bancaire"    &&  m.est_bancaire !== false)
      || (filterBancaire === "hors_banque" &&  m.est_bancaire === false);
    return matchType && matchBanc;
  });

  const mvtsBancairesPeriode = mvtsPeriode.filter(m => m.est_bancaire !== false);
  const totalCreditsBanc = mvtsBancairesPeriode.filter(m => getMontant(m) > 0).reduce((s, m) => s + getMontant(m), 0);
  const totalDebitsBanc  = mvtsBancairesPeriode.filter(m => getMontant(m) < 0).reduce((s, m) => s + Math.abs(getMontant(m)), 0);
  const soldePeriodeBanc = totalCreditsBanc - totalDebitsBanc;

  const mvtsHorsBanquePeriode = mvtsPeriode.filter(m => m.est_bancaire === false);
  const totalHorsBanque = mvtsHorsBanquePeriode.reduce((s, m) => s + Math.abs(getMontant(m)), 0);

  const recapCats = CATEGORIES.map(cat => {
    const lignes     = mvtsPeriode.filter(m => m.type === cat.key);
    const lignesBanc = lignes.filter(m => m.est_bancaire !== false);
    const lignesHors = lignes.filter(m => m.est_bancaire === false);
    const totalBanc  = lignesBanc.reduce((s, m) => s + Math.abs(getMontant(m)), 0);
    const totalHors  = lignesHors.reduce((s, m) => s + Math.abs(getMontant(m)), 0);
    const total      = totalBanc + totalHors;
    return { ...cat, total, totalBanc, totalHors, count: lignes.length };
  }).filter(c => c.total > 0);

  const maxCat = Math.max(...recapCats.map(c => c.total), 1);

  async function handleDelete(id) {
    if (!window.confirm("Supprimer ce mouvement ?")) return;
    await supabase.from("releve_bancaire").delete().eq("id", id);
    fetchAll();
  }

  const shortcutSt = { padding: "5px 11px", border: `1px solid ${CLR.border}`, borderRadius: 6, fontSize: 11, fontWeight: 500, color: CLR.textSecond, background: CLR.card, cursor: "pointer", outline: "none" };
  const filterBancaireSt = (val) => ({ padding: "5px 12px", border: `1px solid ${filterBancaire === val ? CLR.indigo : CLR.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", outline: "none", background: filterBancaire === val ? CLR.indigoBg : CLR.card, color: filterBancaire === val ? CLR.indigo : CLR.textSecond });

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "0 0 48px" }}>

      {/* ── Topbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0 20px", borderBottom: `1px solid ${CLR.border}`, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: CLR.text }}>Finances</div>
          <div style={{ fontSize: 12, color: CLR.textMuted, marginTop: 2 }}>Trésorerie réelle · Journal des mouvements</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setShowFacture(s => !s); setShowForm(false); }}
            style={{ padding: "8px 16px", background: showFacture ? CLR.green : CLR.greenBg, color: showFacture ? "#fff" : CLR.green, border: `1px solid ${CLR.greenBorder}`, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            🧾 Facture transporteur
          </button>
          <button onClick={() => { setShowForm(s => !s); setShowFacture(false); }}
            style={{ padding: "8px 16px", background: CLR.indigo, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            + Mouvement
          </button>
        </div>
      </div>

      {/* ── Formulaire mouvement ── */}
      {showForm && (
        <FormulaireNouveauMouvement
          conseilleres={conseilleres} produits={produits}
          onSaved={() => { setShowForm(false); fetchAll(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* ── Formulaire facture transporteur ── */}
      {showFacture && (
        <FormulaireFactureTransporteur
          onSaved={() => { setShowFacture(false); fetchAll(); }}
          onCancel={() => setShowFacture(false)}
        />
      )}

      {/* ── HÉRO solde bancaire réel ── */}
      <div style={{ background: soldeBancaire >= 0 ? CLR.greenBg : CLR.redBg, border: `1.5px solid ${soldeBancaire >= 0 ? CLR.greenBorder : CLR.redBorder}`, borderRadius: 14, padding: "28px 32px", marginBottom: 16, boxShadow: soldeBancaire >= 0 ? "0 4px 24px rgba(22,163,74,0.10)" : "0 4px 24px rgba(220,38,38,0.10)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: soldeBancaire >= 0 ? CLR.green : CLR.red, marginBottom: 8 }}>Solde bancaire réel</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", color: soldeBancaire >= 0 ? CLR.green : CLR.red }}>
            {soldeBancaire >= 0 ? "+" : "−"}{Math.round(Math.abs(soldeBancaire)).toLocaleString("fr")}
          </span>
          <span style={{ fontSize: 22, fontWeight: 500, color: soldeBancaire >= 0 ? CLR.green : CLR.red }}>MAD</span>
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 12, color: CLR.textMuted }}>
          <span>Mouvements bancaires uniquement · {mouvements.filter(m => m.est_bancaire !== false).length} entrées</span>
          {totalHorsBanque > 0 && <span style={{ color: CLR.amber }}>+ {fmtMAD(totalHorsBanque)} hors banque (analytique, période)</span>}
        </div>
      </div>

      {/* ── Sélecteur période ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <input type="date" value={period.start} max={period.end} onChange={e => setPeriod(p => ({ ...p, start: e.target.value }))} style={{ padding: "6px 10px", border: `1px solid ${CLR.border}`, borderRadius: 7, fontSize: 13, color: CLR.text, background: CLR.card, outline: "none" }} />
        <span style={{ fontSize: 12, color: CLR.textMuted }}>→</span>
        <input type="date" value={period.end} min={period.start} max={TODAY} onChange={e => setPeriod(p => ({ ...p, end: e.target.value }))} style={{ padding: "6px 10px", border: `1px solid ${CLR.border}`, borderRadius: 7, fontSize: 13, color: CLR.text, background: CLR.card, outline: "none" }} />
        <div style={{ width: "0.5px", height: 18, background: CLR.border }} />
        {[
          { label: "Mois en cours",  fn: () => setPeriod({ start: startOfMonth(), end: TODAY }) },
          { label: "Mois précédent", fn: () => { const r = prevMonth(); setPeriod({ start: r.start, end: r.end }); } },
        ].map(s => (
          <button key={s.label} onClick={s.fn} style={shortcutSt}
            onMouseEnter={e => { e.currentTarget.style.borderColor = CLR.indigo; e.currentTarget.style.color = CLR.indigo; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = CLR.border; e.currentTarget.style.color = CLR.textSecond; }}>
            {s.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 13, alignItems: "center" }}>
          <span style={{ color: CLR.green, fontWeight: 600 }}>+{fmtMAD(totalCreditsBanc)}</span>
          <span style={{ color: CLR.red,   fontWeight: 600 }}>−{fmtMAD(totalDebitsBanc)}</span>
          <span style={{ color: soldePeriodeBanc >= 0 ? CLR.green : CLR.red, fontWeight: 700, fontFamily: "'JetBrains Mono','Courier New',monospace" }}>= {fmtMAD(soldePeriodeBanc, true)}</span>
        </div>
      </div>

      {/* ── Récap catégories ── */}
      {recapCats.length > 0 && (
        <div style={{ background: CLR.card, border: `1px solid ${CLR.border}`, borderRadius: R, padding: "18px 22px", marginBottom: 20, boxShadow: SHADOW }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: CLR.text, marginBottom: 14 }}>Récapitulatif par catégorie — période sélectionnée</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recapCats.map(cat => {
              const isIn   = cat.sens === "credit";
              const active = filterType === cat.key;
              return (
                <div key={cat.key} onClick={() => setFilterType(active ? "tous" : cat.key)}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "7px 10px", borderRadius: 8, background: active ? cat.color + "14" : "transparent", border: active ? `1px solid ${cat.color}30` : "1px solid transparent", transition: "all .15s" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
                  <div style={{ fontSize: 12, color: CLR.textSecond, width: 170, flexShrink: 0 }}>
                    {cat.label}<span style={{ fontSize: 10, color: CLR.textMuted, marginLeft: 6 }}>{cat.count} mvt{cat.count > 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ flex: 1, height: 4, background: CLR.borderRow, borderRadius: 99, overflow: "hidden", position: "relative" }}>
                    {cat.totalHors > 0 && <div style={{ position: "absolute", height: "100%", borderRadius: 99, background: CLR.amber + "60", width: `${(cat.total / maxCat) * 100}%` }} />}
                    <div style={{ height: "100%", borderRadius: 99, background: cat.color, width: `${(cat.totalBanc / maxCat) * 100}%`, transition: "width .4s" }} />
                  </div>
                  <div style={{ minWidth: 160, textAlign: "right" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isIn ? CLR.green : CLR.red, fontFamily: "'JetBrains Mono','Courier New',monospace" }}>
                      {isIn ? "+" : "−"}{fmtMAD(cat.total)}
                    </span>
                    {cat.totalHors > 0 && <span style={{ fontSize: 10, color: CLR.amber, marginLeft: 6 }}>dont {fmtMAD(cat.totalHors)} HB</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {filterType !== "tous" && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${CLR.borderRow}` }}>
              <button onClick={() => setFilterType("tous")} style={{ fontSize: 11, color: CLR.indigo, fontWeight: 600, background: CLR.indigoBg, border: `1px solid ${CLR.indigoBorder}`, borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>
                ✕ Retirer le filtre — {CAT_META[filterType]?.label}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Journal ── */}
      <div style={{ background: CLR.card, border: `1px solid ${CLR.border}`, borderRadius: R, overflow: "hidden", boxShadow: SHADOW }}>
        <div style={{ padding: "12px 20px", background: "#F9FAFB", borderBottom: `1px solid ${CLR.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: CLR.text }}>
            Journal
            {filterType !== "tous" && <span style={{ marginLeft: 8, fontSize: 11, color: CLR.indigo, background: CLR.indigoBg, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>{CAT_META[filterType]?.label}</span>}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setFilterBancaire("tous")}        style={filterBancaireSt("tous")}>Tout</button>
            <button onClick={() => setFilterBancaire("bancaire")}    style={filterBancaireSt("bancaire")}>Bancaire</button>
            <button onClick={() => setFilterBancaire("hors_banque")} style={filterBancaireSt("hors_banque")}>Hors banque</button>
            <div style={{ width: "0.5px", height: 16, background: CLR.border, margin: "0 4px" }} />
            <span style={{ fontSize: 11, color: CLR.textMuted, background: CLR.card, border: `1px solid ${CLR.border}`, borderRadius: 5, padding: "2px 8px" }}>
              {mvtsFiltres.length} entrée{mvtsFiltres.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: CLR.textMuted, fontSize: 13 }}>Chargement…</div>
        ) : mvtsFiltres.length === 0 ? (
          <div style={{ padding: "36px 20px", textAlign: "center", background: "#F9FAFB", margin: 16, borderRadius: 8, border: `1px dashed ${CLR.border}` }}>
            <div style={{ fontSize: 22, opacity: .3, marginBottom: 8 }}>◎</div>
            <div style={{ fontSize: 13, color: CLR.textMuted, fontWeight: 500 }}>Aucun mouvement sur cette période</div>
            <div style={{ fontSize: 11, color: CLR.textGhost, marginTop: 4 }}>{filterType !== "tous" ? `Aucune entrée "${CAT_META[filterType]?.label}" sur la période` : "Modifie la période ou clique sur + Mouvement"}</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Date","Catégorie","Libellé","Observation","Nature","Montant",""].map(h => (
                    <th key={h} style={{ padding: "8px 14px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: CLR.textMuted, borderBottom: `1px solid ${CLR.border}`, textAlign: h === "Montant" ? "right" : "left", background: "#F9FAFB", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mvtsFiltres.map((m, i) => {
                  const val    = getMontant(m);
                  const isIn   = val > 0;
                  const cat    = CAT_META[m.type];
                  const isBanc = m.est_bancaire !== false;
                  return (
                    <tr key={m.id || i} style={{ borderBottom: `1px solid ${CLR.borderRow}`, background: !isBanc ? CLR.amberBg + "55" : i % 2 === 0 ? CLR.card : "#F9FAFB" }}>
                      <td style={{ padding: "9px 14px", fontSize: 12, color: CLR.textMuted, whiteSpace: "nowrap" }}>{fmt(m.date)}</td>
                      <td style={{ padding: "9px 14px" }}>
                        {cat ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: cat.color, background: cat.color + "14", padding: "2px 8px", borderRadius: 4 }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: cat.color }} />{cat.label}
                          </span>
                        ) : <span style={{ fontSize: 11, color: CLR.textMuted }}>{m.type || "—"}</span>}
                      </td>
                      <td style={{ padding: "9px 14px", fontSize: 13, color: CLR.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.intitule || m.libelle || "—"}</td>
                      <td style={{ padding: "9px 14px", fontSize: 11, color: CLR.textMuted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.observation || "—"}</td>
                      <td style={{ padding: "9px 14px" }}><BadgeBancaire estBancaire={isBanc} /></td>
                      <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "'JetBrains Mono','Courier New',monospace" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isIn ? CLR.green : CLR.red, opacity: !isBanc ? 0.7 : 1 }}>
                          {isIn ? "+" : "−"}{Math.round(Math.abs(val))} MAD
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <button onClick={() => handleDelete(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: CLR.textGhost, fontSize: 14, padding: "0 4px", lineHeight: 1 }} title="Supprimer">✕</button>
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
