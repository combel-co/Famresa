// ==========================================
// PLANNING — calendrier unifié (consultation / réservation / wizard)
// ==========================================
const CAL_HORIZON_MONTHS = 13;

let _planningPhase = 'consult';
let _planningCalendarCollapsed = false;
let _microPromptTimer = null;
let _pendingMicroDate = null;

function getPlanningPhase() {
  return _planningPhase;
}

/** Barre de statut / chrome navigateur : beige en réservation/wizard planning, blanc sinon. */
function syncPlanningThemeColor(planningBookingFocus) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', planningBookingFocus ? '#faf8f4' : '#ffffff');
}

/**
 * Masque header app + onglets ressources pendant reserve/wizard sur l’onglet Planning.
 * Réaligne sur switchTab (Profil = caché) hors flux réservation.
 */
function syncPlanningShellChrome() {
  const phase = typeof getPlanningPhase === 'function' ? getPlanningPhase() : 'consult';
  const inBooking = phase === 'reserve' || phase === 'wizard';
  const onCalendar = typeof activeTab !== 'undefined' && activeTab === 'calendar';
  const focus = inBooking && onCalendar;
  document.body.classList.toggle('planning-booking-focus', !!focus);
  syncPlanningThemeColor(!!focus);

  if (!focus) {
    const appHeader = document.getElementById('app-header');
    const resourceTabs = document.getElementById('resource-tabs');
    if (typeof activeTab !== 'undefined') {
      const profileMode = activeTab === 'profile';
      if (appHeader) appHeader.style.display = profileMode ? 'none' : '';
      if (resourceTabs) resourceTabs.style.display = profileMode ? 'none' : '';
    }
  }

  const postChrome = () => {
    if (typeof syncResourceTabsHeight === 'function') syncResourceTabsHeight();
    if (!focus && typeof activeTab !== 'undefined' && typeof _syncHeaderHeight === 'function') {
      _syncHeaderHeight();
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(postChrome);
  } else {
    postChrome();
  }
}

/**
 * Phase reserve : en-tête « Arrivée / Départ » + même scroll que la consult ; pied (Réinitialiser / Suivant beige).
 * Phase wizard : masque le shell ; phase consult : shell en flux sans en-tête modal.
 */
function syncPlanningReserveModalUi() {
  const shell = document.getElementById('planning-reserve-shell');
  const header = document.getElementById('planning-reserve-header');
  const bar = document.getElementById('planning-action-bar');
  const left = document.getElementById('planning-action-left');
  const right = document.getElementById('planning-action-right');
  const closeBtn = document.getElementById('planning-reserve-close');
  if (!shell || !header) return;

  const phase = getPlanningPhase();

  if (phase === 'wizard') {
    shell.style.display = 'none';
    shell.classList.remove('planning-reserve-shell--active');
    document.body.classList.remove('planning-reserve-active');
    header.setAttribute('hidden', '');
    if (bar) bar.classList.remove('planning-action-bar--reserve');
    if (left) left.classList.remove('bm-reset-btn');
    if (closeBtn) closeBtn.onclick = null;
    return;
  }

  if (phase === 'reserve') {
    shell.style.display = '';
    shell.classList.add('planning-reserve-shell--active');
    document.body.classList.add('planning-reserve-active');
    header.removeAttribute('hidden');
    if (bar) bar.classList.add('planning-action-bar--reserve');
    if (left) {
      left.classList.add('bm-reset-btn');
      left.textContent = 'Réinitialiser';
    }
    if (right) {
      right.textContent = 'Suivant';
    }
    if (closeBtn) closeBtn.onclick = () => planningActionEffacer();
    return;
  }

  shell.style.display = '';
  shell.classList.remove('planning-reserve-shell--active');
  document.body.classList.remove('planning-reserve-active');
  header.setAttribute('hidden', '');
  if (bar) bar.classList.remove('planning-action-bar--reserve');
  if (left) left.classList.remove('bm-reset-btn');
  if (closeBtn) closeBtn.onclick = null;
}

function getBookingOccupancy(booking) {
  if (!booking) return 0;
  const c = booking.companions != null ? Number(booking.companions) : Number(booking.guestCount);
  const extra = Number.isFinite(c) && c >= 0 ? c : 0;
  return 1 + extra;
}

function scrollPlanningToDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return;
  const monthKey = dateStr.slice(0, 7);
  const target = document.querySelector(`[data-month="${monthKey}"]`);
  if (target) {
    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
}

function enterPlanningEditMode() {
  _planningPhase = 'wizard';
  _planningCalendarCollapsed = true;
  const calBlock = document.getElementById('planning-calendar-block');
  if (calBlock) calBlock.style.display = 'none';
  const w = document.getElementById('planning-wizard-wrap');
  if (w) {
    w.style.display = 'block';
    w.removeAttribute('aria-hidden');
  }
  const bar = document.getElementById('planning-action-bar');
  if (bar) {
    bar.style.display = 'flex';
    document.getElementById('tab-calendar')?.classList.add('planning-has-action-bar');
  }
  if (typeof setBottomNavBookingActive === 'function') setBottomNavBookingActive(true);
  if (typeof initWizardAfterDates === 'function') initWizardAfterDates();
  renderCalendar();
  syncPlanningShellChrome();
  syncPlanningReserveModalUi();
}

function exitPlanningUnifiedMode() {
  _planningPhase = 'consult';
  _planningCalendarCollapsed = false;
  hidePlanningMicroPrompt();
  const w = document.getElementById('planning-wizard-wrap');
  if (w) {
    w.style.display = 'none';
    w.setAttribute('aria-hidden', 'true');
  }
  const calBlock = document.getElementById('planning-calendar-block');
  if (calBlock) calBlock.style.display = '';
  const bar = document.getElementById('planning-action-bar');
  if (bar) bar.style.display = 'none';
  document.getElementById('tab-calendar')?.classList.remove('planning-has-action-bar');
  if (typeof setBottomNavBookingActive === 'function') setBottomNavBookingActive(false);
  if (typeof resetBookingWizardState === 'function') resetBookingWizardState();
  syncPlanningShellChrome();
  syncPlanningReserveModalUi();
}

function afterBookingSuccess(startDateStr) {
  window._planningCelebrateScrollDate = startDateStr;
  if (typeof resetBookingWizardState === 'function') resetBookingWizardState();
  exitPlanningUnifiedMode();
  if (typeof renderCalendar === 'function') renderCalendar();
}

function finishPlanningAfterCelebrate(startDateStr) {
  const ds = startDateStr || window._planningCelebrateScrollDate;
  window._planningCelebrateScrollDate = null;
  if (typeof switchTab === 'function') switchTab('planning');
  scrollPlanningToDate(ds);
  if (typeof showToast === 'function') showToast('Réservation ajoutée');
}

function hidePlanningMicroPrompt() {
  const el = document.getElementById('planning-micro-prompt');
  if (el) el.style.display = 'none';
  if (_microPromptTimer) {
    clearTimeout(_microPromptTimer);
    _microPromptTimer = null;
  }
  _pendingMicroDate = null;
}

function showPlanningMicroPrompt(dateStr) {
  const el = document.getElementById('planning-micro-prompt');
  const tx = document.getElementById('planning-micro-prompt-text');
  if (!el || !tx) return;
  const d = new Date(dateStr + 'T00:00:00');
  const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  tx.textContent = `Réserver à partir du ${label} ?`;
  el.style.display = 'flex';
  _pendingMicroDate = dateStr;
  if (_microPromptTimer) clearTimeout(_microPromptTimer);
  _microPromptTimer = setTimeout(() => hidePlanningMicroPrompt(), 4000);
  const ok = document.getElementById('planning-micro-ok');
  const cancel = document.getElementById('planning-micro-cancel');
  if (ok) {
    ok.onclick = () => {
      hidePlanningMicroPrompt();
      enterPlanningReserveFromPrompt(_pendingMicroDate || dateStr);
    };
  }
  if (cancel) {
    cancel.onclick = () => hidePlanningMicroPrompt();
  }
}

function enterPlanningReserveFromPrompt(dateStr) {
  if (!dateStr || typeof bmApplyDaySelection !== 'function') return;
  if (typeof resetBookingWizardState === 'function') resetBookingWizardState();
  bmApplyDaySelection(dateStr);
  _planningPhase = 'reserve';
  _planningCalendarCollapsed = false;
  const w = document.getElementById('planning-wizard-wrap');
  if (w) {
    w.style.display = 'none';
    w.setAttribute('aria-hidden', 'true');
  }
  const calBlock = document.getElementById('planning-calendar-block');
  if (calBlock) calBlock.style.display = '';
  const bar = document.getElementById('planning-action-bar');
  if (bar) {
    bar.style.display = 'flex';
    document.getElementById('tab-calendar')?.classList.add('planning-has-action-bar');
    const right = document.getElementById('planning-action-right');
    if (right) {
      right.disabled = false;
      right.classList.remove('is-disabled');
    }
  }
  if (typeof setBottomNavBookingActive === 'function') setBottomNavBookingActive(true);
  onPlanningDatesChanged();
  renderCalendar();
  syncPlanningShellChrome();
  syncPlanningReserveModalUi();
}

function planningActionEffacer() {
  hidePlanningMicroPrompt();
  if (typeof resetBookingWizardState === 'function') resetBookingWizardState();
  exitPlanningUnifiedMode();
  renderCalendar();
}

function planningSuivantFromDates() {
  if (typeof bmEnsureDefaultEndForNext === 'function') bmEnsureDefaultEndForNext();
  _planningPhase = 'wizard';
  _planningCalendarCollapsed = true;
  const calBlock = document.getElementById('planning-calendar-block');
  if (calBlock) calBlock.style.display = 'none';
  const w = document.getElementById('planning-wizard-wrap');
  if (w) {
    w.style.display = 'block';
    w.removeAttribute('aria-hidden');
  }
  const bar = document.getElementById('planning-action-bar');
  if (bar) {
    bar.style.display = 'flex';
    document.getElementById('tab-calendar')?.classList.add('planning-has-action-bar');
  }
  if (typeof setBottomNavBookingActive === 'function') setBottomNavBookingActive(true);
  if (typeof initWizardAfterDates === 'function') initWizardAfterDates();
  renderCalendar();
  syncPlanningShellChrome();
  syncPlanningReserveModalUi();
}

function planningExpandDatesFromWizard() {
  _planningPhase = 'reserve';
  _planningCalendarCollapsed = false;
  const calBlock = document.getElementById('planning-calendar-block');
  if (calBlock) calBlock.style.display = '';
  const w = document.getElementById('planning-wizard-wrap');
  if (w) {
    w.style.display = 'none';
    w.setAttribute('aria-hidden', 'true');
  }
  const bar = document.getElementById('planning-action-bar');
  if (bar) {
    bar.style.display = 'flex';
    document.getElementById('tab-calendar')?.classList.add('planning-has-action-bar');
  }
  if (typeof setBottomNavBookingActive === 'function') setBottomNavBookingActive(true);
  renderCalendar();
  syncPlanningShellChrome();
  syncPlanningReserveModalUi();
}

function planningActionLeftClick() {
  if (_planningPhase === 'wizard') {
    const steps = bmBuildStepConfig();
    const idx = Math.max(0, steps.indexOf(bmCurrentStep));
    if (idx <= 0) {
      planningExpandDatesFromWizard();
      return;
    }
    bmCurrentStep = steps[idx - 1];
    renderBmSteps();
    return;
  }
  planningActionEffacer();
}

function planningActionRightClick() {
  if (_planningPhase === 'reserve') {
    planningSuivantFromDates();
    return;
  }
  if (_planningPhase === 'wizard' && typeof bmNextStep === 'function') bmNextStep();
}

function onPlanningDatesChanged() {
  const hint = document.getElementById('planning-hint');
  const recapEl = document.getElementById('planning-reserve-recap');
  const subEl = document.getElementById('planning-reserve-subtitle');
  if (!hint) return;

  if (_planningPhase !== 'reserve' || typeof bmGetSelection !== 'function') {
    hint.textContent = '';
    if (recapEl) {
      recapEl.textContent = '';
      recapEl.setAttribute('hidden', '');
    }
    if (subEl) {
      subEl.textContent = 'Sélectionnez votre date de départ';
      subEl.removeAttribute('hidden');
    }
    return;
  }

  hint.textContent = '';

  const sel = bmGetSelection();
  if (subEl) {
    if (!sel.startDate) {
      subEl.textContent = 'Sélectionnez votre date de départ';
      subEl.removeAttribute('hidden');
    } else if (!sel.endDate) {
      subEl.textContent = 'Sélectionnez votre date de fin';
      subEl.removeAttribute('hidden');
    } else {
      subEl.textContent = '';
      // On ne toggle plus `hidden` pour éviter un saut visuel / changement de styles.
      subEl.removeAttribute('hidden');
    }
  }

  if (recapEl) {
    if (sel.startDate && sel.endDate) {
      const n = Math.max(1, countStayNights(sel.startDate, sel.endDate));
      const sd = new Date(sel.startDate + 'T00:00:00');
      const ed = new Date(sel.endDate + 'T00:00:00');
      const a = sd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      const b = ed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      recapEl.textContent =
        sel.startDate === sel.endDate
          ? `1 nuit · ${a}`
          : `${n} nuit${n > 1 ? 's' : ''} · ${a} → ${b}`;
      recapEl.removeAttribute('hidden');
    } else {
      recapEl.textContent = '';
      recapEl.setAttribute('hidden', '');
    }
  }
}

function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  if (_planningPhase === 'wizard' && _planningCalendarCollapsed) {
    grid.innerHTML = '';
    renderExperiencePanels();
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sel = typeof bmGetSelection === 'function' ? bmGetSelection() : { startDate: null, endDate: null };
  const bmStart = sel.startDate;
  const bmEnd = sel.endDate;
  let html = '';

  for (let m = 0; m < CAL_HORIZON_MONTHS; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDay = d.getDay() - 1;
    if (firstDay < 0) firstDay = 6;
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    html += `<div class="bm-month-block" data-month="${monthKey}">`;
    html += `<div class="bm-month-label">${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</div>`;
    html += `<div class="bm-cal-grid">`;

    for (let i = 0; i < firstDay; i++) html += `<div class="bm-day bm-empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cellDate = new Date(year, month, day);
      const isPast = cellDate < today;
      const isToday = cellDate.getTime() === today.getTime();
      const booking = bookings[dateStr];

      let classes = ['bm-day'];
      if (isPast) classes.push('bm-past');
      else if (isToday) classes.push('bm-today');
      if (booking && !isPast) classes.push('bm-booked');

      if (_planningPhase === 'reserve' && bmStart) {
        if (bmEnd) {
          if (dateStr === bmStart && dateStr === bmEnd) classes.push('bm-day--start', 'bm-day--end');
          else if (dateStr === bmStart) classes.push('bm-day--start');
          else if (dateStr === bmEnd) classes.push('bm-day--end');
          else if (dateStr > bmStart && dateStr < bmEnd) classes.push('bm-day--mid');
        } else if (dateStr === bmStart) classes.push('bm-day--start', 'bm-day--end');
      }

      let avHtml = '';
      if (booking) {
        const avatarPhoto = booking._currentPhoto || booking.photo || null;
        avHtml = avatarPhoto
          ? `<div class="bm-booking-avatar"><img src="${avatarPhoto}" alt=""></div>`
          : `<div class="bm-booking-avatar">${getInitials(booking.userName || '?')}</div>`;
      }

      const inReserve = _planningPhase === 'reserve';
      const clickableConsult = _planningPhase === 'consult' && !isPast;
      const clickableReserve = inReserve && !isPast && !booking;

      let onAction = 'aria-disabled="true" tabindex="-1"';
      if (clickableReserve) {
        onAction = `onclick="planningOnReserveDayClick('${dateStr}')" tabindex="0" role="button"`;
      } else if (clickableConsult) {
        onAction = `onclick="planningOnConsultDayClick('${dateStr}', ${isPast})" tabindex="0" role="button"`;
      }

      html += `<div class="${classes.join(' ')}" ${onAction}><span class="bm-day-num">${day}</span>${avHtml}</div>`;
    }
    html += `</div></div>`;
  }

  grid.innerHTML = html;
  onPlanningDatesChanged();
  renderExperiencePanels();
}

function planningOnConsultDayClick(dateStr, isPast) {
  const res = resources.find((r) => r.id === selectedResource);
  if (isPast) {
    if (currentUser) {
      const booking = bookings[dateStr];
      if (booking && booking.userId === currentUser.id) {
        if (res && res.type === 'house') {
          showStaySheet(booking.reservationGroupId || booking.id, booking);
        } else {
          const date = new Date(dateStr + 'T00:00:00');
          const prettyDate = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
          showTripReport(booking, prettyDate);
        }
      }
    }
    return;
  }
  if (!currentUser) {
    showWelcomeScreen();
    return;
  }

  const booking = bookings[dateStr];
  if (booking && booking.returnedAt && currentUser && booking.userId === currentUser.id) {
    if (res && res.type === 'house') {
      showStaySheet(booking.reservationGroupId || booking.id, booking);
    } else {
      const date = new Date(dateStr + 'T00:00:00');
      const prettyDate = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      showTripReport(booking, prettyDate);
    }
    return;
  }

  if (booking) {
    if (res && res.type === 'house') {
      showOccupiedDaySheetH4(dateStr, booking);
    } else {
      showOccupiedDaySheetH4(dateStr, booking);
    }
    return;
  }

  if (window._planningBookingMode) {
    window._planningBookingMode = false;
    enterPlanningReserveFromPrompt(dateStr);
    return;
  }
  showPlanningMicroPrompt(dateStr);
}

function planningOnReserveDayClick(dateStr) {
  if (typeof bmApplyDaySelection === 'function') bmApplyDaySelection(dateStr);
  renderCalendar();
}

function showOccupiedDaySheetH4(dateStr, booking) {
  const res = resources.find((r) => r.id === selectedResource);
  const isHouse = res?.type === 'house';
  const startDate = booking.startDate || booking.date || dateStr;
  const endDate = booking.endDate || startDate;
  const isMine = currentUser && booking.userId === currentUser.id;
  const dTap = new Date(dateStr + 'T00:00:00');
  const title = dTap.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const nights = Math.max(1, countStayNights(startDate, endDate));
  const sFmt = new Date(startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const eFmt = new Date(endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const sub = isHouse
    ? `Séjour du ${sFmt} → ${eFmt} · ${nights} nuit${nights > 1 ? 's' : ''}`
    : `${sFmt} → ${eFmt} · ${nights} jour${nights > 1 ? 's' : ''}`;

  const companions = booking.companions != null ? Number(booking.companions) : Number(booking.guestCount) || 0;
  const occLine =
    companions > 0
      ? `<div style="font-size:13px;color:#7c7269;margin-top:4px">+ ${companions} accompagnant${companions > 1 ? 's' : ''}</div>`
      : '';

  const avatarPhoto = booking._currentPhoto || booking.photo || null;
  const av = avatarPhoto
    ? `<div class="h4-avatar h4-avatar--img"><img src="${String(avatarPhoto).replace(/"/g, '&quot;')}" alt=""></div>`
    : `<div class="h4-avatar h4-avatar--txt">${getInitials(booking.userName || '?')}</div>`;
  const mineStyle = isMine ? 'h4-avatar-wrap--me' : '';

  const cap = res?.capacity != null ? Number(res.capacity) : null;
  const total = getBookingOccupancy(booking);
  let capBlock = '';
  if (Number.isFinite(cap) && cap > 0) {
    const rest = cap - total;
    const restLabel = rest <= 0 ? 'Complet' : `${rest} places restantes sur ${cap}`;
    const restColor = rest <= 0 ? '#c0392b' : '#2d6a4f';
    capBlock = `<div class="h4-cap-bar"><span class="h4-cap-ico" aria-hidden="true">👥</span><div>${total} personnes · <span style="color:${restColor};font-weight:600">${restLabel}</span></div></div>`;
  } else {
    capBlock = `<div class="h4-cap-bar"><span class="h4-cap-ico" aria-hidden="true">👥</span><div>${total} personne${total > 1 ? 's' : ''}</div></div>`;
  }

  let actions = `<button type="button" class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="closeSheet()">Fermer</button>`;
  if (isMine) {
    actions = `
      <button type="button" class="btn btn-primary" style="width:100%;background:#2d6a4f;margin-top:12px" onclick="showEditStayFromSheet('${booking.reservationGroupId || ''}','${booking.id}')">Modifier la réservation</button>
      <button type="button" style="width:100%;margin-top:12px;background:none;border:none;color:#c0392b;font-size:14px;cursor:pointer" onclick="showCancelStayConfirmSheet('${booking.reservationGroupId || ''}','${booking.id}','${startDate}','${endDate}',${isHouse})">Annuler la réservation</button>
      <button type="button" class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="closeSheet()">Fermer</button>`;
  }

  const html = `
    <div class="login-sheet h4-sheet">
      <div class="sheet-handle-bar"></div>
      <h2 style="font-size:22px;font-weight:500;margin:0 0 8px;text-transform:capitalize">${title}</h2>
      <p style="font-size:14px;color:#7c7269;margin:0 0 16px">${sub}</p>
      <div class="h4-card-user">
        <div class="h4-avatar-wrap ${mineStyle}">${av}</div>
        <div>
          <div style="font-size:15px;font-weight:600;color:#2d2a24">${booking.userName || '—'}</div>
          ${occLine}
        </div>
      </div>
      ${capBlock}
      ${actions}
    </div>`;

  document.getElementById('sheet-content').innerHTML = html;
  document.getElementById('overlay').classList.add('open');
}

function showCancelStayConfirmSheet(groupId, bookingId, startDate, endDate, isHouse) {
  const sFmt = new Date(startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const eFmt = new Date(endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const html = `
    <div class="login-sheet">
      <h2>Annuler cette réservation ?</h2>
      <p style="color:#7c7269;font-size:14px">Séjour du ${sFmt} → ${eFmt}. Cette action est définitive.</p>
      <button type="button" class="btn" style="width:100%;background:#c0392b;color:#fff;margin-top:12px" onclick="confirmCancelStayFromSheet('${groupId}','${bookingId}',${isHouse})">Oui, annuler</button>
      <button type="button" class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="closeSheet()">Non, garder</button>
    </div>`;
  document.getElementById('sheet-content').innerHTML = html;
}

function confirmCancelStayFromSheet(groupId, bookingId, isHouse) {
  if (isHouse && groupId && typeof cancelStay === 'function') {
    cancelStay(groupId);
  } else if (!isHouse && bookingId && typeof cancelBooking === 'function') {
    cancelBooking(bookingId);
  }
}

function showEditStayFromSheet(groupId, bookingId) {
  closeSheet();
  if (typeof openEditBookingModal === 'function') openEditBookingModal(bookingId);
}

function goToToday() {
  switchTab('calendar');
  const scrollBody = document.getElementById('cal-scroll-body');
  if (scrollBody) scrollBody.scrollTop = 0;
  showToast("Retour à aujourd'hui");
}

function isPlanningBookingActive() {
  return _planningPhase === 'reserve' || _planningPhase === 'wizard';
}

window.exitPlanningUnifiedMode = exitPlanningUnifiedMode;
window.getPlanningPhase = getPlanningPhase;
window.syncPlanningShellChrome = syncPlanningShellChrome;
window.finishPlanningAfterCelebrate = finishPlanningAfterCelebrate;
window.afterBookingSuccess = afterBookingSuccess;
window.enterPlanningEditMode = enterPlanningEditMode;
