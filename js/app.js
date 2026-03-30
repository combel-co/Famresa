// ==========================================
// GLOBAL STATE
// ==========================================
let currentUser = JSON.parse(localStorage.getItem('famcar_user') || 'null');
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let bookings = {};
let resources = [];
let selectedResource = null;
let unsubscribe = null;
let tempPhoto = null;
let activeTab = 'dashboard';
let fuelReportsByBooking = {};
let pendingFuelPromptBookingId = null;
let suPendingFamilyId = null;
window._legacyFallbackAllowed = true;
/** Set from dashboard "Réserver" — consumed on first free-day tap in planning (skip micro-prompt). */
window._planningBookingMode = false;

function switchToBookingMode() {
  if (!currentUser) {
    if (typeof showWelcomeScreen === 'function') showWelcomeScreen();
    return;
  }
  window._planningBookingMode = true;
  switchTab('planning');
}

function setBottomNavBookingActive(active) {
  document.querySelector('.bottom-nav')?.classList.toggle('booking-active', !!active);
}

function isLegacyFallbackAllowed() {
  return window._legacyFallbackAllowed !== false;
}

// Keep --header-h in sync on orientation change (debounced — avoid iOS scroll jitter)
var _resizeTimer;
window.addEventListener('resize', function () {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(function () {
    var h = document.getElementById('app-header');
    if (h && h.offsetHeight > 0)
      document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
  }, 250);
}, { passive: true });

// ==========================================
// Resource tabs are now sticky pills — no scroll animation needed

// ==========================================
// FAMILY SELECTOR
// ==========================================
let _currentFamilyName = 'Famille';
let _userFamilies = []; // { id, name } — real families for this user

function updateFamilyPill(name) {
  _currentFamilyName = name || 'Famille';
  const el = document.getElementById('family-name-display');
  if (el) el.textContent = _currentFamilyName;
}

async function loadFamilyName() {
  if (!currentUser?.familyId) return;
  try {
    try {
      const currentFamDoc = await familleRef(currentUser.familyId).get();
      if (currentFamDoc.exists) {
        const fd = currentFamDoc.data() || {};
        // Admin switch used during DB cleanup: disable legacy collections fallback when true.
        window._legacyFallbackAllowed = fd.disable_legacy_fallback !== true;
      }
    } catch (_) {}

    // Load families the user belongs to (via famille_membres)
    _userFamilies = [];
    try {
      const memSnap = await familleMembresRef()
        .where('profil_id', '==', currentUser.id).get();
      const familyIds = [...new Set(memSnap.docs.map(d => d.data().famille_id).filter(Boolean))];
      for (const fid of familyIds) {
        try {
          const fDoc = await familleRef(fid).get();
          if (fDoc.exists) {
            _userFamilies.push({ id: fid, name: fDoc.data().nom || fDoc.data().name || 'Famille' });
          }
        } catch(_) {}
      }
    } catch(_) {}

    // Compatibility: also include families found through accepted resource access.
    // This keeps migrated resources reachable even if famille_membres wasn't updated yet.
    try {
      const accessSnap = await accesRessourceRef()
        .where('profil_id', '==', currentUser.id)
        .get();
      const acceptedFamilyIds = accessSnap.docs
        .map((doc) => accesRessourceToJS(doc.data(), doc.id))
        .filter((entry) => (entry.statut ?? entry.status) === 'accepted')
        .map((entry) => entry.famille_id || entry.familyId)
        .filter(Boolean);
      const existingIds = new Set(_userFamilies.map((f) => f.id));
      const missingIds = [...new Set(acceptedFamilyIds)].filter((fid) => !existingIds.has(fid));
      for (const fid of missingIds) {
        try {
          const fDoc = await familleRef(fid).get();
          if (fDoc.exists) {
            _userFamilies.push({ id: fid, name: fDoc.data().nom || fDoc.data().name || 'Famille' });
          }
        } catch(_) {}
      }
    } catch(_) {}

    // Fallback: at least show current family
    if (_userFamilies.length === 0) {
      let name = '';
      try {
        const doc = await familleRef(currentUser.familyId).get();
        if (doc.exists) name = doc.data().nom || doc.data().name || '';
      } catch(_) {}
      if (!name) {
        const doc = await db.collection('families').doc(currentUser.familyId).get();
        if (doc.exists) name = doc.data().name || doc.data().nom || '';
      }
      _userFamilies = [{ id: currentUser.familyId, name: name || 'Ma famille' }];
    }

    const current = _userFamilies.find(f => f.id === currentUser.familyId);
    if (current) updateFamilyPill(current.name);
  } catch (e) { /* silent fallback */ }
}

function toggleFamilyPicker() {
  const picker = document.getElementById('family-picker-dropdown');
  if (!picker) return;
  if (picker.style.display === 'block') { picker.style.display = 'none'; return; }
  if (_userFamilies.length <= 1) return; // No picker if only 1 family
  picker.innerHTML = _userFamilies.map((f, i) => {
    const active = f.id === currentUser.familyId;
    return `<div class="family-picker-item${active ? ' active' : ''}" onclick="selectFamily('${f.id}')">
      <span>${f.name}</span>
      ${active ? '<span class="family-picker-check">✓</span>' : ''}
    </div>${i < _userFamilies.length - 1 ? '<div class="family-picker-divider"></div>' : ''}`;
  }).join('');
  picker.style.display = 'block';
}

function selectFamily(familyId) {
  const fam = _userFamilies.find(f => f.id === familyId);
  if (!fam) return;
  currentUser.familyId = familyId;
  localStorage.setItem('famcar_user', JSON.stringify(currentUser));
  updateFamilyPill(fam.name);
  const picker = document.getElementById('family-picker-dropdown');
  if (picker) picker.style.display = 'none';
  loadResources();
}

document.addEventListener('click', function (e) {
  const picker = document.getElementById('family-picker-dropdown');
  const pill   = document.getElementById('family-pill');
  if (picker && picker.style.display === 'block') {
    if (!picker.contains(e.target) && !pill.contains(e.target))
      picker.style.display = 'none';
  }
});

// ==========================================
// TAB SWITCHING
// ==========================================
function switchTab(tab) {
  const normalizedTab = (tab === 'resource')
    ? 'dashboard'
    : (tab === 'planning' ? 'calendar' : (tab === 'history' ? 'profile' : tab));
  const prevTab = activeTab;
  activeTab = normalizedTab;
  if (prevTab === 'calendar' && normalizedTab !== 'calendar' && typeof window.exitPlanningUnifiedMode === 'function') {
    window.exitPlanningUnifiedMode();
  }
  ['dashboard', 'calendar', 'profile'].forEach(name => {
    const isActive = name === normalizedTab;
    const panel = document.getElementById(`tab-${name}`);
    if (panel) panel.classList.toggle('active', isActive);
    const legacyNavBtn = document.getElementById(`nav-${name}`);
    if (legacyNavBtn) legacyNavBtn.classList.toggle('active', isActive);
  });
  document.querySelectorAll('.bottom-nav .nav-item[data-tab]').forEach((item) => {
    const t = item.getAttribute('data-tab');
    const mapped = t === 'planning' ? 'calendar' : (t === 'history' ? 'profile' : t);
    item.classList.toggle('active', mapped === normalizedTab);
  });
  if (typeof syncPlanningShellChrome === 'function') {
    syncPlanningShellChrome();
  } else {
    const appHeader = document.getElementById('app-header');
    const resourceTabs = document.getElementById('resource-tabs');
    if (appHeader) appHeader.style.display = normalizedTab === 'profile' ? 'none' : '';
    if (resourceTabs) resourceTabs.style.display = normalizedTab === 'profile' ? 'none' : '';
  }

  if (normalizedTab === 'dashboard') renderExperiencePanels();
  if (normalizedTab === 'profile') renderProfileTab();
  if (normalizedTab === 'calendar' && typeof renderCalendar === 'function') renderCalendar();

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (typeof syncResourceTabsHeight === 'function') syncResourceTabsHeight();
    });
  } else if (typeof syncResourceTabsHeight === 'function') {
    syncResourceTabsHeight();
  }
}

/**
 * Recharge les données sans écran de chargement ni rechargement de page.
 * Conserve l’onglet actif et la ressource sélectionnée lorsque possible.
 */
async function refreshAppDataSilently() {
  const tab = activeTab;
  if (typeof loadResources !== 'function') return;
  await loadResources({ suppressEmptyWelcomeUI: true });
  if (typeof switchTab === 'function') switchTab(tab);
  if (typeof loadFamilyName === 'function') await loadFamilyName().catch(() => {});
  if (typeof renderCalendar === 'function') renderCalendar();
  if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
}

// ==========================================
// BOOKING HELPERS
// ==========================================
function getMonthBookingEntries() {
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-`;
  const seen = new Set();
  const result = [];
  Object.entries(bookings).forEach(([dateStr, b]) => {
    if (dateStr.startsWith(monthPrefix) && b && !seen.has(b.id)) {
      seen.add(b.id); result.push(b);
    }
  });
  return result;
}

function getUniqueBookingsSorted() {
  const seen = new Set();
  const unique = [];
  Object.values(bookings).forEach((b) => {
    if (!b || !b.id || seen.has(b.id)) return;
    seen.add(b.id);
    unique.push(b);
  });
  return unique.sort((a, b) => ((b.startDate || b.date || '')).localeCompare(a.startDate || a.date || ''));
}

/** Heure locale sur une date YYYY-MM-DD (réservations, bandeau trajet). */
function _parseTimeOnDate(dateStr, hm) {
  if (!dateStr || typeof dateStr !== 'string') return NaN;
  const p = dateStr.split('-').map(Number);
  if (p.length < 3 || !p.every((x) => Number.isFinite(x))) return NaN;
  const parts = String(hm || '09:00').trim().split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  return new Date(p[0], p[1] - 1, p[2], Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0).getTime();
}

function bookingStartMs(b) {
  const sd = b.startDate || b.date || '';
  if (!sd) return NaN;
  return _parseTimeOnDate(sd, b.startHour || '09:00');
}

function bookingEndMs(b) {
  const sd = b.startDate || b.date || '';
  const ed = b.endDate || b.date_fin || sd;
  if (!ed) return NaN;
  const eh = b.endHour != null && String(b.endHour).trim() !== '' ? b.endHour : '23:59';
  return _parseTimeOnDate(ed, eh);
}

function bookingIsActiveNow(b) {
  const t = Date.now();
  const s = bookingStartMs(b);
  const e = bookingEndMs(b);
  return Number.isFinite(s) && Number.isFinite(e) && t >= s && t <= e;
}

function resolveTripTargetBooking(resourceId) {
  if (!currentUser) return { currentMine: null, upcomingMine: null, targetBooking: null };
  const mineBookings = getUniqueBookingsSorted()
    .filter((b) => {
      const bRes = b.ressource_id || b.resourceId || selectedResource;
      const start = b.startDate || b.date || '';
      return b.userId === currentUser.id && bRes === resourceId && !!start;
    })
    .sort((a, b) => bookingStartMs(a) - bookingStartMs(b));
  const now = Date.now();
  const currentMine = mineBookings.find((b) => bookingIsActiveNow(b));
  const upcomingMine = mineBookings.find((b) => bookingStartMs(b) > now);
  const targetBooking = currentMine || upcomingMine || null;
  return { currentMine, upcomingMine, targetBooking, mineBookings };
}

/** Étincelant / Propre / Sale ; ancien `average` et valeur absente → affichage Propre. */
function carCleanlinessLabel(raw) {
  const c = raw || '';
  if (c === 'sparkling') return 'Étincelant';
  if (c === 'dirty') return 'Sale';
  return 'Propre';
}

/**
 * Nuits entre jour d’arrivée et jour de départ (jour de départ = départ le matin, exclu des nuits).
 * Ex. 7 mai → 10 mai = 3 nuits. Midi local évite les décalages DST.
 */
function countStayNights(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const s = new Date(startStr + 'T12:00:00');
  const e = new Date(endStr + 'T12:00:00');
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
}

function formatBookingDateRange(booking) {
  const start = booking.startDate || booking.date;
  const end = booking.endDate || booking.date;
  if (!start) return '—';
  const sd = new Date(start + 'T00:00:00');
  const ed = new Date(end + 'T00:00:00');
  if (start === end) return sd.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
  return `${sd.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })} → ${ed.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' })}`;
}

function getBookingDestinationLabel(booking) {
  if (!booking) return 'Destination non précisée';
  if (typeof booking.destination === 'string' && booking.destination.trim()) return booking.destination.trim();
  if (Array.isArray(booking.destinations) && booking.destinations.length > 0) {
    const names = booking.destinations.map(d => (d?.name || '').trim()).filter(Boolean);
    if (names.length) return names.join(', ');
  }
  return 'Destination non précisée';
}

function estimateRoundTripKm(destination) {
  const map = {
    'Paris intra-muros': 12, 'Versailles': 46, 'Roissy CDG': 66, 'Orly': 38,
    'Lille': 450, 'Reims': 290, 'Orléans': 268, 'Rouen': 272, 'Lyon': 930,
    'Nantes': 770, 'Bordeaux': 1170, 'Marseille': 1540
  };
  return map[destination] || null;
}

function estimateDistanceForBooking(booking) {
  if (!booking) return 0;
  if (typeof booking.kmEstimate === 'number' && booking.kmEstimate > 0) return booking.kmEstimate;
  if (typeof booking.distanceKm === 'number' && booking.distanceKm > 0) return booking.distanceKm;
  if (Array.isArray(booking.destinations) && booking.destinations.length > 0) {
    const fromDestinations = booking.destinations
      .map(d => Number(d?.kmFromParis || 0))
      .filter(km => Number.isFinite(km) && km > 0)
      .reduce((sum, km) => sum + (km * 2), 0);
    if (fromDestinations > 0) return fromDestinations;
  }
  const destination = getBookingDestinationLabel(booking);
  const estimated = estimateRoundTripKm(destination);
  return estimated || 0;
}

function getFuelReturnLevelForBooking(booking) {
  if (!booking) return null;
  if (booking.fuelReturnLevel !== undefined && booking.fuelReturnLevel !== null) return booking.fuelReturnLevel;
  return fuelReportsByBooking[booking.id]?.fuelReturnLevel ?? null;
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getDateRange(startStr, endStr) {
  const dates = [];
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}
