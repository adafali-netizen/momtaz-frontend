import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import "./App.css";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const STATUTS = [
  'À appeler', 'Confirmé', 'Injoignable',
  'Demande de rappel', 'Annulé', 'Pas intéressé', 'Numéro faux'
];

const STATUT_META = {
  'À appeler':         { color: '#2563EB', bg: '#EFF6FF', emoji: '📋' },
  'Confirmé':          { color: '#16A34A', bg: '#F0FDF4', emoji: '✅' },
  'Injoignable':       { color: '#D97706', bg: '#FFFBEB', emoji: '📵' },
  'Demande de rappel': { color: '#7C3AED', bg: '#F5F3FF', emoji: '🔔' },
  'Annulé':            { color: '#DC2626', bg: '#FEF2F2', emoji: '❌' },
  'Pas intéressé':     { color: '#64748B', bg: '#F8FAFC', emoji: '🚫' },
  'Numéro faux':       { color: '#DC2626', bg: '#FEF2F2', emoji: '⚠️' },
};

const FILTRES = ['tous', 'À appeler', 'Confirmé', 'Injoignable', 'Demande de rappel', 'Annulé'];

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function StatusBadge({ statut }) {
  const m = STATUT_META[statut] || { color: '#64748B', bg: '#F8FAFC', emoji: '•' };
  return (
    <span className="status-badge" style={{ color: m.color, background: m.bg }}>
      {m.emoji} {statut}
    </span>
  );
}

function LeadCard({ lead, selected, onClick }) {
  return (
    <div className={`lead-card${selected ? ' selected' : ''}`} onClick={onClick}>
      <div className="card-main">
        <div className="lead-name">{lead.client_nom || 'Sans nom'}</div>
        <div className="lead-phone">{lead.telephone}</div>
      </div>
      <div className="card-badge">
        <StatusBadge statut={lead.statut} />
      </div>
      <div className="card-tags">
        {lead.ville   && <span className="tag">📍 {lead.ville}</span>}
        {lead.produit && <span className="tag produit">🛒 {lead.produit}</span>}
        {lead.source  && <span className="tag">🔗 {lead.source}</span>}
      </div>
    </div>
  );
}

function RightPanel({ lead, commentaire, setCommentaire, savingComment, onUpdateStatut, onSave, onClose }) {
  if (!lead) return (
    <aside className="right-panel">
      <div className="right-panel-empty">
        <div className="right-panel-empty-icon">👆</div>
        <div>Sélectionne un lead<br />pour voir sa fiche</div>
      </div>
    </aside>
  );

  return (
    <aside className="right-panel">

      {/* Header */}
      <div className="panel-header">
        <div className="panel-header-top">
          <div className="panel-name">{lead.client_nom || 'Sans nom'}</div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <StatusBadge statut={lead.statut} />
        <div style={{ marginTop: '8px' }}>
          <div className="panel-info-row">
            📞 <span className="panel-phone">{lead.telephone}</span>
          </div>
          {lead.ville && (
            <div className="panel-info-row">
              📍 {lead.ville}{lead.adresse ? ` — ${lead.adresse}` : ''}
            </div>
          )}
          {lead.conseillere && (
            <div className="panel-info-row">👤 {lead.conseillere}</div>
          )}
        </div>
      </div>

      <div className="panel-body">

        {/* Commande */}
        {lead.produit && (
          <div className="panel-section">
            <div className="panel-section-label">Commande</div>
            <div className="product-card">
              <div className="product-title">{lead.produit}</div>
              <div className="product-row">
                {lead.quantite && <span className="product-chip">Qté <strong>{lead.quantite}</strong></span>}
                {lead.prix     && <span className="product-chip">Prix <strong>{lead.prix} MAD</strong></span>}
                {lead.source   && <span className="product-chip">via <strong>{lead.source}</strong></span>}
              </div>
            </div>
          </div>
        )}

        {/* Statut */}
        <div className="panel-section">
          <div className="panel-section-label">Statut</div>
          <div className="status-grid">
            {STATUTS.map(s => {
              const m = STATUT_META[s];
              const isActive = lead.statut === s;
              return (
                <button
                  key={s}
                  className={`status-btn${isActive ? ' active' : ''}`}
                  onClick={() => onUpdateStatut(lead.id, s)}
                  style={isActive ? { borderColor: m.color + '50', background: m.bg, color: m.color } : {}}
                >
                  {m.emoji} {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Note */}
        <div className="panel-section">
          <div className="panel-section-label">Note opérateur</div>
          <textarea
            className="comment-area"
            value={commentaire}
            onChange={e => setCommentaire(e.target.value)}
            placeholder="Ajouter une note..."
          />
          <button className="btn-save" onClick={onSave} disabled={savingComment}>
            {savingComment ? '⏳ Sauvegarde...' : '💾 Sauvegarder'}
          </button>
        </div>

      </div>
    </aside>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession]         = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [leads, setLeads]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filtre, setFiltre]           = useState('tous');
  const [search, setSearch]           = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [commentaire, setCommentaire] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  // ── Auth (inchangé)
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

  // ── Realtime (inchangé)
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
  const nom  = session?.user?.user_metadata?.nom  || session?.user?.email;

  // ── Business logic (inchangé)
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

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
  }

  // ── Guards
  if (authLoading) return (
    <div className="loading-screen"><span className="loading-dot" /> Connexion...</div>
  );
  if (!session) return <Login />;

  // ── Filtering
  const countByFiltre = f => f === 'tous' ? leads.length : leads.filter(l => l.statut === f).length;

  const leadsFiltres = leads
    .filter(l => filtre === 'tous' || l.statut === filtre)
    .filter(l => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (l.client_nom  || '').toLowerCase().includes(q) ||
        (l.telephone   || '').includes(q) ||
        (l.ville       || '').toLowerCase().includes(q) ||
        (l.produit     || '').toLowerCase().includes(q)
      );
    });

  // ── Render
  return (
    <div className="app">

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-mark">M</div>
            Momtaz
          </div>
          <div className="header-stat">
            <strong>{leadsFiltres.length}</strong> leads affichés
          </div>
          <div className="header-stat">
            <strong>{countByFiltre('Confirmé')}</strong> confirmés
          </div>
        </div>
        <div className="header-right">
          <div className="user-pill">
            <span className={`role-badge${role === 'admin' ? ' admin' : ''}`}>
              {role === 'admin' ? '👑 Admin' : 'Agent'}
            </span>
            <span className="user-name">{nom}</span>
          </div>
          <button className="btn-logout" onClick={handleLogout}>Déconnexion</button>
        </div>
      </header>

      <div className="main-layout">

        {/* Left column — dominant */}
        <div className="left-col">

          {/* Search + filters */}
          <div className="toolbar">
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                type="text"
                placeholder="Rechercher par nom, téléphone, ville, produit..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="filter-tabs">
              {FILTRES.map(f => (
                <button
                  key={f}
                  className={`filter-tab${filtre === f ? ' active' : ''}`}
                  onClick={() => setFiltre(f)}
                >
                  {f}
                  <span className="filter-count">{countByFiltre(f)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Leads */}
          <div className="leads-list">
            {loading ? (
              <div className="state-wrap"><div className="spinner" /> Chargement...</div>
            ) : leadsFiltres.length === 0 ? (
              <div className="state-wrap">
                <span style={{ fontSize: '30px' }}>📭</span>
                Aucun résultat
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
        </div>

        {/* Right panel — secondary */}
        <RightPanel
          lead={selectedLead}
          commentaire={commentaire}
          setCommentaire={setCommentaire}
          savingComment={savingComment}
          onUpdateStatut={updateStatut}
          onSave={saveCommentaire}
          onClose={() => setSelectedLead(null)}
        />

      </div>
    </div>
  );
}
