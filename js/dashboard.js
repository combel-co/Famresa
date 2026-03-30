// ==========================================
// DASHBOARD — EXPERIENCE PANELS
// ==========================================
function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 86400000);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  if (dateStr === todayStr) return "Aujourd'hui";
  if (dateStr === tomorrowStr) return 'Demain';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

function getResourceBookingForDate(dateStr, resourceId) {
  const b = bookings[dateStr];
  if (!b || b.returnedAt) return null;
  const bResourceId = b.ressource_id || b.resourceId || selectedResource;
  if (resourceId && bResourceId !== resourceId) return null;
  return b;
}

function getCurrentResourceBookingState(resourceId) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayBooking = getResourceBookingForDate(todayStr, resourceId);
  if (todayBooking) {
    const end = todayBooking.endDate || todayBooking.date_fin || todayStr;
    const next = new Date(end + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
    return {
      occupied: true,
      booking: todayBooking,
      occupiedUntil: end,
      freeFrom: nextStr
    };
  }

  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let freeUntil = null;
  for (let i = 0; i < 120; i++) {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (getResourceBookingForDate(ds, resourceId)) break;
    freeUntil = ds;
    d.setDate(d.getDate() + 1);
  }
  return { occupied: false, freeUntil: freeUntil || todayStr };
}

function getNextFreeDate() {
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!bookings[ds] || bookings[ds].returnedAt) return ds;
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function renderTripBanner(resourceId) {
  const banner = document.getElementById('trip-banner');
  if (!banner || !currentUser) return;
  const badgeEl = document.getElementById('trip-banner-badge');
  const datelineEl = document.getElementById('trip-banner-dateline');
  const res = resources.find((r) => r.id === resourceId);
  const isHouse = res?.type === 'house';
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayMidnightMs = new Date(todayStr + 'T00:00:00').getTime();

  const { currentMine, targetBooking } = resolveTripTargetBooking(resourceId);

  if (!targetBooking) {
    banner.style.display = 'none';
    banner.onclick = null;
    banner.onkeydown = null;
    banner.style.cursor = '';
    return false;
  }
  const startDateStr = targetBooking.startDate || targetBooking.date;
  const endDate = targetBooking.endDate || startDateStr;
  const start = new Date(startDateStr + 'T00:00:00');
  const diffDays = Math.ceil((start.getTime() - todayMidnightMs) / 86400000);
  const isInProgress = !!currentMine;

  if (!isInProgress && (diffDays < 0 || diffDays > 7)) {
    banner.style.display = 'none';
    banner.onclick = null;
    banner.onkeydown = null;
    banner.style.cursor = '';
    return false;
  }

  const nights = Math.max(
    1,
    typeof countStayNights === 'function'
      ? countStayNights(startDateStr, endDate)
      : Math.round((new Date(endDate + 'T12:00:00') - new Date(startDateStr + 'T12:00:00')) / 86400000)
  );
  const startH = targetBooking.startHour || '09:00';
  const endH = targetBooking.endHour || '20:00';
  let tripSubLine;
  if (isHouse) {
    tripSubLine = `${formatRelativeDate(startDateStr)} → ${formatRelativeDate(endDate)} · ${nights} nuit${nights > 1 ? 's' : ''}`;
  } else {
    const d0 = new Date(startDateStr + 'T00:00:00');
    const dayLong = d0.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const dayPart = dayLong.charAt(0).toUpperCase() + dayLong.slice(1);
    const sep = ' · ';
    const range = `${startH} – ${endH}`;
    if (startDateStr === endDate) {
      tripSubLine = `${dayPart}${sep}${range}`;
    } else {
      tripSubLine = `${formatRelativeDate(startDateStr)} → ${formatRelativeDate(endDate)}${sep}${range}`;
    }
  }

  let badgeText;
  if (isInProgress) {
    badgeText = 'En cours';
  } else if (diffDays === 0) {
    badgeText = "Aujourd'hui";
  } else if (diffDays === 1) {
    badgeText = 'Demain';
  } else {
    badgeText = `Dans ${diffDays} j`;
  }
  if (badgeEl) badgeEl.textContent = badgeText;
  if (datelineEl) datelineEl.textContent = tripSubLine;

  banner.style.display = '';
  banner.style.cursor = isHouse ? 'pointer' : '';
  banner.onclick = isHouse && typeof famresaOnTripBannerTap === 'function' ? () => famresaOnTripBannerTap(resourceId) : null;
  banner.onkeydown =
    isHouse && typeof famresaOnTripBannerTap === 'function'
      ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            famresaOnTripBannerTap(resourceId);
          }
        }
      : null;
  return true;
}

/** Contexte bandeau séjour (maison) pour guides F/G */
function getDashboardTripContext(resourceId) {
  if (!currentUser) return null;
  const res = resources.find((r) => r.id === resourceId);
  const isHouse = res?.type === 'house';
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayMidnightMs = new Date(todayStr + 'T00:00:00').getTime();

  const { currentMine, upcomingMine, targetBooking } = resolveTripTargetBooking(resourceId);
  if (!targetBooking) return null;
  const startDateStr = targetBooking.startDate || targetBooking.date;
  const start = new Date(startDateStr + 'T00:00:00');
  const diffDays = Math.ceil((start.getTime() - todayMidnightMs) / 86400000);
  const isInProgress = !!currentMine;
  if (!isInProgress && (diffDays < 0 || diffDays > 7)) return null;
  return { targetBooking, isInProgress, isHouse, res, currentMine, upcomingMine };
}
window.getDashboardTripContext = getDashboardTripContext;

function getHousePeopleCount(booking) {
  if (!booking) return 0;
  return Number(booking.occupiedBeds || booking.guestCount || booking.peopleCount || 1);
}

function getHouseDecisionState(resourceId) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayMidnightMs = new Date(todayStr + 'T00:00:00').getTime();
  const state = getCurrentResourceBookingState(resourceId);
  const currentBooking = state.occupied ? state.booking : null;
  const labels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekDays = [];
  let occupiedDays = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const booking = getResourceBookingForDate(ds, resourceId);
    if (booking) occupiedDays++;
    weekDays.push({
      date: ds,
      dayLabel: i === 0 ? 'Auj' : labels[d.getDay()],
      dayNum: d.getDate(),
      occupied: !!booking,
      booking
    });
  }

  const occupantName = currentBooking?.userName || '—';
  const peopleCount = getHousePeopleCount(currentBooking);
  const endDate = currentBooking?.endDate || currentBooking?.date_fin || todayStr;
  const endMidnightMs = new Date(endDate + 'T00:00:00').getTime();
  const nightsLeft = currentBooking ? Math.max(1, Math.ceil((endMidnightMs - todayMidnightMs) / 86400000) + 1) : 0;

  let primaryAction = 'reserve';
  if (currentBooking) {
    primaryAction = currentBooking.userId === currentUser?.id ? 'viewReservation' : 'contact';
  }

  return {
    availabilityStatus: currentBooking ? 'occupied' : 'available',
    occupantName,
    peopleCount,
    endDate,
    nightsLeft,
    weekDays,
    occupiedDays,
    freeDays: Math.max(0, 7 - occupiedDays),
    booking: currentBooking,
    primaryAction,
    state
  };
}

function renderWeekStrip(resourceId, decisionState, isHouseResource) {
  const wrap = document.getElementById('dash-week-strip');
  const meta = document.getElementById('house-week-meta');
  if (!wrap) return;
  const ds = decisionState || getHouseDecisionState(resourceId);
  const houseRes = isHouseResource !== false;

  wrap.innerHTML = ds.weekDays.map((day) => {
    const initials = day.booking ? getInitials(day.booking.userName || '?') : '';
    return `<div class="dash-week-day${day.occupied ? ' occupied' : ' free'}">
      <div class="dash-week-lbl">${day.dayLabel}</div>
      <div class="dash-week-num">${day.dayNum}</div>
      <div class="dash-week-state">${day.occupied ? initials : 'Libre'}</div>
    </div>`;
  }).join('');

  if (meta) {
    if (ds.availabilityStatus === 'occupied') {
      const d = formatRelativeDate(ds.state.freeFrom);
      meta.innerHTML = `Libre à partir du <span class="house-week-meta-date">${_escapeHtml(d)}</span>`;
    } else {
      const weekAllFree = ds.weekDays && ds.weekDays.length && ds.weekDays.every((day) => !day.occupied);
      if (weekAllFree) {
        meta.textContent = houseRes ? 'Maison libre cette semaine' : 'Voiture libre cette semaine';
      } else {
        const fu = ds.state?.freeUntil;
        if (fu) {
          const d = formatRelativeDate(fu);
          meta.innerHTML = `Libre jusqu'au <span class="house-week-meta-date">${_escapeHtml(d)}</span>`;
        } else {
          meta.textContent = houseRes ? 'Maison libre cette semaine' : 'Voiture libre cette semaine';
        }
      }
    }
  }
}

function openHousePrimaryAction() {
  const btn = document.getElementById('reserve-cta-btn');
  const action = btn?.dataset.action || 'reserve';
  const bookingId = btn?.dataset.bookingId || '';
  const groupId = btn?.dataset.groupId || '';
  const occupantName = btn?.dataset.occupantName || 'Occupant';

  if (action === 'contact') {
    showToast(`Contacter ${occupantName} depuis votre canal familial`);
    return;
  }
  if (action === 'viewReservation' && typeof showStaySheet === 'function' && (groupId || bookingId)) {
    showStaySheet(groupId || bookingId);
    return;
  }
  switchToBookingMode();
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _openMapProvider(provider, resource) {
  const encoded = getEncodedResourceAddress(resource);
  if (!encoded) return false;

  const mapUrls = {
    apple: `maps://?q=${encoded}`,
    google: `comgooglemaps://?q=${encoded}`,
    waze: `waze://?q=${encoded}&navigate=yes`
  };
  const targetUrl = mapUrls[provider];
  if (!targetUrl) return false;

  try {
    closeSheet();
    window.location.href = targetUrl;
    // No automatic web fallback: keeps browser page out of FamResa webview.
    setTimeout(() => {
      if (document.visibilityState === 'visible') {
        showToast('Impossible d’ouvrir l’app. Copie l’adresse ou vérifie son installation.');
      }
    }, 900);
    return true;
  } catch (_) {
    showToast('Impossible d’ouvrir l’app de navigation');
    return false;
  }
}

async function _copyHouseAddress(resource) {
  const address = getResourceAddressDisplay(resource, '');
  if (!address) {
    showToast('Adresse incomplète');
    return;
  }
  try {
    await navigator.clipboard?.writeText(address);
    showToast('Adresse copiée');
    closeSheet();
  } catch (_) {
    showToast('Impossible de copier');
  }
}

function showHouseDirectionsSheet() {
  const res = resources.find(r => r.id === selectedResource);
  const address = getResourceAddressDisplay(res, 'Adresse non renseignée');
  const hasAddress = hasUsableResourceAddress(res);
  const disabledAttr = hasAddress ? '' : 'disabled aria-disabled="true"';
  const disabledStyle = hasAddress ? '' : 'opacity:0.45;cursor:not-allowed';
  const sheet = document.getElementById('sheet-content');
  if (!sheet) return;

  sheet.innerHTML = `
    <div class="login-sheet">
      <div class="ccv2-btn-manage-link" style="margin-top:0;margin-bottom:8px;cursor:default;text-decoration:none">Adresse</div>
      <div style="font-size: calc(13px * var(--ui-text-scale));line-height:1.45;color:#6b7280;margin-bottom:14px">${_escapeHtml(address)}</div>
      <button class="btn btn-outline" style="${disabledStyle}" ${disabledAttr} onclick="_openMapProvider('apple', resources.find(r => r.id === selectedResource))">Ouvrir dans Apple Maps</button>
      <button class="btn btn-outline" style="${disabledStyle}" ${disabledAttr} onclick="_openMapProvider('google', resources.find(r => r.id === selectedResource))">Ouvrir dans Google Maps</button>
      <button class="btn btn-outline" style="${disabledStyle}" ${disabledAttr} onclick="_openMapProvider('waze', resources.find(r => r.id === selectedResource))">Ouvrir dans Waze</button>
      <button class="btn btn-outline" style="${disabledStyle}" ${disabledAttr} onclick="_copyHouseAddress(resources.find(r => r.id === selectedResource))">Copier l'adresse</button>
      ${hasAddress ? '' : '<div style="font-size: calc(12px * var(--ui-text-scale));color:#b45309;margin-top:8px">Complète l’adresse de la maison pour activer les actions.</div>'}
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:6px;margin-bottom:-16px" onclick="closeSheet()">Annuler</button>
    </div>
  `;
  document.getElementById('overlay')?.classList.add('open');
}

function _dashIncompleteHtml() {
  return '<span class="house-raw-incomplete">À compléter</span>';
}

function renderHouseRawInfo(resource, decisionState) {
  const wrap = document.getElementById('house-raw-list');
  if (!wrap) return;
  const capNum = resource?.capacity != null && resource.capacity !== '' ? Number(resource.capacity) : NaN;
  const capVal = Number.isFinite(capNum) && capNum > 0 ? `${capNum} pers.` : _dashIncompleteHtml();
  const rooms = Number(resource?.rooms || resource?.bedrooms || resource?.chambres || 0);
  const roomsVal = rooms > 0 ? `${rooms}` : _dashIncompleteHtml();
  const addrOk = hasUsableResourceAddress(resource);
  const address = addrOk ? getResourceAddressDisplay(resource, '') : _dashIncompleteHtml();
  const routeBtn = addrOk
    ? `<button class="house-route-btn" type="button" onclick="showHouseDirectionsSheet()">
            <span class="house-route-btn-arrow" aria-hidden="true">→</span>
            <span class="house-route-btn-text">Obtenir l'itinéraire</span>
          </button>`
    : '';

  const guidesHtml =
    window._myResourceRoles?.[selectedResource] === 'admin' && typeof famresaHouseGuideRowsHtml === 'function'
      ? famresaHouseGuideRowsHtml(resource)
      : '';

  wrap.innerHTML = `
    <div class="house-raw-grid">
      <div class="house-raw-cell">
        <div class="house-raw-label">Capacité</div>
        <div class="house-raw-value">${capVal}</div>
      </div>
      <div class="house-raw-cell">
        <div class="house-raw-label">Chambres</div>
        <div class="house-raw-value">${roomsVal}</div>
      </div>
      <div class="house-raw-cell house-raw-cell-full">
        <div class="house-raw-label">Adresse</div>
        <div class="house-raw-address-row">
          <div class="house-raw-address">
            <span class="house-raw-address-text">${addrOk ? getResourceAddressDisplay(resource, '—') : address}</span>
          </div>
          ${routeBtn}
        </div>
      </div>
      ${guidesHtml}
    </div>
  `;
}

function _fuelTypeLabel(ft) {
  if (ft === 'diesel') return 'Diesel';
  if (ft === 'electrique') return 'Électrique';
  if (ft === 'essence') return 'Essence';
  if (ft === 'hybride') return 'Hybride';
  return '—';
}

function renderCarRawInfo(resource) {
  const wrap = document.getElementById('car-raw-list');
  if (!wrap) return;
  const seats = Number(resource?.seatCount ?? resource?.seats ?? 0);
  const seatsLabel = seats > 0 ? `${seats} pers.` : _dashIncompleteHtml();
  const ft = (resource?.fuelType || '').trim();
  const fuel = ft ? _fuelTypeLabel(ft) : _dashIncompleteHtml();
  const mileage =
    resource?.mileageKm != null && String(resource.mileageKm).trim() !== ''
      ? `${resource.mileageKm} km`
      : _dashIncompleteHtml();
  const bt =
    resource?.carBluetooth === true ? 'Oui' : resource?.carBluetooth === false ? 'Non' : _dashIncompleteHtml();
  const assuranceRaw = (resource?.assurance || '').trim();
  const assuranceVal = assuranceRaw ? _escapeHtml(assuranceRaw) : _dashIncompleteHtml();
  const ctRaw = (resource?.ct || '').trim();
  const ctClass = getCtClass(ctRaw);
  const ctVal = ctRaw ? _escapeHtml(ctRaw) : _dashIncompleteHtml();

  wrap.innerHTML = `
    <div class="house-raw-grid">
      <div class="house-raw-cell">
        <div class="house-raw-label">Places</div>
        <div class="house-raw-value">${seatsLabel}</div>
      </div>
      <div class="house-raw-cell">
        <div class="house-raw-label">Énergie</div>
        <div class="house-raw-value">${fuel}</div>
      </div>
      <div class="house-raw-cell">
        <div class="house-raw-label">Kilométrage</div>
        <div class="house-raw-value">${mileage}</div>
      </div>
      <div class="house-raw-cell">
        <div class="house-raw-label">Bluetooth</div>
        <div class="house-raw-value">${bt}</div>
      </div>
      <div class="house-raw-cell">
        <div class="house-raw-label">Assurance</div>
        <div class="house-raw-value">${assuranceVal}</div>
      </div>
      <div class="house-raw-cell">
        <div class="house-raw-label">Contrôle technique</div>
        <div class="house-raw-value${ctClass ? ` ${ctClass}` : ''}">${ctVal}</div>
      </div>
    </div>
  `;
}

function renderBedIcons(totalBeds, occupiedBeds) {
  const total = Math.max(0, Number(totalBeds || 0));
  const occupied = Math.max(0, Math.min(total, Number(occupiedBeds || 0)));
  const shown = Math.min(total, 8);
  let icons = '';
  for (let i = 0; i < shown; i++) {
    const filled = i < occupied;
    icons += `<span style="opacity:${filled ? '1' : '0.25'}">🛏</span>`;
  }
  return `<div style="font-size: calc(11px * var(--ui-text-scale));line-height:1.1;display:flex;gap:2px;align-items:center">${icons}</div>`;
}

function getCtClass(ctLabel) {
  if (!ctLabel) return '';
  const now = new Date();
  const yearMatch = String(ctLabel).match(/(20\d{2})/);
  if (!yearMatch) return '';
  const year = Number(yearMatch[1]);
  const monthMap = { jan: 0, fev: 1, fév: 1, mar: 2, avr: 3, mai: 4, jun: 5, jui: 6, jul: 6, aou: 7, août: 7, sep: 8, oct: 9, nov: 10, dec: 11, déc: 11 };
  const lower = ctLabel.toLowerCase();
  let month = 11;
  Object.keys(monthMap).forEach((k) => {
    if (lower.includes(k)) month = monthMap[k];
  });
  const expiry = new Date(year, month, 1);
  const diffMonths = (expiry.getFullYear() - now.getFullYear()) * 12 + (expiry.getMonth() - now.getMonth());
  if (diffMonths < 0) return 'warn';
  if (diffMonths <= 3) return 'warn';
  return 'ok';
}

function renderUpcomingBookings() {
  const el = document.getElementById('upcoming-bookings');
  const label = document.getElementById('upcoming-label');
  if (!el) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + 7);
  const limitStr = limitDate.toISOString().slice(0, 10);
  const unique = getUniqueBookingsSorted().filter(b => {
    const start = b.startDate || b.date || '';
    const end = b.endDate || start;
    return end >= todayStr && start <= limitStr;
  });
  if (!unique.length) {
    if (label) label.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  if (label) label.style.display = '';
  el.innerHTML = unique.slice(0, 5).map(b => {
    const isMe = currentUser && b.userId === currentUser.id;
    const avClass = `ccv2-booking-av${isMe ? ' me' : ''}`;
    const av = b.photo ? `<img src="${b.photo}" alt="">` : getInitials(b.userName || 'C');
    const startDate = b.startDate || b.date || '';
    const rawDiff = Math.ceil((new Date(startDate + 'T00:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')) / 86400000);
    const dateLabel = (isMe && rawDiff >= 0 && rawDiff <= 7)
      ? `Dans ${rawDiff} jour${rawDiff > 1 ? 's' : ''}`
      : formatRelativeDate(startDate);
    const dest = getBookingDestinationLabel(b);
    return `<div class="ccv2-booking-row">
      <div class="${avClass}">${av}</div>
      <div class="ccv2-booking-info">
        <div class="ccv2-booking-name">${b.userName || 'Utilisateur'}${isMe ? ' · moi' : ''}</div>
        <div class="ccv2-booking-dest">${dest}</div>
      </div>
      <div class="ccv2-booking-date${isMe && rawDiff >= 0 && rawDiff <= 7 ? ' soon' : ''}">${dateLabel}</div>
    </div>`;
  }).join('');
}

/** Bandeau photo plein largeur uniquement (pas de variante vignette). */
function applyDashHeroLayoutPreference() {
  const dashHeroEl = document.getElementById('dash-resource-hero');
  if (dashHeroEl) dashHeroEl.classList.remove('dash-hero--split');
}

function maybeShowFamresaSalutOnce() {
  try {
    if (typeof activeTab === 'undefined' || activeTab !== 'dashboard') return;
    if (!resources || resources.length === 0) return;
    if (sessionStorage.getItem('famresa_salut_once') === '1') return;
    const pn = (currentUser?.name || '').trim().split(/\s+/)[0];
    if (!pn || typeof showToast !== 'function') return;
    sessionStorage.setItem('famresa_salut_once', '1');
    setTimeout(() => showToast(`Salut ${pn} 👋`), 250);
  } catch (_) {}
}

function renderExperiencePanels() {
  applyDashHeroLayoutPreference();

  if (!resources || resources.length === 0) {
    const houseInfoCard = document.getElementById('house-info-card');
    const carInfoCard = document.getElementById('car-info-card');
    const tripBanner = document.getElementById('trip-banner');
    if (houseInfoCard) houseInfoCard.style.display = 'none';
    if (carInfoCard) carInfoCard.style.display = 'none';
    if (tripBanner) tripBanner.style.display = 'none';
    return;
  }

  const monthEntries = getMonthBookingEntries();
  const res = resources.find(r => r.id === selectedResource);
  const isHouse = res && res.type === 'house';
  const decisionState = getHouseDecisionState(selectedResource);
  const state = decisionState.state;
  const todayBooking = decisionState.booking;

  // ── Nom, media, sous-titre ──
  const cardEmoji = document.getElementById('resource-card-emoji');
  const cardPhotoFill = document.getElementById('resource-card-photo-fill');
  const cardTitle = document.getElementById('resource-card-title');
  const cardSubtitle = document.getElementById('resource-card-subtitle');
  if (cardEmoji) cardEmoji.textContent = res?.emoji || (isHouse ? '🏠' : '🚗');
  if (cardPhotoFill) {
    if (res?.photoUrl) {
      cardPhotoFill.innerHTML = `<img class="dash-hero-photo-img" src="${res.photoUrl}" alt="" fetchpriority="high" decoding="async">`;
    }
    else if (isHouse) cardPhotoFill.innerHTML = '';
    else cardPhotoFill.innerHTML = `<span id="resource-card-emoji">${res?.emoji || '🚗'}</span>`;
  }
  if (cardTitle) cardTitle.textContent = res?.name || (isHouse ? 'Maison' : 'Voiture');
  if (cardSubtitle) {
    if (!isHouse) {
      const loc = (res?.carLocation || res?.lieu || '').trim();
      if (loc) cardSubtitle.textContent = loc;
      else if (res?.plaque) cardSubtitle.textContent = res.plaque;
      else cardSubtitle.textContent = 'Voiture familiale';
    } else if (isHouse && hasUsableResourceAddress(res)) cardSubtitle.textContent = getResourceAddressDisplay(res, 'Maison de famille');
    else cardSubtitle.textContent = isHouse ? 'Maison de famille' : 'Voiture familiale';
  }

  // ── Badge disponibilité ──
  const badge = document.getElementById('availability-badge');
  const statusText = document.getElementById('car-status-text');
  const mainCard = document.getElementById('resource-main-card');
  const tripBanner = document.getElementById('trip-banner');
  const houseWeekSection = document.getElementById('house-week-section');
  const houseRawInfo = document.getElementById('house-raw-info');
  const houseInfoCard = document.getElementById('house-info-card');
  const carInfoCard = document.getElementById('car-info-card');
  const carInfoGrid = document.getElementById('car-info-grid');
  if (houseWeekSection) houseWeekSection.style.display = '';
  if (houseRawInfo) houseRawInfo.style.display = isHouse ? '' : 'none';
  if (houseInfoCard) houseInfoCard.style.display = isHouse ? '' : 'none';
  if (carInfoCard) carInfoCard.style.display = !isHouse ? '' : 'none';
  if (carInfoGrid) carInfoGrid.style.display = 'none';
  if (tripBanner) tripBanner.style.display = isHouse ? 'none' : tripBanner.style.display;
  if (mainCard) {
    mainCard.classList.remove('state-available', 'state-occupied', 'state-soon');
  }
  if (badge && statusText) {
    if (todayBooking) {
      badge.className = 'ccv2-badge reserved';
      statusText.textContent = isHouse ? 'Occupée' : 'Occupée';
      if (mainCard) mainCard.classList.add('state-occupied');
    } else {
      badge.className = 'ccv2-badge available';
      statusText.textContent = 'Libre';
      if (mainCard) mainCard.classList.add('state-available');
    }
  }

  // ── Bloc « Cette semaine » (maison et voiture): badge, strip, meta ──
  const weekStatus = document.getElementById('house-week-status');
  if (houseWeekSection) {
    houseWeekSection.classList.toggle('house-week-section--house', !!isHouse);
    houseWeekSection.classList.toggle('house-week-section--car', !isHouse);
  }

  if (res) {
    if (decisionState.availabilityStatus === 'occupied') {
      const n = decisionState.peopleCount;
      if (weekStatus) {
        const nameEsc = _escapeHtml(decisionState.occupantName);
        const detailSuffix = isHouse
          ? `${n} personne${n > 1 ? 's' : ''}`
          : (n > 1 ? `${n} personnes` : 'conducteur');
        weekStatus.innerHTML = `<span class="house-week-status-badge">Occupée</span><span class="house-week-status-detail"> · ${nameEsc} · ${detailSuffix}</span>`;
        weekStatus.classList.remove('house-week-status--available');
        weekStatus.classList.add('house-week-status--occupied');
      }
    } else if (weekStatus) {
      if (!isHouse && res) {
        const clean = res.carCleanliness || '';
        const cleanLabel = typeof carCleanlinessLabel === 'function' ? carCleanlinessLabel(clean) : 'Propre';
        const cleanCls =
          clean === 'dirty'
            ? 'house-week-car-clean--warn'
            : clean === 'sparkling'
              ? 'house-week-car-clean--sparkle'
              : 'house-week-car-clean--ok';
        const fuelHtml =
          typeof getFuelBarGrid === 'function' ? getFuelBarGrid(res.fuelLevel ?? null) : '';
        weekStatus.innerHTML = `<span class="house-week-status-badge house-week-status-badge--free">Libre</span><div class="house-week-car-extras"><span class="house-week-car-clean ${cleanCls}">${_escapeHtml(cleanLabel)}</span><div class="house-week-car-fuel">${fuelHtml}</div></div>`;
      } else {
        weekStatus.innerHTML = '<span class="house-week-status-badge house-week-status-badge--free">Libre</span>';
      }
      weekStatus.classList.remove('house-week-status--occupied');
      weekStatus.classList.add('house-week-status--available');
    }
    renderWeekStrip(selectedResource, decisionState, isHouse);
  }

  if (isHouse) {
    renderHouseRawInfo(res || {}, decisionState);
  }
  if (!isHouse) {
    renderCarRawInfo(res || {});
  }

  // ── Action primaire ──
  const reserveBtn = document.getElementById('reserve-cta-btn');
  if (reserveBtn) {
    if (isHouse) {
      reserveBtn.onclick = switchToBookingMode;
      reserveBtn.dataset.bookingId = todayBooking?.id || '';
      reserveBtn.dataset.groupId = todayBooking?.reservationGroupId || '';
      reserveBtn.dataset.occupantName = decisionState.occupantName || '';
      reserveBtn.dataset.action = 'reserve';
      reserveBtn.textContent = 'Réserver la maison';
    } else {
      reserveBtn.onclick = switchToBookingMode;
      if (state.occupied) reserveBtn.textContent = `Réserver dès le ${formatRelativeDate(state.freeFrom)}`;
      else reserveBtn.textContent = 'Réserver la voiture';
    }
  }

  // ── Bouton "Rendre plus tôt" (visible si réservation active aujourd'hui pour moi, voiture uniquement) ──
  const earlyReturnContainer = document.getElementById('early-return-container');
  if (earlyReturnContainer) {
    if (!isHouse && todayBooking && currentUser && todayBooking.userId === currentUser.id) {
      earlyReturnContainer.innerHTML = `<button class="btn" style="width:100%;background:#fff8ed;color:#b45309;border:1px solid #fde68a;font-weight:600;padding:12px;margin-top:8px" onclick="showEarlyReturnSheet('${todayBooking.id}')">🔑 Rendre plus tôt</button>`;
      earlyReturnContainer.style.display = '';
    } else {
      earlyReturnContainer.innerHTML = '';
      earlyReturnContainer.style.display = 'none';
    }
  }

  // ── Texte de contexte legacy (voiture) ──
  const nextSlot = document.getElementById('next-slot-text');
  if (nextSlot && !isHouse) {
    if (state.occupied) {
      const who = todayBooking?.userName || 'Quelqu’un';
      nextSlot.innerHTML = `${who} · <strong>jusqu'au ${formatRelativeDate(state.occupiedUntil)}</strong> · libre dès ${formatRelativeDate(state.freeFrom)}`;
    } else {
      nextSlot.innerHTML = `Libre <strong>jusqu'au ${formatRelativeDate(state.freeUntil)}</strong>`;
    }
  }

  const hasSoonTrip = renderTripBanner(selectedResource);
  if (hasSoonTrip && !state.occupied && mainCard) {
    mainCard.classList.remove('state-available');
    mainCard.classList.add('state-soon');
  }

  // ── Prochaines réservations (si le bloc existe encore) ──
  renderUpcomingBookings();

  const myMonthRides = monthEntries.filter(b => currentUser && b.userId === currentUser.id).length;
  const qsRides = document.getElementById('qs-rides');
  if (qsRides) qsRides.textContent = String(myMonthRides);

  renderXpHeroCard();
  renderHistoryList();
  renderPostTripReminder();
  maybeShowFamresaSalutOnce();
  if (typeof famresaRenderCompletionCard === 'function') famresaRenderCompletionCard();
}

function renderHistoryList() {
  const history = getUniqueBookingsSorted();
  const res = resources.find(r => r.id === selectedResource);
  const historyEl = document.getElementById('history-full');
  if (!historyEl) return;

  if (!history.length) {
    historyEl.innerHTML = '<div style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));padding:16px 0">Aucune réservation enregistrée.</div>';
    return;
  }

  if (res && res.type === 'house') {
    // Group by reservationGroupId for house stays
    const groups = {};
    history.forEach(h => {
      const key = h.reservationGroupId || h.id;
      if (!groups[key]) groups[key] = h;
    });
    historyEl.innerHTML = Object.values(groups).map(h => {
      const av = h.photo ? `<img src="${h.photo}" alt="" style="width:100%;height:100%;object-fit:cover">` : getInitials(h.userName || 'C');
      const dateFormatted = formatBookingDateRange(h);
      return `<div class="history-card" onclick="showStaySheet('${h.reservationGroupId || h.id}', ${JSON.stringify(h).replace(/"/g,'&quot;')})">
        <div class="history-left">
          <div class="history-avatar-sm">${av}</div>
          <div class="history-section-label">Séjour</div>
          <div class="history-date-val">${dateFormatted}</div>
          <div class="history-dest">${h.userName}</div>
        </div>
        <div class="history-right">
          <div class="history-section-label">Statut</div>
          <div style="margin-top:2px;font-size: calc(13px * var(--ui-text-scale));font-weight:600">Confirmé</div>
        </div>
      </div>`;
    }).join('');
  } else {
    // Car history
    const today = new Date().toISOString().slice(0, 10);
    historyEl.innerHTML = history.map(h => {
      const av = h.photo ? `<img src="${h.photo}" alt="" style="width:100%;height:100%;object-fit:cover">` : getInitials(h.userName || 'C');
      const dateFormatted = formatBookingDateRange(h);
      const dest = getBookingDestinationLabel(h);
      const km = estimateDistanceForBooking(h);
      const fuelLevel = getFuelReturnLevelForBooking(h);
      const fuelLeft = (fuelLevel !== undefined && fuelLevel !== null) ? getFuelBar(fuelLevel) : '<span style="color:#b45309;font-size: calc(12px * var(--ui-text-scale))">Donnée manquante</span>';
      const isFuture = (h.endDate || h.startDate || h.date || '') >= today;
      const isOwn = currentUser && h.userId === currentUser.id;
      const cancelBtn = (isFuture && isOwn)
        ? `<button class="btn btn-danger" style="margin-top:8px;font-size: calc(12px * var(--ui-text-scale));padding:6px 12px;width:100%" onclick="event.stopPropagation();showDeleteBookingSheet('${h.id}','${h.startDate || h.date}')">Annuler la réservation</button>`
        : '';
      return `<div class="history-card">
        <div class="history-left">
          <div class="history-avatar-sm">${av}</div>
          <div class="history-section-label">Réservation</div>
          <div class="history-date-val">${dateFormatted}</div>
          <div class="history-dest">${dest}</div>
        </div>
        <div class="history-right">
          <div class="history-section-label">Retour · réservoir</div>
          <div style="margin-top:2px">${fuelLeft}</div>
          <div class="history-dest" style="margin-top:4px">${km} km</div>
        </div>
        ${cancelBtn ? `<div style="width:100%;padding:0 8px 8px">${cancelBtn}</div>` : ''}
      </div>`;
    }).join('');
  }
}

window.applyDashHeroLayoutPreference = applyDashHeroLayoutPreference;
