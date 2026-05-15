import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./components/Login";

const STATUTS = [
  'À appeler', 'Confirmé', 'Injoignable',
  'Demande de rappel', 'Annulé', 'Pas intéressé', 'Numéro faux'
];

const STATUT_META = {
  'À appeler':        { color: '#3b82f6', emoji: '📋' },
  'Confirmé':         { color: '#16a34a', emoji: '✅' },
  'Injoignable':      { color: '#f59e0b', emoji: '📵' },
  'Demande de rappel':{ color: '#f97316', emoji: '🔔' },
  'Annulé':           { color: '#ef4444', emoji: '❌' },
  'Pas intéressé':    { color: '#6b7280', emoji: '🚫' },
  'Numéro faux':      { color: '#dc2626', emoji: '⚠️' },
};

const FILTRES = ['tous', 'À appeler', 'Confirmé', 'Injoignable', 'Demande de rappel', 'Annulé'];

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('tous');
  const [selectedLead, setSelectedLead] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch leads après login
  useEffect(() => {
    if (!session) return;
    fetchLeads();
    const channel = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchLeads)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session]);

  const role = session?.user?.user_metadata?.role || 'conseillere';
  const nom = session?.user?.user_metadata?.nom || session?.user?.email;

  async function fetchLeads() {
    let query = supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (role !== 'admin') {
      query = query.eq('conseillere', nom);
    }
    const { data, error } = await query;
    if (!error) setLeads(data);
    setLoading(false);
  }

  async function updateStatut(id, statut) {
    await supabase.from('leads').update({ statut }).eq('id', id);
    const webhookUrl = 'https://momtaz-webhook-production.up.railway.app/api/lead/' + id;
    await fetch(webhookUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut }),
    });
    if (selectedLead?.id === id) setSelectedLead({ ...selectedLead, statut });
  }

  async function saveCommentaire() {
    if (!selectedLead) return;
    setSavingComment(true);
    await supabase.from('leads').update({ commentaire }).eq('id', selectedLead.id);
    const webhookUrl = 'https://momtaz-webhook-production.up.railway.app/api/lead/' + selectedLead.id;
    await fetch(webhookUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentaire }),
    });
    setSavingComment(false);
    setSelectedLead({ ...selectedLead, commentaire });
  }

  function openLead(lead) {
    setSelectedLead(lead);
    setCommentaire(lead.commentaire || '');
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (authLoading) return <div style={{ color: '#fff', padding: '2rem' }}>Chargement...</div>;
  if (!session) return <Login />;

  const leadsFiltres = filtre === 'tous' ? leads : leads.filter(l => l.statut === filtre);

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#0F1117', minHeight: '100vh', color: '#fff' }}>

      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', background: '#1A1D27', borderBottom: '1px solid #333' }}>
        <span style={{ color: '#00D4AA', fontWeight: 700, fontSize: '1.1rem' }}>
          {role === 'admin' ? '👑 Admin — Momtaz' : `👤 ${nom}`}
        </span>
        <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid #555', color: '#aaa', padding: '0.3rem 0.8rem', borderRadius: '6px', cursor: 'pointer' }}>
          Déconnexion
        </button>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 53px)' }}>

        {/* Liste leads */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {/* Filtres */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {FILTRES.map(f => (
              <button key={f} onClick={() => setFiltre(f)} style={{
                padding: '0.3rem 0.8rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
                background: filtre === f ? '#00D4AA' : '#1A1D27', color: filtre === f ? '#000' : '#aaa', fontWeight: filtre === f ? 700 : 400
              }}>{f}</button>
            ))}
          </div>

          {loading ? <p style={{ color: '#aaa' }}>Chargement des leads...</p> : (
            leadsFiltres.map(lead => {
              const meta = STATUT_META[lead.statut] || {};
              return (
                <div key={lead.id} onClick={() => openLead(lead)} style={{
                  background: selectedLead?.id === lead.id ? '#1e2235' : '#1A1D27',
                  border: `1px solid ${selectedLead?.id === lead.id ? '#00D4AA' : '#2a2d3a'}`,
                  borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem', cursor: 'pointer'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{lead.telephone}</span>
                    <span style={{ color: meta.color, fontSize: '0.85rem' }}>{meta.emoji} {lead.statut}</span>
                  </div>
                  <div style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {lead.ville} {lead.conseillere ? `· ${lead.conseillere}` : ''}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Panneau lead sélectionné */}
        {selectedLead && (
          <div style={{ width: '340px', background: '#1A1D27', borderLeft: '1px solid #333', padding: '1.5rem', overflowY: 'auto' }}>
            <h3 style={{ color: '#00D4AA', marginTop: 0 }}>{selectedLead.telephone}</h3>
            <p style={{ color: '#aaa', fontSize: '0.9rem' }}>{selectedLead.ville} · {selectedLead.conseillere}</p>

            {/* Changement statut */}
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ color: '#fff', marginBottom: '0.5rem', fontWeight: 600 }}>Statut</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {STATUTS.map(s => {
                  const m = STATUT_META[s];
                  return (
                    <button key={s} onClick={() => updateStatut(selectedLead.id, s)} style={{
                      padding: '0.5rem', borderRadius: '6px', border: `1px solid ${selectedLead.statut === s ? m.color : '#333'}`,
                      background: selectedLead.statut === s ? m.color + '22' : 'transparent',
                      color: selectedLead.statut === s ? m.color : '#aaa', cursor: 'pointer', textAlign: 'left'
                    }}>
                      {m.emoji} {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Commentaire */}
            <div>
              <p style={{ color: '#fff', marginBottom: '0.5rem', fontWeight: 600 }}>Commentaire</p>
              <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
                style={{ width: '100%', minHeight: '80px', background: '#0F1117', border: '1px solid #333', borderRadius: '6px', color: '#fff', padding: '0.5rem', boxSizing: 'border-box', resize: 'vertical' }}
              />
              <button onClick={saveCommentaire} disabled={savingComment} style={{
                marginTop: '0.5rem', width: '100%', padding: '0.6rem', background: '#00D4AA', color: '#000',
                border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer'
              }}>
                {savingComment ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
