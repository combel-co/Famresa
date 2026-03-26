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
  const titleEl = document.getElementById('trip-banner-title');
  const subEl = document.getElementById('trip-banner-sub');
  const iconEl = document.getElementById('trip-banner-icon');
  const res = resources.find(r => r.id === resourceId);
  const today = new Date();
  const upcomingMine = getUniqueBookingsSorted()
    .filter((b) => {
      const bRes = b.ressource_id || b.resourceId || selectedResource;
      const start = b.startDate || b.date || '';
      return b.userId === currentUser.id && bRes === resourceId && start >= today.toISOString().slice(0, 10);
    })
    .sort((a, b) => (a.startDate || a.date || '').localeCompare(b.startDate || b.date || ''))[0];

  if (!upcomingMine) {
    banner.style.display = 'none';
    return false;
  }
  const start = new Date((upcomingMine.startDate || upcomingMine.date) + 'T00:00:00');
  const diffDays = Math.ceil((start.getTime() - today.setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays < 0 || diffDays > 7) {
    banner.style.display = 'none';
    return false;
  }

  const endDate = upcomingMine.endDate || upcomingMine.startDate || upcomingMine.date;
  const nights = Math.max(1, Math.round((new Date(endDate + 'T00:00:00') - new Date((upcomingMine.startDate || upcomingMine.date) + 'T00:00:00')) / 86400000));
  if (titleEl) titleEl.textContent = `${res?.name || 'Ressource'} · dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  if (subEl) subEl.textContent = `${formatRelativeDate(upcomingMine.startDate || upcomingMine.date)} → ${formatRelativeDate(endDate)} · ${nights} nuit${nights > 1 ? 's' : ''}`;
  if (iconEl) iconEl.textContent = res?.emoji || (res?.type === 'house' ? '🏠' : '🚗');
  banner.style.display = '';
  return true;
}

function renderWeekStrip(resourceId) {
  const wrap = document.getElementById('dash-week-strip');
  if (!wrap) return;
  const labels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const booking = getResourceBookingForDate(ds, resourceId);
    const isToday = i === 0;
    const isMine = booking && currentUser && booking.userId === currentUser.id;
    const dayLabel = isToday ? 'Auj' : labels[d.getDay()];
    let av = '<div class="dash-week-free"></div>';
    if (booking) {
      const initials = getInitials(booking.userName || '?');
      let cls = '';
      if (initials === 'AG') cls = 'ag';
      else if (initials === 'MC') cls = 'mc';
      else if (initials === 'GA') cls = 'ga';
      av = `<div class="dash-week-avatar ${cls}">${initials}</div>`;
    }
    html += `<div class="dash-week-day${isToday ? ' today' : ''}${isMine ? ' mine' : ''}">
      <div class="dash-week-lbl">${dayLabel}</div>
      <div class="dash-week-num">${d.getDate()}</div>
      ${av}
    </div>`;
  }
  wrap.innerHTML = html;
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
  return `<div style="font-size:11px;line-height:1.1;display:flex;gap:2px;align-items:center">${icons}</div>`;
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

function renderExperiencePanels() {
  const monthEntries = getMonthBookingEntries();
  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  const res = resources.find(r => r.id === selectedResource);
  const isHouse = res && res.type === 'house';
  const state = getCurrentResourceBookingState(selectedResource);
  const todayBooking = state.occupied ? state.booking : null;

  // ── Nom, media, sous-titre ──
  const cardEmoji = document.getElementById('resource-card-emoji');
  const cardPhoto = document.getElementById('resource-card-photo');
  const cardTitle = document.getElementById('resource-card-title');
  const cardSubtitle = document.getElementById('resource-card-subtitle');
  if (cardEmoji) cardEmoji.textContent = res?.emoji || (isHouse ? '🏠' : '🚗');
  if (cardPhoto) {
    if (res?.photoUrl) cardPhoto.innerHTML = `<img src="${res.photoUrl}" alt="">`;
    else if (isHouse) cardPhoto.innerHTML = '';
    else cardPhoto.innerHTML = `<span id="resource-card-emoji">${res?.emoji || '🚗'}</span>`;
  }
  if (cardTitle) cardTitle.textContent = res?.name || (isHouse ? 'Maison' : 'Voiture');
  if (cardSubtitle) {
    if (!isHouse && res?.plaque) cardSubtitle.textContent = res.plaque;
    else if (isHouse && res?.address) cardSubtitle.textContent = res.address;
    else cardSubtitle.textContent = isHouse ? 'Maison de famille' : 'Voiture familiale';
  }

  // ── Badge disponibilité ──
  const badge = document.getElementById('availability-badge');
  const statusText = document.getElementById('car-status-text');
  const mainCard = document.getElementById('resource-main-card');
  if (mainCard) {
    mainCard.classList.remove('state-available', 'state-occupied', 'state-soon');
  }
  if (badge && statusText) {
    if (todayBooking) {
      badge.className = 'ccv2-badge reserved';
      statusText.textContent = isHouse ? 'Occupee' : 'Occupee';
      if (mainCard) mainCard.classList.add('state-occupied');
    } else {
      badge.className = 'ccv2-badge available';
      statusText.textContent = 'Libre';
      if (mainCard) mainCard.classList.add('state-available');
    }
  }

  // ── Info grid (voiture) ──
  const infoGrid = document.getElementById('car-info-grid');
  if (infoGrid) infoGrid.style.display = '';
  if (infoGrid) infoGrid.onclick = isHouse ? showGuideSheet : showCarInfo;

  const infoAssurance = document.getElementById('info-assurance');
  const infoCt = document.getElementById('info-ct');
  if (isHouse && infoGrid) {
    const capacity = Number(res?.capacity || 8);
    const occupiedBeds = Number(todayBooking?.occupiedBeds || todayBooking?.guestCount || todayBooking?.peopleCount || (state.occupied ? 1 : 0));
    const beds = renderBedIcons(capacity, occupiedBeds);
    const exitRaw = res?.houseExitState || '';
    const exitLabel = exitRaw === 'nickel' ? 'Nickel'
      : exitRaw === 'cleanup' ? 'A nettoyer'
      : exitRaw === 'issue' ? 'Probleme'
      : 'Non renseigne';
    infoGrid.innerHTML = `
      <div class="dash-kpi-item">
        <div class="ccv2-label">Capacite</div>
        <div class="ccv2-value">${occupiedBeds}/${capacity} couchages</div>
        ${beds}
      </div>
      <div class="dash-kpi-item">
        <div class="ccv2-label">Guide d'entree</div>
        <div class="ccv2-value ok">Acceder</div>
      </div>
      <div class="dash-kpi-item">
        <div class="ccv2-label">Etat laisse</div>
        <div class="ccv2-value ${exitRaw === 'issue' ? 'warn' : (exitRaw === 'cleanup' ? 'warn' : (exitRaw === 'nickel' ? 'ok' : ''))}">${exitLabel}</div>
      </div>
    `;
  } else {
    if (infoGrid && !document.getElementById('info-assurance')) {
      infoGrid.innerHTML = `
      <div class="dash-kpi-item" id="cell-assurance">
        <div class="ccv2-label">Assurance</div>
        <div class="ccv2-value" id="info-assurance">—</div>
      </div>
      <div class="dash-kpi-item" id="cell-ct">
        <div class="ccv2-label">CT</div>
        <div class="ccv2-value" id="info-ct">—</div>
      </div>
      <div class="dash-kpi-item" id="car-fuel-row">
        <div class="ccv2-label">Reservoir</div>
        <div id="car-fuel-display"></div>
      </div>`;
    }
    const assuranceEl = document.getElementById('info-assurance');
    const kpiLabel = document.querySelector('#cell-assurance .ccv2-label');
    const clean = res?.carCleanliness || '';
    const cleanLabel = clean === 'clean' ? 'Propre' : clean === 'average' ? 'Moyenne' : clean === 'dirty' ? 'Sale' : 'Non renseigne';
    const ctEl = document.getElementById('info-ct');
    if (kpiLabel) kpiLabel.textContent = 'Proprete';
    if (assuranceEl) {
      assuranceEl.textContent = cleanLabel;
      assuranceEl.classList.remove('ok', 'warn');
      if (clean === 'clean') assuranceEl.classList.add('ok');
      if (clean === 'average' || clean === 'dirty') assuranceEl.classList.add('warn');
    }
    if (ctEl) {
      ctEl.textContent = res?.ct || '—';
      ctEl.classList.remove('ok', 'warn');
      const ctClass = getCtClass(res?.ct || '');
      if (ctClass) ctEl.classList.add(ctClass);
    }
  }

  // ── Réservoir ──
  const fuelDisplay = document.getElementById('car-fuel-display');
  const fuelCell = document.getElementById('car-fuel-row');
  if (fuelDisplay) {
    if (!isHouse) {
      fuelDisplay.innerHTML = getFuelBarGrid(res?.fuelLevel ?? null);
      if (fuelCell) fuelCell.style.display = '';
    } else {
      fuelDisplay.innerHTML = '';
      if (fuelCell) fuelCell.style.display = 'none';
    }
  }

  // ── Bouton Réserver ──
  const reserveBtn = document.getElementById('reserve-cta-btn');
  if (reserveBtn) {
    if (state.occupied) reserveBtn.textContent = `Réserver dès le ${formatRelativeDate(state.freeFrom)}`;
    else reserveBtn.textContent = isHouse ? 'Réserver la maison' : 'Réserver la voiture';
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

  // ── Prochain créneau libre ──
  const nextSlot = document.getElementById('next-slot-text');
  if (nextSlot) {
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
  renderWeekStrip(selectedResource);

  // ── Prochaines réservations ──
  renderUpcomingBookings();

  const myMonthRides = monthEntries.filter(b => currentUser && b.userId === currentUser.id).length;
  const qsRides = document.getElementById('qs-rides');
  if (qsRides) qsRides.textContent = String(myMonthRides);

  renderXpHeroCard();
  renderHistoryList();
  renderPostTripReminder();
}

function renderHistoryList() {
  const history = getUniqueBookingsSorted();
  const res = resources.find(r => r.id === selectedResource);
  const historyEl = document.getElementById('history-full');
  if (!historyEl) return;

  if (!history.length) {
    historyEl.innerHTML = '<div style="color:var(--text-light);font-size:14px;padding:16px 0">Aucune réservation enregistrée.</div>';
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
          <div style="margin-top:2px;font-size:13px;font-weight:600">Confirmé</div>
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
      const fuelLeft = (fuelLevel !== undefined && fuelLevel !== null) ? getFuelBar(fuelLevel) : '<span style="color:#b45309;font-size:12px">Donnée manquante</span>';
      const isFuture = (h.endDate || h.startDate || h.date || '') >= today;
      const isOwn = currentUser && h.userId === currentUser.id;
      const cancelBtn = (isFuture && isOwn)
        ? `<button class="btn btn-danger" style="margin-top:8px;font-size:12px;padding:6px 12px;width:100%" onclick="event.stopPropagation();showDeleteBookingSheet('${h.id}','${h.startDate || h.date}')">Annuler la réservation</button>`
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
