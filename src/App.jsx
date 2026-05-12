import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const STATUTS = [
  'A appeler', 'Confirme', 'Injoignable',
  'Demande de rappel', 'Annule', 'Pas interesse', 'Numero faux'
];

const STATUT_META = {
  'A appeler':         { color: '#3b82f6', emoji: '📞' },
  'Confirme':          { color: '#16a34a', emoji: '✅' },
  'Injoignable':       { color: '#f59e0b', emoji: '📵' },
  'Demande de rappel': { color: '#f97316', emoji: '🔔' },
  'Annule':            { color: '#ef4444', emoji: '❌' },
  'Pas interesse':     { color: '#6b7280', emoji: '🚫' },
  'Numero faux':       { color: '#dc2626', emoji: '⚠️' },
};

const FILTRES = ['tous', 'A appeler', 'Confirme', 'Injoignable', 'Demande de rappel', 'Annule'];

export default function App() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('tous');
  const [selectedLead, setSelectedLead] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  useEffect(() => {
    fetchLeads();
    const channel = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchLeads)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function fetchLeads() {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLeads(data || []);
    setLoading(false);
  }

  function openLead(lead) {
    setSelectedLead(lead);
    setCommentaire(lead.commentaire || '');
  }

  async function updateStatut(id, statut) {
    await supabase.from('leads').update({ statut, updated_at: new Date() }).eq('id', id);
    setSelectedLead(function(prev) { return prev ? Object.assign({}, prev, { statut: statut }) : null; });
    fetchLeads();
  }

  async function saveCommentaire() {
    if (!selectedLead) return;
    setSavingComment(true);
    await supabase.from('leads').update({ commentaire: commentaire, updated_at: new Date() }).eq('id', selectedLead.id);
    setSavingComment(false);
    setSelectedLead(function(prev) { return prev ? Object.assign({}, prev, { commentaire: commentaire }) : null; });
    fetchLeads();
  }

  var leadsFiltres = filtre === 'tous' ? leads : leads.filter(function(l) { return l.statut === filtre; });
  var counts = {};
  FILTRES.forEach(function(f) {
    counts[f] = f === 'tous' ? leads.length : leads.filter(function(l) { return l.statut === f; }).length;
  });

  if (selectedLead) {
    var rawTel = String(selectedLead.telephone || '');
    var tel = rawTel.startsWith('0') ? rawTel.substring(1) : rawTel;
    var waUrl = 'https://wa.me/212' + tel + '?text=Bonjour%20' + encodeURIComponent(selectedLead.client_nom || '');
    var telUrl = 'tel:' + selectedLead.telephone;
    var meta = STATUT_META[selectedLead.statut] || { color: '#6b7280', emoji: '•' };
    var dateStr = selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleString('fr-FR') : '';

    return (
      <div style={s.page}>
        <div style={s.ficheNav}>
          <button onClick={() => setSelectedLead(null)} style={s.backBtn}>← Retour</button>
          <span style={s.ficheNavTitle}>Fiche Lead</span>
        </div>

        <div style={s.ficheBody}>

          <div style={s.ficheCard}>
            <div style={s.ficheNom}>{selectedLead.client_nom}</div>
            <div style={s.ficheProduit}>{selectedLead.produit} — {selectedLead.prix} MAD</div>
            <div style={s.ficheRow}>
              <span style={s.ficheChip}>📍 {selectedLead.ville}</span>
              <span style={s.ficheChip}>📱 {selectedLead.telephone}</span>
              <span style={s.ficheChip}>🕐 {dateStr}</span>
            </div>
            <div style={{ marginTop: '12px' }}>
              <span style={Object.assign({}, s.statutPill, { background: meta.color + '22', color: meta.color, border: '1px solid ' + meta.color })}>
                {meta.emoji} {selectedLead.statut}
              </span>
            </div>
          </div>

          <div style={s.actionsRow}>
            <a href={telUrl} style={s.btnCall}>📞 Appeler</a>
            <a href={waUrl} target="_blank" rel="noreferrer" style={s.btnWa}>💬 WhatsApp</a>
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>CHANGER LE STATUT</div>
            <div style={s.statutGrid}>
              {STATUTS.map(function(s2) {
                var m = STATUT_META[s2] || { color: '#6b7280', emoji: '•' };
                var isActive = selectedLead.statut === s2;
                return (
                  <button
                    key={s2}
                    onClick={() => updateStatut(selectedLead.id, s2)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '600',
                      border: '1px solid ' + m.color,
                      background: isActive ? m.color : m.color + '15',
                      color: isActive ? '#fff' : m.color,
                    }}
                  >
                    {m.emoji} {s2}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>NOTE / COMMENTAIRE</div>
            <textarea
              value={commentaire}
              onChange={function(e) { setCommentaire(e.target.value); }}
              placeholder="Ajouter une note sur ce lead..."
              style={s.textarea}
              rows={4}
            />
            <button onClick={saveCommentaire} disabled={savingComment} style={s.btnSave}>
              {savingComment ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.logo}>Momtaz</div>
          <div style={s.logoSub}>Command Center</div>
        </div>
        <div style={s.badge}>{leads.length} leads</div>
      </div>

      <div style={s.filtresWrap}>
        {FILTRES.map(function(f) {
          return (
            <button
              key={f}
              onClick={() => setFiltre(f)}
              style={Object.assign({}, s.filtreBtn, {
                background: filtre === f ? '#00D4AA' : '#1A1D27',
                color: filtre === f ? '#000' : '#9ca3af',
                border: filtre === f ? '1px solid #00D4AA' : '1px solid #2a2d3a',
              })}
            >
              {f} ({counts[f] || 0})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={s.center}>Chargement...</div>
      ) : (
        <div style={s.liste}>
          {leadsFiltres.map(function(lead) {
            var m = STATUT_META[lead.statut] || { color: '#6b7280', emoji: '•' };
            return (
              <div key={lead.id} style={s.card} onClick={() => openLead(lead)}>
                <div style={s.cardTop}>
                  <div>
                    <div style={s.cardNom}>{lead.client_nom}</div>
                    <div style={s.cardProduit}>{lead.produit} — {lead.prix} MAD</div>
                  </div>
                  <span style={Object.assign({}, s.statutPill, { background: m.color + '22', color: m.color, border: '1px solid ' + m.color })}>
                    {m.emoji} {lead.statut}
                  </span>
                </div>
                <div style={s.cardBottom}>
                  <span style={s.cardInfo}>📍 {lead.ville}</span>
                  <span style={s.cardInfo}>📱 {lead.telephone}</span>
                  {lead.commentaire ? <span style={s.cardInfo}>💬 {lead.commentaire.substring(0, 30)}{lead.commentaire.length > 30 ? '...' : ''}</span> : null}
                </div>
              </div>
            );
          })}
          {leadsFiltres.length === 0 && (
            <div style={s.center}>Aucun lead pour ce filtre</div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: '#0B0D14', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { background: 'linear-gradient(135deg, #13151F, #1A1D27)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2a2d3a' },
  logo: { fontSize: '22px', fontWeight: '900', color: '#00D4AA', letterSpacing: '-0.5px' },
  logoSub: { fontSize: '11px', color: '#4b5563', marginTop: '2px', letterSpacing: '0.5px', textTransform: 'uppercase' },
  badge: { background: '#00D4AA22', color: '#00D4AA', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: '700', border: '1px solid #00D4AA44' },
  filtresWrap: { display: 'flex', gap: '8px', padding: '16px 24px', flexWrap: 'wrap', borderBottom: '1px solid #1e2130' },
  filtreBtn: { padding: '7px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' },
  liste: { padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' },
  card: { background: '#13151F', borderRadius: '14px', padding: '16px 20px', border: '1px solid #1e2130', cursor: 'pointer' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '12px' },
  cardNom: { fontSize: '16px', fontWeight: '700', color: '#f9fafb', marginBottom: '3px' },
  cardProduit: { fontSize: '13px', color: '#6b7280' },
  cardBottom: { display: 'flex', gap: '14px', flexWrap: 'wrap' },
  cardInfo: { fontSize: '12px', color: '#4b5563' },
  statutPill: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap' },
  center: { textAlign: 'center', padding: '60px', color: '#4b5563' },
  ficheNav: { background: '#13151F', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid #1e2130' },
  backBtn: { background: 'none', border: '1px solid #2a2d3a', color: '#9ca3af', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  ficheNavTitle: { fontSize: '15px', fontWeight: '700', color: '#f9fafb' },
  ficheBody: { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' },
  ficheCard: { background: '#13151F', borderRadius: '16px', padding: '20px', border: '1px solid #1e2130' },
  ficheNom: { fontSize: '22px', fontWeight: '800', color: '#f9fafb', marginBottom: '4px' },
  ficheProduit: { fontSize: '15px', color: '#00D4AA', fontWeight: '600', marginBottom: '12px' },
  ficheRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  ficheChip: { fontSize: '12px', color: '#6b7280', background: '#1A1D27', padding: '4px 10px', borderRadius: '8px', border: '1px solid #2a2d3a' },
  actionsRow: { display: 'flex', gap: '10px' },
  btnCall: { flex: 1, display: 'block', background: 'linear-gradient(135deg, #1f2937, #374151)', color: '#fff', padding: '15px', borderRadius: '12px', textAlign: 'center', textDecoration: 'none', fontSize: '15px', fontWeight: '700' },
  btnWa: { flex: 1, display: 'block', background: 'linear-gradient(135deg, #15803d, #166534)', color: '#fff', padding: '15px', borderRadius: '12px', textAlign: 'center', textDecoration: 'none', fontSize: '15px', fontWeight: '700' },
  section: { background: '#13151F', borderRadius: '16px', padding: '18px', border: '1px solid #1e2130' },
  sectionTitle: { fontSize: '11px', color: '#4b5563', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' },
  statutGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  textarea: { width: '100%', background: '#0B0D14', border: '1px solid #2a2d3a', borderRadius: '10px', color: '#f9fafb', padding: '12px', fontSize: '14px', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  btnSave: { marginTop: '10px', width: '100%', background: 'linear-gradient(135deg, #00D4AA, #00b894)', color: '#000', border: 'none', padding: '13px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
};
