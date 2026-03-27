// ==========================================
// EVENTS — HOUSE STAY EVENT JOURNAL
// ==========================================

const EVENT_TYPES = [
  { id: 'note', label: 'Note', emoji: '📝' },
  { id: 'problem', label: 'Problème', emoji: '⚠️' },
  { id: 'repair', label: 'Réparation', emoji: '🔧' },
  { id: 'delivery', label: 'Livraison', emoji: '📦' },
  { id: 'visitor', label: 'Visite', emoji: '👥' },
];

async function showEventsSheet(groupId) {
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>📝 Journal du séjour</h2>
      <div id="events-list" style="min-height:60px;margin-bottom:16px">
        <div style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale))">Chargement...</div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:16px">
        <div style="font-weight:600;font-size: calc(14px * var(--ui-text-scale));margin-bottom:10px">Ajouter une entrée</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          ${EVENT_TYPES.map(t => `<button class="btn" style="padding:6px 12px;font-size: calc(13px * var(--ui-text-scale));background:#f5f5f5;color:var(--text)" id="evtype-${t.id}" onclick="selectEventType('${t.id}')">${t.emoji} ${t.label}</button>`).join('')}
        </div>
        <textarea id="event-text" placeholder="Description..." rows="2" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size: calc(14px * var(--ui-text-scale));resize:none;margin-bottom:10px"></textarea>
        <button class="btn btn-primary" onclick="addEventEntry('${groupId}')">Ajouter</button>
      </div>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');

  // Select first event type by default
  selectEventType('note');

  // Load events
  await refreshEventsList(groupId);
}

let _selectedEventType = 'note';

function selectEventType(typeId) {
  _selectedEventType = typeId;
  EVENT_TYPES.forEach(t => {
    const btn = document.getElementById(`evtype-${t.id}`);
    if (btn) {
      btn.style.background = t.id === typeId ? 'var(--accent)' : '#f5f5f5';
      btn.style.color = t.id === typeId ? 'white' : 'var(--text)';
    }
  });
}

async function refreshEventsList(groupId) {
  const listEl = document.getElementById('events-list');
  if (!listEl) return;
  try {
    const snap = await evenementsSejourRef()
      .where('groupId', '==', groupId)
      .get();
    if (snap.empty) {
      listEl.innerHTML = '<div style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale))">Aucune entrée pour ce séjour.</div>';
      return;
    }
    listEl.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      const typeInfo = EVENT_TYPES.find(t => t.id === d.type) || EVENT_TYPES[0];
      const ts = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      return `<div style="background:#f8f9fa;border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span>${typeInfo.emoji}</span>
          <span style="font-weight:600;font-size: calc(13px * var(--ui-text-scale))">${typeInfo.label}</span>
          <span style="color:var(--text-light);font-size: calc(12px * var(--ui-text-scale));margin-left:auto">${ts}</span>
        </div>
        <div style="font-size: calc(14px * var(--ui-text-scale))">${d.description || ''}</div>
        <div style="color:var(--text-light);font-size: calc(12px * var(--ui-text-scale));margin-top:4px">${d.userName || ''}</div>
      </div>`;
    }).join('');
  } catch(e) {
    listEl.innerHTML = '<div style="color:var(--danger);font-size: calc(14px * var(--ui-text-scale))">Erreur de chargement.</div>';
  }
}

async function addEventEntry(groupId) {
  const text = (document.getElementById('event-text')?.value || '').trim();
  if (!text) { showToast('Entrez une description'); return; }
  try {
    await evenementsSejourRef().add({
      groupId,
      ressource_id: selectedResource,
      type: _selectedEventType,
      description: text,
      profil_id: currentUser?.id || null,
      userName: currentUser?.name || 'Anonyme',
      createdAt: ts()
    });
    document.getElementById('event-text').value = '';
    showToast('Entrée ajoutée ✓');
    await refreshEventsList(groupId);
  } catch(e) { showToast('Erreur — réessayez'); }
}
