import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import "./App.css";

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const STATUTS = [
  'À appeler', 'Confirmé', 'Injoignable',
  'Demande de rappel', 'Annulé', 'Pas intéressé', 'Numéro faux'
];

const STATUT_META = {
  'À appeler':         { color: '#3B82F6', bg: '#3B82F620', emoji: '📋' },
  'Confirmé':          { color: '#22C55E', bg: '#22C55E20', emoji: '✅' },
  'Injoignable':       { color: '#F59E0B', bg: '#F59E0B20', emoji: '📵' },
  'Demande de rappel': { color: '#8B5CF6', bg: '#8B5CF620', emoji: '🔔' },
  'Annulé':            { color: '#EF4444', bg: '#EF444420', emoji: '❌' },
  'Pas intéressé':     { color: '#64748B', bg: '#64748B20', emoji: '🚫' },
  'Numéro faux':       { color: '#EF4444', bg: '#EF444420', emoji: '⚠️' },
};

const FILTRES = ['tous', 'À appeler', 'Confirmé', 'Injoignable', 'Demande de rappel', 'Annulé'];

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function StatusBadge({ statut }) {
  const m = STATUT_META[statut] || { color: '#94A3C4', bg: '#94A3C420', emoji: '•' };
  return (
    <span className="status-badge" style={{ color: m.color, background: m.bg }}>
      {m.emoji} {statut}
    </span>
  );
}

function LeadCard({ lead, selected, onClick }) {
  return (
    <div className={`lead-card${selected ? ' selected' : ''}`} onClick={onClick}>
      <div className="lead-card-top">
        <div>
          <div className="lead-name">{lead.client_nom || 'Sans nom'}</div>
          <div className="lead-phone">{lead.telephone}</div>
        </div>
        <StatusBadge statut={lead.statut} />
      </div>
      <div className="lead-card-bottom">
        {lead.ville && <span className="tag ville">📍 {lead.ville}</span>}
        {lead.produit && <span className="tag produit">🛒 {lead.produit}</span>}
        {lead.source && <span className="tag">🔗 {lead.source}</span>}
      </div>
    </div>
  );
}

function DetailPanel({ lead, commentaire, setCommentaire, savingComment, onUpdateStatut, onSaveCommentaire, onClose }) {
  if (!lead) return null;

  return (
    <aside className="detail-panel">
      <div className="detail-panel-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="detail-panel-title">{lead.client_nom || 'Sans nom'}</div>
            <div style={{ marginTop: '6px' }}><StatusBadge statut={lead.statut} /></div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--muted2)',
            cursor: 'pointer', fontSize: '20px', padding: '0 4px', lineHeight: 1
          }}>×</button>
        </div>
        <div className="detail-panel-sub">
          <span className="detail-info-row">📞 <span style={{ fontFamily: 'JetBrains Mono', fontSize: '12px', color: 'var(--cyan)' }}>{lead.telephone}</span></span>
          {lead.ville && <span className="detail-info-row">📍 {lead.ville}{lead.adresse ? ` — ${lead.adresse}` : ''}</span>}
          {lead.conseillere && <span className="detail-info-row">👤 {lead.conseillere}</span>}
        </div>
      </div>

      <div className="detail-panel-body">

        {lead.produit && (
          <div className="detail-section">
            <div className="detail-section-label">Commande</div>
            <div className="product-block">
              <div className="product-name">{lead.produit}</div>
              <div className="product-meta">
                {lead.quantite && <div className="product-meta-item">Qté : <span>{lead.quantite}</span></div>}
                {lead.prix && <div className="product-meta-item">Prix : <span>{lead.prix} MAD</span></div>}
                {lead.source && <div className="product-meta-item">Source : <span>{lead.source}</span></div>}
              </div>
            </div>
          </div>
        )}

        <div className="detail-section">
          <div className="detail-section-label">Changer le statut</div>
          <div className="status-grid">
            {STATUTS.map(s => {
              const m = STATUT_META[s];
              const isActive = lead.statut === s;
              return (
                <button
                  key={s}
                  className={`status-btn${isActive ? ' active' : ''}`}
                  onClick={() => onUpdateStatut(lead.id, s)}
                  style={isActive ? { borderColor: m.color + '80', background: m.bg, color: m.color } : {}}
                >
                  <span>{m.emoji}</span>
                  <span>{s}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-label">Note opérateur</div>
          <textarea
            className="comment-textarea"
            value={commentaire}
            onChange={e => setCommentaire(e.target.value)}
            placeholder="Ajouter une note sur ce lead..."
          />
          <button className="btn-save" onClick={onSaveCommentaire} disabled={savingComment}>
            {savingComment ? '⏳ Sauvegarde...' : '💾 Sauvegarder la note'}
          </button>
        </div>

      </div>
    </aside>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('tous');
  const [selectedLead, setSelectedLead] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  const [savingComment, setSavingComment] = useState(false);

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
    if (role !== 'admin') query = query.eq('conseillere', nom);
    const { data, error } = await query;
    if (!error) setLeads(data);
    setLoading(false);
  }

  async function updateStatut(id, statut) {
    await supabase.from('leads').update({ statut }).eq('id', id);
    await fetch('https://momtaz-webhook-production.up.railway.app/api/lead/' + id, {
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
    await fetch('https://momtaz-webhook-production.up.railway.app/api/lead/' + selectedLead.id, {
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

  if (authLoading) return (
    <div className="loading-screen">
      <span className="loading-dot" />
      Connexion en cours...
    </div>
  );
  if (!session) return <Login />;

  const leadsFiltres = filtre === 'tous' ? leads : leads.filter(l => l.statut === filtre);
  const countByFiltre = (f) => f === 'tous' ? leads.length : leads.filter(l => l.statut === f).length;

  return (
    <div className="app">

      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-dot" />
            Momtaz
          </div>
          <div className="header-divider" />
          <span className="leads-counter">
            <span>{leadsFiltres.length}</span> leads
          </span>
        </div>
        <div className="header-right">
          <div className="user-badge">
            <span className={`role-tag${role === 'admin' ? ' admin' : ''}`}>
              {role === 'admin' ? '👑 Admin' : 'Agent'}
            </span>
            <span className="user-name">{nom}</span>
          </div>
          <button className="btn-logout" onClick={handleLogout}>Déconnexion</button>
        </div>
      </header>

      <div className="filter-bar">
        {FILTRES.map(f => (
          <button
            key={f}
            className={`filter-btn${filtre === f ? ' active' : ''}`}
            onClick={() => setFiltre(f)}
          >
            {f} <span className="count">{countByFiltre(f)}</span>
          </button>
        ))}
      </div>

      <div className="main-layout">
        <div className="leads-panel">
          {loading ? (
            <div className="state-loading">
              <div className="spinner" />
              Chargement des leads...
            </div>
          ) : leadsFiltres.length === 0 ? (
            <div className="state-empty">
              <span style={{ fontSize: '32px' }}>📭</span>
              Aucun lead pour ce filtre
            </div>
          ) : (
            leadsFiltres.map(lead => (
              <LeadCard
                key={lead.id}
                lead={lead}
                selected={selectedLead?.id === lead.id}
                onClick={() => openLead(lead)}
              />
            ))
          )}
        </div>

        <DetailPanel
          lead={selectedLead}
          commentaire={commentaire}
          setCommentaire={setCommentaire}
          savingComment={savingComment}
          onUpdateStatut={updateStatut}
          onSaveCommentaire={saveCommentaire}
          onClose={() => setSelectedLead(null)}
        />
      </div>
    </div>
  );
}
