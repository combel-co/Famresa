// ==========================================
// BOOKING MODAL (Airbnb style) — UI only
// ==========================================
// Business logic delegated to reservationService
// (src/modules/reservation/reservation.service.js)

let bm = { startDate: null, endDate: null, startHour: '09:00', endHour: '20:00', destinations: [], step: 'start', booker: null, bookerTab: 'member' };
let bmCurrentStep = 'destination';
let bmIsAdmin = false;
let bmMembers = [];
let bmIsEditing = false;
let bmCalendarSignature = '';

function bmGetContext() {
  const resource = resources.find(r => r.id === selectedResource);
  return {
    resource,
    isHouse: !!(resource && resource.type === 'house'),
    isAdmin: !!bmIsAdmin,
    isEditing: !!bmIsEditing
  };
}

function bmBuildStepConfig() {
  const { isHouse, isAdmin, isEditing } = bmGetContext();
  if (isEditing) return ['destination'];
  if (isHouse) return isAdmin ? ['dates', 'booker', 'destination'] : ['dates', 'destination'];
  return isAdmin ? ['dates', 'hours', 'booker', 'destination'] : ['dates', 'hours', 'destination'];
}

function bmCanProceedFromStep(step) {
  if (step === 'dates') return !!bm.startDate;
  if (step === 'hours') return !!bm.startHour && !!bm.endHour;
  if (step === 'booker') {
    if (bm.bookerTab === 'external') return !!(bm.booker && bm.booker.type === 'external' && bm.booker.name);
    return true;
  }
  return true;
}

function bmGetRecapRows() {
  const { isHouse } = bmGetContext();
  const start = bm.startDate
    ? new Date(bm.startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    : '—';
  const end = bm.endDate
    ? new Date(bm.endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    : (bm.startDate ? start : '—');
  const who = bm.booker ? bm.booker.name : 'Moi-même';
  const where = isHouse
    ? (document.getElementById('bm-motif-input')?.value.trim() || 'Séjour')
    : (bm.destinations[0]?.name || 'Flexible');
  return [
    `Dates: ${start} → ${end}`,
    `Heures: ${bm.startHour} → ${bm.endHour}`,
    `Pour: ${who}`,
    `${isHouse ? 'Motif' : 'Destination'}: ${where}`
  ];
}

function bmUpdateFooterRecap() {
  const recap = document.getElementById('bm-footer-recap');
  if (!recap) return;
  recap.innerHTML = bmGetRecapRows().map(x => `<span>${x}</span>`).join('');
}

function bmScrollToStep(step) {
  setTimeout(() => {
    document.getElementById(`bm-step-${step}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

function renderBmSteps() {
  const steps = bmBuildStepConfig();
  const { isHouse, isEditing } = bmGetContext();
  const currentIndex = Math.max(0, steps.indexOf(bmCurrentStep));
  bmCurrentStep = steps[currentIndex] || steps[0];

  ['dates', 'hours', 'booker', 'destination'].forEach((step) => {
    const el = document.getElementById(`bm-step-${step}`);
    if (!el) return;
    const index = steps.indexOf(step);
    el.classList.remove('active', 'completed', 'upcoming');
    if (index === -1) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
      return;
    }
    el.style.display = '';
    el.removeAttribute('aria-hidden');
    if (index < currentIndex) el.classList.add('completed');
    else if (index === currentIndex) el.classList.add('active');
    else el.classList.add('upcoming');
  });

  const bookerVal = document.getElementById('bm-mini-booker-val');
  if (bookerVal) bookerVal.textContent = bm.booker ? bm.booker.name : 'Moi-même';

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
  if (datesVal) {
    datesVal.textContent = bm.startDate
      ? (bm.endDate && bm.endDate !== bm.startDate
          ? formatBmDateRange(bm.startDate, bm.endDate)
          : new Date(bm.startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))
      : 'Ajouter des dates';
  }

  const hoursVal = document.getElementById('bm-mini-hours-val');
  if (hoursVal) hoursVal.textContent = `${bm.startHour} → ${bm.endHour}`;

  const destTitle = document.querySelector('#bm-step-destination .bm-section-title');
  const destLabel = document.querySelector('#bm-step-destination .bm-card-mini-label');
  if (destTitle) destTitle.textContent = isHouse ? 'Motif (optionnel)' : 'Où ?';
  if (destLabel) destLabel.textContent = isHouse ? 'Motif' : 'Destination';

  const datesTitle = document.querySelector('#bm-step-dates .bm-section-title');
  if (datesTitle) datesTitle.textContent = isHouse ? 'Arrivée / Départ' : 'Quand ?';

  const nextBtn = document.getElementById('bm-next-btn');
  if (nextBtn) {
    const isLast = currentIndex === steps.length - 1;
    nextBtn.textContent = isLast ? (isEditing ? 'Enregistrer' : 'Réserver') : 'Suivant';
    nextBtn.disabled = !bmCanProceedFromStep(bmCurrentStep);
    nextBtn.setAttribute('aria-disabled', String(nextBtn.disabled));
  }

  const progress = document.getElementById('bm-progress-text');
  if (progress) {
    progress.textContent = isEditing
      ? 'Mode édition'
      : `Étape ${currentIndex + 1} sur ${steps.length}`;
  }

  const destSection = document.getElementById('bm-dest-section');
  const motifSection = document.getElementById('bm-motif-section');
  if (destSection) destSection.style.display = isHouse ? 'none' : '';
  if (motifSection) motifSection.style.display = isHouse ? '' : 'none';

  bmUpdateFooterRecap();
}

function bmNextStep() {
  const steps = bmBuildStepConfig();
  const currentIndex = Math.max(0, steps.indexOf(bmCurrentStep));
  if (!bmCanProceedFromStep(bmCurrentStep)) {
    const feedback = document.getElementById('bm-inline-feedback');
    if (feedback) feedback.textContent = 'Complétez cette étape pour continuer.';
    return;
  }
  const feedback = document.getElementById('bm-inline-feedback');
  if (feedback) feedback.textContent = '';
  if (currentIndex >= steps.length - 1) {
    confirmRangeBooking();
    return;
  }
  bmCurrentStep = steps[currentIndex + 1];
  renderBmSteps();
  bmScrollToStep(bmCurrentStep);
}

function goToStep(step) {
  const steps = bmBuildStepConfig();
  if (!steps.includes(step)) return;
  bmCurrentStep = step;
  if (step === 'dates') renderBmCalendar();
  renderBmSteps();
  bmScrollToStep(step);
}

function openBookingModal() {
  if (!currentUser) { showWelcomeScreen(); return; }
  bm = { startDate: null, endDate: null, startHour: '09:00', endHour: '20:00', destinations: [], step: 'start', booker: null, bookerTab: 'member' };
  bmIsEditing = false;
  bmCalendarSignature = '';
  bmIsAdmin = window._myResourceRoles && window._myResourceRoles[selectedResource] === 'admin';
  bmMembers = [];
  bmCurrentStep = 'dates';
  if (bmIsAdmin) loadBookerMembers();

  document.getElementById('booking-modal').classList.add('open');
  const sh = document.getElementById('bm-start-hour'); if (sh) sh.value = '09:00';
  const eh = document.getElementById('bm-end-hour'); if (eh) eh.value = '20:00';
  const di = document.getElementById('bm-dest-input'); if (di) di.value = '';
  const mi = document.getElementById('bm-motif-input'); if (mi) mi.value = '';
  const ni = document.getElementById('bm-external-name'); if (ni) ni.value = '';
  const hint = document.getElementById('bm-dates-hint'); if (hint) hint.textContent = 'Sélectionnez votre date de départ';
  const feedback = document.getElementById('bm-inline-feedback'); if (feedback) feedback.textContent = '';
  renderDestSuggestions('');
  renderBmCalendar();
  renderBmSteps();
}

function closeBookingModal() {
  _editingBookingId = null;
  bmIsEditing = false;
  bmCalendarSignature = '';
  document.getElementById('booking-modal').classList.remove('open');
}

function renderBmCalendar() {
  const container = document.getElementById('bm-calendar-container');
  const body = document.getElementById('bm-body');
  if (!container) return;
  const scrollTop = body ? body.scrollTop : 0;
  const today = new Date(); today.setHours(0,0,0,0);
  let html = '';

  for (let m = 0; m < reservationService.BOOKING_HORIZON_MONTHS; m++) {
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

      const isInteractive = !isPast && !booking;
      const onAction = isInteractive
        ? `onclick="onBmDayClick('${ds}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();onBmDayClick('${ds}')}" tabindex="0" role="button" aria-label="Sélectionner le ${day}"`
        : 'aria-disabled="true" tabindex="-1"';
      html += `<div class="${classes.join(' ')}" ${onAction}><span class="bm-day-num">${day}</span>${avHtml}</div>`;
    }
    html += `</div></div>`;
  }
  const bookingKeys = Object.keys(bookings || {}).sort().join(',');
  const signature = `${bm.startDate || ''}|${bm.endDate || ''}|${bookingKeys}`;
  if (signature !== bmCalendarSignature || container.innerHTML !== html) {
    container.innerHTML = html;
    bmCalendarSignature = signature;
  }
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
    return `<button type="button" class="bm-dest-chip${sel ? ' selected' : ''}" onclick="toggleDestination('${d.name.replace(/'/g,"\\'")}',${d.km})" aria-pressed="${sel ? 'true' : 'false'}">${d.name}</button>`;
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
  _editingBookingId = null;
  bmIsEditing = false;
  bmCalendarSignature = '';
  bm.startDate = null; bm.endDate = null; bm.destinations = []; bm.step = 'start';
  bm.booker = null; bm.bookerTab = 'member';
  bmCurrentStep = 'dates';
  const hint = document.getElementById('bm-dates-hint'); if (hint) hint.textContent = 'Sélectionnez votre date de départ';
  const feedback = document.getElementById('bm-inline-feedback'); if (feedback) feedback.textContent = '';
  const di = document.getElementById('bm-dest-input'); if (di) di.value = '';
  const mi = document.getElementById('bm-motif-input'); if (mi) mi.value = '';
  const ni = document.getElementById('bm-external-name'); if (ni) ni.value = '';
  const kmEl = document.getElementById('bm-dest-km'); if (kmEl) kmEl.textContent = '';
  if (bmIsAdmin) renderBookerMemberList();
  renderDestSuggestions('');
  renderBmCalendar();
  renderBmSteps();
}

// ==========================================
// ADMIN BOOKER — "Pour qui ?" step (admin only)
// ==========================================

async function loadBookerMembers() {
  if (!currentUser?.familyId) return;
  try {
    bmMembers = await reservationService.getEligibleBookers(currentUser.familyId);
  } catch (_) { bmMembers = []; }
  renderBookerMemberList();
}

function renderBookerMemberList() {
  const container = document.getElementById('bm-booker-member-list');
  if (!container) return;
  // "Moi-même" option + all members
  let html = `<div class="bm-member-item${!bm.booker ? ' selected' : ''}" onclick="selectBooker(null)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectBooker(null)}" tabindex="0" role="button" aria-pressed="${!bm.booker ? 'true' : 'false'}">
    <div class="bm-member-avatar">${currentUser.photo ? '<img src="' + currentUser.photo + '" alt="">' : getInitials(currentUser.name || '?')}</div>
    <div class="bm-member-name">Moi-même</div>
  </div>`;
  for (const m of bmMembers) {
    if (m.id === currentUser.id) continue;
    const sel = bm.booker && bm.booker.id === m.id ? ' selected' : '';
    const avatar = m.photo ? '<img src="' + m.photo + '" alt="">' : (m.initials || '?');
    html += `<div class="bm-member-item${sel}" onclick="selectBooker('${m.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectBooker('${m.id}')}" tabindex="0" role="button" aria-pressed="${sel ? 'true' : 'false'}">
      <div class="bm-member-avatar">${avatar}</div>
      <div class="bm-member-name">${m.name}</div>
    </div>`;
  }
  container.innerHTML = html;
}

function selectBooker(memberId) {
  if (!memberId) {
    bm.booker = null;
  } else {
    const m = bmMembers.find(x => x.id === memberId);
    if (m) bm.booker = { id: m.id, name: m.name, photo: m.photo, type: 'member' };
  }
  renderBookerMemberList();
  renderBmSteps();
}

function switchBookerTab(tab) {
  bm.bookerTab = tab;
  bm.booker = null;
  const feedback = document.getElementById('bm-inline-feedback');
  if (feedback) feedback.textContent = '';
  const memberList = document.getElementById('bm-booker-member-list');
  const externalDiv = document.getElementById('bm-booker-external');
  const tabs = document.querySelectorAll('#bm-booker-tabs .bm-booker-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (tab === 'member') {
    if (memberList) memberList.style.display = '';
    if (externalDiv) externalDiv.style.display = 'none';
    renderBookerMemberList();
  } else {
    if (memberList) memberList.style.display = 'none';
    if (externalDiv) externalDiv.style.display = '';
    const ni = document.getElementById('bm-external-name'); if (ni) ni.value = '';
  }
  renderBmSteps();
}

function onExternalNameInput(val) {
  const name = (val || '').trim();
  const feedback = document.getElementById('bm-inline-feedback');
  if (name) {
    bm.booker = { id: 'external', name, photo: null, type: 'external' };
    if (feedback) feedback.textContent = '';
  } else {
    bm.booker = null;
    if (feedback && bmCurrentStep === 'booker') feedback.textContent = 'Entrez le nom du locataire externe.';
  }
  renderBmSteps();
}

/**
 * Resolve the effective booker for the reservation.
 * Returns { id, name, photo, createdBy } — createdBy is null if booking for self.
 */
function _resolveBooker() {
  if (bm.booker) {
    return {
      id: bm.booker.id,
      name: bm.booker.name,
      photo: bm.booker.photo || null,
      createdBy: { id: currentUser.id, name: currentUser.name }
    };
  }
  return { id: currentUser.id, name: currentUser.name, photo: currentUser.photo, createdBy: null };
}

// ==========================================
// BOOKING ACTIONS — UI → Service → UI feedback
// ==========================================

async function confirmRangeBooking() {
  if (!currentUser || !bm.startDate) return;

  // If in edit mode, save changes instead of creating new
  if (_editingBookingId) {
    await saveEditedBooking();
    return;
  }

  const res = resources.find(r => r.id === selectedResource);
  const isHouse = res && res.type === 'house';

  if (isHouse) {
    await createStay();
    return;
  }

  try {
    const booker = _resolveBooker();
    const result = await reservationService.createCarReservation({
      resourceId: selectedResource,
      userId: booker.id,
      userName: booker.name,
      photo: booker.photo,
      startDate: bm.startDate,
      endDate: bm.endDate || bm.startDate,
      startHour: bm.startHour || '09:00',
      endHour: bm.endHour || '20:00',
      destinations: bm.destinations,
      bookings,
      createdBy: booker.createdBy
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
    const booker = _resolveBooker();
    const result = await reservationService.createStayReservation({
      resourceId: selectedResource,
      userId: booker.id,
      userName: booker.name,
      photo: booker.photo,
      startDate,
      endDate,
      motif,
      bookings,
      createdBy: booker.createdBy
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
    await reservationService.cancel(bookingId, currentUser?.familyId);
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

// ==========================================
// EARLY RETURN — "Rendre plus tôt"
// ==========================================
function showEarlyReturnSheet(bookingId) {
  const booking = Object.values(bookings).find(b => b && b.id === bookingId);
  if (!booking) { showToast('Réservation introuvable'); return; }

  selectedFuelLevel = null;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const resourceId = booking.ressource_id || booking.resourceId || selectedResource;

  const html = `
    <div class="login-sheet">
      <h2>🔑 Rendre plus tôt</h2>
      <p style="color:var(--text-light);font-size:14px;margin-bottom:16px">
        Indiquez l'heure de retour et l'état du véhicule
      </p>
      <div class="input-group" style="margin-bottom:14px">
        <label>Heure de retour</label>
        <input type="time" id="early-return-hour" value="${currentTime}">
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px">État du véhicule</label>
        <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:6px;cursor:pointer">
          <input type="checkbox" id="early-return-cleaning"> À nettoyer
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:6px;cursor:pointer">
          <input type="checkbox" id="early-return-repair"> Réparation nécessaire
        </label>
      </div>
      <div class="input-group" style="margin-bottom:14px">
        <label>Notes (optionnel)</label>
        <input type="text" id="early-return-notes" placeholder="Ex: pneu avant droit à vérifier" autocomplete="off">
      </div>
      <div style="margin-bottom:14px;padding-top:14px;border-top:1px solid var(--border)">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:10px">Niveau d'essence rendu</label>
        <div class="fuel-selector">${renderFuelButtons()}</div>
      </div>
      <div class="lock-error" id="early-return-error"></div>
      <button class="btn btn-primary" style="width:100%" onclick="confirmEarlyReturn('${booking.id}','${resourceId}')">Confirmer le retour</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px;width:100%" onclick="closeSheet()">Annuler</button>
    </div>`;

  document.getElementById('sheet-content').innerHTML = html;
  document.getElementById('overlay').classList.add('open');
}

async function confirmEarlyReturn(bookingId, resourceId) {
  const returnHour = document.getElementById('early-return-hour')?.value;
  const needsCleaning = document.getElementById('early-return-cleaning')?.checked || false;
  const needsRepair = document.getElementById('early-return-repair')?.checked || false;
  const notes = (document.getElementById('early-return-notes')?.value || '').trim();
  const fuelLevel = selectedFuelLevel;

  if (!returnHour) {
    document.getElementById('early-return-error').textContent = 'Indiquez l\'heure de retour';
    return;
  }

  try {
    await reservationService.earlyReturn(bookingId, resourceId, {
      returnHour,
      needsCleaning,
      needsRepair,
      notes,
      fuelLevel
    });
    selectedFuelLevel = null;

    // Update local resource fuel level so UI reflects it immediately
    if (fuelLevel !== null && fuelLevel !== undefined) {
      const res = resources.find(r => r.id === resourceId);
      if (res) res.fuelLevel = fuelLevel;
    }

    closeSheet();
    if (fuelLevel !== null && fuelLevel !== undefined && fuelLevel >= 50) {
      celebrate('⛽', 'Véhicule rendu — merci !', '🌟', 'La voiture est bien ravitaillée');
    } else {
      showToast('Véhicule rendu — merci !');
    }
  } catch(e) {
    document.getElementById('early-return-error').textContent = 'Erreur — réessayez';
  }
}

// ==========================================
// EDIT BOOKING — Re-open modal pre-filled for modification
// ==========================================
let _editingBookingId = null;

function openEditBookingModal(bookingId) {
  const booking = Object.values(bookings).find(b => b && b.id === bookingId);
  if (!booking) { showToast('Réservation introuvable'); return; }

  closeSheet();
  _editingBookingId = bookingId;
  bmIsEditing = true;
  bmCalendarSignature = '';

  // Open modal and pre-fill with existing values
  openBookingModal();

  // Pre-fill destinations
  if (booking.destinations && booking.destinations.length > 0) {
    const dest = booking.destinations[0];
    bm.destinations = [{ name: dest.name, km: dest.kmFromParis || dest.km || 0 }];
  }

  // Pre-fill dates
  bm.startDate = booking.startDate || null;
  bm.endDate = booking.endDate || null;

  // Pre-fill hours
  bm.startHour = booking.startHour || '09:00';
  bm.endHour = booking.endHour || '20:00';
  const sh = document.getElementById('bm-start-hour'); if (sh) sh.value = bm.startHour;
  const eh = document.getElementById('bm-end-hour'); if (eh) eh.value = bm.endHour;

  // Edit flow starts on destination recap step
  bmCurrentStep = 'destination';

  // Update UI
  renderDestSuggestions('');
  renderBmCalendar();
  renderBmSteps();
}

async function saveEditedBooking() {
  if (!_editingBookingId) return;
  try {
    const updates = {
      destinations: bm.destinations,
      startDate: bm.startDate,
      endDate: bm.endDate || bm.startDate,
      startHour: bm.startHour || '09:00',
      endHour: bm.endHour || '20:00'
    };
    const result = await reservationService.updateReservation(_editingBookingId, updates, bookings);
    if (result.error === 'conflict') {
      showToast(result.message);
      return;
    }
    _editingBookingId = null;
    closeBookingModal();
    showToast('Réservation modifiée');
  } catch(e) {
    showToast('Erreur — réessayez');
  }
}
