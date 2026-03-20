// ==========================================
// BOOKING MODAL (Airbnb style) — UI only
// ==========================================
// Business logic delegated to reservationService
// (src/modules/reservation/reservation.service.js)

let bm = { startDate: null, endDate: null, startHour: '09:00', endHour: '20:00', destinations: [], step: 'start' };
let bmCurrentStep = 'destination';

function renderBmSteps() {
  const steps = ['destination', 'dates', 'hours'];
  const res = resources.find(r => r.id === selectedResource);
  const isHouse = res && res.type === 'house';
  const currentIndex = steps.indexOf(bmCurrentStep);
  steps.forEach((step, i) => {
    const el = document.getElementById(`bm-step-${step}`);
    if (!el) return;
    el.classList.remove('active', 'completed', 'upcoming');
    if (i < currentIndex) el.classList.add('completed');
    else if (i === currentIndex) el.classList.add('active');
    else el.classList.add('upcoming');
    // Hide hours step for house
    if (step === 'hours' && isHouse) el.style.display = 'none';
    else el.style.display = '';
  });

  // Update mini card values
  const destVal = document.getElementById('bm-mini-dest-val');
  if (destVal) {
    if (isHouse) {
      const motif = document.getElementById('bm-motif-input')?.value || '';
      destVal.textContent = motif || 'Séjour';
    } else {
      destVal.textContent = bm.destinations.length > 0 ? bm.destinations[0].name : 'Je suis flexible';
    }
  }

  const datesVal = document.getElementById('bm-mini-dates-val');
  if (datesVal) datesVal.textContent = bm.startDate
    ? (bm.endDate && bm.endDate !== bm.startDate
        ? formatBmDateRange(bm.startDate, bm.endDate)
        : new Date(bm.startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))
    : 'Ajouter des dates';

  const hoursVal = document.getElementById('bm-mini-hours-val');
  if (hoursVal) hoursVal.textContent = `${bm.startHour} → ${bm.endHour}`;

  // Update step labels for house
  const destTitle = document.querySelector('#bm-step-destination .bm-section-title');
  const destLabel = document.querySelector('#bm-step-destination .bm-card-mini-label');
  if (destTitle) destTitle.textContent = isHouse ? 'Motif (optionnel)' : 'Où ?';
  if (destLabel) destLabel.textContent = isHouse ? 'Motif' : 'Destination';

  const datesTitle = document.querySelector('#bm-step-dates .bm-section-title');
  const datesHint = document.getElementById('bm-dates-hint');
  if (datesTitle) datesTitle.textContent = isHouse ? 'Arrivée / Départ' : 'Quand ?';

  // Footer button
  const nextBtn = document.getElementById('bm-next-btn');
  if (nextBtn) {
    if (bmCurrentStep === 'hours' || (isHouse && bmCurrentStep === 'dates')) {
      nextBtn.textContent = 'Réserver';
      nextBtn.disabled = !bm.startDate;
    } else if (bmCurrentStep === 'dates') {
      nextBtn.textContent = 'Suivant';
      nextBtn.disabled = !bm.startDate;
    } else {
      nextBtn.textContent = 'Suivant';
      nextBtn.disabled = false;
    }
  }

  // Show/hide destination section vs motif section
  const destSection = document.getElementById('bm-dest-section');
  const motifSection = document.getElementById('bm-motif-section');
  if (destSection) destSection.style.display = isHouse ? 'none' : '';
  if (motifSection) motifSection.style.display = isHouse ? '' : 'none';
}

function bmNextStep() {
  const res = resources.find(r => r.id === selectedResource);
  const isHouse = res && res.type === 'house';
  if (bmCurrentStep === 'destination') {
    bmCurrentStep = 'dates';
    renderBmCalendar();
  } else if (bmCurrentStep === 'dates') {
    if (isHouse) {
      confirmRangeBooking();
      return;
    }
    bmCurrentStep = 'hours';
  } else if (bmCurrentStep === 'hours') {
    confirmRangeBooking();
    return;
  }
  renderBmSteps();
  setTimeout(() => {
    document.getElementById(`bm-step-${bmCurrentStep}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

function goToStep(step) {
  bmCurrentStep = step;
  if (step === 'dates') renderBmCalendar();
  renderBmSteps();
  setTimeout(() => {
    document.getElementById(`bm-step-${step}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

function openBookingModal() {
  if (!currentUser) { showWelcomeScreen(); return; }
  bm = { startDate: null, endDate: null, startHour: '09:00', endHour: '20:00', destinations: [], step: 'start' };
  bmCurrentStep = 'destination';
  document.getElementById('booking-modal').classList.add('open');
  const sh = document.getElementById('bm-start-hour'); if (sh) sh.value = '09:00';
  const eh = document.getElementById('bm-end-hour'); if (eh) eh.value = '20:00';
  const di = document.getElementById('bm-dest-input'); if (di) di.value = '';
  const mi = document.getElementById('bm-motif-input'); if (mi) mi.value = '';
  const hint = document.getElementById('bm-dates-hint'); if (hint) hint.textContent = 'Sélectionnez votre date de départ';
  renderDestSuggestions('');
  renderBmSteps();
}

function closeBookingModal() {
  document.getElementById('booking-modal').classList.remove('open');
}

function renderBmCalendar() {
  const container = document.getElementById('bm-calendar-container');
  const body = document.getElementById('bm-body');
  if (!container) return;
  const scrollTop = body ? body.scrollTop : 0;
  const today = new Date(); today.setHours(0,0,0,0);
  let html = '';

  for (let m = 0; m < 4; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const year = d.getFullYear(); const month = d.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDay = d.getDay() - 1; if (firstDay < 0) firstDay = 6;
    const availBands = reservationService.computeAvailBands(year, month, daysInMonth, bookings);

    html += `<div class="bm-month-block">`;
    html += `<div class="bm-month-label">${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</div>`;
    if (availBands.length > 0) html += `<div class="bm-avail-band">✓ Disponible : ${availBands.join(', ')}</div>`;
    html += `<div class="bm-cal-grid">`;
    for (let i = 0; i < firstDay; i++) html += `<div class="bm-day bm-empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const cellDate = new Date(year, month, day);
      const isPast = cellDate < today;
      const isToday = cellDate.getTime() === today.getTime();
      const booking = bookings[ds];

      let classes = ['bm-day'];
      if (isPast) classes.push('bm-past');
      else if (isToday) classes.push('bm-today');
      if (booking && !isPast) classes.push('bm-booked');

      if (bm.startDate && bm.endDate) {
        if (ds === bm.startDate && ds === bm.endDate) classes.push('bm-day--start', 'bm-day--end');
        else if (ds === bm.startDate) classes.push('bm-day--start');
        else if (ds === bm.endDate) classes.push('bm-day--end');
        else if (ds > bm.startDate && ds < bm.endDate) classes.push('bm-day--mid');
      } else if (bm.startDate && ds === bm.startDate) classes.push('bm-day--start', 'bm-day--end');

      let avHtml = '';
      if (booking) {
        avHtml = booking.photo
          ? `<div class="bm-booking-avatar"><img src="${booking.photo}" alt=""></div>`
          : `<div class="bm-booking-avatar">${getInitials(booking.userName || '?')}</div>`;
      }

      const onclick = (!isPast && !booking) ? `onclick="onBmDayClick('${ds}')"` : '';
      html += `<div class="${classes.join(' ')}" ${onclick}><span class="bm-day-num">${day}</span>${avHtml}</div>`;
    }
    html += `</div></div>`;
  }
  container.innerHTML = html;
  if (body) body.scrollTop = scrollTop;
}

function onBmDayClick(ds) {
  if (!bm.startDate || bm.endDate) {
    bm.startDate = ds; bm.endDate = null; bm.step = 'end';
  } else {
    if (ds < bm.startDate) { bm.endDate = bm.startDate; bm.startDate = ds; }
    else bm.endDate = ds;
    bm.step = 'start';
  }
  const hint = document.getElementById('bm-dates-hint');
  if (hint) {
    if (bm.startDate && bm.endDate) hint.textContent = formatBmDateRange(bm.startDate, bm.endDate);
    else hint.textContent = 'Sélectionnez la date de retour';
  }
  renderBmCalendar();
  renderBmSteps();
}

function formatBmDateRange(s, e) {
  const sd = new Date(s + 'T00:00:00'), ed = new Date(e + 'T00:00:00');
  if (s === e) return sd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const sameMonth = sd.getMonth() === ed.getMonth() && sd.getFullYear() === ed.getFullYear();
  if (sameMonth) return `${sd.getDate()} — ${ed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  return `${sd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — ${ed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

function filterDestSuggestions(val) { renderDestSuggestions(val); }

function renderDestSuggestions(query) {
  const container = document.getElementById('bm-dest-suggestions');
  if (!container) return;
  const q = (query || '').toLowerCase().trim();
  const list = q ? reservationService.DEST_PRESETS.filter(d => d.name.toLowerCase().includes(q)) : reservationService.DEST_PRESETS;
  container.innerHTML = list.map(d => {
    const sel = bm.destinations.some(x => x.name === d.name);
    return `<button class="bm-dest-chip${sel ? ' selected' : ''}" onclick="toggleDestination('${d.name.replace(/'/g,"\\'")}',${d.km})">${d.name}</button>`;
  }).join('');
}

function toggleDestination(name, km) {
  if (bm.destinations.length > 0 && bm.destinations[0].name === name) {
    bm.destinations = [];
  } else {
    bm.destinations = [{ name, km }];
  }
  renderDestSuggestions(document.getElementById('bm-dest-input')?.value || '');
  const kmEl = document.getElementById('bm-dest-km');
  if (kmEl) kmEl.textContent = bm.destinations.length > 0
    ? `Distance estimée depuis Paris : ${bm.destinations[0].km * 2} km aller-retour`
    : '';
  renderBmSteps();
}

function updateBookingRecap() {
  bm.startHour = document.getElementById('bm-start-hour')?.value || '09:00';
  bm.endHour = document.getElementById('bm-end-hour')?.value || '20:00';
  renderBmSteps();
}

function resetBookingModal() {
  bm.startDate = null; bm.endDate = null; bm.destinations = []; bm.step = 'start';
  bmCurrentStep = 'destination';
  const hint = document.getElementById('bm-dates-hint'); if (hint) hint.textContent = 'Sélectionnez votre date de départ';
  const di = document.getElementById('bm-dest-input'); if (di) di.value = '';
  const mi = document.getElementById('bm-motif-input'); if (mi) mi.value = '';
  const kmEl = document.getElementById('bm-dest-km'); if (kmEl) kmEl.textContent = '';
  renderDestSuggestions('');
  renderBmSteps();
}

// ==========================================
// BOOKING ACTIONS — UI → Service → UI feedback
// ==========================================

async function confirmRangeBooking() {
  if (!currentUser || !bm.startDate) return;
  const res = resources.find(r => r.id === selectedResource);
  const isHouse = res && res.type === 'house';

  if (isHouse) {
    await createStay();
    return;
  }

  try {
    const result = await reservationService.createCarReservation({
      resourceId: selectedResource,
      userId: currentUser.id,
      userName: currentUser.name,
      photo: currentUser.photo,
      startDate: bm.startDate,
      endDate: bm.endDate || bm.startDate,
      startHour: bm.startHour || '09:00',
      endHour: bm.endHour || '20:00',
      destinations: bm.destinations,
      bookings
    });

    if (result.error === 'conflict') {
      showToast(`Conflit : le ${result.date} est déjà réservé`);
      return;
    }

    closeBookingModal();
    celebrate('✓', 'Réservation confirmée !', `+${result.xpGained} XP`,
      result.destinations.length > 0 ? `Direction : ${result.destinations[0].name}` : 'Bonne route !');
    setTimeout(() => { const nb = checkNewBadges(); nb.forEach(b => showToast(`Badge débloqué : ${b.label}`)); }, 2800);
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function createStay() {
  if (!currentUser || !bm.startDate) return;
  const startDate = bm.startDate;
  const endDate = bm.endDate || bm.startDate;
  const motif = document.getElementById('bm-motif-input')?.value.trim() || '';

  try {
    const result = await reservationService.createStayReservation({
      resourceId: selectedResource,
      userId: currentUser.id,
      userName: currentUser.name,
      photo: currentUser.photo,
      startDate,
      endDate,
      motif,
      bookings
    });

    if (result.error === 'conflict') {
      showToast(`Conflit : le ${result.date} est déjà réservé`);
      return;
    }

    closeBookingModal();
    celebrate('🏠', 'Séjour confirmé !', '+20 XP', motif || `${formatBmDateRange(startDate, endDate)}`);
    setTimeout(() => { const nb = checkNewBadges(); nb.forEach(b => showToast(`Badge débloqué : ${b.label}`)); }, 2800);
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function cancelStay(groupId) {
  try {
    await reservationService.cancelStay(groupId);
    closeSheet();
    showToast('Séjour annulé');
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function cancelBooking(bookingId) {
  try {
    await reservationService.cancel(bookingId);
    closeSheet();
    showToast('Réservation annulée');
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function truncateCarBooking(bookingId, newEndDate) {
  try {
    await reservationService.truncate(bookingId, newEndDate);
    closeSheet();
    showToast('Réservation raccourcie');
  } catch(e) { showToast('Erreur — réessayez'); }
}

// ==========================================
// MANAGE BOOKING SHEET — Pure UI
// ==========================================
function showDeleteBookingSheet(bookingId, dateStr) {
  const booking = Object.values(bookings).find(b => b && b.id === bookingId);
  if (!booking) { showToast('Réservation introuvable'); return; }

  const today = new Date().toISOString().slice(0, 10);
  const bookingEnd = booking.endDate || booking.startDate || booking.date || '';
  if (bookingEnd < today) {
    showToast('Impossible de modifier une réservation passée');
    return;
  }

  const isMultiDay = booking.startDate && booking.endDate && booking.startDate !== booking.endDate;
  const canTruncate = isMultiDay && dateStr > booking.startDate;

  const date = new Date(dateStr + 'T00:00:00');
  const prettyDate = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  let truncateSection = '';
  if (canTruncate) {
    const prevDate = new Date(dateStr + 'T00:00:00');
    prevDate.setDate(prevDate.getDate() - 1);
    const newEndStr = prevDate.toISOString().slice(0, 10);
    const prettyNewEnd = prevDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    truncateSection = `
      <div style="margin:0 0 12px;padding:14px;background:#fff8ed;border-radius:12px;border:1px solid #fde68a">
        <div style="font-weight:600;margin-bottom:4px">Retour anticipé</div>
        <div style="font-size:13px;color:var(--text-light);margin-bottom:10px">La voiture est rendue le ${prettyNewEnd}. Les jours suivants sont libérés.</div>
        <button class="btn btn-primary" onclick="truncateCarBooking('${booking.id}','${newEndStr}')">Rendre la voiture le ${prettyNewEnd}</button>
      </div>`;
  }

  const html = `
    <div class="login-sheet">
      <h2>Gérer la réservation</h2>
      <div style="color:var(--text-light);font-size:14px;margin-bottom:16px">${prettyDate}</div>
      ${truncateSection}
      <div style="margin:0 0 12px;padding:14px;background:#fff0f0;border-radius:12px;border:1px solid #fecaca">
        <div style="font-weight:600;margin-bottom:4px">${isMultiDay ? 'Annuler toute la réservation' : 'Annuler la réservation'}</div>
        <div style="font-size:13px;color:var(--text-light);margin-bottom:10px">Cette action est irréversible.</div>
        <button class="btn btn-danger" onclick="cancelBooking('${booking.id}')">${isMultiDay ? 'Annuler toute la réservation' : 'Confirmer l\'annulation'}</button>
      </div>
      <button class="btn" style="background:#f5f5f5;color:var(--text)" onclick="closeSheet()">Retour</button>
    </div>`;

  document.getElementById('sheet-content').innerHTML = html;
  document.getElementById('overlay').classList.add('open');
}
