// ==========================================
// RESOURCES — MULTI-RESOURCE SUPPORT
// ==========================================

// Roles map: resourceId → role ('admin'|'member'|'guest')
window._myResourceRoles = {};

// Load resources — reads from new 'ressources' collection with fallback to legacy
async function loadResources() {
  try {
    const familyId = currentUser.familyId || null;
    let allowLegacyFallback = (typeof isLegacyFallbackAllowed === 'function')
      ? isLegacyFallbackAllowed()
      : true;
    if (familyId) {
      try {
        const famDoc = await familleRef(familyId).get();
        if (famDoc.exists) {
          const fd = famDoc.data() || {};
          allowLegacyFallback = fd.disable_legacy_fallback !== true;
          window._legacyFallbackAllowed = allowLegacyFallback;
        }
      } catch (_) {}
    }

    // Resource-first: compute access from profile, independent from active family
    let myAccessEntries = [];
    try {
      myAccessEntries = await getMyResourceAccessEntries(currentUser.id, null);
    } catch(_) {}
    if (allowLegacyFallback && myAccessEntries.length === 0) {
      try {
        const snap = await db.collection('resource_access').where('profileId', '==', currentUser.id).get();
        snap.forEach(d => myAccessEntries.push(accesRessourceToJS(d.data(), d.id)));
      } catch(_) {}
    }

    window._myResourceRoles = {};
    myAccessEntries.forEach((entry) => {
      const rid = entry.ressource_id || entry.resourceId;
      if (!rid) return;
      const prev = window._myResourceRoles[rid];
      const role = entry.role || 'guest';
      if (!prev || role === 'admin' || (role === 'member' && prev === 'guest')) {
        window._myResourceRoles[rid] = role;
      }
    });

    const acceptedIds = [...new Set(
      myAccessEntries
        .filter(e => (e.statut ?? e.status) === 'accepted')
        .map(e => e.ressource_id || e.resourceId)
        .filter(Boolean)
    )];

    if (acceptedIds.length > 0) {
      let accessibleResources = [];
      try {
        accessibleResources = await getRessourcesByIds(acceptedIds);
      } catch(_) {}

      resources = accessibleResources.map((r) => ({
        ...r,
        name: r.name || r.nom || 'Ressource',
        type: r.type || 'car'
      }));

      if (resources.length === 0) {
        renderNoAccessState();
        return;
      }

      selectedResource = resources.some((r) => r.id === selectedResource)
        ? selectedResource
        : resources[0].id;
      renderResourceTabs();
      subscribeBookings();
      fuelReportsByBooking = {};
      return;
    }

    const hasPendingResourceAccess = myAccessEntries.some(
      (e) => (e.statut ?? e.status) === 'pending'
    );
    if (hasPendingResourceAccess) {
      resources = [];
      window._myResourceRoles = {};
      renderMinimalDashboardWhilePending();
      return;
    }

    // Fallback when no accepted access: keep family-based behavior for first setup / pending users
    if (!familyId) {
      resources = [];
      window._myResourceRoles = {};
      showResourceChoiceSheet();
      return;
    }

    let allResources = [];
    try {
      allResources = await getFamilleRessources(familyId);
    } catch(_) {}
    if (allowLegacyFallback && allResources.length === 0) {
      try {
        const snap = await db.collection('families').doc(familyId).collection('resources').get();
        snap.forEach(d => allResources.push({ id: d.id, ...d.data() }));
      } catch(_) {}
    }
    if (allowLegacyFallback && allResources.length === 0) {
      try {
        const snap = await db.collection('families').doc(familyId).collection('cars').get();
        snap.forEach(d => allResources.push({ id: d.id, type: 'car', ...d.data() }));
      } catch(_) {}
    }

    allResources = allResources.map(r => ({
      ...r,
      name: r.name || r.nom || 'Ressource',
      type: r.type || 'car'
    }));
    if (allResources.length === 0) {
      showResourceChoiceSheet();
      return;
    }

    const myAccessEntriesForFamily = myAccessEntries.filter(
      (e) => (e.famille_id === familyId || e.familyId === familyId)
    );
    if (myAccessEntriesForFamily.length === 0 && allResources.length > 0) {
      // No access records yet — determine role from family created_by
      let role = 'member';
      try {
        let famDoc = null;
        if (allowLegacyFallback) {
          try {
            const d = await db.collection('families').doc(familyId).get();
            if (d.exists) famDoc = d;
          } catch(_) {}
        }
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
        const docsByResource = await Promise.all(
          allResources.map((res) => findResourceAccessDocs(res.id, currentUser.id))
        );
        for (let i = 0; i < allResources.length; i++) {
          if ((docsByResource[i] || []).length > 0) continue;
          const res = allResources[i];
          batch.set(accesRessourceRef().doc(), {
            ressource_id: res.id, profil_id: currentUser.id,
            famille_id: familyId, role, statut: 'accepted',
            invited_at: ts(), accepted_at: ts(),
          });
        }
        await batch.commit();
      } catch(_) {}

      allResources.forEach(r => { window._myResourceRoles[r.id] = role; });
      resources = allResources;
    } else if (myAccessEntriesForFamily.length > 0) {
      window._myResourceRoles = {};
      myAccessEntriesForFamily.forEach(e => {
        const rid = e.ressource_id || e.resourceId;
        window._myResourceRoles[rid] = e.role;
      });
      const acceptedIdsInFamily = new Set(
        myAccessEntriesForFamily
          .filter(e => (e.statut ?? e.status) === 'accepted')
          .map(e => e.ressource_id || e.resourceId)
      );
      resources = allResources.filter(r => acceptedIdsInFamily.has(r.id));
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
    fuelReportsByBooking = {};
  } catch (e) {
    console.error('Firebase error (loadResources):', e);
    document.getElementById('cal-grid').innerHTML =
      '<div class="loading" style="flex-direction:column;gap:8px;color:var(--danger)">⚠️ Connexion impossible<br><small style="color:var(--text-light)">Vérifiez votre connexion ou Firebase.</small></div>';
  }
}

// Empty dashboard while access request is pending (no welcome / create resource card)
function renderMinimalDashboardWhilePending() {
  const tabsEl = document.getElementById('resource-tabs');
  if (tabsEl) tabsEl.innerHTML = '';

  const mainCard = document.getElementById('resource-main-card');
  if (mainCard) {
    mainCard.innerHTML = '<div style="min-height:120px" aria-hidden="true"></div>';
  }

  const upcomingLabel = document.getElementById('upcoming-label');
  if (upcomingLabel) upcomingLabel.style.display = 'none';
  const upcomingBookings = document.getElementById('upcoming-bookings');
  if (upcomingBookings) upcomingBookings.innerHTML = '';
}

// Show waiting state when user has no accessible resources
function renderNoAccessState() {
  const tabsEl = document.getElementById('resource-tabs');
  if (tabsEl) tabsEl.innerHTML = '';

  const mainCard = document.getElementById('resource-main-card');
  if (mainCard) {
    mainCard.innerHTML = `
      <div style="padding:40px 24px;text-align:center">
        <div style="font-size: calc(52px * var(--ui-text-scale));margin-bottom:16px">⏳</div>
        <div style="font-weight:700;font-size: calc(20px * var(--ui-text-scale));margin-bottom:8px">En attente d'accès</div>
        <div style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));line-height:1.6;margin-bottom:24px">
          Ton compte est actif, mais tu n'as pas encore accès à une ressource.<br>
          Demande à un admin de t'envoyer un lien d'invitation spécifique.
        </div>
        <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:12px;padding:16px;font-size: calc(13px * var(--ui-text-scale));color:#4338ca;line-height:1.5">
          🔗 L'admin doit aller dans Profil → ressource → <strong>Inviter</strong>
        </div>
      </div>`;
  }

  const upcomingLabel = document.getElementById('upcoming-label');
  if (upcomingLabel) upcomingLabel.style.display = 'none';
  const upcomingBookings = document.getElementById('upcoming-bookings');
  if (upcomingBookings) upcomingBookings.innerHTML = '';
}

// Show resource choice sheet when a new account has no resources yet
function showResourceChoiceSheet() {
  // Render an empty main card state while the sheet is shown
  const tabsEl = document.getElementById('resource-tabs');
  if (tabsEl) tabsEl.innerHTML = '';

  const mainCard = document.getElementById('resource-main-card');
  if (mainCard) {
    mainCard.innerHTML = `
      <div style="padding:40px 24px;text-align:center">
        <div style="font-size: calc(52px * var(--ui-text-scale));margin-bottom:16px">🏁</div>
        <div style="font-weight:700;font-size: calc(20px * var(--ui-text-scale));margin-bottom:8px">Bienvenue !</div>
        <div style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));line-height:1.6">
          Pour commencer, cree une premiere ressource.
        </div>
      </div>`;
  }

  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Première ressource</h2>
      <p style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));margin-bottom:20px">
        Crée ta première ressource. Une famille sera créée automatiquement.
      </p>
      <button class="btn btn-primary" style="width:100%;padding:14px;margin-bottom:12px" onclick="closeSheet();showAddResourceSheet()">
        Créer une ressource
      </button>
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

  const pills = resources.map(res => {
    const isActive = res.id === selectedResource;
    const cls = `resource-tab${isActive ? ' active' : ''}`;
    return `<div class="${cls}" onclick="selectResource('${res.id}')">
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

  let _photoHydrationRun = 0;

  async function _hydrateCurrentBookingPhotos() {
    const runId = ++_photoHydrationRun;
    const uniqueBookings = new Map();
    Object.values(bookings || {}).forEach((booking) => {
      if (!booking?.id) return;
      if (!uniqueBookings.has(booking.id)) uniqueBookings.set(booking.id, booking);
    });

    await Promise.all([...uniqueBookings.values()].map(async (booking) => {
      const currentPhoto = await getCurrentPhotoForBooking(booking);
      booking._currentPhoto = currentPhoto || null;
    }));

    // Ignore outdated async runs when newer rebuilds already happened
    if (runId !== _photoHydrationRun) return;
    renderCalendar();
    renderExperiencePanels();
    if (document.getElementById('booking-modal')?.classList.contains('open')) renderBmCalendar();
  }

  function _rebuild() {
    bookings = {};
    // Legacy first, new data takes precedence (overwrites same dates)
    Object.entries(_bookingsLegacy).forEach(([k, v]) => { bookings[k] = v; });
    Object.entries(_bookingsNew).forEach(([k, v]) => { bookings[k] = v; });
    renderCalendar();
    renderExperiencePanels();
    if (document.getElementById('booking-modal')?.classList.contains('open')) renderBmCalendar();
    _hydrateCurrentBookingPhotos().catch(() => {});
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

  const allowLegacyFallback = (typeof isLegacyFallbackAllowed === 'function')
    ? isLegacyFallbackAllowed()
    : true;

  // Legacy collection: families/{id}/bookings
  let unsubLegacy = null;
  if (allowLegacyFallback) {
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
  } else {
    _readyLegacy = true;
    if (_readyNew) _rebuild();
  }

  unsubscribe = () => {
    if (unsubNew) unsubNew();
    if (unsubLegacy) unsubLegacy();
  };
}

// ==========================================
// ADD RESOURCE
// ==========================================
async function _loadUserFamiliesForResourceCreation() {
  if (!currentUser?.id) return [];
  const memberSnap = await familleMembresRef().where('profil_id', '==', currentUser.id).get();
  if (memberSnap.empty) return [];

  const familyIds = [...new Set(memberSnap.docs.map((doc) => doc.data()?.famille_id).filter(Boolean))];
  const familyDocs = await Promise.all(familyIds.map(async (id) => {
    try {
      const snap = await familleRef(id).get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      return { id, name: data.nom || data.name || 'Espace partagé' };
    } catch (_) {
      return null;
    }
  }));

  return familyDocs.filter(Boolean);
}

function _toggleAddResourceFamilyFields() {
  const selectEl = document.getElementById('add-res-family-select');
  const newFamilyRow = document.getElementById('add-res-new-family-row');
  if (!selectEl || !newFamilyRow) return;
  newFamilyRow.style.display = selectEl.value === '__new__' ? 'block' : 'none';
}

function _slugifyDefaultFamilyName(resourceName) {
  const base = String(resourceName || '').trim();
  if (!base) return 'Mon espace';
  return `Espace ${base}`;
}

async function _ensureFamilyForNewResource(resourceName) {
  const selectedFamily = document.getElementById('add-res-family-select')?.value || '';
  if (selectedFamily && selectedFamily !== '__new__') return selectedFamily;

  const manualNewFamilyName = (document.getElementById('add-res-new-family-name')?.value || '').trim();
  const familyName = manualNewFamilyName || _slugifyDefaultFamilyName(resourceName);
  const familyRef = await famillesRef().add({
    nom: familyName,
    inviteCode: generateInviteCode(),
    created_by: currentUser.id,
    createdAt: ts()
  });

  await familleMembresRef().add({
    famille_id: familyRef.id,
    profil_id: currentUser.id,
    role: 'admin',
    nom: currentUser.name || '',
    email: currentUser.email || '',
    photo: currentUser.photo || null,
    createdAt: ts()
  });

  currentUser.familyId = familyRef.id;
  localStorage.setItem('famcar_user', JSON.stringify(currentUser));
  return familyRef.id;
}

async function showAddResourceSheet() {
  const userFamilies = await _loadUserFamiliesForResourceCreation();
  const hasFamilies = userFamilies.length > 0;
  const familyBlock = hasFamilies
    ? `
      <div class="input-group">
        <label>Famille</label>
        <select id="add-res-family-select" onchange="_toggleAddResourceFamilyFields()">
          ${userFamilies.map((family, index) => `<option value="${family.id}" ${index === 0 ? 'selected' : ''}>${family.name}</option>`).join('')}
          <option value="__new__">Créer une nouvelle famille</option>
        </select>
      </div>
      <div class="input-group" id="add-res-new-family-row" style="display:none">
        <label>Nom de la nouvelle famille</label>
        <input type="text" id="add-res-new-family-name" placeholder="Ex: Maison de campagne" autocomplete="off">
      </div>`
    : `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:10px 12px;color:#0c4a6e;font-size: calc(12px * var(--ui-text-scale));line-height:1.45;margin-bottom:14px">
        Première ressource: une nouvelle famille sera créée automatiquement.
      </div>`;

  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Ajouter une ressource</h2>
      <p style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));margin-bottom:20px">Voiture, maison ou autre bien partagé</p>
      <div style="display:flex;gap:12px;margin-bottom:20px">
        <button id="type-car-btn" class="btn btn-primary" style="flex:1;padding:12px" onclick="setResourceType('car', this)">🚗 Voiture</button>
        <button id="type-house-btn" class="btn btn-outline" style="flex:1;padding:12px" onclick="setResourceType('house', this)">🏠 Maison</button>
      </div>
      ${familyBlock}
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
    const familyId = await _ensureFamilyForNewResource(name);
    const ref = await ressourcesRef().add({
      famille_id: familyId,
      nom: name, name, type, emoji,
      createdAt: ts()
    });
    const newRes = { id: ref.id, name, type, emoji };
    resources.push(newRes);

    // Auto-grant admin access to the creator
    const existingDocs = await findResourceAccessDocs(ref.id, currentUser.id);
    if (existingDocs.length > 0) {
      await accesRessourceRef().doc(existingDocs[0].id).update({
        role: 'admin',
        statut: 'accepted',
        invited_at: ts(),
        accepted_at: ts(),
      });
    } else {
      await accesRessourceRef().add({
        ressource_id: ref.id, profil_id: currentUser.id,
        famille_id: familyId, role: 'admin',
        statut: 'accepted', invited_at: ts(), accepted_at: ts(),
      });
    }
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
  window._resourcePhotoDraft = res.photoUrl || null;
  const plaque = res.plaque || '';
  const carLocation = res.carLocation || res.lieu || '';
  const assurance = res.assurance || '';
  const observations = res.observations || '';
  const seatCount = res.seatCount ?? res.seats ?? '';
  const fuelType = res.fuelType || '';
  const mileageKm = res.mileageKm != null ? String(res.mileageKm) : '';
  const btVal =
    res.carBluetooth === true ? 'yes' : res.carBluetooth === false ? 'no' : '';
  const photoPreview = res.photoUrl
    ? `<img src="${res.photoUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : (res.emoji || '🚗');
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <div id="resource-photo-preview" style="width:92px;height:92px;border-radius:16px;overflow:hidden;background:#f3f4f6;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size: calc(44px * var(--ui-text-scale))">${photoPreview}</div>
      <label style="font-size: calc(12px * var(--ui-text-scale));color:var(--accent);cursor:pointer;text-decoration:underline" onclick="document.getElementById('resource-photo-input').click()">Modifier la photo</label>
      <input type="file" id="resource-photo-input" accept="image/*" style="display:none" onchange="handleResourcePhoto(this)">
      <h2 style="margin:0 0 4px">${res.name}</h2>
      ${plaque ? `<div style="display:inline-block;font-size: calc(12px * var(--ui-text-scale));font-weight:700;color:var(--accent);background:rgba(99,102,241,0.10);border:1px solid rgba(99,102,241,0.18);border-radius:6px;padding:3px 10px;letter-spacing:0.5px;margin-bottom:20px">${plaque}</div>` : '<div style="margin-bottom:20px"></div>'}
      <div class="input-group">
        <label>Plaque d'immatriculation</label>
        <input type="text" id="car-plaque" placeholder="Ex: AB-123-CD" value="${_rmEscapeHtml(plaque)}" style="text-transform:uppercase">
      </div>
      <div class="input-group">
        <label>Lieu (ville, parking…)</label>
        <input type="text" id="car-location" placeholder="Paris" value="${_rmEscapeHtml(carLocation)}">
      </div>
      <div class="input-group">
        <label>Nombre de places</label>
        <input type="number" id="car-seat-count" min="1" max="99" placeholder="5" value="${seatCount === '' ? '' : _rmEscapeHtml(String(seatCount))}">
      </div>
      <div class="input-group">
        <label>Énergie</label>
        <select id="car-fuel-type" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size: calc(14px * var(--ui-text-scale))">
          <option value="" ${!fuelType ? 'selected' : ''}>—</option>
          <option value="essence" ${fuelType === 'essence' ? 'selected' : ''}>Essence</option>
          <option value="diesel" ${fuelType === 'diesel' ? 'selected' : ''}>Diesel</option>
          <option value="electrique" ${fuelType === 'electrique' ? 'selected' : ''}>Électrique</option>
        </select>
      </div>
      <div class="input-group">
        <label>Kilométrage</label>
        <input type="text" id="car-mileage" inputmode="numeric" placeholder="ex: 45000" value="${_rmEscapeHtml(mileageKm)}">
      </div>
      <div class="input-group">
        <label>Bluetooth</label>
        <select id="car-bluetooth" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size: calc(14px * var(--ui-text-scale))">
          <option value="" ${!btVal ? 'selected' : ''}>—</option>
          <option value="yes" ${btVal === 'yes' ? 'selected' : ''}>Oui</option>
          <option value="no" ${btVal === 'no' ? 'selected' : ''}>Non</option>
        </select>
      </div>
      <div class="input-group">
        <label>Assurance</label>
        <input type="text" id="car-assurance" placeholder="Compagnie / n° de contrat" value="${_rmEscapeHtml(assurance)}">
      </div>
      <div class="input-group">
        <label>Observations</label>
        <textarea id="car-observations" placeholder="Carrosserie, entretien, notes..." rows="3" style="resize:none;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size: calc(14px * var(--ui-text-scale));width:100%">${_rmEscapeHtml(observations)}</textarea>
      </div>
      <button class="btn btn-primary" onclick="saveCarInfo()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function saveCarInfo() {
  const plaque = (document.getElementById('car-plaque')?.value || '').trim().toUpperCase();
  const carLocation = (document.getElementById('car-location')?.value || '').trim();
  const assurance = (document.getElementById('car-assurance')?.value || '').trim();
  const observations = (document.getElementById('car-observations')?.value || '').trim();
  const seatRaw = document.getElementById('car-seat-count')?.value;
  const seatParsed = parseInt(String(seatRaw || '').trim(), 10);
  const fuelType = (document.getElementById('car-fuel-type')?.value || '').trim();
  const mileageRaw = (document.getElementById('car-mileage')?.value || '').trim();
  const btRaw = document.getElementById('car-bluetooth')?.value || '';
  const photoUrl = window._resourcePhotoDraft || null;
  try {
    const updates = {
      plaque,
      assurance,
      observations,
      carLocation,
      lieu: carLocation
    };
    if (Number.isFinite(seatParsed) && seatParsed > 0) updates.seatCount = seatParsed;
    if (fuelType) updates.fuelType = fuelType;
    if (mileageRaw) {
      const digits = String(mileageRaw).replace(/\D/g, '');
      const n = parseInt(digits, 10);
      updates.mileageKm = digits && Number.isFinite(n) ? n : mileageRaw;
    }
    if (btRaw === 'yes') updates.carBluetooth = true;
    else if (btRaw === 'no') updates.carBluetooth = false;
    if (photoUrl) updates.photoUrl = photoUrl;

    await ressourcesRef().doc(selectedResource).update(updates);

    const res = resources.find(r => r.id === selectedResource);
    if (res) Object.assign(res, updates);
    window._resourcePhotoDraft = null;
    closeSheet();
    showToast('Infos enregistrées ✓');
    if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
    if (typeof renderProfileTab === 'function') renderProfileTab();
  } catch (e) {
    console.error('saveCarInfo', e);
    showToast('Erreur — réessayez');
  }
}


// ==========================================
// HOUSE INFO
// ==========================================
function showHouseInfo() {
  const res = resources.find(r => r.id === selectedResource);
  if (!res) return;
  window._resourcePhotoDraft = res.photoUrl || null;
  const structuredAddress = getResourceStructuredAddress(res);
  const photoPreview = res.photoUrl
    ? `<img src="${res.photoUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : (res.emoji || '🏠');
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <div id="resource-photo-preview" style="width:92px;height:92px;border-radius:16px;overflow:hidden;background:#f3f4f6;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size: calc(44px * var(--ui-text-scale))">${photoPreview}</div>
      <label style="font-size: calc(12px * var(--ui-text-scale));color:var(--accent);cursor:pointer;text-decoration:underline" onclick="document.getElementById('resource-photo-input').click()">Modifier la photo</label>
      <input type="file" id="resource-photo-input" accept="image/*" style="display:none" onchange="handleResourcePhoto(this)">
      <h2>Info maison</h2>
      <div style="color:var(--text-light);font-size: calc(13px * var(--ui-text-scale));margin-bottom:20px">${res.emoji || '🏠'} ${res.name}</div>
      <div class="input-group">
        <label>Rue</label>
        <input type="text" id="house-address-street" placeholder="123 rue..." value="${structuredAddress.street || ''}">
      </div>
      <div class="input-group">
        <label>Ville</label>
        <input type="text" id="house-address-city" placeholder="Les Lèves-et-Thoumeyragues" value="${structuredAddress.city || ''}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="input-group">
          <label>Code postal</label>
          <input type="text" id="house-address-postal" placeholder="33220" value="${structuredAddress.postalCode || ''}">
        </div>
        <div class="input-group">
          <label>Pays</label>
          <input type="text" id="house-address-country" placeholder="France" value="${structuredAddress.country || ''}">
        </div>
      </div>
      <div class="input-group">
        <label>Observations</label>
        <textarea id="house-observations" placeholder="Notes importantes..." rows="3" style="resize:none;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size: calc(14px * var(--ui-text-scale));width:100%">${res.observations || ''}</textarea>
      </div>
      <button class="btn btn-primary" onclick="saveHouseInfo()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function saveHouseInfo() {
  const street = (document.getElementById('house-address-street')?.value || '').trim();
  const city = (document.getElementById('house-address-city')?.value || '').trim();
  const postalCode = (document.getElementById('house-address-postal')?.value || '').trim();
  const country = (document.getElementById('house-address-country')?.value || '').trim();
  const observations = (document.getElementById('house-observations')?.value || '').trim();
  const photoUrl = window._resourcePhotoDraft || null;
  try {
    const address = formatStructuredAddress({ street, city, postalCode, country });
    const updates = {
      address,
      address_street: street,
      address_city: city,
      address_postal_code: postalCode,
      address_country: country,
      observations
    };
    if (photoUrl) updates.photoUrl = photoUrl;
    await ressourcesRef().doc(selectedResource).update(updates);
    const res = resources.find(r => r.id === selectedResource);
    if (res) Object.assign(res, updates);
    window._resourcePhotoDraft = null;
    closeSheet();
    showToast('Infos maison enregistrées ✓');
  } catch(e) { showToast('Erreur — réessayez'); }
}

function handleResourcePhoto(input) {
  if (!input?.files?.[0]) return;
  resizePhotoFile(input.files[0], (dataUrl) => {
    window._resourcePhotoDraft = dataUrl;
    const previewWrap = document.getElementById('resource-photo-preview');
    if (previewWrap) previewWrap.innerHTML = `<img src="${dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`;
  });
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
      <p style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));margin-bottom:16px">Invitez des membres par lien spécifique à cette ressource.</p>
      <div id="resource-invite-section">
        <div style="color:var(--text-light);font-size: calc(13px * var(--ui-text-scale));text-align:center;padding:12px">Chargement...</div>
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
        <input type="text" value="${link}" readonly style="font-size: calc(11px * var(--ui-text-scale));flex:1;background:#f8f9fa;color:var(--text-light)">
        <button class="btn btn-primary" style="padding:10px 14px;white-space:nowrap;font-size: calc(13px * var(--ui-text-scale))"
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

    html += `<div style="font-weight:700;font-size: calc(14px * var(--ui-text-scale));margin-bottom:8px">⏳ Demandes en attente (${pending.length})</div>`;
    html += pending.map(item => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;margin-bottom:8px">
        <div style="flex:1">
          <div style="font-weight:600;font-size: calc(13px * var(--ui-text-scale))">${userNames[item.profileId] || item.profileId}</div>
          <div style="font-size: calc(11px * var(--ui-text-scale));color:var(--text-light)">Demande en attente</div>
        </div>
        <button class="btn btn-primary" style="padding:6px 10px;font-size: calc(12px * var(--ui-text-scale))"
          onclick="approveResourceAccess('${item.id}','${userNames[item.profileId] || ''}')">✓ Approuver</button>
        <button class="btn btn-danger" style="padding:6px 10px;font-size: calc(12px * var(--ui-text-scale))"
          onclick="rejectResourceAccess('${item.id}')">✕</button>
      </div>`).join('');
  }

  if (accepted.length) {
    html += `<div style="font-weight:700;font-size: calc(14px * var(--ui-text-scale));margin-top:12px;margin-bottom:8px">✓ Membres avec accès</div>`;
    html += accepted.map(item => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin-bottom:6px">
        <div style="flex:1;font-size: calc(13px * var(--ui-text-scale));font-weight:500">${item.profileId}</div>
        <div style="font-size: calc(11px * var(--ui-text-scale));color:#16a34a;font-weight:600">${item.role}</div>
      </div>`).join('');
  }

  if (!pending.length && !accepted.length) {
    html = '<div style="color:var(--text-light);font-size: calc(13px * var(--ui-text-scale))">Aucun membre invité pour l\'instant.</div>';
  }

  pendingEl.innerHTML = html;
}

async function approveResourceAccess(accessId, userName) {
  try {
    await resourceService.approveManageAccess({ accessId, approverProfileId: currentUser?.id || null });
    showToast(`Accès approuvé${userName ? ' pour ' + userName : ''} ✓`);
    closeSheet();
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function rejectResourceAccess(accessId) {
  try {
    await resourceService.rejectManageAccess({ accessId, approverProfileId: currentUser?.id || null });
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
    ? (getResourceAddressDisplay(preview, 'Chargement…'))
    : 'Chargement…';

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
      <div class="rm-invite-card rm-invite-card-compact">
        <div class="rm-invite-compact-row">
          <span class="rm-invite-url-text">${_rmEscapeHtml(viewModel.invite.displayUrl || '')}</span>
          <button type="button" class="rm-invite-share-icn" onclick='_rmShareResourceInvite(${JSON.stringify(resource.id)})' aria-label="Partager le lien">📤</button>
        </div>
      </div>`
    : '';

  const inviteCodeEditHtml = viewModel.permissions.canInvite && viewModel.invite?.inviteCode
    ? `
      <div class="rm-invite-code-block">
        <div class="rm-section-lbl">Code d'invitation</div>
        <div class="rm-invite-code-row">
          <span class="rm-invite-code-prefix">Code :</span>
          <input type="text" id="rm-invite-code-input" class="rm-invite-code-input" value="${_rmEscapeHtml(viewModel.invite.inviteCode)}" maxlength="8" autocomplete="off" spellcheck="false" aria-label="Code d'invitation">
          <button type="button" class="btn btn-primary rm-invite-code-save" onclick='_rmSaveInviteCode(${JSON.stringify(resource.id)})'>Enregistrer</button>
        </div>
        <div class="lock-error" id="rm-invite-code-error" role="alert"></div>
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
      ${inviteCodeEditHtml}
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
  if (!overlay || !content || !resourceId || !currentUser?.id) return;

  const resForFam = resources.find((r) => r.id === resourceId);
  const familyIdForResource = resForFam?.famille_id || resForFam?.familleId || currentUser.familyId;
  if (!familyIdForResource) return;

  overlay.classList.remove('hidden');
  content.innerHTML = _rmLoadingMarkup(resourceId);
  _resourceManageState = { resourceId, viewModel: null };

  try {
    const viewModel = await resourceService.getManagePageViewModel({
      resourceId,
      currentUserId: currentUser.id,
      familyId: familyIdForResource,
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

async function _rmSaveInviteCode(resourceId) {
  const input = document.getElementById('rm-invite-code-input');
  const errEl = document.getElementById('rm-invite-code-error');
  if (!input || !errEl) return;
  errEl.textContent = '';
  const resForFam = resources.find((r) => r.id === resourceId);
  const familyIdForResource = resForFam?.famille_id || resForFam?.familleId || currentUser.familyId;
  if (!familyIdForResource) {
    errEl.textContent = 'Famille introuvable';
    return;
  }
  try {
    const code = await resourceService.updateInviteCodeForResource({
      resourceId,
      rawCode: input.value,
      currentUserId: currentUser.id,
      familyId: familyIdForResource,
    });
    const localResource = resources.find((item) => item.id === resourceId);
    if (localResource) localResource.inviteCode = code;
    showToast('Code mis à jour ✓');
    await showResourceManagePage(resourceId);
  } catch (e) {
    const msg = e?.message || '';
    errEl.textContent = msg === 'DUPLICATE' ? 'Ce code est déjà utilisé'
      : msg === 'INVALID' ? 'Code invalide : 8 caractères (A-Z, 2-9)'
      : msg === 'FORBIDDEN' ? 'Action non autorisée'
      : 'Erreur — réessayez';
  }
}

async function _rmApprove(accessId, userName, resourceId) {
  try {
    await resourceService.approveManageAccess({ accessId, approverProfileId: currentUser?.id || null });
    showToast(`${userName} a accès ✓`);
    await showResourceManagePage(resourceId);
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function _rmReject(accessId, resourceId) {
  try {
    await resourceService.rejectManageAccess({ accessId, approverProfileId: currentUser?.id || null });
    showToast('Demande refusée');
    await showResourceManagePage(resourceId);
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function _rmShareResourceInvite(resourceId) {
  let currentInvite = _rmCurrentInvite(resourceId);
  try {
    if (!currentInvite?.shareUrl) {
      currentInvite = await resourceService.ensureManageInviteInfo({
        resourceId,
        origin: location.origin,
        pathname: location.pathname
      });
    }
    const url = currentInvite?.shareUrl;
    if (!url) {
      showToast('Lien indisponible');
      return;
    }
    if (navigator.share) {
      await navigator.share({
        title: 'FamResa — invitation ressource',
        text: 'Rejoins cette ressource sur FamResa.',
        url
      });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try {
    const inv = _rmCurrentInvite(resourceId)
      || await resourceService.ensureManageInviteInfo({
        resourceId,
        origin: location.origin,
        pathname: location.pathname
      });
    await navigator.clipboard?.writeText(inv.shareUrl);
    showToast('Lien copié !');
  } catch (e2) {
    showToast('Impossible de partager pour le moment');
  }
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
        <p style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));margin-bottom:20px">Gérer les droits de ce membre</p>
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
      <p style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));margin-bottom:20px">Cette action est irréversible. Les réservations existantes seront conservées.</p>
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
async function handleResourceJoinCode(code, options = {}) {
  const opts = options || {};
  const notify = (message) => {
    if (!opts.silent) showToast(message);
  };
  if (!currentUser?.id) {
    notify('Connecte-toi pour traiter ce lien');
    return { status: 'auth_required' };
  }

  try {
    const snap = await ressourcesRef().where('inviteCode', '==', code).limit(1).get();
    if (snap.empty) {
      notify('Lien invalide ou expiré');
      return { status: 'invalid_link' };
    }
    const resourceId = snap.docs[0].id;
    const resourceData = snap.docs[0].data() || {};
    const resourceName = resourceData.nom || resourceData.name || 'Ressource';

    const existingDocs = await findResourceAccessDocs(resourceId, currentUser.id);
    const existingEntries = existingDocs.map((d) => accesRessourceToJS(d.data(), d.id));
    const statuts = new Set(existingEntries.map((e) => (e.statut ?? e.status)).filter(Boolean));

    if (statuts.has('accepted')) {
      notify('Tu as déjà accès à cette ressource');
      return { status: 'already_accepted', resourceId, resourceName };
    }
    if (statuts.has('pending')) {
      notify('Ta demande est déjà en attente d\'approbation');
      return { status: 'already_pending', resourceId, resourceName };
    }

    // Previously rejected (or unknown status): re-submit by updating an existing doc if possible
    if (existingDocs.length > 0) {
      await accesRessourceRef().doc(existingDocs[0].id).update({
        statut: 'pending',
        invited_at: ts(),
        accepted_at: null,
      });
      notify('Demande envoyee — en attente de validation par un admin');
      return { status: 'pending_created', resourceId, resourceName };
    }

    await accesRessourceRef().add({
      ressource_id: resourceId, profil_id: currentUser.id,
      famille_id: currentUser.familyId || null,
      role: 'member', statut: 'pending',
      invited_at: ts(), accepted_at: null,
    });
    notify('Demande envoyee — en attente de validation par un admin');
    return { status: 'pending_created', resourceId, resourceName };
  } catch(e) {
    console.error(e);
    notify('Erreur — réessayez');
    return { status: 'error' };
  }
}
