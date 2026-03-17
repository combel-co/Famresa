// ==========================================
// RESOURCES — MULTI-RESOURCE SUPPORT
// ==========================================

// Roles map: resourceId → role ('admin'|'member'|'guest')
window._myResourceRoles = {};

// Load resources from Firestore (replaces loadCars)
// Reads from 'resources' collection; auto-migrates from 'cars' if empty
async function loadResources() {
  try {
    let snap = await familyRef().collection('resources').orderBy('name').get();

    if (snap.empty) {
      // Migrate cars → resources
      const carsSnap = await familyRef().collection('cars').get();
      if (!carsSnap.empty) {
        const batch = db.batch();
        carsSnap.forEach(doc => {
          const ref = familyRef().collection('resources').doc(doc.id);
          batch.set(ref, { ...doc.data(), type: 'car' }, { merge: true });
        });
        await batch.commit();
        snap = await familyRef().collection('resources').orderBy('name').get();
      }
    }

    let allResources = [];
    snap.forEach(doc => allResources.push({ id: doc.id, ...doc.data() }));

    if (allResources.length === 0) {
      const ref = await familyRef().collection('resources').add({
        name: 'Voiture familiale', emoji: '🚗', type: 'car', fuelLevel: null
      });
      allResources = [{ id: ref.id, name: 'Voiture familiale', emoji: '🚗', type: 'car', fuelLevel: null }];
    }

    // Ensure all resources have a type
    allResources = allResources.map(r => ({ ...r, type: r.type || 'car' }));

    // ── Resource Access Check ──
    const myAccessEntries = await getMyResourceAccessEntries(currentUser.id, currentUser.familyId);

    if (myAccessEntries.length === 0) {
      // No access entries yet → migrate: grant access to all existing resources
      const familyDoc = await familyRef().get();
      const isAdmin = familyDoc.exists && familyDoc.data().created_by === currentUser.id;
      const role = isAdmin ? 'admin' : 'member';
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const batch = db.batch();
      for (const res of allResources) {
        const ref = db.collection('resource_access').doc();
        batch.set(ref, {
          resourceId: res.id, profileId: currentUser.id,
          familyId: currentUser.familyId, role, status: 'accepted',
          invited_at: now, accepted_at: now
        });
        window._myResourceRoles[res.id] = role;
      }
      await batch.commit();
      resources = allResources;
    } else {
      // Filter resources by accepted access entries
      window._myResourceRoles = {};
      myAccessEntries.forEach(e => { window._myResourceRoles[e.resourceId] = e.role; });
      const acceptedIds = new Set(myAccessEntries.filter(e => e.status === 'accepted').map(e => e.resourceId));
      resources = allResources.filter(r => acceptedIds.has(r.id));
    }

    if (resources.length === 0) {
      renderNoAccessState();
      return;
    }

    selectedResource = resources[0].id;
    renderResourceTabs();
    subscribeBookings();
    subscribeFuelReports();
  } catch (e) {
    console.error('Firebase error:', e);
    document.getElementById('cal-grid').innerHTML =
      '<div class="loading" style="flex-direction:column;gap:8px;color:var(--danger)">⚠️ Connexion impossible<br><small style="color:var(--text-light)">Vérifiez votre connexion ou Firebase.</small></div>';
  }
}

// Show waiting state when user has no accessible resources
function renderNoAccessState() {
  const tabsEl = document.getElementById('resource-tabs');
  if (tabsEl) tabsEl.innerHTML = '';

  const mainCard = document.getElementById('resource-main-card');
  if (mainCard) {
    mainCard.innerHTML = `
      <div style="padding:40px 24px;text-align:center">
        <div style="font-size:52px;margin-bottom:16px">⏳</div>
        <div style="font-weight:700;font-size:20px;margin-bottom:8px">En attente d'accès</div>
        <div style="color:var(--text-light);font-size:14px;line-height:1.6;margin-bottom:24px">
          Tu es membre de la famille, mais tu n'as pas encore accès à une ressource.<br>
          Demande à un admin de t'envoyer un lien d'invitation spécifique.
        </div>
        <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:12px;padding:16px;font-size:13px;color:#4338ca;line-height:1.5">
          🔗 L'admin doit aller dans Profil → ressource → <strong>Inviter</strong>
        </div>
      </div>`;
  }

  const upcomingLabel = document.getElementById('upcoming-label');
  if (upcomingLabel) upcomingLabel.style.display = 'none';
  const upcomingBookings = document.getElementById('upcoming-bookings');
  if (upcomingBookings) upcomingBookings.innerHTML = '';
}

// ==========================================
// RESOURCE TABS RENDER
// ==========================================
function renderResourceTabs() {
  const container = document.getElementById('resource-tabs');
  if (!container) return;

  const todayStr = new Date().toISOString().slice(0, 10);

  const pills = resources.map(res => {
    const isActive = res.id === selectedResource;
    const isAvailable = !bookings[todayStr] || (bookings[todayStr] && bookings[todayStr].resourceId !== res.id);
    const dotCls = `resource-pill-dot${isAvailable ? ' available' : ''}`;
    const cls = `resource-tab${isActive ? ' active' : ''}`;
    return `<div class="${cls}" onclick="selectResource('${res.id}')">
      <div class="${dotCls}"></div>
      <span>${res.name}</span>
    </div>`;
  });

  pills.push(`<div class="resource-tab" onclick="showAddResourceSheet()">
    <span>+ Ajouter</span>
  </div>`);

  container.innerHTML = pills.join('');
}

function selectResourceType(type) {
  const match = resources.find(r => (type === 'house' ? r.type === 'house' : r.type !== 'house'));
  if (match) selectResource(match.id);
}

// ==========================================
// SELECT RESOURCE
// ==========================================
function selectResource(resourceId) {
  selectedResource = resourceId;
  renderResourceTabs();
  if (unsubscribe) unsubscribe();
  subscribeBookings();
  // Re-render calendar badge
  const activeRes = resources.find(r => r.id === resourceId);
  const badge = document.getElementById('active-car-badge');
  if (badge && activeRes) {
    badge.textContent = `${activeRes.emoji || '🚗'} ${activeRes.name}`;
    badge.disabled = resources.length <= 1;
  }
  // Adapt dashboard for resource type
  renderCalendar();
  renderExperiencePanels();
}

// Kept for backward compatibility with calendar car badge click
function cycleCar() {
  if (resources.length <= 1) return;
  const currentIndex = resources.findIndex(r => r.id === selectedResource);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % resources.length : 0;
  selectResource(resources[nextIndex].id);
  showToast(`Ressource active : ${resources[nextIndex].name}`);
}

// ==========================================
// BOOKINGS SUBSCRIPTION
// ==========================================
function subscribeBookings() {
  if (unsubscribe) unsubscribe();

  // Query by resourceId (new), but also by carId (legacy) — merge results
  const snap1 = familyRef().collection('bookings')
    .where('resourceId', '==', selectedResource)
    .onSnapshot(handleBookingsSnapshot);

  // Also subscribe to legacy carId bookings (for backward compat during migration window)
  let snap2 = null;
  const hasLegacy = resources.some(r => r.id === selectedResource && r.type === 'car');
  if (hasLegacy) {
    snap2 = familyRef().collection('bookings')
      .where('carId', '==', selectedResource)
      .onSnapshot(snap => {
        // Merge with existing bookings (only add new entries)
        snap.forEach(doc => {
          const d = { id: doc.id, ...doc.data() };
          // Skip if already loaded via resourceId subscription
          if (d.resourceId && d.resourceId === selectedResource) return;
          expandBookingToMap(d);
        });
        renderCalendar();
        renderExperiencePanels();
        if (document.getElementById('booking-modal')?.classList.contains('open')) renderBmCalendar();
      });
  }

  unsubscribe = () => {
    snap1();
    if (snap2) snap2();
  };
}

function handleBookingsSnapshot(snap) {
  bookings = {};
  snap.forEach(doc => {
    const d = { id: doc.id, ...doc.data() };
    expandBookingToMap(d);
  });
  renderCalendar();
  renderExperiencePanels();
  if (document.getElementById('booking-modal')?.classList.contains('open')) renderBmCalendar();
}

function expandBookingToMap(d) {
  if (d.startDate && d.endDate) {
    let cur = new Date(d.startDate + 'T00:00:00');
    const end = new Date(d.endDate + 'T00:00:00');
    while (cur <= end) {
      const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
      bookings[ds] = d;
      cur.setDate(cur.getDate() + 1);
    }
  } else if (d.date) {
    bookings[d.date] = d;
  }
}

function subscribeFuelReports() {
  fuelReportsByBooking = {};
}

// ==========================================
// ADD RESOURCE
// ==========================================
function showAddResourceSheet() {
  let selectedType = 'car';
  let selectedEmoji = '🚗';
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Ajouter une ressource</h2>
      <p style="color:var(--text-light);font-size:14px;margin-bottom:20px">Voiture, maison ou autre bien partagé</p>
      <div style="display:flex;gap:12px;margin-bottom:20px">
        <button id="type-car-btn" class="btn btn-primary" style="flex:1;padding:12px" onclick="setResourceType('car', this)">🚗 Voiture</button>
        <button id="type-house-btn" class="btn btn-outline" style="flex:1;padding:12px" onclick="setResourceType('house', this)">🏠 Maison</button>
      </div>
      <div class="input-group">
        <label>Nom</label>
        <input type="text" id="add-res-name" placeholder="Ex: Clio, Maison Bretagne..." autocomplete="off">
      </div>
      <div class="lock-error" id="add-res-error"></div>
      <button class="btn btn-primary" style="margin-top:8px" onclick="confirmAddResource()">Ajouter</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Annuler</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

function setResourceType(type, btn) {
  document.getElementById('type-car-btn').className = 'btn btn-outline';
  document.getElementById('type-house-btn').className = 'btn btn-outline';
  btn.className = 'btn btn-primary';
  // Store on a data attribute since we're in inline HTML context
  document.getElementById('add-res-name').dataset.type = type;
}

async function confirmAddResource() {
  const nameInput = document.getElementById('add-res-name');
  const name = (nameInput?.value || '').trim();
  const type = nameInput?.dataset.type || 'car';
  const errEl = document.getElementById('add-res-error');
  if (!name) { if (errEl) errEl.textContent = 'Entrez un nom'; return; }
  try {
    const emoji = type === 'house' ? '🏠' : '🚗';
    const ref = await familyRef().collection('resources').add({
      name, type, emoji,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const newRes = { id: ref.id, name, type, emoji };
    resources.push(newRes);

    // Auto-grant admin access to the creator
    const now = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('resource_access').add({
      resourceId: ref.id, profileId: currentUser.id,
      familyId: currentUser.familyId, role: 'admin',
      status: 'accepted', invited_at: now, accepted_at: now
    });
    if (!window._myResourceRoles) window._myResourceRoles = {};
    window._myResourceRoles[ref.id] = 'admin';

    closeSheet();
    selectResource(ref.id);
    showToast(`${emoji} ${name} ajouté(e)`);
  } catch(e) { if (errEl) errEl.textContent = 'Erreur — réessayez'; }
}

// ==========================================
// CAR INFO SHEET (adapted for resources)
// ==========================================
async function showCarInfo() {
  const res = resources.find(r => r.id === selectedResource);
  if (!res) return;
  if (res.type === 'house') { showHouseInfo(); return; }
  const plaque = res.plaque || '';
  const assurance = res.assurance || '';
  const observations = res.observations || '';
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <div style="font-size:52px;line-height:1;margin-bottom:8px;filter:drop-shadow(0 4px 10px rgba(37,99,235,0.15))">${res.emoji || '🚗'}</div>
      <h2 style="margin:0 0 4px">${res.name}</h2>
      ${plaque ? `<div style="display:inline-block;font-size:12px;font-weight:700;color:var(--accent);background:rgba(99,102,241,0.10);border:1px solid rgba(99,102,241,0.18);border-radius:6px;padding:3px 10px;letter-spacing:0.5px;margin-bottom:20px">${plaque}</div>` : '<div style="margin-bottom:20px"></div>'}
      <div class="input-group">
        <label>Plaque d'immatriculation</label>
        <input type="text" id="car-plaque" placeholder="Ex: AB-123-CD" value="${plaque}" style="text-transform:uppercase">
      </div>
      <div class="input-group">
        <label>Assurance</label>
        <input type="text" id="car-assurance" placeholder="Compagnie / n° de contrat" value="${assurance}">
      </div>
      <div class="input-group">
        <label>Observations</label>
        <textarea id="car-observations" placeholder="Carrosserie, entretien, notes..." rows="3" style="resize:none;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;width:100%">${observations}</textarea>
      </div>
      <button class="btn btn-primary" onclick="saveCarInfo()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function saveCarInfo() {
  const plaque = (document.getElementById('car-plaque')?.value || '').trim().toUpperCase();
  const assurance = (document.getElementById('car-assurance')?.value || '').trim();
  const observations = (document.getElementById('car-observations')?.value || '').trim();
  try {
    await familyRef().collection('resources').doc(selectedResource).update({ plaque, assurance, observations });
    // Also update legacy cars collection
    try { await familyRef().collection('cars').doc(selectedResource).update({ plaque, assurance, observations }); } catch(e) {}
    const res = resources.find(r => r.id === selectedResource);
    if (res) Object.assign(res, { plaque, assurance, observations });
    closeSheet();
    showToast('Infos enregistrées ✓');
  } catch(e) { showToast('Erreur — réessayez'); }
}

// ==========================================
// CALENDAR BADGE (backward compat)
// ==========================================
function renderCarSelector() {
  const badge = document.getElementById('active-car-badge');
  if (!badge) return;
  if (resources.length === 0 || !selectedResource) {
    badge.textContent = '🚗 Aucune ressource';
    badge.disabled = true;
    return;
  }
  const active = resources.find(r => r.id === selectedResource) || resources[0];
  badge.textContent = `${active.emoji || '🚗'} ${active.name}`;
  badge.disabled = resources.length <= 1;
}

// ==========================================
// HOUSE INFO
// ==========================================
function showHouseInfo() {
  const res = resources.find(r => r.id === selectedResource);
  if (!res) return;
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Info maison</h2>
      <div style="color:var(--text-light);font-size:13px;margin-bottom:20px">${res.emoji || '🏠'} ${res.name}</div>
      <div class="input-group">
        <label>Adresse</label>
        <input type="text" id="house-address" placeholder="123 rue..." value="${res.address || ''}">
      </div>
      <div class="input-group">
        <label>Observations</label>
        <textarea id="house-observations" placeholder="Notes importantes..." rows="3" style="resize:none;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;width:100%">${res.observations || ''}</textarea>
      </div>
      <button class="btn btn-primary" onclick="saveHouseInfo()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function saveHouseInfo() {
  const address = (document.getElementById('house-address')?.value || '').trim();
  const observations = (document.getElementById('house-observations')?.value || '').trim();
  try {
    await familyRef().collection('resources').doc(selectedResource).update({ address, observations });
    const res = resources.find(r => r.id === selectedResource);
    if (res) Object.assign(res, { address, observations });
    closeSheet();
    showToast('Infos maison enregistrées ✓');
  } catch(e) { showToast('Erreur — réessayez'); }
}

// ==========================================
// RESOURCE INVITE & ACCESS MANAGEMENT
// ==========================================
function _generateResourceInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function _getOrCreateResourceInviteCode(resourceId) {
  const res = resources.find(r => r.id === resourceId);
  if (res?.inviteCode) return res.inviteCode;
  const code = _generateResourceInviteCode();
  await familyRef().collection('resources').doc(resourceId).update({ inviteCode: code });
  if (res) res.inviteCode = code;
  return code;
}

async function showResourceAccessSheet(resourceId) {
  const res = resources.find(r => r.id === resourceId);
  if (!res) return;
  const role = window._myResourceRoles?.[resourceId];
  if (role !== 'admin') { showToast('Accès admin requis'); return; }

  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Accès · ${res.emoji || ''} ${res.name}</h2>
      <p style="color:var(--text-light);font-size:14px;margin-bottom:16px">Invitez des membres par lien spécifique à cette ressource.</p>
      <div id="resource-invite-section">
        <div style="color:var(--text-light);font-size:13px;text-align:center;padding:12px">Chargement...</div>
      </div>
      <div id="pending-requests-section" style="margin-top:20px"></div>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:16px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');

  const code = await _getOrCreateResourceInviteCode(resourceId);
  const link = `${location.origin}${location.pathname}?resource_join=${code}`;
  document.getElementById('resource-invite-section').innerHTML = `
    <div class="input-group">
      <label>Lien d'invitation</label>
      <div style="display:flex;gap:8px;align-items:stretch">
        <input type="text" value="${link}" readonly style="font-size:11px;flex:1;background:#f8f9fa;color:var(--text-light)">
        <button class="btn btn-primary" style="padding:10px 14px;white-space:nowrap;font-size:13px"
          onclick="navigator.clipboard?.writeText('${link}').then(()=>showToast('Lien copié !'))">Copier</button>
      </div>
    </div>`;

  const allEntries = await getAccessEntriesForResource(resourceId);
  const pending = allEntries.filter(e => e.status === 'pending');
  const accepted = allEntries.filter(e => e.status === 'accepted' && e.profileId !== currentUser.id);
  const pendingEl = document.getElementById('pending-requests-section');

  let html = '';
  if (pending.length) {
    // Load user names for pending
    const userNames = {};
    await Promise.all(pending.map(async item => {
      try {
        const memberDoc = await familyRef().collection('members').doc(item.profileId).get();
        userNames[item.profileId] = memberDoc.exists ? (memberDoc.data().name || item.profileId) : item.profileId;
      } catch(e) { userNames[item.profileId] = item.profileId; }
    }));

    html += `<div style="font-weight:700;font-size:14px;margin-bottom:8px">⏳ Demandes en attente (${pending.length})</div>`;
    html += pending.map(item => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;margin-bottom:8px">
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">${userNames[item.profileId] || item.profileId}</div>
          <div style="font-size:11px;color:var(--text-light)">Demande en attente</div>
        </div>
        <button class="btn btn-primary" style="padding:6px 10px;font-size:12px"
          onclick="approveResourceAccess('${item.id}','${userNames[item.profileId] || ''}')">✓ Approuver</button>
        <button class="btn btn-danger" style="padding:6px 10px;font-size:12px"
          onclick="rejectResourceAccess('${item.id}')">✕</button>
      </div>`).join('');
  }

  if (accepted.length) {
    html += `<div style="font-weight:700;font-size:14px;margin-top:12px;margin-bottom:8px">✓ Membres avec accès</div>`;
    html += accepted.map(item => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin-bottom:6px">
        <div style="flex:1;font-size:13px;font-weight:500">${item.profileId}</div>
        <div style="font-size:11px;color:#16a34a;font-weight:600">${item.role}</div>
      </div>`).join('');
  }

  if (!pending.length && !accepted.length) {
    html = '<div style="color:var(--text-light);font-size:13px">Aucun membre invité pour l'instant.</div>';
  }

  pendingEl.innerHTML = html;
}

async function approveResourceAccess(accessId, userName) {
  try {
    await updateResourceAccessStatus(accessId, 'accepted');
    showToast(`Accès approuvé${userName ? ' pour ' + userName : ''} ✓`);
    closeSheet();
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function rejectResourceAccess(accessId) {
  try {
    await updateResourceAccessStatus(accessId, 'rejected');
    showToast('Demande refusée');
    closeSheet();
  } catch(e) { showToast('Erreur — réessayez'); }
}

// Called when user visits ?resource_join=CODE (after being logged in)
async function handleResourceJoinCode(code) {
  if (!currentUser?.familyId) return;
  try {
    const snap = await familyRef().collection('resources').where('inviteCode', '==', code).limit(1).get();
    if (snap.empty) { showToast('Lien invalide ou expiré'); return; }
    const resourceId = snap.docs[0].id;

    // Check for existing access entry
    const existing = await db.collection('resource_access')
      .where('resourceId', '==', resourceId)
      .where('profileId', '==', currentUser.id)
      .limit(1).get();

    if (!existing.empty) {
      const status = existing.docs[0].data().status;
      if (status === 'accepted') { showToast('Tu as déjà accès à cette ressource'); return; }
      if (status === 'pending') { showToast('Ta demande est déjà en attente d'approbation'); return; }
    }

    await db.collection('resource_access').add({
      resourceId, profileId: currentUser.id, familyId: currentUser.familyId,
      role: 'member', status: 'pending',
      invited_at: firebase.firestore.FieldValue.serverTimestamp(),
      accepted_at: null
    });
    showToast('Demande envoyée — en attente d'approbation par l'admin');
  } catch(e) { console.error(e); showToast('Erreur — réessayez'); }
}
