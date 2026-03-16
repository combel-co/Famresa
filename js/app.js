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

// Keep --header-h in sync on resize / orientation change
window.addEventListener('resize', function () {
  var h = document.getElementById('app-header');
  if (h && h.offsetHeight > 0)
    document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
}, { passive: true });

// ==========================================
// ANIMATED TABS — collapse icons on scroll
// Touch: progressive follow, snap only on finger lift
// Mouse/keyboard: snap at threshold
// ==========================================
(function () {
  const FULL_FONT   = 32;  // px — must match CSS
  const FULL_HEIGHT = 40;  // px — must match CSS
  const FULL_MARGIN = 3;   // px (margin-bottom) — must match CSS
  const FULL_PAD    = 12;  // px (tabs padding-top) — must match CSS
  const RANGE       = 55;  // px of scroll to go full→compact

  let _touching = false;
  let _compact  = false;

  function setProgress(tabs, p) {
    const s = 1 - p;
    tabs.style.paddingTop = (FULL_PAD * s) + 'px';
    tabs.querySelectorAll('.resource-tab-icon').forEach(function (icon) {
      icon.style.transition  = 'none';
      icon.style.fontSize    = (FULL_FONT   * s) + 'px';
      icon.style.height      = (FULL_HEIGHT * s) + 'px';
      icon.style.lineHeight  = (FULL_HEIGHT * s) + 'px';
      icon.style.marginBottom= (FULL_MARGIN * s) + 'px';
      icon.style.opacity     = s;
      icon.style.overflow    = 'hidden';
    });
  }

  function clearInline(tabs) {
    tabs.style.removeProperty('padding-top');
    tabs.querySelectorAll('.resource-tab-icon').forEach(function (icon) {
      icon.style.cssText = '';
    });
  }

  function applyCompact(tabs, compact) {
    if (compact === _compact) return;
    _compact = compact;
    tabs.classList.toggle('compact', compact);
  }

  window.addEventListener('touchstart', function () {
    _touching = true;
  }, { passive: true });

  window.addEventListener('touchend', function () {
    _touching = false;
    var tabs = document.getElementById('resource-tabs');
    if (!tabs) return;
    // Clear inline overrides (re-enable CSS transitions)
    clearInline(tabs);
    // Snap: if icons not fully gone yet → return to full
    var p = Math.min(1, Math.max(0, window.scrollY / RANGE));
    applyCompact(tabs, p >= 1);
  }, { passive: true });

  window.addEventListener('scroll', function () {
    var tabs = document.getElementById('resource-tabs');
    if (!tabs) return;
    var p = Math.min(1, Math.max(0, window.scrollY / RANGE));

    if (_touching) {
      // Progressive: follow scroll proportionally while finger is down
      if (p >= 1) {
        clearInline(tabs);
        applyCompact(tabs, true);
      } else if (p <= 0) {
        clearInline(tabs);
        applyCompact(tabs, false);
      } else {
        if (_compact) { clearInline(tabs); _compact = false; tabs.classList.remove('compact'); }
        setProgress(tabs, p);
      }
    } else {
      // Mouse / keyboard: simple snap at midpoint
      clearInline(tabs);
      applyCompact(tabs, p > 0.5);
    }
  }, { passive: true });
})();

// ==========================================
// FAMILY SELECTOR
// ==========================================
let _currentFamilyName = 'Famille';
const _MOCK_FAMILIES = ['Famille Berton', 'Famille Dupont'];

function updateFamilyPill(name) {
  _currentFamilyName = name || 'Famille';
  const el = document.getElementById('family-name-display');
  if (el) el.textContent = _currentFamilyName;
}

async function loadFamilyName() {
  if (!currentUser?.familyId) return;
  try {
    const doc = await db.collection('families').doc(currentUser.familyId).get();
    if (doc.exists && doc.data().name) updateFamilyPill(doc.data().name);
  } catch (e) { /* silent fallback */ }
}

function toggleFamilyPicker() {
  const picker = document.getElementById('family-picker-dropdown');
  if (!picker) return;
  if (picker.style.display === 'block') { picker.style.display = 'none'; return; }
  picker.innerHTML = _MOCK_FAMILIES.map((f, i) => {
    const active = f === _currentFamilyName;
    return `<div class="family-picker-item${active ? ' active' : ''}" onclick="selectFamily(${i})">
      <span>${f}</span>
      ${active ? '<span class="family-picker-check">✓</span>' : ''}
    </div>${i < _MOCK_FAMILIES.length - 1 ? '<div class="family-picker-divider"></div>' : ''}`;
  }).join('');
  picker.style.display = 'block';
}

function selectFamily(index) {
  updateFamilyPill(_MOCK_FAMILIES[index]);
  const picker = document.getElementById('family-picker-dropdown');
  if (picker) picker.style.display = 'none';
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
  activeTab = tab;
  ['dashboard', 'calendar', 'leaderboard', 'history'].forEach(name => {
    document.getElementById(`tab-${name}`)?.classList.toggle('active', name === tab);
    document.getElementById(`nav-${name}`)?.classList.toggle('active', name === tab);
  });
  if (tab === 'leaderboard' || tab === 'history' || tab === 'dashboard') renderExperiencePanels();
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

