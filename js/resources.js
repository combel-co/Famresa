// ==========================================
// RESOURCES — MULTI-RESOURCE SUPPORT
// ==========================================

// Roles map: resourceId → role ('admin'|'member'|'guest')
window._myResourceRoles = {};

// Load resources — reads from new 'ressources' collection with fallback to legacy
async function loadResources() {
  try {
    const familyId = currentUser.familyId;

    // ── 1. Load resources (new collection first, legacy fallback) ──
    let allResources = [];
    try {
      allResources = await getFamilleRessources(familyId);
    } catch(_) {}

    if (allResources.length === 0) {
      // Fallback: legacy families/{id}/resources then cars
      try {
        const snap = await db.collection('families').doc(familyId).collection('resources').get();
        snap.forEach(d => allResources.push({ id: d.id, ...d.data() }));
      } catch(_) {}
    }
    if (allResources.length === 0) {
      try {
        const snap = await db.collection('families').doc(familyId).collection('cars').get();
        snap.forEach(d => allResources.push({ id: d.id, type: 'car', ...d.data() }));
      } catch(_) {}
    }

    // Normalise field names
    allResources = allResources.map(r => ({
      ...r,
      name: r.name || r.nom || 'Ressource',
      type: r.type || 'car'
    }));

    // If no resources exist, show the resource choice screen instead of auto-creating
    if (allResources.length === 0) {
      showResourceChoiceSheet();
      return;
    }

    // ── 2. Access check (new collection first, legacy fallback) ──
    let myAccessEntries = [];
    try {
      myAccessEntries = await getMyResourceAccessEntries(currentUser.id, familyId);
    } catch(_) {}

    if (myAccessEntries.length === 0) {
      // Fallback: legacy resource_access
      try {
        const snap = await db.collection('resource_access').where('profileId', '==', currentUser.id).get();
        snap.forEach(d => myAccessEntries.push(accesRessourceToJS(d.data(), d.id)));
        myAccessEntries = myAccessEntries.filter(e => e.familyId === familyId || e.famille_id === familyId);
      } catch(_) {}
    }

    if (myAccessEntries.length === 0 && allResources.length > 0) {
      // No access records yet — determine role from family created_by
      let role = 'member';
      try {
        let famDoc = null;
        try {
          const d = await db.collection('families').doc(familyId).get();
          if (d.exists) famDoc = d;
        } catch(_) {}
        if (!famDoc) {
          try {
            const d = await familleRef(familyId).get();
            if (d.exists) famDoc = d;
          } catch(_) {}
        }
        if (famDoc && famDoc.data().created_by === currentUser.id) role = 'admin';
      } catch(_) {}

      // Try writing to new collection; silently ignore if not permitted yet
      try {
        const batch = db.batch();
        for (const res of allResources) {
          batch.set(accesRessourceRef().doc(), {
            ressource_id: res.id, profil_id: currentUser.id,
            famille_id: familyId, role, statut: 'accepted',
            invited_at: ts(), accepted_at: ts()
          });
        }
        await batch.commit();
      } catch(_) {}

      allResources.forEach(r => { window._myResourceRoles[r.id] = role; });
      resources = allResources;
    } else if (myAccessEntries.length > 0) {
      window._myResourceRoles = {};
      myAccessEntries.forEach(e => {
        const rid = e.ressource_id || e.resourceId;
        window._myResourceRoles[rid] = e.role;
      });
      const acceptedIds = new Set(
        myAccessEntries
          .filter(e => (e.statut ?? e.status) === 'accepted')
          .map(e => e.ressource_id || e.resourceId)
      );
      resources = allResources.filter(r => acceptedIds.has(r.id));
      // If none match (e.g. access entries from old IDs), grant all
      if (resources.length === 0 && allResources.length > 0) {
        resources = allResources;
        // Preserve the best role from existing access entries instead of defaulting to 'member'
        const existingRoles = Object.values(window._myResourceRoles);
        const bestRole = existingRoles.includes('admin') ? 'admin'
          : existingRoles.includes('member') ? 'member' : 'guest';
        allResources.forEach(r => { window._myResourceRoles[r.id] = bestRole; });
      }
    } else {
      resources = allResources;
      allResources.forEach(r => { window._myResourceRoles[r.id] = 'member'; });
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
    console.error('Firebase error (loadResources):', e);
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

// Show resource choice sheet when a new family has no resources yet
function showResourceChoiceSheet() {
  // Render an empty main card state while the sheet is shown
  const tabsEl = document.getElementById('resource-tabs');
  if (tabsEl) tabsEl.innerHTML = '';

  const mainCard = document.getElementById('resource-main-card');
  if (mainCard) {
    mainCard.innerHTML = `
      <div style="padding:40px 24px;text-align:center">
        <div style="font-size:52px;margin-bottom:16px">🏁</div>
        <div style="font-weight:700;font-size:20px;margin-bottom:8px">Bienvenue !</div>
        <div style="color:var(--text-light);font-size:14px;line-height:1.6">
          Pour commencer, créez une ressource ou rejoignez-en une existante.
        </div>
      </div>`;
  }

  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Première ressource</h2>
      <p style="color:var(--text-light);font-size:14px;margin-bottom:20px">
        Que souhaitez-vous faire ?
      </p>
      <button class="btn btn-primary" style="width:100%;padding:14px;margin-bottom:12px" onclick="closeSheet();showAddResourceSheet()">
        🆕 Créer une ressource
      </button>
      <div style="text-align:center;color:var(--text-light);font-size:13px;margin-bottom:12px">ou</div>
      <div id="resource-join-section">
        <div class="input-group" style="margin-bottom:8px">
          <label>Code d'invitation ressource</label>
          <input type="text" id="resource-choice-join-code" placeholder="Ex: ABC123" autocomplete="off" style="text-transform:uppercase">
        </div>
        <div class="lock-error" id="resource-choice-join-error"></div>
        <button class="btn" style="width:100%;background:#f0f4ff;color:#4338ca;font-weight:600;padding:12px" onclick="submitResourceChoiceJoin()">
          Rejoindre une ressource
        </button>
      </div>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:14px;width:100%" onclick="closeSheet()">Plus tard</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function submitResourceChoiceJoin() {
  const input = document.getElementById('resource-choice-join-code');
  const errEl = document.getElementById('resource-choice-join-error');
  const code = (input?.value || '').trim().toUpperCase();
  if (!code) { errEl.textContent = 'Entrez un code d\'invitation'; return; }
  errEl.textContent = '';
  try {
    await handleResourceJoinCode(code);
    closeSheet();
    await loadResources();
  } catch(e) {
    errEl.textContent = 'Code invalide ou erreur — réessayez';
  }
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
  // Adapt dashboard for resource type
  renderCalendar();
  renderExperiencePanels();
}


// ==========================================
// BOOKINGS SUBSCRIPTION
// ==========================================
function subscribeBookings() {
  if (unsubscribe) unsubscribe();

  // Two separate maps so neither listener clears the other's data
  let _bookingsNew    = {};
  let _bookingsLegacy = {};
  let _readyNew     = false;
  let _readyLegacy  = false;

  function _rebuild() {
    bookings = {};
    // Legacy first, new data takes precedence (overwrites same dates)
    Object.entries(_bookingsLegacy).forEach(([k, v]) => { bookings[k] = v; });
    Object.entries(_bookingsNew).forEach(([k, v]) => { bookings[k] = v; });
    renderCalendar();
    renderExperiencePanels();
    if (document.getElementById('booking-modal')?.classList.contains('open')) renderBmCalendar();
  }

  function _expandToMap(d, map) {
    const start = d.startDate || d.date_debut;
    const end   = d.endDate   || d.date_fin || start;
    if (start && end) {
      let cur = new Date(start + 'T00:00:00');
      const endObj = new Date(end + 'T00:00:00');
      while (cur <= endObj) {
        const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
        map[ds] = d;
        cur.setDate(cur.getDate() + 1);
      }
    } else if (d.date) { map[d.date] = d; }
  }

  // New collection: reservations
  let unsubNew = null;
  try {
    unsubNew = reservationsRef()
      .where('ressource_id', '==', selectedResource)
      .onSnapshot(snap => {
        _bookingsNew = {};
        snap.forEach(doc => _expandToMap(reservationToJS(doc.data(), doc.id), _bookingsNew));
        _readyNew = true;
        if (_readyLegacy) _rebuild();
      }, err => {
        console.warn('[reservations] snapshot error:', err);
        _readyNew = true;
        if (_readyLegacy) _rebuild();
      });
  } catch(_) { _readyNew = true; }

  // Legacy collection: families/{id}/bookings
  let unsubLegacy = null;
  try {
    const familyId = currentUser.familyId;
    const legacyCol = db.collection('families').doc(familyId).collection('bookings');
    // Subscribe by resourceId first, then carId for old bookings
    unsubLegacy = legacyCol
      .where('resourceId', '==', selectedResource)
      .onSnapshot(snap => {
        _bookingsLegacy = {};
        snap.forEach(doc => _expandToMap({ id: doc.id, ...doc.data() }, _bookingsLegacy));
        // Also pick up carId-only bookings
        legacyCol.where('carId', '==', selectedResource).get().then(snap2 => {
          snap2.forEach(doc => {
            const d = { id: doc.id, ...doc.data() };
            if (!d.resourceId) _expandToMap(d, _bookingsLegacy);
          });
          _readyLegacy = true;
          if (_readyNew) _rebuild();
        }).catch(() => { _readyLegacy = true; if (_readyNew) _rebuild(); });
      }, err => {
        console.warn('[bookings legacy] snapshot error:', err);
        _readyLegacy = true;
        if (_readyNew) _rebuild();
      });
  } catch(_) {
    _readyLegacy = true;
    if (_readyNew) _rebuild();
  }

  unsubscribe = () => {
    if (unsubNew) unsubNew();
    if (unsubLegacy) unsubLegacy();
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
    const ref = await ressourcesRef().add({
      famille_id: currentUser.familyId,
      nom: name, name, type, emoji,
      createdAt: ts()
    });
    const newRes = { id: ref.id, name, type, emoji };
    resources.push(newRes);

    // Auto-grant admin access to the creator
    await accesRessourceRef().add({
      ressource_id: ref.id, profil_id: currentUser.id,
      famille_id: currentUser.familyId, role: 'admin',
      statut: 'accepted', invited_at: ts(), accepted_at: ts()
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
    await ressourcesRef().doc(selectedResource).update({ plaque, assurance, observations });
    const res = resources.find(r => r.id === selectedResource);
    if (res) Object.assign(res, { plaque, assurance, observations });
    closeSheet();
    showToast('Infos enregistrées ✓');
  } catch(e) { showToast('Erreur — réessayez'); }
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
    await ressourcesRef().doc(selectedResource).update({ address, observations });
    const res = resources.find(r => r.id === selectedResource);
    if (res) Object.assign(res, { address, observations });
    closeSheet();
    showToast('Infos maison enregistrées ✓');
  } catch(e) { showToast('Erreur — réessayez'); }
}

// ==========================================
// RESOURCE INVITE & ACCESS MANAGEMENT
// ==========================================
async function _getOrCreateResourceInviteCode(resourceId) {
  const invite = await resourceService.ensureManageInviteInfo({
    resourceId,
    origin: location.origin,
    pathname: location.pathname
  });
  const res = resources.find((item) => item.id === resourceId);
  if (res) res.inviteCode = invite.inviteCode;
  return invite.inviteCode;
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
        const pid = item.profil_id || item.profileId;
        const pDoc = await profilRef(pid).get();
        if (pDoc.exists) { userNames[pid] = pDoc.data().nom || pDoc.data().name || pid; }
        else {
          const m = await getFamilleMember(currentUser.familyId, pid);
          userNames[pid] = m?.nom || m?.name || pid;
        }
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
    html = '<div style="color:var(--text-light);font-size:13px">Aucun membre invité pour l\'instant.</div>';
  }

  pendingEl.innerHTML = html;
}

async function approveResourceAccess(accessId, userName) {
  try {
    await resourceService.approveManageAccess({ accessId });
    showToast(`Accès approuvé${userName ? ' pour ' + userName : ''} ✓`);
    closeSheet();
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function rejectResourceAccess(accessId) {
  try {
    await resourceService.rejectManageAccess({ accessId });
    showToast('Demande refusée');
    closeSheet();
  } catch(e) { showToast('Erreur — réessayez'); }
}

// ==========================================
// RESOURCE MANAGE PAGE
// ==========================================
let _resourceManageState = {
  resourceId: null,
  viewModel: null
};

function _rmEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _rmAvatar(member, variant) {
  const avatarClass = variant === 'pending'
    ? 'rm-p-avatar'
    : `rm-m-avatar${member.avatarClass ? ` ${member.avatarClass}` : ''}`;
  if (member.photo) {
    return `<div class="${avatarClass}"><img src="${_rmEscapeHtml(member.photo)}" alt=""></div>`;
  }
  return `<div class="${avatarClass}">${_rmEscapeHtml(member.initials || '?')}</div>`;
}

function _rmLoadingMarkup(resourceId) {
  const preview = resources.find((item) => item.id === resourceId);
  const title = preview?.name || 'Ressource';
  const subtitle = preview?.type === 'house'
    ? (preview.address || 'Chargement…')
    : (preview?.plaque || 'Chargement…');

  return `
    <div class="rm-page-header">
      <button class="rm-back-btn" onclick="hideResourceManagePage()">‹</button>
      <div>
        <div class="rm-page-title">${_rmEscapeHtml(title)}</div>
        <div class="rm-page-sub">${_rmEscapeHtml(subtitle)}</div>
      </div>
    </div>
    <div class="rm-scroll-area">
      <div class="rm-loading-card">
        <div class="rm-loading-spinner" aria-hidden="true"></div>
        <div class="rm-loading-title">Chargement de la ressource</div>
        <div class="rm-loading-copy">Les données live Firebase arrivent…</div>
      </div>
    </div>`;
}

function _rmErrorMarkup() {
  return `
    <div class="rm-page-header">
      <button class="rm-back-btn" onclick="hideResourceManagePage()">‹</button>
      <div>
        <div class="rm-page-title">Ressource</div>
        <div class="rm-page-sub">Erreur de chargement</div>
      </div>
    </div>
    <div class="rm-scroll-area">
      <div class="rm-loading-card rm-loading-card-error">
        <div class="rm-loading-title">Impossible de charger cette ressource</div>
        <div class="rm-loading-copy">Vérifiez votre connexion puis réessayez.</div>
      </div>
    </div>`;
}

function _rmRenderPage(viewModel) {
  const resource = viewModel.resource;
  const stats = viewModel.stats;

  const inviteHtml = viewModel.permissions.canInvite
    ? `
      <div class="rm-section-lbl">Inviter quelqu'un</div>
      <div class="rm-invite-card">
        <div class="rm-invite-title">Ajouter un membre à cette ressource</div>
        <div class="rm-invite-row">
          <input class="rm-invite-input" type="email" id="rm-invite-email-${_rmEscapeHtml(resource.id)}" placeholder="prenom@email.com">
          <button class="rm-copy-link-btn" onclick='_rmSendInviteEmail(${JSON.stringify(resource.id)})'>Envoyer</button>
        </div>
        <button class="rm-share-link-row" type="button" onclick='_rmCopyInviteLink(${JSON.stringify(resource.id)})'>
          <div class="rm-share-link-url">${_rmEscapeHtml(viewModel.invite.displayUrl || '')}</div>
          <div class="rm-share-link-copy">Copier le lien</div>
        </button>
      </div>`
    : '';

  const pendingHtml = viewModel.permissions.isAdmin && viewModel.pendingMembers.length
    ? `
      <div class="rm-section-lbl">Demandes en attente</div>
      <div class="rm-pending-group">
        <div class="rm-pending-header">
          <div class="rm-pending-label">${viewModel.pendingMembers.length} demande${viewModel.pendingMembers.length > 1 ? 's' : ''} à valider</div>
          <div class="rm-pending-count">${viewModel.pendingMembers.length}</div>
        </div>
        ${viewModel.pendingMembers.map((member) => `
          <div class="rm-pending-row">
            ${_rmAvatar(member, 'pending')}
            <div class="rm-p-info">
              <div class="rm-p-name">${_rmEscapeHtml(member.name)}</div>
              <div class="rm-p-meta">${_rmEscapeHtml(member.requestLabel)}</div>
            </div>
            <div class="rm-p-actions">
              <button class="rm-p-btn-accept" onclick='_rmApprove(${JSON.stringify(member.accessId)}, ${JSON.stringify(member.name)}, ${JSON.stringify(resource.id)})'>Accepter</button>
              <button class="rm-p-btn-reject" onclick='_rmReject(${JSON.stringify(member.accessId)}, ${JSON.stringify(resource.id)})'>Refuser</button>
            </div>
          </div>`).join('')}
      </div>`
    : '';

  const membersHtml = viewModel.acceptedMembers.length
    ? viewModel.acceptedMembers.map((member) => `
      <div class="rm-member-row">
        ${_rmAvatar(member, 'member')}
        <div class="rm-m-info">
          <div class="rm-m-name">${_rmEscapeHtml(member.displayName)}</div>
          <div class="rm-m-joined">${_rmEscapeHtml(member.joinedLabel)}</div>
        </div>
        <div class="rm-role-pill ${_rmEscapeHtml(member.roleClass)}">${_rmEscapeHtml(member.roleLabel)}</div>
        ${member.canManage
          ? `<button class="rm-m-menu" type="button" onclick='_rmMemberMenu(${JSON.stringify(member.accessId)}, ${JSON.stringify(member.name)}, ${JSON.stringify(resource.id)})'>···</button>`
          : '' }
      </div>`).join('')
    : '<div class="rm-empty-state">Aucun membre actif</div>';

  const dangerHtml = viewModel.permissions.isAdmin
    ? `
      <div class="rm-section-lbl">Gestion</div>
      <div class="rm-danger-card">
        <div class="rm-danger-title">Zone admin</div>
        <div class="rm-danger-row">
          <div class="rm-danger-label">Modifier les infos</div>
          <button class="rm-danger-btn neutral" onclick='_rmEditResource(${JSON.stringify(resource.id)}, ${JSON.stringify(viewModel.actions.editMode)})'>Modifier</button>
        </div>
        <div class="rm-danger-row">
          <div class="rm-danger-label">Supprimer la ressource</div>
          <button class="rm-danger-btn" onclick='_rmDeleteResource(${JSON.stringify(resource.id)})'>Supprimer</button>
        </div>
      </div>`
    : '';

  return `
    <div class="rm-page-header">
      <button class="rm-back-btn" onclick="hideResourceManagePage()">‹</button>
      <div>
        <div class="rm-page-title">${_rmEscapeHtml(resource.name)}</div>
        <div class="rm-page-sub">${_rmEscapeHtml(resource.familyName)}</div>
      </div>
    </div>
    <div class="rm-scroll-area">
      <div class="rm-resource-hero">
        <div class="rm-resource-big-icon">${_rmEscapeHtml(resource.emoji)}</div>
        <div class="rm-resource-info">
          <div class="rm-resource-name">${_rmEscapeHtml(resource.name)}</div>
          <div class="rm-resource-family">${_rmEscapeHtml(resource.subLine)}</div>
          <div class="rm-resource-meta">${_rmEscapeHtml(resource.metaLine)}</div>
        </div>
        <div class="rm-resource-role-badge ${_rmEscapeHtml(resource.roleClass)}">${_rmEscapeHtml(resource.roleLabel)}</div>
      </div>
      ${inviteHtml}
      ${pendingHtml}
      <div class="rm-section-lbl">Membres actifs</div>
      <div class="rm-members-group">${membersHtml}</div>
      ${dangerHtml}
    </div>`;
}

function _rmCurrentInvite(resourceId) {
  if (_resourceManageState.resourceId === resourceId && _resourceManageState.viewModel?.invite?.shareUrl) {
    return _resourceManageState.viewModel.invite;
  }
  return null;
}

function hideResourceManagePage() {
  _resourceManageState = { resourceId: null, viewModel: null };
  document.getElementById('resource-manage-overlay')?.classList.add('hidden');
}

async function showResourceManagePage(resourceId) {
  const overlay = document.getElementById('resource-manage-overlay');
  const content = document.getElementById('resource-manage-content');
  if (!overlay || !content || !resourceId || !currentUser?.id || !currentUser?.familyId) return;

  overlay.classList.remove('hidden');
  content.innerHTML = _rmLoadingMarkup(resourceId);
  _resourceManageState = { resourceId, viewModel: null };

  try {
    const viewModel = await resourceService.getManagePageViewModel({
      resourceId,
      currentUserId: currentUser.id,
      familyId: currentUser.familyId,
      origin: location.origin,
      pathname: location.pathname
    });

    _resourceManageState = { resourceId, viewModel };
    const localResource = resources.find((item) => item.id === resourceId);
    if (localResource && viewModel.invite?.inviteCode) localResource.inviteCode = viewModel.invite.inviteCode;
    content.innerHTML = _rmRenderPage(viewModel);
  } catch (e) {
    console.error('Resource manage page error:', e);
    content.innerHTML = _rmErrorMarkup();
  }
}

async function _rmApprove(accessId, userName, resourceId) {
  try {
    await resourceService.approveManageAccess({ accessId });
    showToast(`${userName} a accès ✓`);
    await showResourceManagePage(resourceId);
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function _rmReject(accessId, resourceId) {
  try {
    await resourceService.rejectManageAccess({ accessId });
    showToast('Demande refusée');
    await showResourceManagePage(resourceId);
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function _rmCopyInviteLink(resourceId) {
  try {
    const currentInvite = _rmCurrentInvite(resourceId)
      || await resourceService.ensureManageInviteInfo({
        resourceId,
        origin: location.origin,
        pathname: location.pathname
      });
    await navigator.clipboard?.writeText(currentInvite.shareUrl);
    showToast('Lien copié !');
  } catch (e) {
    showToast('Impossible de copier le lien');
  }
}

async function _rmSendInviteEmail(resourceId) {
  const emailEl = document.getElementById(`rm-invite-email-${resourceId}`);
  const email = (emailEl?.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) { showToast('Email invalide'); return; }

  try {
    const currentInvite = _rmCurrentInvite(resourceId)
      || await resourceService.ensureManageInviteInfo({
        resourceId,
        origin: location.origin,
        pathname: location.pathname
      });
    await navigator.clipboard?.writeText(currentInvite.shareUrl);
    showToast(`Lien copié — envoyez-le à ${email}`);
    if (emailEl) emailEl.value = '';
  } catch (e) {
    showToast('Impossible de préparer le lien');
  }
}

async function _rmMemberMenu(accessId, memberName, resourceId) {
  const overlay = document.getElementById('resource-manage-overlay');
  if (!overlay) return;

  // Remove any existing inline sheet
  const existing = document.getElementById('rm-inline-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id = 'rm-inline-sheet';
  sheet.className = 'rm-inline-sheet-backdrop';
  sheet.onclick = function(e) { if (e.target === sheet) sheet.remove(); };
  sheet.innerHTML = `
    <div class="rm-inline-sheet-content" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="login-sheet">
        <h2>${_rmEscapeHtml(memberName)}</h2>
        <p style="color:var(--text-light);font-size:14px;margin-bottom:20px">Gérer les droits de ce membre</p>
        <button class="btn btn-danger" onclick='_rmRemoveMember(${JSON.stringify(accessId)}, ${JSON.stringify(memberName)}, ${JSON.stringify(resourceId)});document.getElementById("rm-inline-sheet")?.remove()'>Retirer l'accès</button>
        <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick='document.getElementById("rm-inline-sheet")?.remove()'>Annuler</button>
      </div>
    </div>`;
  overlay.appendChild(sheet);
}

async function _rmRemoveMember(accessId, memberName, resourceId) {
  try {
    await resourceService.removeManageAccess({ accessId });
    showToast(`${memberName} retiré(e)`);
    await showResourceManagePage(resourceId);
  } catch(e) { showToast('Erreur — réessayez'); }
}

function _rmEditResource(resourceId, editMode) {
  selectResource(resourceId);
  hideResourceManagePage();
  if (editMode === 'house') {
    showHouseInfo();
    return;
  }
  showCarInfo();
}

async function _rmDeleteResource(resourceId) {
  const res = _resourceManageState.viewModel?.resource?.id === resourceId
    ? _resourceManageState.viewModel.resource
    : resources.find((item) => item.id === resourceId);
  if (!res) return;
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Supprimer ${_rmEscapeHtml(res.name)} ?</h2>
      <p style="color:var(--text-light);font-size:14px;margin-bottom:20px">Cette action est irréversible. Les réservations existantes seront conservées.</p>
      <button class="btn btn-danger" onclick='_rmConfirmDelete(${JSON.stringify(resourceId)});closeSheet()'>Oui, supprimer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Annuler</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function _rmConfirmDelete(resourceId) {
  try {
    await resourceService.deleteManagedResource({ resourceId });
    resources = resources.filter((item) => item.id !== resourceId);
    if (window._myResourceRoles) delete window._myResourceRoles[resourceId];
    hideResourceManagePage();

    if (resources.length > 0) {
      selectResource(resources[0].id);
    } else {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      renderNoAccessState();
    }

    if (typeof renderProfileTab === 'function') renderProfileTab();
    showToast('Ressource supprimée');
  } catch(e) { showToast('Erreur — réessayez'); }
}

// Called when user visits ?resource_join=CODE (after being logged in)
async function handleResourceJoinCode(code) {
  if (!currentUser?.familyId) return;
  try {
    const snap = await ressourcesRef().where('inviteCode', '==', code).limit(1).get();
    if (snap.empty) { showToast('Lien invalide ou expiré'); return; }
    const resourceId = snap.docs[0].id;

    // Check for existing access entry
    const existing = await accesRessourceRef()
      .where('ressource_id', '==', resourceId)
      .where('profil_id', '==', currentUser.id)
      .get();

    if (!existing.empty) {
      const statut = existing.docs[0].data().statut;
      if (statut === 'accepted') { showToast('Tu as déjà accès à cette ressource'); return; }
      if (statut === 'pending') { showToast('Ta demande est déjà en attente d\'approbation'); return; }
    }

    await accesRessourceRef().add({
      ressource_id: resourceId, profil_id: currentUser.id,
      famille_id: currentUser.familyId,
      role: 'member', statut: 'pending',
      invited_at: ts(), accepted_at: null
    });
    showToast('Demande envoyée — en attente d\'approbation par l\'admin');
  } catch(e) { console.error(e); showToast('Erreur — réessayez'); }
}
