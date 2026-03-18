// ==========================================
// CHECKLIST — HOUSE CHECKIN / CHECKOUT
// ==========================================

const CHECKLIST_DEFS = {
  checkin: [
    { id: 'keys', label: 'Récupérer les clés' },
    { id: 'electricity', label: 'Vérifier l\'électricité' },
    { id: 'water', label: 'Vérifier l\'eau / chauffe-eau' },
    { id: 'heat', label: 'Régler le chauffage' },
    { id: 'wifi', label: 'Connecter le Wi-Fi' },
    { id: 'inventory', label: 'Faire l\'état des lieux' },
    { id: 'food', label: 'Vérifier le réfrigérateur / congélateur' },
    { id: 'windows', label: 'Ouvrir les volets / fenêtres' },
  ],
  checkout: [
    { id: 'clean_kitchen', label: 'Nettoyer la cuisine' },
    { id: 'clean_bathroom', label: 'Nettoyer la salle de bain' },
    { id: 'trash', label: 'Sortir les poubelles' },
    { id: 'laundry', label: 'Lancer la machine / ranger le linge' },
    { id: 'windows_close', label: 'Fermer les volets / fenêtres' },
    { id: 'heat_off', label: 'Couper le chauffage' },
    { id: 'water_off', label: 'Couper l\'eau si nécessaire' },
    { id: 'keys_return', label: 'Rendre les clés' },
  ]
};

async function showChecklistSheet(groupId, type) {
  const label = type === 'checkin' ? 'Arrivée' : 'Départ';
  const defs = CHECKLIST_DEFS[type] || [];

  // Load statuses
  let doneIds = new Set();
  try {
    const snap = await checklistStatutsRef().where('groupId', '==', groupId).get();
    snap.docs.filter(d => d.data().type === type).forEach(d => doneIds.add(d.data().itemId));
  } catch(e) {}

  const renderItems = () => defs.map(def => {
    const done = doneIds.has(def.id);
    return `<div class="checklist-item${done ? ' done' : ''}" onclick="toggleChecklistItem('${groupId}', '${type}', '${def.id}', this)">
      <span class="checklist-check">${done ? '✅' : '⬜'}</span>
      <span class="checklist-label">${def.label}</span>
    </div>`;
  }).join('');

  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Checklist ${label}</h2>
      <div id="checklist-items" style="display:flex;flex-direction:column;gap:4px;margin-bottom:20px">
        ${renderItems()}
      </div>
      <button class="btn" style="background:#f5f5f5;color:var(--text)" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function toggleChecklistItem(groupId, type, itemId, el) {
  const isDone = el.classList.contains('done');
  el.classList.toggle('done', !isDone);
  el.querySelector('.checklist-check').textContent = !isDone ? '✅' : '⬜';
  try {
    const docId = `${groupId}_${type}_${itemId}`;
    const ref = checklistStatutsRef().doc(docId);
    if (!isDone) {
      await ref.set({
        groupId, type, itemId,
        ressource_id: selectedResource,
        profil_id: currentUser?.id || null,
        doneAt: ts()
      });
    } else {
      await ref.delete();
    }
  } catch(e) {
    // Revert on error
    el.classList.toggle('done', isDone);
    el.querySelector('.checklist-check').textContent = isDone ? '✅' : '⬜';
    showToast('Erreur — réessayez');
  }
}
