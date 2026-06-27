import { supabase } from "../supabaseClient";

const TARIF_UNITAIRE = 10;
const STATUTS_LIVRES = ["Livrée", "Facturée"];

const STATUT_CONFIG = {
  brouillon: { label: "Brouillon", color: "#94A3B8", bg: "#F1F5F9" },
  valide:    { label: "Validé",    color: "#7C3AED", bg: "#EDE9FE" },
  paye:      { label: "Payé",      color: "#059669", bg: "#ECFDF5" },
};

function fmt(n) {
  return Number(n || 0).toLocaleString("fr-MA", { minimumFractionDigits: 0 }) + " MAD";
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Modal Nouveau Relevé ───────────────────────────────────────────────────
function ModalNouveauReleve({ onClose, onCreated }) {
  const [conseilleres, setConseilleres] = useState([]);
  const [form, setForm] = useState({
    conseillere: "",
    periode_debut: "",
    periode_fin: "",
  });
  const [preview, setPreview] = useState(null); // { commandes, nb, montant }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // Charger la liste des conseillères depuis les commandes
  useEffect(() => {
    supabase
      .from("commandes")
      .select("conseillere")
      .not("conseillere", "is", null)
      .then(({ data }) => {
        if (!data) return;
        const uniq = [...new Set(data.map((r) => r.conseillere).filter(Boolean))].sort();
        setConseilleres(uniq);
      });
  }, []);

  const calculer = useCallback(async () => {
    const { conseillere, periode_debut, periode_fin } = form;
    if (!conseillere || !periode_debut || !periode_fin) return;
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase
        .from("commandes")
        .select("id, reference, montant_total, date_livraison, statut, conseillere")
        .eq("conseillere", conseillere)
        .in("statut", STATUTS_LIVRES)
        .gte("date_livraison", periode_debut)
        .lte("date_livraison", periode_fin)
        .order("date_livraison", { ascending: true });

      if (error) throw error;
      setPreview({
        commandes: data || [],
        nb: (data || []).length,
        montant: (data || []).length * TARIF_UNITAIRE,
      });
    } catch (e) {
      setErr("Erreur lors du calcul : " + e.message);
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    if (form.conseillere && form.periode_debut && form.periode_fin) {
      calculer();
    } else {
      setPreview(null);
    }
  }, [form.conseillere, form.periode_debut, form.periode_fin, calculer]);

  const sauvegarder = async () => {
    if (!preview || preview.nb === 0) return;
    setSaving(true);
    setErr(null);
    try {
      // Créer le relevé
      const { data: releve, error: e1 } = await supabase
        .from("paiements_conseilleres")
        .insert({
          conseillere: form.conseillere,
          periode_debut: form.periode_debut,
          periode_fin: form.periode_fin,
          nb_commandes: preview.nb,
          tarif_unitaire: TARIF_UNITAIRE,
          montant_total: preview.montant,
          statut: "brouillon",
        })
        .select()
        .single();
      if (e1) throw e1;

      // Lier les commandes
      if (preview.commandes.length > 0) {
        const liens = preview.commandes.map((c) => ({
          paiement_id: releve.id,
          commande_id: c.id,
          commande_ref: c.reference,
          montant_cmd: c.montant_total,
        }));
        const { error: e2 } = await supabase.from("paiements_commandes").insert(liens);
        if (e2) throw e2;
      }

      onCreated(releve);
      onClose();
    } catch (e) {
      setErr("Erreur lors de la création : " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <span style={S.modalTitle}>Nouveau relevé de paiement</span>
          <button style={S.btnClose} onClick={onClose}>✕</button>
        </div>

        <div style={S.modalBody}>
          {/* Conseillère */}
          <div style={S.field}>
            <label style={S.label}>Conseillère</label>
            <select
              style={S.select}
              value={form.conseillere}
              onChange={(e) => setForm({ ...form, conseillere: e.target.value })}
            >
              <option value="">Sélectionner…</option>
              {conseilleres.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Période */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={S.field}>
              <label style={S.label}>Début de période</label>
              <input
                type="date"
                style={S.input}
                value={form.periode_debut}
                onChange={(e) => setForm({ ...form, periode_debut: e.target.value })}
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>Fin de période</label>
              <input
                type="date"
                style={S.input}
                value={form.periode_fin}
                onChange={(e) => setForm({ ...form, periode_fin: e.target.value })}
              />
            </div>
          </div>

          {/* Aperçu */}
          {loading && (
            <div style={S.previewBox}>
              <span style={{ color: "#64748B", fontSize: 13 }}>Calcul en cours…</span>
            </div>
          )}

          {preview && !loading && (
            <>
              <div style={S.previewBox}>
                <div style={S.previewRow}>
                  <span style={S.previewLabel}>Commandes retenues</span>
                  <span style={{ ...S.previewVal, fontFamily: "JetBrains Mono, monospace" }}>
                    {preview.nb}
                  </span>
                </div>
                <div style={S.previewRow}>
                  <span style={S.previewLabel}>Tarif unitaire</span>
                  <span style={{ ...S.previewVal, fontFamily: "JetBrains Mono, monospace" }}>
                    {TARIF_UNITAIRE} MAD
                  </span>
                </div>
                <div style={{ ...S.previewRow, borderTop: "1px solid #E2E8F0", paddingTop: 10, marginTop: 4 }}>
                  <span style={{ ...S.previewLabel, fontWeight: 600, color: "#1E293B" }}>
                    Montant total
                  </span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 18, color: "#534AB7" }}>
                    {fmt(preview.montant)}
                  </span>
                </div>
              </div>

              {/* Liste commandes */}
              {preview.commandes.length > 0 ? (
                <div style={S.cmdList}>
                  <div style={S.cmdListHeader}>
                    <span>Référence</span>
                    <span>Date livraison</span>
                    <span>Statut</span>
                    <span style={{ textAlign: "right" }}>Montant</span>
                  </div>
                  {preview.commandes.map((c) => (
                    <div key={c.id} style={S.cmdRow}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                        {c.reference || c.id.slice(0, 8)}
                      </span>
                      <span style={{ fontSize: 12 }}>{fmtDate(c.date_livraison)}</span>
                      <span style={{ fontSize: 11, color: "#059669" }}>{c.statut}</span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, textAlign: "right" }}>
                        {fmt(c.montant_total)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ ...S.previewBox, background: "#FFF7ED", borderColor: "#FED7AA" }}>
                  <span style={{ color: "#C2410C", fontSize: 13 }}>
                    Aucune commande livrée sur cette période pour cette conseillère.
                  </span>
                </div>
              )}
            </>
          )}

          {err && <div style={S.error}>{err}</div>}
        </div>

        <div style={S.modalFooter}>
          <button style={S.btnSecondary} onClick={onClose}>Annuler</button>
          <button
            style={{
              ...S.btnPrimary,
              opacity: (!preview || preview.nb === 0 || saving) ? 0.5 : 1,
              cursor: (!preview || preview.nb === 0 || saving) ? "not-allowed" : "pointer",
            }}
            onClick={sauvegarder}
            disabled={!preview || preview.nb === 0 || saving}
          >
            {saving ? "Création…" : "Créer le brouillon"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Détail Relevé ────────────────────────────────────────────────────
function ModalDetailReleve({ releve, onClose, onUpdated }) {
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refVirement, setRefVirement] = useState(releve.reference_virement || "");
  const [notes, setNotes] = useState(releve.notes || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    supabase
      .from("paiements_commandes")
      .select("*")
      .eq("paiement_id", releve.id)
      .then(({ data }) => {
        setCommandes(data || []);
        setLoading(false);
      });
  }, [releve.id]);

  const changerStatut = async (nouveau_statut) => {
    setSaving(true);
    setErr(null);
    try {
      const update = { statut: nouveau_statut };

      if (nouveau_statut === "paye") {
        if (!refVirement.trim()) {
          setErr("La référence de virement est obligatoire pour marquer comme Payé.");
          setSaving(false);
          return;
        }
        update.reference_virement = refVirement.trim();

        // Créer l'entrée dans releve_bancaire
        const { data: rb, error: rbErr } = await supabase
          .from("releve_bancaire")
          .insert({
            date: new Date().toISOString().split("T")[0],
            libelle: `Paiement conseillère ${releve.conseillere} — ${fmtDate(releve.periode_debut)} au ${fmtDate(releve.periode_fin)}`,
            debit: releve.montant_total,
            credit: 0,
            reference: refVirement.trim(),
            categorie: "Paiement conseillère",
            notes: `Relevé #${releve.id.slice(0, 8)} — ${releve.nb_commandes} commandes livrées`,
          })
          .select()
          .single();

        if (rbErr) throw rbErr;
        update.releve_bancaire_id = rb.id;
      }

      if (notes.trim()) update.notes = notes.trim();

      const { data, error } = await supabase
        .from("paiements_conseilleres")
        .update(update)
        .eq("id", releve.id)
        .select()
        .single();

      if (error) throw error;
      onUpdated(data);
      onClose();
    } catch (e) {
      setErr("Erreur : " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const cfg = STATUT_CONFIG[releve.statut];

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, maxWidth: 680 }}>
        <div style={S.modalHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={S.modalTitle}>Relevé — {releve.conseillere}</span>
            <span style={{ ...S.badge, color: cfg.color, background: cfg.bg }}>
              {cfg.label}
            </span>
          </div>
          <button style={S.btnClose} onClick={onClose}>✕</button>
        </div>

        <div style={S.modalBody}>
          {/* Récapitulatif */}
          <div style={S.summaryGrid}>
            <div style={S.summaryItem}>
              <span style={S.summaryLabel}>Période</span>
              <span style={S.summaryVal}>
                {fmtDate(releve.periode_debut)} → {fmtDate(releve.periode_fin)}
              </span>
            </div>
            <div style={S.summaryItem}>
              <span style={S.summaryLabel}>Commandes retenues</span>
              <span style={{ ...S.summaryVal, fontFamily: "JetBrains Mono, monospace" }}>
                {releve.nb_commandes}
              </span>
            </div>
            <div style={S.summaryItem}>
              <span style={S.summaryLabel}>Tarif unitaire</span>
              <span style={{ ...S.summaryVal, fontFamily: "JetBrains Mono, monospace" }}>
                {releve.tarif_unitaire} MAD
              </span>
            </div>
            <div style={{ ...S.summaryItem, background: "#EEF2FF", borderColor: "#C7D2FE" }}>
              <span style={S.summaryLabel}>Montant total</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 20, color: "#534AB7" }}>
                {fmt(releve.montant_total)}
              </span>
            </div>
          </div>

          {releve.reference_virement && (
            <div style={{ ...S.previewBox, background: "#F0FDF4", borderColor: "#BBF7D0" }}>
              <span style={{ fontSize: 12, color: "#166534" }}>
                Référence virement : <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{releve.reference_virement}</strong>
              </span>
            </div>
          )}

          {/* Liste commandes */}
          {loading ? (
            <div style={{ color: "#64748B", fontSize: 13 }}>Chargement…</div>
          ) : (
            <div style={S.cmdList}>
              <div style={S.cmdListHeader}>
                <span>Référence commande</span>
                <span style={{ textAlign: "right" }}>Montant commande</span>
              </div>
              {commandes.length === 0 ? (
                <div style={{ padding: "12px 0", color: "#94A3B8", fontSize: 13 }}>
                  Aucune commande liée.
                </div>
              ) : (
                commandes.map((c) => (
                  <div key={c.id} style={{ ...S.cmdRow, gridTemplateColumns: "1fr auto" }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                      {c.commande_ref || c.commande_id.slice(0, 8)}
                    </span>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                      {fmt(c.montant_cmd)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Actions selon statut */}
          {releve.statut === "valide" && (
            <div style={S.field}>
              <label style={S.label}>Référence de virement <span style={{ color: "#EF4444" }}>*</span></label>
              <input
                style={S.input}
                placeholder="Ex: VIR-2026-001, numéro de transaction…"
                value={refVirement}
                onChange={(e) => setRefVirement(e.target.value)}
              />
            </div>
          )}

          {(releve.statut === "brouillon" || releve.statut === "valide") && (
            <div style={S.field}>
              <label style={S.label}>Notes (optionnel)</label>
              <textarea
                style={{ ...S.input, height: 60, resize: "vertical" }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations, accord verbal, etc."
              />
            </div>
          )}

          {err && <div style={S.error}>{err}</div>}
        </div>

        <div style={S.modalFooter}>
          <button style={S.btnSecondary} onClick={onClose}>Fermer</button>
          {releve.statut === "brouillon" && (
            <button
              style={{ ...S.btnPrimary, background: "#7C3AED" }}
              onClick={() => changerStatut("valide")}
              disabled={saving}
            >
              {saving ? "…" : "✓ Valider le relevé"}
            </button>
          )}
          {releve.statut === "valide" && (
            <button
              style={{ ...S.btnPrimary, background: "#059669" }}
              onClick={() => changerStatut("paye")}
              disabled={saving}
            >
              {saving ? "…" : "Marquer Payé + enregistrer en Finances"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ────────────────────────────────────────────────────────
export default function PaiementsConseilleres() {
  const [releves, setReleves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNouveau, setShowNouveau] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState("tous");
  const [filtreConseillere, setFiltreConseillere] = useState("tous");

  const charger = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("paiements_conseilleres")
      .select("*")
      .order("created_at", { ascending: false });
    setReleves(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const conseilleres = [...new Set(releves.map((r) => r.conseillere))].sort();

  const filtres = releves.filter((r) => {
    const matchStatut = filtreStatut === "tous" || r.statut === filtreStatut;
    const matchCons = filtreConseillere === "tous" || r.conseillere === filtreConseillere;
    return matchStatut && matchCons;
  });

  // KPIs globaux
  const totalBrouillons = releves.filter((r) => r.statut === "brouillon").reduce((s, r) => s + r.montant_total, 0);
  const totalValides = releves.filter((r) => r.statut === "valide").reduce((s, r) => s + r.montant_total, 0);
  const totalPayes = releves.filter((r) => r.statut === "paye").reduce((s, r) => s + r.montant_total, 0);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div>
          <h1 style={S.pageTitle}>Paiements Conseillères</h1>
          <p style={S.pageSubtitle}>Relevés traçables · {TARIF_UNITAIRE} MAD par commande livrée</p>
        </div>
        <button style={S.btnPrimary} onClick={() => setShowNouveau(true)}>
          + Nouveau relevé
        </button>
      </div>

      {/* KPIs */}
      <div style={S.kpiRow}>
        <div style={S.kpiCard}>
          <span style={S.kpiLabel}>En brouillon</span>
          <span style={{ ...S.kpiVal, color: "#64748B" }}>{fmt(totalBrouillons)}</span>
        </div>
        <div style={{ ...S.kpiCard, background: "#EDE9FE", borderColor: "#C4B5FD" }}>
          <span style={S.kpiLabel}>À payer (validés)</span>
          <span style={{ ...S.kpiVal, color: "#7C3AED" }}>{fmt(totalValides)}</span>
        </div>
        <div style={{ ...S.kpiCard, background: "#F0FDF4", borderColor: "#BBF7D0" }}>
          <span style={S.kpiLabel}>Payé (total)</span>
          <span style={{ ...S.kpiVal, color: "#059669" }}>{fmt(totalPayes)}</span>
        </div>
        <div style={S.kpiCard}>
          <span style={S.kpiLabel}>Relevés total</span>
          <span style={S.kpiVal}>{releves.length}</span>
        </div>
      </div>

      {/* Filtres */}
      <div style={S.filtres}>
        <select style={S.selectSm} value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
          <option value="tous">Tous les statuts</option>
          <option value="brouillon">Brouillon</option>
          <option value="valide">Validé</option>
          <option value="paye">Payé</option>
        </select>
        <select style={S.selectSm} value={filtreConseillere} onChange={(e) => setFiltreConseillere(e.target.value)}>
          <option value="tous">Toutes les conseillères</option>
          {conseilleres.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "#94A3B8", marginLeft: "auto" }}>
          {filtres.length} relevé{filtres.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div style={S.tableWrapper}>
        {loading ? (
          <div style={S.emptyState}>Chargement…</div>
        ) : filtres.length === 0 ? (
          <div style={S.emptyState}>
            Aucun relevé. Créez le premier avec le bouton "+ Nouveau relevé".
          </div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                {["Conseillère", "Période", "Commandes", "Tarif", "Montant", "Statut", "Réf. virement", "Créé le", ""].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtres.map((r) => {
                const cfg = STATUT_CONFIG[r.statut];
                return (
                  <tr key={r.id} style={S.tr}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{r.conseillere}</td>
                    <td style={{ ...S.td, fontSize: 12 }}>
                      {fmtDate(r.periode_debut)}<br />
                      <span style={{ color: "#94A3B8" }}>→ {fmtDate(r.periode_fin)}</span>
                    </td>
                    <td style={{ ...S.td, fontFamily: "JetBrains Mono, monospace", textAlign: "center" }}>
                      {r.nb_commandes}
                    </td>
                    <td style={{ ...S.td, fontFamily: "JetBrains Mono, monospace", color: "#64748B" }}>
                      {r.tarif_unitaire} MAD
                    </td>
                    <td style={{ ...S.td, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "#534AB7" }}>
                      {fmt(r.montant_total)}
                    </td>
                    <td style={S.td}>
                      <span style={{ ...S.badge, color: cfg.color, background: cfg.bg }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#64748B" }}>
                      {r.reference_virement || "—"}
                    </td>
                    <td style={{ ...S.td, fontSize: 12, color: "#94A3B8" }}>
                      {fmtDate(r.created_at)}
                    </td>
                    <td style={S.td}>
                      <button
                        style={S.btnView}
                        onClick={() => setSelected(r)}
                      >
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showNouveau && (
        <ModalNouveauReleve
          onClose={() => setShowNouveau(false)}
          onCreated={(r) => { setReleves([r, ...releves]); }}
        />
      )}
      {selected && (
        <ModalDetailReleve
          releve={selected}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setReleves(releves.map((r) => r.id === updated.id ? updated : r));
          }}
        />
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const S = {
  page: {
    padding: "28px 32px",
    background: "#F8FAFC",
    minHeight: "100vh",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  pageTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#0F172A",
    letterSpacing: "-0.3px",
  },
  pageSubtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#64748B",
  },
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    background: "#FFF",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  kpiLabel: { fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px" },
  kpiVal: { fontFamily: "JetBrains Mono, monospace", fontSize: 20, fontWeight: 700, color: "#0F172A" },
  filtres: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  selectSm: {
    padding: "6px 10px",
    border: "1px solid #E2E8F0",
    borderRadius: 6,
    fontSize: 13,
    color: "#334155",
    background: "#FFF",
    outline: "none",
    cursor: "pointer",
  },
  tableWrapper: {
    background: "#FFF",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    padding: "10px 14px",
    fontSize: 11,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    textAlign: "left",
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    fontWeight: 600,
  },
  tr: {
    borderBottom: "1px solid #F1F5F9",
  },
  td: {
    padding: "12px 14px",
    fontSize: 13,
    color: "#334155",
    verticalAlign: "middle",
  },
  badge: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.3px",
  },
  emptyState: {
    padding: "40px 20px",
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 14,
  },
  btnPrimary: {
    background: "#534AB7",
    color: "#FFF",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnSecondary: {
    background: "#F1F5F9",
    color: "#334155",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  btnView: {
    background: "transparent",
    color: "#534AB7",
    border: "1px solid #C7D2FE",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  btnClose: {
    background: "none",
    border: "none",
    color: "#64748B",
    fontSize: 16,
    cursor: "pointer",
    padding: 4,
  },
  // Modal
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: "#FFF",
    borderRadius: 14,
    width: "100%",
    maxWidth: 560,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 24px",
    borderBottom: "1px solid #E2E8F0",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0F172A",
  },
  modalBody: {
    padding: "20px 24px",
    overflowY: "auto",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    padding: "16px 24px",
    borderTop: "1px solid #E2E8F0",
  },
  // Formulaire
  field: { display: "flex", flexDirection: "column", gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.3px" },
  input: {
    padding: "9px 12px",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    fontSize: 14,
    color: "#0F172A",
    outline: "none",
    fontFamily: "inherit",
  },
  select: {
    padding: "9px 12px",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    fontSize: 14,
    color: "#0F172A",
    background: "#FFF",
    outline: "none",
    cursor: "pointer",
  },
  previewBox: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  previewRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewLabel: { fontSize: 13, color: "#64748B" },
  previewVal: { fontSize: 15, fontWeight: 600, color: "#0F172A" },
  cmdList: {
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    overflow: "hidden",
    fontSize: 13,
  },
  cmdListHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr",
    padding: "8px 12px",
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    fontSize: 11,
    color: "#64748B",
    fontWeight: 600,
    textTransform: "uppercase",
  },
  cmdRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr",
    padding: "8px 12px",
    borderBottom: "1px solid #F1F5F9",
    alignItems: "center",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  summaryItem: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  summaryLabel: { fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.3px" },
  summaryVal: { fontSize: 16, fontWeight: 700, color: "#0F172A" },
  error: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#DC2626",
  },
};
