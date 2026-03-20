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
let unsubscribeFuelReports = null;
let pendingFuelPromptBookingId = null;
let suPendingFamilyId = null;

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
  const normalizedTab = tab === 'resource' ? 'dashboard' : tab;
  activeTab = normalizedTab;
  ['dashboard', 'calendar', 'leaderboard', 'history'].forEach(name => {
    document.getElementById(`tab-${name}`)?.classList.toggle('active', name === normalizedTab);
    document.getElementById(`nav-${name}`)?.classList.toggle('active', name === normalizedTab);
  });
  if (normalizedTab === 'leaderboard' || normalizedTab === 'dashboard') renderExperiencePanels();
  if (normalizedTab === 'history') renderProfileTab();
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

function getDateRange(startStr, endStr) {
  const dates = [];
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}
