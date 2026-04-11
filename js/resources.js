// ==========================================
// RESOURCES — MULTI-RESOURCE SUPPORT
// ==========================================

// Roles map: resourceId → role ('admin'|'member'|'guest')
window._myResourceRoles = {};

// Load resources — reads from new 'ressources' collection with fallback to legacy
// options.suppressEmptyWelcomeUI: do not open welcome sheet / empty main card (first-resource onboarding handles UX)
// Returns { needsFirstResourceOnboarding } — true only when suppressEmptyWelcomeUI and user has no resource to use yet
async function loadResources(options = {}) {
  const suppressEmptyWelcomeUI = options.suppressEmptyWelcomeUI === true;
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
        type: r.type || 'car',
        capacity: r.capacity ?? r.capacite ?? r.metadata?.capacity
      }));

      if (resources.length === 0) {
        renderNoAccessState();
        return { needsFirstResourceOnboarding: false };
      }

      selectedResource = resources.some((r) => r.id === selectedResource)
        ? selectedResource
        : resources[0].id;
      renderResourceTabs();
      subscribeBookings();
      fuelReportsByBooking = {};
      return { needsFirstResourceOnboarding: false };
    }

    const hasPendingResourceAccess = myAccessEntries.some(
      (e) => (e.statut ?? e.status) === 'pending'
    );
    if (hasPendingResourceAccess) {
      resources = [];
      window._myResourceRoles = {};
      selectedResource = null;
      const pendingEntry = myAccessEntries.find(
        (e) => (e.statut ?? e.status) === 'pending'
      );
      const pid = pendingEntry?.ressource_id || pendingEntry?.resourceId;
      let pendingName = '';
      if (pid) {
        try {
          const rd = await ressourcesRef().doc(pid).get();
          if (rd.exists) {
            const d = rd.data() || {};
            pendingName = d.nom || d.name || '';
          }
        } catch (_) {}
      }
      renderMinimalDashboardWhilePending(pendingName || 'cette maison ou voiture');
      return { needsFirstResourceOnboarding: false };
    }

    // Fallback when no accepted access: keep family-based behavior for first setup / pending users
    if (!familyId) {
      resources = [];
      window._myResourceRoles = {};
      selectedResource = null;
      if (!suppressEmptyWelcomeUI) showResourceChoiceSheet();
      return { needsFirstResourceOnboarding: suppressEmptyWelcomeUI };
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
      if (!suppressEmptyWelcomeUI) showResourceChoiceSheet();
      return { needsFirstResourceOnboarding: suppressEmptyWelcomeUI };
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
      return { needsFirstResourceOnboarding: false };
    }

    selectedResource = resources[0].id;
    renderResourceTabs();
    subscribeBookings();
    fuelReportsByBooking = {};
    return { needsFirstResourceOnboarding: false };
  } catch (e) {
    console.error('Firebase error (loadResources):', e);
    document.getElementById('cal-grid').innerHTML =
      '<div class="loading" style="flex-direction:column;gap:8px;color:var(--danger)">⚠️ Connexion impossible<br><small style="color:var(--text-light)">Vérifiez votre connexion ou Firebase.</small></div>';
    return { needsFirstResourceOnboarding: false };
  }
}

// Empty dashboard while access request is pending (no welcome / create resource card)
function renderMinimalDashboardWhilePending(resourceLabel) {
  const tabsEl = document.getElementById('resource-tabs');
  if (tabsEl) tabsEl.innerHTML = '';

  const rawName = resourceLabel || 'cette maison ou voiture';
  const name = String(rawName)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
  const mainCard = document.getElementById('resource-main-card');
  if (mainCard) {
    mainCard.innerHTML = `
      <div style="padding:32px 20px;text-align:center;max-width:340px;margin:0 auto">
        <div style="font-size: calc(44px * var(--ui-text-scale));margin-bottom:12px">⏳</div>
        <div style="font-weight:700;font-size: calc(19px * var(--ui-text-scale));margin-bottom:10px">Demande en cours</div>
        <div style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));line-height:1.55;margin-bottom:8px">
          L'admin de <strong>${name}</strong> n'a pas encore validé ta demande.
        </div>
        <div style="color:var(--text-light);font-size: calc(13px * var(--ui-text-scale));line-height:1.5;margin-bottom:20px">
          Tu recevras une notification dès que c'est fait.
        </div>
        <button type="button" class="btn btn-outline" style="width:100%" onclick="retryLoadResourcesPending()">Réessayer</button>
      </div>`;
  }

  const upcomingLabel = document.getElementById('upcoming-label');
  if (upcomingLabel) upcomingLabel.style.display = 'none';
  const upcomingBookings = document.getElementById('upcoming-bookings');
  if (upcomingBookings) upcomingBookings.innerHTML = '';
}

async function retryLoadResourcesPending() {
  showSkeleton();
  try {
    await loadResources({ suppressEmptyWelcomeUI: true });
  } finally {
    hideSkeleton();
  }
  if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
  if (typeof renderCalendar === 'function') renderCalendar();
}

// Show waiting state when user has no accessible resources
function renderNoAccessState() {
  const tabsEl = document.getElementById('resource-tabs');
  if (tabsEl) tabsEl.innerHTML = '';

  const mainCard = document.getElementById('resource-main-card');
  if (mainCard) {
    mainCard.innerHTML = `
      <div style="padding:36px 20px;text-align:center;max-width:340px;margin:0 auto">
        <div style="font-size: calc(48px * var(--ui-text-scale));margin-bottom:14px">🏠</div>
        <div style="font-weight:700;font-size: calc(19px * var(--ui-text-scale));margin-bottom:10px">Pas encore de maison ni de voiture</div>
        <div style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));line-height:1.55;margin-bottom:22px">
          Demande un lien à un proche, ou crée la tienne pour la famille.
        </div>
        <button type="button" class="btn btn-primary" style="width:100%;margin-bottom:10px" onclick="startFirstResourceOnboardingFromEmptyState()">Créer une maison ou une voiture</button>
        <button type="button" class="btn btn-outline" style="width:100%" onclick="openInviteLinkPromptFromDashboard()">J'ai un lien d'invitation</button>
      </div>`;
  }

  const upcomingLabel = document.getElementById('upcoming-label');
  if (upcomingLabel) upcomingLabel.style.display = 'none';
  const upcomingBookings = document.getElementById('upcoming-bookings');
  if (upcomingBookings) upcomingBookings.innerHTML = '';
}

function startFirstResourceOnboardingFromEmptyState() {
  if (typeof startFirstResourceOnboarding === 'function') startFirstResourceOnboarding();
}

async function openInviteLinkPromptFromDashboard() {
  const raw = window.prompt('Colle le lien ou le code d\'invitation :');
  if (!raw || !String(raw).trim()) return;
  let code = String(raw).trim();
  const m = code.match(/resource_join=([^&?#]+)/i);
  if (m) {
    try {
      code = decodeURIComponent(m[1].trim());
    } catch (_) {
      code = m[1].trim();
    }
  }
  if (!code) return;
  showSkeleton();
  try {
    await handleResourceJoinCode(code, { silent: false });
    await loadResources({ suppressEmptyWelcomeUI: true });
  } catch (e) {
    console.error(e);
    showToast('Impossible de traiter le lien');
  } finally {
    hideSkeleton();
  }
  if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
  if (typeof renderCalendar === 'function') renderCalendar();
}

// Legacy entry: route to full-screen onboarding (v2 — no welcome sheet)
function showResourceChoiceSheet() {
  const tabsEl = document.getElementById('resource-tabs');
  if (tabsEl) tabsEl.innerHTML = '';
  const mainCard = document.getElementById('resource-main-card');
  if (mainCard) {
    mainCard.innerHTML = '<div style="min-height:80px" aria-hidden="true"></div>';
  }
  document.getElementById('overlay')?.classList.remove('open');
  if (typeof startFirstResourceOnboarding === 'function' && currentUser?.id) {
    setTimeout(() => startFirstResourceOnboarding(), 0);
  }
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
// --resource-tabs-h : hauteur réelle #resource-tabs (sticky calendrier / planning)
// ==========================================
function syncResourceTabsHeight() {
  const el = document.getElementById('resource-tabs');
  const root = document.documentElement;
  if (!el) return;
  if (typeof window !== 'undefined' && !window._resourceTabsHeightLivePx) window._resourceTabsHeightLivePx = 0;
  try {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') {
      root.style.setProperty('--resource-tabs-h', '0px');
      // On conserve la dernière hauteur mesurée pour les UI sticky en mode réserve.
      const livePx = (typeof window !== 'undefined' ? window._resourceTabsHeightLivePx : 0) || 0;
      root.style.setProperty('--resource-tabs-h-live', livePx + 'px');
      return;
    }
    const h = el.getBoundingClientRect().height;
    const px = Math.ceil(Math.max(0, h));
    root.style.setProperty('--resource-tabs-h', px + 'px');
    root.style.setProperty('--resource-tabs-h-live', px + 'px');
    if (typeof window !== 'undefined') window._resourceTabsHeightLivePx = px;
  } catch (_) {}
}

function ensureResourceTabsResizeObserver() {
  const el = document.getElementById('resource-tabs');
  if (!el || typeof ResizeObserver === 'undefined') return;
  if (el.dataset.resourceTabsRo === '1') return;
  el.dataset.resourceTabsRo = '1';
  const ro = new ResizeObserver(() => syncResourceTabsHeight());
  ro.observe(el);
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

  const run = () => {
    syncResourceTabsHeight();
    ensureResourceTabsResizeObserver();
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
  } else {
    run();
  }
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

function _houseStayGroupKeyForDoc(d) {
  if (d.reservationGroupId) return String(d.reservationGroupId);
  const s = d.startDate || d.date_debut || d.date;
  const e = d.endDate || d.date_fin || s;
  const uid = d.userId || d.profil_id || '';
  return `stay_${uid}_${s}_${e}`;
}

function _peopleCountFromStayDoc(d) {
  const pc = Number(d.peopleCount);
  if (Number.isFinite(pc) && pc > 0) return pc;
  const c = d.companions != null ? Number(d.companions) : Number(d.guestCount);
  const extra = Number.isFinite(c) && c >= 0 ? c : 0;
  return 1 + extra;
}

/**
 * Agrège l'occupation (personnes) par jour pour les séjours maison, par groupe de réservation.
 */
function buildHouseStayOccupancyFromDocs(allDocs) {
  const dayToGroupPeople = {};
  for (const d of allDocs) {
    const gk = _houseStayGroupKeyForDoc(d);
    const people = _peopleCountFromStayDoc(d);
    const start = d.startDate || d.date_debut;
    const end = d.endDate || d.date_fin || start;
    if (start && end) {
      let cur = new Date(start + 'T00:00:00');
      const endObj = new Date(end + 'T00:00:00');
      while (cur <= endObj) {
        const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
        if (!dayToGroupPeople[ds]) dayToGroupPeople[ds] = {};
        dayToGroupPeople[ds][gk] = people;
        cur.setDate(cur.getDate() + 1);
      }
    } else if (d.date) {
      const ds = d.date;
      if (!dayToGroupPeople[ds]) dayToGroupPeople[ds] = {};
      dayToGroupPeople[ds][gk] = people;
    }
  }
  const occupancy = {};
  for (const ds of Object.keys(dayToGroupPeople)) {
    const byGroup = dayToGroupPeople[ds];
    let totalPeople = 0;
    for (const k of Object.keys(byGroup)) totalPeople += byGroup[k];
    occupancy[ds] = { totalPeople, byGroup };
  }
  return occupancy;
}

function subscribeBookings() {
  if (unsubscribe) unsubscribe();

  // Two separate maps so neither listener clears the other's data
  let _bookingsNew    = {};
  let _bookingsLegacy = {};
  let _allDocsNew = [];
  let _allDocsLegacy = [];
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
  }

  function _rebuild() {
    bookings = {};
    // Legacy first, new data takes precedence (overwrites same dates)
    Object.entries(_bookingsLegacy).forEach(([k, v]) => { bookings[k] = v; });
    Object.entries(_bookingsNew).forEach(([k, v]) => { bookings[k] = v; });

    const res = resources.find((r) => r.id === selectedResource);
    if (res && res.type === 'house') {
      const byId = new Map();
      for (const d of _allDocsLegacy) byId.set(d.id, d);
      for (const d of _allDocsNew) byId.set(d.id, d);
      houseStayOccupancyByDate = buildHouseStayOccupancyFromDocs([...byId.values()]);
    } else {
      houseStayOccupancyByDate = {};
    }

    renderCalendar();
    renderExperiencePanels();
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
        _allDocsNew = [];
        snap.forEach(doc => {
          const j = reservationToJS(doc.data(), doc.id);
          _allDocsNew.push(j);
          _expandToMap(j, _bookingsNew);
        });
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
          _allDocsLegacy = [];
          snap.forEach(doc => {
            const j = { id: doc.id, ...doc.data() };
            _allDocsLegacy.push(j);
            _expandToMap(j, _bookingsLegacy);
          });
          // Also pick up carId-only bookings
          legacyCol.where('carId', '==', selectedResource).get().then(snap2 => {
            snap2.forEach(doc => {
              const d = { id: doc.id, ...doc.data() };
              if (!d.resourceId) {
                _allDocsLegacy.push(d);
                _expandToMap(d, _bookingsLegacy);
              }
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
async function _familyRowForResourceCreation(id) {
  if (!id) return null;
  try {
    const snap = await familleRef(id).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return { id, name: data.nom || data.name || 'Espace partagé' };
  } catch (_) {
    return null;
  }
}

/**
 * Familles où l’utilisateur peut rattacher une nouvelle ressource : membres explicites
 * + familles déduites des accès ressource acceptés (invités sans ligne famille_membres).
 * Aligné sur loadFamilyName (js/app.js).
 */
async function _loadUserFamiliesForResourceCreation() {
  if (!currentUser?.id) return [];

  const families = [];
  const seen = new Set();

  const appendUniqueInOrder = async (orderedIds) => {
    const rows = await Promise.all(orderedIds.map((fid) => _familyRowForResourceCreation(fid)));
    for (const row of rows) {
      if (row && !seen.has(row.id)) {
        seen.add(row.id);
        families.push(row);
      }
    }
  };

  try {
    const memberSnap = await familleMembresRef().where('profil_id', '==', currentUser.id).get();
    const memberFamilyIds = [...new Set(memberSnap.docs.map((doc) => doc.data()?.famille_id).filter(Boolean))];
    await appendUniqueInOrder(memberFamilyIds);
  } catch (_) {}

  let myAccessEntries = [];
  try {
    myAccessEntries = await getMyResourceAccessEntries(currentUser.id, null);
  } catch (_) {}
  if (myAccessEntries.length === 0) {
    try {
      const snap = await db.collection('resource_access').where('profileId', '==', currentUser.id).get();
      snap.forEach((d) => myAccessEntries.push(accesRessourceToJS(d.data(), d.id)));
    } catch (_) {}
  }

  const acceptedFamilyIds = [
    ...new Set(
      myAccessEntries
        .filter((e) => (e.statut ?? e.status) === 'accepted')
        .map((e) => e.famille_id || e.familyId)
        .filter(Boolean)
    ),
  ];
  await appendUniqueInOrder(acceptedFamilyIds);

  return families;
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

/** Creates famille + famille_membres (admin) and sets currentUser.familyId. */
async function persistNewFamilyWithAdminMembership(familyName) {
  const name = (familyName || '').trim() || 'Mon espace';
  const familyRef = await famillesRef().add({
    nom: name,
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

/** Onboarding: user-provided family / space name (non-empty — validate in UI). */
async function createFamilyForOnboarding(familyName) {
  const name = (familyName || '').trim();
  if (!name) throw new Error('MISSING_FAMILY_NAME');
  return persistNewFamilyWithAdminMembership(name);
}

async function _ensureFamilyForNewResource(resourceName) {
  const selectedFamily = document.getElementById('add-res-family-select')?.value || '';
  if (selectedFamily && selectedFamily !== '__new__') return selectedFamily;

  const manualNewFamilyName = (document.getElementById('add-res-new-family-name')?.value || '').trim();
  const familyName = manualNewFamilyName || _slugifyDefaultFamilyName(resourceName);
  return persistNewFamilyWithAdminMembership(familyName);
}

async function showAddResourceSheet() {
  const userFamilies = await _loadUserFamiliesForResourceCreation();
  const hasFamilies = userFamilies.length > 0;

  let preferredFamilyId = null;
  if (selectedResource) {
    const res = resources.find((r) => r.id === selectedResource);
    preferredFamilyId = res?.famille_id || res?.familleId || null;
    if (!preferredFamilyId) {
      try {
        const rd = await ressourcesRef().doc(selectedResource).get();
        if (rd.exists) {
          const d = rd.data() || {};
          preferredFamilyId = d.famille_id || d.familyId || null;
        }
      } catch (_) {}
    }
  }
  const familySelectIndex = preferredFamilyId
    ? userFamilies.findIndex((f) => f.id === preferredFamilyId)
    : 0;
  const selectedFamilyOptionIndex = familySelectIndex >= 0 ? familySelectIndex : 0;

  const familyBlock = hasFamilies
    ? `
      <div class="input-group">
        <label>Famille</label>
        <select id="add-res-family-select" onchange="_toggleAddResourceFamilyFields()">
          ${userFamilies.map((family, index) => `<option value="${family.id}" ${index === selectedFamilyOptionIndex ? 'selected' : ''}>${family.name}</option>`).join('')}
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
  } catch(e) {     if (errEl) errEl.textContent = 'Erreur — réessayez'; }
}

/**
 * Create first resource during onboarding (family must already exist).
 * @param {object} p
 * @param {string} p.familyId
 * @param {'car'|'house'} p.type
 * @param {string} p.name
 * @param {string|null} [p.photoUrl]
 */
async function createResourceFromOnboarding(p) {
  const familyId = p.familyId;
  const type = p.type === 'house' ? 'house' : 'car';
  const name = (p.name || '').trim();
  if (!familyId || !name) throw new Error('INVALID_RESOURCE');

  const emoji = type === 'house' ? '🏠' : '🚗';
  const doc = {
    famille_id: familyId,
    nom: name,
    name,
    type,
    emoji,
    createdAt: ts()
  };

  if (p.photoUrl) doc.photoUrl = p.photoUrl;

  if (type === 'house') {
    const cap = parseInt(String(p.capacity || ''), 10);
    if (Number.isFinite(cap) && cap > 0) doc.capacity = cap;
    const rooms = parseInt(String(p.rooms || ''), 10);
    if (Number.isFinite(rooms) && rooms > 0) doc.rooms = rooms;
    const st = (p.address_street || '').trim();
    const city = (p.address_city || '').trim();
    const pc = (p.address_postal_code || '').trim();
    const country = (p.address_country || '').trim();
    if (st) doc.address_street = st;
    if (city) doc.address_city = city;
    if (pc) doc.address_postal_code = pc;
    if (country) doc.address_country = country;
  } else {
    const seats = parseInt(String(p.seats || ''), 10);
    if (Number.isFinite(seats) && seats > 0) doc.seatCount = seats;
    const ft = (p.fuelType || '').trim();
    if (ft) doc.fuelType = ft;
    const km = (p.mileageKm || '').trim();
    if (km !== '') doc.mileageKm = km;
    if (p.carBluetooth === true || p.carBluetooth === false) doc.carBluetooth = p.carBluetooth;
    const lieu = (p.lieu || '').trim();
    if (lieu) doc.lieu = lieu;
  }

  const ref = await ressourcesRef().add(doc);
  resources.push({ id: ref.id, name, type, emoji });

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
      ressource_id: ref.id,
      profil_id: currentUser.id,
      famille_id: familyId,
      role: 'admin',
      statut: 'accepted',
      invited_at: ts(),
      accepted_at: ts(),
    });
  }
  if (!window._myResourceRoles) window._myResourceRoles = {};
  window._myResourceRoles[ref.id] = 'admin';

  return ref.id;
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
  const displayName = res.name || res.nom || '';
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <div id="resource-photo-preview" style="width:92px;height:92px;border-radius:16px;overflow:hidden;background:#f3f4f6;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size: calc(44px * var(--ui-text-scale))">${photoPreview}</div>
      <label style="font-size: calc(12px * var(--ui-text-scale));color:var(--accent);cursor:pointer;text-decoration:underline" onclick="document.getElementById('resource-photo-input').click()">Modifier la photo</label>
      <input type="file" id="resource-photo-input" accept="image/*" style="display:none" onchange="handleResourcePhoto(this)">
      <div class="input-group" style="margin-top:16px">
        <label>Nom</label>
        <input type="text" id="car-name" placeholder="Ex : Mercedes 180 A" value="${_rmEscapeHtml(displayName)}">
      </div>
      ${plaque ? `<div style="display:inline-block;font-size: calc(12px * var(--ui-text-scale));font-weight:700;color:var(--accent);background:rgba(99,102,241,0.10);border:1px solid rgba(99,102,241,0.18);border-radius:6px;padding:3px 10px;letter-spacing:0.5px;margin-bottom:12px">${_rmEscapeHtml(plaque)}</div>` : '<div style="margin-bottom:12px"></div>'}
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
  const carName = (document.getElementById('car-name')?.value || '').trim();
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
    if (carName) {
      updates.name = carName;
      updates.nom = carName;
    }
    if (Number.isFinite(seatParsed) && seatParsed > 0) updates.seatCount = seatParsed;
    else updates.seatCount = null;
    if (fuelType) updates.fuelType = fuelType;
    else updates.fuelType = null;
    if (mileageRaw) {
      const digits = String(mileageRaw).replace(/\D/g, '');
      const n = parseInt(digits, 10);
      updates.mileageKm = digits && Number.isFinite(n) ? n : mileageRaw;
    } else {
      updates.mileageKm = null;
    }
    if (btRaw === 'yes') updates.carBluetooth = true;
    else if (btRaw === 'no') updates.carBluetooth = false;
    else updates.carBluetooth = null;
    if (photoUrl) updates.photoUrl = photoUrl;

    await ressourcesRef().doc(selectedResource).update(updates);

    const res = resources.find(r => r.id === selectedResource);
    if (res) Object.assign(res, updates);
    window._resourcePhotoDraft = null;
    closeSheet();
    showToast('Infos enregistrées ✓');
    if (typeof renderResourceTabs === 'function') renderResourceTabs();
    if (typeof renderCalendar === 'function') renderCalendar();
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
  const houseName = res.name || res.nom || '';
  const capNum = typeof getResourceHouseCapacityNumber === 'function' ? getResourceHouseCapacityNumber(res) : null;
  const capStr = capNum != null ? String(capNum) : '';
  const roomsRaw = res.rooms ?? res.bedrooms ?? res.chambres;
  const roomsStr = roomsRaw != null && roomsRaw !== '' ? String(roomsRaw) : '';
  const photoPreview = res.photoUrl
    ? `<img src="${res.photoUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : (res.emoji || '🏠');
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <div id="resource-photo-preview" style="width:92px;height:92px;border-radius:16px;overflow:hidden;background:#f3f4f6;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size: calc(44px * var(--ui-text-scale))">${photoPreview}</div>
      <label style="font-size: calc(12px * var(--ui-text-scale));color:var(--accent);cursor:pointer;text-decoration:underline" onclick="document.getElementById('resource-photo-input').click()">Modifier la photo</label>
      <input type="file" id="resource-photo-input" accept="image/*" style="display:none" onchange="handleResourcePhoto(this)">
      <h2>Info maison</h2>
      <div style="color:var(--text-light);font-size: calc(12px * var(--ui-text-scale));margin-bottom:14px">${res.emoji || '🏠'} Renseignez toutes les informations de la maison.</div>
      <div class="input-group">
        <label>Nom</label>
        <input type="text" id="house-name" placeholder="Ex : Maison des champs" value="${_rmEscapeHtml(houseName)}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="input-group">
          <label>Capacité (personnes)</label>
          <input type="number" id="house-capacity" min="1" max="999" placeholder="ex. 8" value="${_rmEscapeHtml(capStr)}">
        </div>
        <div class="input-group">
          <label>Pièces (optionnel)</label>
          <input type="number" id="house-rooms" min="0" max="99" placeholder="ex. 4" value="${_rmEscapeHtml(roomsStr)}">
        </div>
      </div>
      <div class="input-group">
        <label>Rue</label>
        <input type="text" id="house-address-street" placeholder="123 rue..." value="${_rmEscapeHtml(structuredAddress.street || '')}">
      </div>
      <div class="input-group">
        <label>Ville</label>
        <input type="text" id="house-address-city" placeholder="Les Lèves-et-Thoumeyragues" value="${_rmEscapeHtml(structuredAddress.city || '')}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="input-group">
          <label>Code postal</label>
          <input type="text" id="house-address-postal" placeholder="33220" value="${_rmEscapeHtml(structuredAddress.postalCode || '')}">
        </div>
        <div class="input-group">
          <label>Pays</label>
          <input type="text" id="house-address-country" placeholder="France" value="${_rmEscapeHtml(structuredAddress.country || '')}">
        </div>
      </div>
      <div class="input-group">
        <label>Observations</label>
        <textarea id="house-observations" placeholder="Notes importantes..." rows="3" style="resize:none;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size: calc(14px * var(--ui-text-scale));width:100%">${_rmEscapeHtml(res.observations || '')}</textarea>
      </div>
      <button class="btn btn-primary" onclick="saveHouseInfo()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function saveHouseInfo() {
  const houseName = (document.getElementById('house-name')?.value || '').trim();
  const capRaw = document.getElementById('house-capacity')?.value;
  const roomsRaw = document.getElementById('house-rooms')?.value;
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
    if (houseName) {
      updates.name = houseName;
      updates.nom = houseName;
    }
    const capTrim = String(capRaw ?? '').trim();
    if (capTrim === '') {
      updates.capacity = null;
      updates.capacite = null;
    } else {
      const capParsed = parseInt(capTrim, 10);
      if (Number.isFinite(capParsed) && capParsed > 0) {
        updates.capacity = capParsed;
        updates.capacite = capParsed;
      }
    }
    const roomsTrim = String(roomsRaw ?? '').trim();
    if (roomsTrim === '') {
      updates.rooms = null;
    } else {
      const roomsParsed = parseInt(roomsTrim, 10);
      if (Number.isFinite(roomsParsed) && roomsParsed >= 0) updates.rooms = roomsParsed;
    }
    if (photoUrl) updates.photoUrl = photoUrl;
    await ressourcesRef().doc(selectedResource).update(updates);
    const res = resources.find(r => r.id === selectedResource);
    if (res) Object.assign(res, updates);
    window._resourcePhotoDraft = null;
    closeSheet();
    showToast('Infos maison enregistrées ✓');
    if (typeof renderResourceTabs === 'function') renderResourceTabs();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
    if (typeof renderProfileTab === 'function') renderProfileTab();
  } catch(e) { showToast('Erreur — réessayez'); }
}

function handleResourcePhoto(input) {
  if (!input?.files?.[0]) return;
  resizePhotoFile(input.files[0], (dataUrl) => {
    window._resourcePhotoDraft = dataUrl;
    const previewWrap = document.getElementById('resource-photo-preview');
    if (previewWrap) previewWrap.innerHTML = `<img src="${dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`;
  }, window.PHOTO_PRESET_RESOURCE);
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

  const inviteBlockHtml = viewModel.permissions.canInvite && viewModel.invite?.inviteCode
    ? `
      <div class="rm-section-lbl">Inviter à rejoindre</div>
      <p class="rm-invite-lede">Partagez le lien ou communiquez le code et le mot de passe.</p>
      <div class="rm-members-group rm-invite-group">
        <div class="rm-invite-row">
          <div class="rm-invite-cell">
            <div class="rm-m-name">Lien</div>
            <div class="rm-m-joined rm-invite-url-line" title="${_rmEscapeHtml(viewModel.invite.displayUrl || '')}">${_rmEscapeHtml(viewModel.invite.displayUrl || '')}</div>
          </div>
          <div class="rm-invite-row-actions">
            <button type="button" class="rm-invite-action-txt" onclick='_rmCopyInviteLink(${JSON.stringify(resource.id)})'>Copier</button>
            <button type="button" class="rm-invite-action-txt rm-invite-action-txt--soft" onclick='_rmShareResourceInvite(${JSON.stringify(resource.id)})' aria-label="Partager le lien">Partager</button>
          </div>
        </div>
        <div class="rm-invite-row rm-invite-row--stack">
          <div class="rm-invite-cell rm-invite-cell--fill">
            <div class="rm-m-name">Code d'activation</div>
            <input type="text" id="rm-invite-code-input" class="rm-invite-input-line rm-invite-input-line--code" value="${_rmEscapeHtml(viewModel.invite.inviteCode)}" maxlength="8" autocomplete="off" spellcheck="false" aria-label="Code d'activation">
            <div class="lock-error rm-invite-line-err" id="rm-invite-code-error" role="alert"></div>
          </div>
          <button type="button" class="rm-p-btn-reject rm-invite-save-btn" onclick='_rmSaveInviteCode(${JSON.stringify(resource.id)})'>Enregistrer</button>
        </div>
        <div class="rm-invite-row rm-invite-row--stack">
          <div class="rm-invite-cell rm-invite-cell--fill">
            <div class="rm-m-name">Mot de passe</div>
            <div class="rm-m-joined">4 chiffres pour valider les demandes</div>
            <input type="text" id="rm-join-pin-field" class="rm-invite-input-line rm-invite-input-line--pin" value="${_rmEscapeHtml(viewModel.invite.joinPin || '')}" maxlength="4" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Mot de passe à 4 chiffres">
            <div class="lock-error rm-invite-line-err" id="rm-join-pin-error" role="alert"></div>
          </div>
          <button type="button" class="rm-p-btn-reject rm-invite-save-btn" onclick='_rmSaveJoinPin(${JSON.stringify(resource.id)})'>Enregistrer</button>
        </div>
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
          ? `<button class="rm-m-menu" type="button" onclick='_rmMemberMenu(${JSON.stringify(member.accessId)}, ${JSON.stringify(member.name)}, ${JSON.stringify(resource.id)}, ${JSON.stringify(member.role || 'member')}, ${stats.adminCount})'>···</button>`
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
      ${inviteBlockHtml}
      ${pendingHtml}
      <div class="rm-section-lbl">Membres actifs</div>
      <div class="rm-members-group">${membersHtml}</div>
      ${dangerHtml}
    </div>`;
}

function _rmSetupJoinPinInputs() {
  const field = document.getElementById('rm-join-pin-field');
  if (!field) return;
  field.addEventListener('input', () => {
    const cleaned = String(field.value || '').replace(/\D/g, '').slice(0, 4);
    if (field.value !== cleaned) field.value = cleaned;
  });
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
    _rmSetupJoinPinInputs();
  } catch (e) {
    console.error('Resource manage page error:', e);
    content.innerHTML = _rmErrorMarkup();
  }
}

async function _rmSaveJoinPin(resourceId) {
  const errEl = document.getElementById('rm-join-pin-error');
  if (errEl) errEl.textContent = '';
  const field = document.getElementById('rm-join-pin-field');
  const pin = field ? String(field.value || '').replace(/\D/g, '').slice(0, 4) : '';
  const resForFam = resources.find((r) => r.id === resourceId);
  const familyIdForResource = resForFam?.famille_id || resForFam?.familleId || currentUser.familyId;
  if (!familyIdForResource) {
    if (errEl) errEl.textContent = 'Famille introuvable';
    return;
  }
  try {
    await resourceService.updateJoinPinForResource({
      resourceId,
      rawPin: pin,
      currentUserId: currentUser.id,
      familyId: familyIdForResource,
    });
    showToast(pin ? 'Mot de passe mis à jour ✓' : 'Mot de passe supprimé ✓');
    await showResourceManagePage(resourceId);
  } catch (e) {
    const msg = e?.message || '';
    if (errEl) {
      errEl.textContent = msg === 'FORBIDDEN' ? 'Action non autorisée'
        : msg === 'INVALID_PIN' ? 'Entrez 4 chiffres ou laissez vide pour supprimer'
        : 'Erreur — réessayez';
    }
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

async function _rmMemberMenu(accessId, memberName, resourceId, memberRole, adminCount) {
  const overlay = document.getElementById('resource-manage-overlay');
  if (!overlay) return;

  // Remove any existing inline sheet
  const existing = document.getElementById('rm-inline-sheet');
  if (existing) existing.remove();

  const roleNorm = memberRole || 'member';
  const ac = typeof adminCount === 'number' ? adminCount : 0;
  const promoteBtn = roleNorm !== 'admin'
    ? `<button class="btn" style="background:var(--accent);color:#fff;margin-bottom:10px" onclick='_rmSetMemberRole(${JSON.stringify(accessId)}, ${JSON.stringify(memberName)}, ${JSON.stringify(resourceId)}, ${JSON.stringify('admin')})'>Nommer administrateur</button>`
    : '';
  const demoteBtn = roleNorm === 'admin' && ac > 1
    ? `<button class="btn" style="background:#f5f5f5;color:var(--text);margin-bottom:10px" onclick='_rmSetMemberRole(${JSON.stringify(accessId)}, ${JSON.stringify(memberName)}, ${JSON.stringify(resourceId)}, ${JSON.stringify('member')})'>Rétrograder en membre</button>`
    : '';

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
        ${promoteBtn}
        ${demoteBtn}
        <button class="btn btn-danger" onclick='_rmRemoveMember(${JSON.stringify(accessId)}, ${JSON.stringify(memberName)}, ${JSON.stringify(resourceId)});document.getElementById("rm-inline-sheet")?.remove()'>Retirer l'accès</button>
        <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick='document.getElementById("rm-inline-sheet")?.remove()'>Annuler</button>
      </div>
    </div>`;
  overlay.appendChild(sheet);
}

/** Met à jour window._myResourceRoles après un changement de rôle (ex. rétrogradation de soi-même). */
async function _refreshMyRoleForResource(resourceId) {
  if (!currentUser?.id || !resourceId) return;
  try {
    const docs = await findResourceAccessDocs(resourceId, currentUser.id);
    const entries = docs.map((d) => accesRessourceToJS(d.data(), d.id));
    const accepted = entries.filter((e) => (e.statut ?? e.status) === 'accepted');
    if (accepted.length === 0) {
      delete window._myResourceRoles[resourceId];
      return;
    }
    let best = 'guest';
    for (const e of accepted) {
      const r = e.role || 'guest';
      if (r === 'admin') {
        best = 'admin';
        break;
      }
      if (r === 'member' && best === 'guest') best = 'member';
    }
    window._myResourceRoles[resourceId] = best;
  } catch (_) {}
}

async function _rmSetMemberRole(accessId, memberName, resourceId, newRole) {
  document.getElementById('rm-inline-sheet')?.remove();
  try {
    await resourceService.setMemberRole({
      accessId,
      newRole,
      currentUserId: currentUser?.id || null,
    });
    showToast(
      newRole === 'admin'
        ? `${memberName} est administrateur`
        : 'Rôle mis à jour',
    );
    await _refreshMyRoleForResource(resourceId);
    await showResourceManagePage(resourceId);
  } catch (e) {
    const m = e?.message || '';
    if (m === 'LAST_ADMIN') {
      showToast('Il doit rester au moins un administrateur.');
    } else if (m === 'ACCESS_FORBIDDEN' || m === 'FORBIDDEN') {
      showToast('Action non autorisée');
    } else if (m === 'ACCESS_INVALID_STATE' || m === 'ACCESS_NOT_FOUND') {
      showToast('Accès introuvable ou invalide');
    } else if (m === 'INVALID_ROLE') {
      showToast('Rôle invalide');
    } else {
      showToast('Erreur — réessayez');
    }
  }
}

async function _rmRemoveMember(accessId, memberName, resourceId) {
  try {
    await resourceService.removeManageAccess({
      accessId,
      approverProfileId: currentUser?.id || null,
    });
    showToast(`${memberName} retiré(e)`);
    await showResourceManagePage(resourceId);
  } catch(e) { showToast('Erreur — réessayez'); }
}

function _rmEditResource(resourceId, editMode) {
  selectResource(resourceId);
  hideResourceManagePage();
  if (typeof famresaResourceEditHubOpen === 'function') {
    famresaResourceEditHubOpen(resourceId);
    return;
  }
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

function _resourceHasJoinPin(data) {
  return String((data && data.joinPin) || '').replace(/\D/g, '').length === 4;
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
    const resourceFamilyId = resourceData.famille_id || resourceData.familyId || null;

    const existingDocs = await findResourceAccessDocs(resourceId, currentUser.id);
    const existingEntries = existingDocs.map((d) => accesRessourceToJS(d.data(), d.id));
    const statuts = new Set(existingEntries.map((e) => (e.statut ?? e.status)).filter(Boolean));

    if (statuts.has('accepted')) {
      notify('Tu as déjà accès à cette ressource');
      return { status: 'already_accepted', resourceId, resourceName };
    }
    if (statuts.has('pending')) {
      notify('Ta demande est déjà en attente d\'approbation');
      return {
        status: 'already_pending',
        resourceId,
        resourceName,
        hasJoinPin: _resourceHasJoinPin(resourceData),
      };
    }

    // Previously rejected (or unknown status): re-submit by updating an existing doc if possible
    if (existingDocs.length > 0) {
      await accesRessourceRef().doc(existingDocs[0].id).update({
        statut: 'pending',
        invited_at: ts(),
        accepted_at: null,
        ...(resourceFamilyId ? { famille_id: resourceFamilyId } : {}),
      });
      notify('Demande envoyee — en attente de validation par un admin');
      return {
        status: 'pending_created',
        resourceId,
        resourceName,
        hasJoinPin: _resourceHasJoinPin(resourceData),
      };
    }

    await accesRessourceRef().add({
      ressource_id: resourceId, profil_id: currentUser.id,
      famille_id: resourceFamilyId || currentUser.familyId || null,
      role: 'member', statut: 'pending',
      invited_at: ts(), accepted_at: null,
    });
    notify('Demande envoyee — en attente de validation par un admin');
    return {
      status: 'pending_created',
      resourceId,
      resourceName,
      hasJoinPin: _resourceHasJoinPin(resourceData),
    };
  } catch(e) {
    console.error(e);
    notify('Erreur — réessayez');
    return { status: 'error' };
  }
}

if (typeof window !== 'undefined' && !window._resourceTabsHeightResizeBound) {
  window._resourceTabsHeightResizeBound = true;
  let _resourceTabsResizeDebounce = null;
  window.addEventListener(
    'resize',
    () => {
      if (_resourceTabsResizeDebounce != null) clearTimeout(_resourceTabsResizeDebounce);
      _resourceTabsResizeDebounce = setTimeout(() => {
        _resourceTabsResizeDebounce = null;
        if (typeof syncResourceTabsHeight === 'function') syncResourceTabsHeight();
      }, 100);
    },
    { passive: true }
  );
}
