import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const STATUT_COLORS = {
  'À appeler':         '#3b82f6',
  'Confirmé':          '#16a34a',
  'Injoignable':       '#f59e0b',
  'Demande de rappel': '#f97316',
  'Annulé':            '#ef4444',
  'Pas intéressé':     '#6b7280',
  'Numéro faux':       '#dc2626',
};

export default function App() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('tous');

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
      .limit(100);
    setLeads(data || []);
    setLoading(false);
  }

  const leadsFiltres = filtre === 'tous' ? leads : leads.filter(l => l.statut === filtre);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Momtaz</div>
          <div style={styles.subtitle}>Command Center</div>
        </div>
        <div style={styles.badge}>{leads.length} leads</div>
      </div>

      <div style={styles.filtres}>
        {['tous', 'À appeler', 'Confirmé', 'Injoignable', 'Demande de rappel', 'Annulé'].map(f => (
          <button key={f} onClick={() => setFiltre(f)} style={{
            ...styles.filtreBtn,
            background: filtre === f ? '#00D4AA' : '#1A1D27',
            color: filtre === f ? '#000' : '#aaa',
          }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.loading}>Chargement...</div>
      ) : (
        <div style={styles.liste}>
          {leadsFiltres.map(lead => (
            <div key={lead.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div>
                  <div style={styles.clientNom}>{lead.client_nom}</div>
                  <div style={styles.produit}>{lead.produit} — {lead.prix} MAD</div>
                </div>
                <div style={{ ...styles.statutBadge, background: STATUT_COLORS[lead.statut] || '#6b7280' }}>
                  {lead.statut}
                </div>
              </div>
              <div style={styles.cardBottom}>
                <span style={styles.info}>📍 {lead.ville}</span>
                <span style={styles.info}>📱 {lead.telephone}</span>
                <span style={styles.info}>🕐 {new Date(lead.created_at).toLocaleString('fr-FR')}</span>
              </div>
            </div>
          ))}
          {leadsFiltres.length === 0 && (
            <div style={styles.empty}>Aucun lead pour ce filtre</div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0F1117',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    background: '#1A1D27',
    padding: '20px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #2a2d3a',
  },
  title: { fontSize: '20px', fontWeight: '800', color: '#00D4AA' },
  subtitle: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  badge: {
    background: '#00D4AA22',
    color: '#00D4AA',
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '700',
  },
  filtres: {
    display: 'flex',
    gap: '8px',
    padding: '16px 24px',
    flexWrap: 'wrap',
    borderBottom: '1px solid #2a2d3a',
  },
  filtreBtn: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
  },
  liste: {
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    background: '#1A1D27',
    borderRadius: '14px',
    padding: '16px',
    border: '1px solid #2a2d3a',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  clientNom: { fontSize: '16px', fontWeight: '700', color: '#fff' },
  produit: { fontSize: '13px', color: '#9ca3af', marginTop: '3px' },
  statutBadge: {
    padding: '4px 10px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#fff',
    whiteSpace: 'nowrap',
  },
  cardBottom: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  info: { fontSize: '12px', color: '#6b7280' },
  loading: { textAlign: 'center', padding: '60px', color: '#6b7280' },
  empty: { textAlign: 'center', padding: '40px', color: '#6b7280' },
};
