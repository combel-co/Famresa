// ==========================================
// BOOKING MODAL (Airbnb style) — UI only
// ==========================================
// Business logic delegated to reservationService
// (src/modules/reservation/reservation.service.js)

var bm = {
  startDate: null,
  endDate: null,
  startHour: '09:00',
  endHour: '20:00',
  destinations: [],
  step: 'start',
  booker: null,
  bookerTab: 'member',
  personTotal: 1
};
var bmCurrentStep = 'destination';
var bmIsAdmin = false;
var bmMembers = [];
var bmIsEditing = false;
var bmCalendarSignature = '';

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
  if (isEditing) return isHouse ? ['personnes', 'destination'] : ['destination'];
  if (isHouse) return isAdmin ? ['booker', 'destination'] : ['personnes', 'destination'];
  return isAdmin ? ['hours', 'booker', 'destination'] : ['hours', 'destination'];
}

function bmCanProceedFromStep(step) {
  if (step === 'hours') return !!bm.startHour && !!bm.endHour;
  if (step === 'personnes') {
    const cap = bmGetHouseCapacity();
    const t = bm.personTotal || 1;
    if (cap != null && t > cap) return false;
    return t >= 1;
  }
  if (step === 'booker') {
    if (bm.bookerTab === 'external') return !!(bm.booker && bm.booker.type === 'external' && bm.booker.name);
    return true;
  }
  return true;
}

function bmBuildCelebrationRecap(resource, iconFallback) {
  const { isHouse, isAdmin } = bmGetContext();
  const startDate = bm.startDate ? new Date(bm.startDate + 'T00:00:00') : null;
  const endDate = (bm.endDate || bm.startDate) ? new Date((bm.endDate || bm.startDate) + 'T00:00:00') : null;
  const endStr = bm.endDate || bm.startDate;
  const nights =
    bm.startDate && endStr && typeof countStayNights === 'function'
      ? Math.max(1, countStayNights(bm.startDate, endStr))
      : startDate && endDate
        ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))
        : 1;

  let participants = '—';
  if (isHouse) {
    if (isAdmin && bm.bookerTab === 'member') {
      const n = Math.max(1, bmComputeStayTotal());
      const host = _resolveHouseStayBooker();
      participants = n <= 1 ? bmFirstName(host.name || currentUser?.name) : `${n} personnes`;
    } else if (isAdmin && bm.bookerTab === 'external') {
      participants = bm.booker?.name || bmFirstName(currentUser?.name);
    } else {
      const n = Math.max(1, Number(bm.personTotal) || 1);
      participants = n <= 1 ? bmFirstName(currentUser?.name) : `${n} personnes`;
    }
  } else {
    const b = _resolveBooker();
    participants = bmFirstName(b.name || currentUser?.name);
  }

  const isHouseRes = resource?.type === 'house';
  const sub = isHouseRes
    ? (resource?.familyName || 'Réservation famille')
    : 'Réservation véhicule';

  return {
    icon: resource?.emoji || iconFallback || (isHouseRes ? '🏠' : '🚗'),
    name: resource?.name || 'Ressource',
    sub,
    arrivee: startDate ? startDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) : '—',
    depart: endDate ? endDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) : '—',
    duree: `${nights} ${nights > 1 ? 'nuits' : 'nuit'}`,
    participants
  };
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

  ['hours', 'personnes', 'booker', 'destination'].forEach((step) => {
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

  const ptVal = document.getElementById('bm-person-total-val');
  if (ptVal) ptVal.textContent = String(Math.max(1, Number(bm.personTotal) || 1));
  const plab = document.getElementById('bm-personnes-label');
  if (plab) {
    const n = Math.max(1, Number(bm.personTotal) || 1);
    plab.textContent = n <= 1 ? 'personne' : 'personnes';
  }
  bmSyncPersonnesCapacityHint();

  const bookerVal = document.getElementById('bm-mini-booker-val');
  if (bookerVal) {
    if (isHouse && bm.bookerTab === 'member') {
      const tot = bmComputeStayTotal();
      const prim = bmMembers.find((x) => x.id === (bm.primaryProfileId || currentUser.id));
      const pn = bmFirstName(prim?.name || currentUser?.name);
      bookerVal.textContent = `${tot} pers. · ${pn}`;
    } else {
      bookerVal.textContent = bm.booker ? bm.booker.name : bmFirstName(currentUser?.name);
    }
  }

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

  const personnesCard = document.getElementById('planning-mini-personnes-card');
  const personnesWizardVal = document.getElementById('bm-mini-wizard-personnes-val');
  if (personnesCard && personnesWizardVal) {
    const bookerIdx = steps.indexOf('booker');
    const showPersonnesSummary = bookerIdx !== -1 && currentIndex > bookerIdx;
    if (showPersonnesSummary) {
      let n = 1;
      if (isHouse && bm.bookerTab === 'member') {
        n = Math.max(1, bmComputeStayTotal());
      }
      personnesWizardVal.textContent = n <= 1 ? '1 personne' : `${n} personnes`;
      personnesCard.style.display = '';
      personnesCard.removeAttribute('hidden');
      personnesCard.setAttribute(
        'aria-label',
        `Composition : ${personnesWizardVal.textContent}. Modifier`
      );
    } else {
      personnesCard.style.display = 'none';
      personnesCard.setAttribute('hidden', '');
      personnesCard.removeAttribute('aria-label');
    }
  }

  const destInner = document.getElementById('bm-step1-full');
  if (destInner) {
    destInner.classList.toggle('bm-wizard-card', !isHouse);
    destInner.classList.toggle('bm-destination-house-inner', isHouse);
  }

  const hoursVal = document.getElementById('bm-mini-hours-val');
  if (hoursVal) hoursVal.textContent = `${bm.startHour} → ${bm.endHour}`;

  const destTitle = document.querySelector('#bm-step-destination .bm-section-title');
  if (destTitle) destTitle.textContent = isHouse ? 'Un mot sur ton séjour (optionnel)' : 'Où vas-tu ?';

  const inWizard = typeof getPlanningPhase === 'function' && getPlanningPhase() === 'wizard';
  const rightBtn = document.getElementById('planning-action-right');
  const leftBtn = document.getElementById('planning-action-left');
  if (rightBtn && inWizard) {
    const isLast = currentIndex === steps.length - 1;
    rightBtn.textContent = isLast ? (isEditing ? 'Enregistrer' : 'Réserver') : 'Suivant →';
    rightBtn.disabled = !bmCanProceedFromStep(bmCurrentStep);
    rightBtn.classList.toggle('is-disabled', rightBtn.disabled);
  }
  if (leftBtn && inWizard) leftBtn.textContent = 'Retour';

  const destSection = document.getElementById('bm-dest-section');
  const motifSection = document.getElementById('bm-motif-section');
  if (destSection) destSection.style.display = isHouse ? 'none' : '';
  if (motifSection) motifSection.style.display = isHouse ? '' : 'none';
}

function bmNextStep() {
  const steps = bmBuildStepConfig();
  const currentIndex = Math.max(0, steps.indexOf(bmCurrentStep));
  if (!bmCanProceedFromStep(bmCurrentStep)) {
    showToast('Complète cette étape pour continuer.');
    return;
  }
  if (currentIndex >= steps.length - 1) {
    confirmRangeBooking();
    return;
  }
  const nextStep = steps[currentIndex + 1];
  if (
    bmCurrentStep === 'booker' &&
    bmGetContext().isHouse &&
    bmIsAdmin &&
    (nextStep === 'personnes' || nextStep === 'destination')
  ) {
    bm.personTotal = Math.max(1, bmComputeStayTotal());
  }
  bmCurrentStep = nextStep;
  renderBmSteps();
  bmScrollToStep(bmCurrentStep);
}

function goToStep(step) {
  const steps = bmBuildStepConfig();
  if (!steps.includes(step)) return;
  bmCurrentStep = step;
  if (step === 'dates' && typeof planningExpandDatesFromWizard === 'function') planningExpandDatesFromWizard();
  renderBmSteps();
  bmScrollToStep(step);
}

/** @deprecated Legacy name — planning unifié uses switchToBookingMode + calendrier. */
function openBookingModal() {
  if (typeof switchToBookingMode === 'function') switchToBookingMode();
}

function closeBookingModal() {
  _editingBookingId = null;
  bmIsEditing = false;
  if (typeof exitPlanningUnifiedMode === 'function') exitPlanningUnifiedMode();
}

function renderBmCalendar() {
  if (typeof renderCalendar === 'function') renderCalendar();
}

function onBmDayClick(ds) {
  bmApplyDaySelection(ds);
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
  resetBookingWizardState();
  if (typeof exitPlanningUnifiedMode === 'function') exitPlanningUnifiedMode();
}

function resetBookingWizardState() {
  _editingBookingId = null;
  bmIsEditing = false;
  bm.startDate = null;
  bm.endDate = null;
  bm.destinations = [];
  bm.step = 'start';
  bm.booker = null;
  bm.bookerTab = 'member';
  bm.personTotal = 1;
  bm.participatesByMemberId = {};
  bm.guestsByMemberId = {};
  bm.primaryProfileId = null;
  bmCurrentStep = 'hours';
  const di = document.getElementById('bm-dest-input');
  if (di) di.value = '';
  const mi = document.getElementById('bm-motif-input');
  if (mi) mi.value = '';
  const ni = document.getElementById('bm-external-name');
  if (ni) ni.value = '';
  const kmEl = document.getElementById('bm-dest-km');
  if (kmEl) kmEl.textContent = '';
  const _resReset = resources.find((r) => r.id === selectedResource);
  if (_resReset?.type === 'house') bmInitHouseParticipation();
  if (_resReset?.type === 'house' || bmIsAdmin) renderBookerMemberList();
  renderDestSuggestions('');
  const steps = bmBuildStepConfig();
  bmCurrentStep = steps[0] || 'destination';
  renderBmSteps();
}

// ==========================================
// BOOKER — "Pour qui ?" (maison : composition + capacité)
// ==========================================

function bmFirstName(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return '—';
  return s.split(/\s+/)[0];
}

function bmGetHouseCapacity() {
  const res = resources.find((r) => r.id === selectedResource);
  const c = res?.capacity != null ? Number(res.capacity) : NaN;
  return Number.isFinite(c) && c > 0 ? c : null;
}

function bmComputeStayTotal() {
  let t = 0;
  for (const m of bmMembers) {
    if (bm.participatesByMemberId[m.id] !== true) continue;
    t += 1 + Math.max(0, Number(bm.guestsByMemberId[m.id] || 0));
  }
  return t;
}

function bmMaxGuestsForMember(memberId) {
  const cap = bmGetHouseCapacity();
  if (cap == null) return 999;
  const selfContrib =
    bm.participatesByMemberId[memberId] === true
      ? 1 + Math.max(0, Number(bm.guestsByMemberId[memberId] || 0))
      : 0;
  const others = bmComputeStayTotal() - selfContrib;
  return Math.max(0, cap - others - 1);
}

/** Nouvelle résa : seul le profil actif participe par défaut (les autres décochés). */
function bmInitHouseParticipation() {
  bm.participatesByMemberId = {};
  bm.guestsByMemberId = {};
  const primaryId = currentUser?.id || bmMembers[0]?.id || null;
  for (const m of bmMembers) {
    bm.participatesByMemberId[m.id] = primaryId != null && m.id === primaryId;
    bm.guestsByMemberId[m.id] = 0;
  }
  bm.primaryProfileId = primaryId;
  bmEnsurePrimaryParticipant();
}

/** Édition / compat : tout le monde coché (ex. chargement résa existante). */
function bmInitHouseParticipationAllParticipating() {
  bm.participatesByMemberId = {};
  bm.guestsByMemberId = {};
  for (const m of bmMembers) {
    bm.participatesByMemberId[m.id] = true;
    bm.guestsByMemberId[m.id] = 0;
  }
  bm.primaryProfileId = currentUser?.id || bmMembers[0]?.id || null;
  bmEnsurePrimaryParticipant();
}

function bmSortMembersPrimaryFirst() {
  const uid = currentUser?.id;
  if (!uid || !bmMembers.length) return;
  bmMembers.sort((a, b) => {
    if (a.id === uid) return -1;
    if (b.id === uid) return 1;
    return String(a.name || '').localeCompare(String(b.name || ''), 'fr');
  });
}

/**
 * Après chargement async des membres : ne pas écraser l’état si l’utilisateur a déjà modifié la composition.
 * (Sinon fin de requête tardive → tout le monde recoché = bug « Suivant ».)
 */
function bmAfterHouseMembersLoaded() {
  if (!bmMembers.length) {
    renderBookerMemberList();
    renderBmSteps();
    return;
  }
  bmSortMembersPrimaryFirst();
  const memberIds = new Set(bmMembers.map((m) => m.id));
  const hadState = Object.keys(bm.participatesByMemberId).length > 0;
  if (hadState) {
    for (const id of Object.keys(bm.participatesByMemberId)) {
      if (!memberIds.has(id)) {
        delete bm.participatesByMemberId[id];
        delete bm.guestsByMemberId[id];
      }
    }
    for (const m of bmMembers) {
      if (bm.participatesByMemberId[m.id] === undefined) {
        bm.participatesByMemberId[m.id] = false;
        bm.guestsByMemberId[m.id] = 0;
      }
    }
    bmEnsurePrimaryParticipant();
  } else {
    if (bmIsEditing) {
      bmInitHouseParticipationAllParticipating();
    } else {
      bmInitHouseParticipation();
    }
  }
  renderBookerMemberList();
  renderBmSteps();
}

function bmEnsurePrimaryParticipant() {
  const part = bmMembers.filter((m) => bm.participatesByMemberId[m.id] === true);
  if (!part.length) return;
  if (!part.some((m) => m.id === bm.primaryProfileId)) {
    bm.primaryProfileId = part[0].id;
  }
}

function bmToggleParticipate(memberId, checked) {
  if (!checked) {
    const otherActive = bmMembers.some(
      (m) => m.id !== memberId && bm.participatesByMemberId[m.id] === true
    );
    if (!otherActive) {
      if (typeof showToast === 'function') showToast('Garde au moins un participant.');
      return;
    }
  }
  bm.participatesByMemberId[memberId] = !!checked;
  if (!checked) bm.guestsByMemberId[memberId] = 0;
  bmEnsurePrimaryParticipant();
  renderBookerMemberList();
  renderBmSteps();
}

function bmSetPrimaryProfile(profileId) {
  try {
    bm.primaryProfileId = decodeURIComponent(String(profileId || ''));
  } catch (_) {
    bm.primaryProfileId = String(profileId || '');
  }
  bmEnsurePrimaryParticipant();
  renderBookerMemberList();
  renderBmSteps();
}

function bmGuestDelta(memberId, delta) {
  if (bm.participatesByMemberId[memberId] !== true) return;
  const cur = Math.max(0, Number(bm.guestsByMemberId[memberId] || 0));
  const next = cur + delta;
  if (next < 0) return;
  const maxG = bmMaxGuestsForMember(memberId);
  if (next > maxG) {
    const cap = bmGetHouseCapacity();
    if (cap != null && typeof showToast === 'function') showToast(`Capacité max. : ${cap} personne${cap > 1 ? 's' : ''}`);
    return;
  }
  bm.guestsByMemberId[memberId] = next;
  renderBookerMemberList();
  renderBmSteps();
}

function bmSyncPersonnesCapacityHint() {
  const hint = document.getElementById('bm-personnes-capacity-hint');
  if (!hint) return;
  const res = resources.find((r) => r.id === selectedResource);
  const cap = res?.capacity != null ? Number(res.capacity) : null;
  if (!Number.isFinite(cap) || cap <= 0) {
    hint.style.display = 'none';
    return;
  }
  const counter = Math.max(1, Number(bm.personTotal) || 1);
  const remaining = Math.max(0, cap - counter);
  hint.textContent = `${cap} places au total · ${remaining} disponibles`;
  hint.style.display = '';
}

function bmPersonTotalDelta(delta) {
  const cap = bmGetHouseCapacity();
  let next = Math.max(1, (Number(bm.personTotal) || 1) + delta);
  if (cap != null && next > cap) {
    if (typeof showToast === 'function') showToast(`Capacité max. : ${cap} personne${cap > 1 ? 's' : ''}`);
    return;
  }
  bm.personTotal = next;
  renderBmSteps();
}

function bmGetSelection() {
  return { startDate: bm.startDate, endDate: bm.endDate };
}

/**
 * Date selection while in planning reserve mode (replaces modal onBmDayClick).
 */
function bmApplyDaySelection(ds) {
  const booking = bookings[ds];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cellDate = new Date(ds + 'T00:00:00');
  if (cellDate < today) return;
  if (booking) {
    if (typeof showToast === 'function') showToast('Ce jour est déjà réservé');
    return;
  }

  if (!bm.startDate || bm.endDate) {
    bm.startDate = ds;
    bm.endDate = null;
    bm.step = 'end';
  } else {
    if (ds < bm.startDate) {
      bm.endDate = bm.startDate;
      bm.startDate = ds;
    } else {
      bm.endDate = ds;
    }
    bm.step = 'start';
  }
  if (typeof onPlanningDatesChanged === 'function') onPlanningDatesChanged();
}

async function loadBookerMembers() {
  const res = resources.find((r) => r.id === selectedResource);
  if (!res) return;
  try {
    if (res.type === 'house') {
      bmMembers = await reservationService.getBookersForResource(selectedResource, currentUser?.familyId);
      if (currentUser?.id && !bmMembers.some((m) => m.id === currentUser.id)) {
        try {
          const prof = await userRepository.getProfileById(currentUser.id);
          if (prof) {
            const name = prof.nom || prof.name || currentUser.name || 'Moi';
            const initials =
              String(name)
                .trim()
                .split(/\s+/)
                .map((p) => p[0] || '')
                .join('')
                .toUpperCase()
                .slice(0, 2) || '?';
            bmMembers.push({ id: currentUser.id, name, photo: prof.photo || currentUser.photo || null, initials });
          }
        } catch (_) {}
      }
      bmAfterHouseMembersLoaded();
    } else {
      if (!currentUser?.familyId) return;
      bmMembers = await reservationService.getEligibleBookers(currentUser.familyId);
    }
  } catch (_) {
    bmMembers = [];
  }
  if (res.type === 'house') {
    if (!bmMembers.length) {
      renderBookerMemberList();
      renderBmSteps();
    }
  } else {
    renderBookerMemberList();
  }
}

function renderBookerMemberList() {
  const container = document.getElementById('bm-booker-member-list');
  if (!container) return;
  const { isHouse } = bmGetContext();

  if (isHouse) {
    if (!bmMembers.length) {
      container.innerHTML =
        '<div class="bm-booker-empty" style="padding:14px;font-size: calc(13px * var(--ui-text-scale));color:var(--text-light)">Aucun membre avec accès à cette ressource.</div>';
      return;
    }
    const cap = bmGetHouseCapacity();
    const total = bmComputeStayTotal();
    const capHint = cap != null ? ` / ${cap}` : '';
    let html = '';
    for (const m of bmMembers) {
      const part = bm.participatesByMemberId[m.id] !== false;
      const g = Math.max(0, Number(bm.guestsByMemberId[m.id] || 0));
      const displayName = m.id === currentUser.id ? bmFirstName(currentUser.name || m.name) : bmFirstName(m.name);
      const avatar = m.photo ? '<img src="' + m.photo + '" alt="">' : (m.initials || getInitials(m.name || '?'));
      const maxG = bmMaxGuestsForMember(m.id);
      const plusDis = !part || g >= maxG;
      const minusDis = !part || g <= 0;
      const idEsc = String(m.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      html += `<div class="bm-member-row${part ? '' : ' bm-member-row--off'}">
        <label class="bm-member-participate"><input type="checkbox" ${part ? 'checked' : ''} onchange="bmToggleParticipate('${idEsc}', this.checked)" aria-label="Participe : ${displayName.replace(/"/g, '&quot;')}"></label>
        <div class="bm-member-avatar">${avatar}</div>
        <div class="bm-member-name">${displayName}</div>
        <div class="bm-guest-stepper">
          <button type="button" class="bm-guest-btn" ${minusDis ? 'disabled' : ''} onclick="bmGuestDelta('${idEsc}',-1)" aria-label="Retirer un invité">−</button>
          <span class="bm-guest-val" aria-live="polite">${g}</span>
          <button type="button" class="bm-guest-btn" ${plusDis ? 'disabled' : ''} onclick="bmGuestDelta('${idEsc}',1)" aria-label="Ajouter un invité">+</button>
        </div>
      </div>`;
    }
    const partOptions = bmMembers.filter((m) => bm.participatesByMemberId[m.id] === true);
    let selOpts = partOptions
      .map((m) => {
        const label = m.id === currentUser.id ? bmFirstName(currentUser.name || m.name) : bmFirstName(m.name);
        const sel = (bm.primaryProfileId || currentUser.id) === m.id ? ' selected' : '';
        const valueEnc = encodeURIComponent(String(m.id));
        return `<option value="${valueEnc}"${sel}>${label.replace(/</g, '&lt;')}</option>`;
      })
      .join('');
    html += `<div class="bm-primary-field">
      <label for="bm-primary-select">Séjour au nom de</label>
      <select id="bm-primary-select" class="bm-primary-select" onchange="bmSetPrimaryProfile(this.value)">${selOpts}</select>
    </div>
    <div class="bm-booker-total-line" aria-live="polite">Total : <strong>${total}</strong> personne${total > 1 ? 's' : ''}${cap != null ? ` (capacité ${cap})` : ''}${cap != null && total > cap ? ' <span class="bm-booker-cap-warn">— dépasse la capacité</span>' : ''}</div>`;
    container.innerHTML = html;
    const sel = document.getElementById('bm-primary-select');
    if (sel && bm.primaryProfileId) sel.value = encodeURIComponent(String(bm.primaryProfileId));
    return;
  }

  let html = `<div class="bm-member-item${!bm.booker ? ' selected' : ''}" onclick="selectBooker(null)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectBooker(null)}" tabindex="0" role="button" aria-pressed="${!bm.booker ? 'true' : 'false'}">
    <div class="bm-member-avatar">${currentUser.photo ? '<img src="' + currentUser.photo + '" alt="">' : getInitials(currentUser.name || '?')}</div>
    <div class="bm-member-name">${bmFirstName(currentUser.name)}</div>
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
    const m = bmMembers.find((x) => x.id === memberId);
    if (m) bm.booker = { id: m.id, name: m.name, photo: m.photo, type: 'member' };
  }
  renderBookerMemberList();
  renderBmSteps();
}

function switchBookerTab(tab) {
  bm.bookerTab = tab;
  bm.booker = null;
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
  if (name) {
    bm.booker = { id: 'external', name, photo: null, type: 'external' };
  } else {
    bm.booker = null;
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

/** Séjour maison : hôte principal (profil sur les documents) + créé par si besoin. */
function _resolveHouseStayBooker() {
  const primaryId = bm.primaryProfileId || currentUser.id;
  const m = bmMembers.find((x) => x.id === primaryId);
  const name = m?.name || currentUser.name;
  const photo = m?.photo ?? currentUser.photo;
  const createdBy = primaryId !== currentUser.id ? { id: currentUser.id, name: currentUser.name } : null;
  return { id: primaryId, name, photo, createdBy };
}

// ==========================================
// BOOKING ACTIONS — UI → Service → UI feedback
// ==========================================

async function confirmRangeBooking() {
  if (!currentUser || !bm.startDate) return;

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
      showToast('Ce jour est déjà réservé');
      return;
    }

    window.__lastCelebrationRecap = bmBuildCelebrationRecap(res, res?.emoji || '🚗');
    const sub = `${formatBmSubtitleRange(bm.startDate, bm.endDate || bm.startDate)}`;
    if (typeof afterBookingSuccess === 'function') afterBookingSuccess(bm.startDate);
    celebrate(
      res?.emoji || '🚗',
      'Réservation confirmée !',
      '+20 XP',
      sub,
      () => {
        if (typeof finishPlanningAfterCelebrate === 'function') finishPlanningAfterCelebrate(bm.startDate);
      },
      { closeDelayMs: 3200 }
    );
    setTimeout(() => { const nb = checkNewBadges(); nb.forEach(b => showToast(`Badge débloqué : ${b.label}`)); }, 2800);
  } catch(e) { showToast('Erreur — réessayez'); }
}

async function createStay() {
  if (!currentUser || !bm.startDate) return;
  const startDate = bm.startDate;
  const endDate = bm.endDate || bm.startDate;
  const motif = document.getElementById('bm-motif-input')?.value.trim() || '';

  try {
    const external = bm.bookerTab === 'external';
    const booker = external ? _resolveBooker() : _resolveHouseStayBooker();
    const peopleCount = Math.max(1, Number(bm.personTotal) || 1);
    const result = await reservationService.createStayReservation({
      resourceId: selectedResource,
      userId: booker.id,
      userName: booker.name,
      photo: booker.photo,
      startDate,
      endDate,
      motif,
      bookings,
      createdBy: booker.createdBy,
      peopleCount
    });

    if (result.error === 'conflict') {
      showToast('Ce jour est déjà réservé');
      return;
    }

    window.__lastCelebrationRecap = bmBuildCelebrationRecap(resources.find(r => r.id === selectedResource), '🏠');
    const sub = `${formatBmSubtitleRange(startDate, endDate)}`;
    if (typeof afterBookingSuccess === 'function') afterBookingSuccess(startDate);
    celebrate(
      '🏠',
      'Séjour confirmé !',
      '+20 XP',
      sub,
      () => {
        if (typeof finishPlanningAfterCelebrate === 'function') finishPlanningAfterCelebrate(startDate);
      },
      { closeDelayMs: 3200 }
    );
    setTimeout(() => { const nb = checkNewBadges(); nb.forEach(b => showToast(`Badge débloqué : ${b.label}`)); }, 2800);
  } catch(e) { showToast('Erreur — réessayez'); }
}

function bmEnsureDefaultEndForNext() {
  if (!bm.startDate) return;
  if (bm.endDate) return;
  const s = new Date(bm.startDate + 'T00:00:00');
  s.setDate(s.getDate() + 1);
  bm.endDate = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
}

function initWizardAfterDates() {
  bmIsAdmin = window._myResourceRoles && window._myResourceRoles[selectedResource] === 'admin';
  const res = resources.find((r) => r.id === selectedResource);
  if (res?.type === 'house' || bmIsAdmin) void loadBookerMembers();
  const steps = bmBuildStepConfig();
  bmCurrentStep = steps[0] || 'destination';
  if (!bmIsEditing) {
    const pc = Number(
      bm.personTotal || (res?.type === 'house' && bmIsAdmin ? Math.max(1, bmComputeStayTotal()) : 1)
    );
    bm.personTotal = Number.isFinite(pc) && pc > 0 ? pc : 1;
  }
  renderBmSteps();
}

function formatBmSubtitleRange(startDate, endDate) {
  const nights = countStayNights(startDate, endDate);
  const n = Math.max(1, nights);
  const sd = new Date(startDate + 'T00:00:00');
  const ed = new Date(endDate + 'T00:00:00');
  const a = sd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const b = ed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return `${a} → ${b} · ${n} ${n > 1 ? 'nuits' : 'nuit'}`;
}

async function cancelStay(groupId) {
  try {
    await reservationService.cancelStay(groupId);
    closeSheet();
    showToast('Réservation annulée');
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
        <div style="font-size: calc(13px * var(--ui-text-scale));color:var(--text-light);margin-bottom:10px">La voiture est rendue le ${prettyNewEnd}. Les jours suivants sont libérés.</div>
        <button class="btn btn-primary" onclick="truncateCarBooking('${booking.id}','${newEndStr}')">Rendre la voiture le ${prettyNewEnd}</button>
      </div>`;
  }

  const html = `
    <div class="login-sheet">
      <h2>Gérer la réservation</h2>
      <div style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));margin-bottom:16px">${prettyDate}</div>
      ${truncateSection}
      <div style="margin:0 0 12px;padding:14px;background:#fff0f0;border-radius:12px;border:1px solid #fecaca">
        <div style="font-weight:600;margin-bottom:4px">${isMultiDay ? 'Annuler toute la réservation' : 'Annuler la réservation'}</div>
        <div style="font-size: calc(13px * var(--ui-text-scale));color:var(--text-light);margin-bottom:10px">Cette action est irréversible.</div>
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
      <p style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));margin-bottom:16px">
        Indiquez l'heure de retour et l'état du véhicule
      </p>
      <div class="input-group" style="margin-bottom:14px">
        <label>Heure de retour</label>
        <input type="time" id="early-return-hour" value="${currentTime}">
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size: calc(13px * var(--ui-text-scale));font-weight:600;display:block;margin-bottom:8px">État du véhicule</label>
        <label style="display:flex;align-items:center;gap:8px;font-size: calc(14px * var(--ui-text-scale));margin-bottom:6px;cursor:pointer">
          <input type="checkbox" id="early-return-cleaning"> À nettoyer
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size: calc(14px * var(--ui-text-scale));margin-bottom:6px;cursor:pointer">
          <input type="checkbox" id="early-return-repair"> Réparation nécessaire
        </label>
      </div>
      <div class="input-group" style="margin-bottom:14px">
        <label>Notes (optionnel)</label>
        <input type="text" id="early-return-notes" placeholder="Ex: pneu avant droit à vérifier" autocomplete="off">
      </div>
      <div class="input-group" style="margin-bottom:14px">
        <label>Propreté au retour</label>
        <select id="early-return-cleanliness">
          <option value="clean">Propre</option>
          <option value="sparkling">Étincelant</option>
          <option value="dirty">Sale</option>
        </select>
      </div>
      <div style="margin-bottom:14px;padding-top:14px;border-top:1px solid var(--border)">
        <label style="font-size: calc(13px * var(--ui-text-scale));font-weight:600;display:block;margin-bottom:10px">Niveau d'essence rendu</label>
        <div class="fuel-selector">${renderFuelButtons()}</div>
      </div>
      <div class="lock-error" id="early-return-error"></div>
      <button class="btn btn-primary" style="width:100%" onclick="confirmEarlyReturn('${booking.id}','${resourceId}')">Confirmer le retour</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px;width:100%" onclick="closeSheet()">Annuler</button>
    </div>`;

  document.getElementById('sheet-content').innerHTML = html;
  const resEarly = resources.find((r) => r.id === resourceId);
  const rawClean = resEarly?.carCleanliness || '';
  const cleanSel =
    rawClean === 'sparkling' ? 'sparkling' : rawClean === 'dirty' ? 'dirty' : 'clean';
  const cleanEl = document.getElementById('early-return-cleanliness');
  if (cleanEl) cleanEl.value = cleanSel;
  document.getElementById('overlay').classList.add('open');
}

async function confirmEarlyReturn(bookingId, resourceId) {
  const returnHour = document.getElementById('early-return-hour')?.value;
  const needsCleaning = document.getElementById('early-return-cleaning')?.checked || false;
  const needsRepair = document.getElementById('early-return-repair')?.checked || false;
  const notes = (document.getElementById('early-return-notes')?.value || '').trim();
  const cleanliness = document.getElementById('early-return-cleanliness')?.value || '';
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
      fuelLevel,
      cleanliness,
      reportedBy: currentUser?.name || null
    });
    selectedFuelLevel = null;

    // Update local resource fuel level so UI reflects it immediately
    if (fuelLevel !== null && fuelLevel !== undefined) {
      const res = resources.find(r => r.id === resourceId);
      if (res) res.fuelLevel = fuelLevel;
    }
    const res = resources.find(r => r.id === resourceId);
    if (res) {
      if (cleanliness) res.carCleanliness = cleanliness;
      if (notes) res.carReturnNote = notes;
      res.reportedBy = currentUser?.name || null;
      res.reportedAt = new Date().toISOString();
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
var _editingBookingId = null;

function openEditBookingModal(bookingId) {
  const booking = Object.values(bookings).find((b) => b && b.id === bookingId);
  if (!booking) {
    showToast('Réservation introuvable');
    return;
  }

  closeSheet();
  _editingBookingId = bookingId;
  bmIsEditing = true;

  if (booking.destinations && booking.destinations.length > 0) {
    const dest = booking.destinations[0];
    bm.destinations = [{ name: dest.name, km: dest.kmFromParis || dest.km || 0 }];
  } else {
    bm.destinations = [];
  }

  bm.startDate = booking.startDate || null;
  bm.endDate = booking.endDate || null;
  bm.startHour = booking.startHour || '09:00';
  bm.endHour = booking.endHour || '20:00';
  const sh = document.getElementById('bm-start-hour');
  if (sh) sh.value = bm.startHour;
  const eh = document.getElementById('bm-end-hour');
  if (eh) eh.value = bm.endHour;

  const pc = booking.peopleCount || 1 + (Number(booking.guestCount) || Number(booking.companions) || 0);
  bm.personTotal = Math.max(1, Number(pc) || 1);
  const mi = document.getElementById('bm-motif-input');
  if (mi) mi.value = booking.motif || '';

  switchTab('planning');
  setTimeout(() => {
    if (typeof enterPlanningEditMode === 'function') enterPlanningEditMode();
  }, 0);
  renderDestSuggestions('');
}

async function saveEditedBooking() {
  if (!_editingBookingId) return;
  try {
    const booking = Object.values(bookings).find((b) => b && b.id === _editingBookingId);
    const res = resources.find((r) => r.id === selectedResource);
    const isHouse = res && res.type === 'house';

    if (isHouse && booking && booking.reservationGroupId) {
      const motif = document.getElementById('bm-motif-input')?.value.trim() || '';
      const peopleCount = Math.max(1, Number(bm.personTotal) || 1);
      const result = await reservationService.updateStayReservation({
        groupId: booking.reservationGroupId,
        resourceId: selectedResource,
        userId: booking.userId,
        userName: booking.userName,
        photo: booking.photo || null,
        startDate: bm.startDate,
        endDate: bm.endDate || bm.startDate,
        motif,
        bookings,
        createdBy: booking.createdBy || null,
        peopleCount,
        familyId: currentUser?.familyId
      });
      if (result.error === 'conflict') {
        showToast('Ce jour est déjà réservé');
        return;
      }
      _editingBookingId = null;
      bmIsEditing = false;
      if (typeof exitPlanningUnifiedMode === 'function') exitPlanningUnifiedMode();
      if (typeof renderCalendar === 'function') renderCalendar();
      showToast('Réservation modifiée');
      return;
    }

    const updates = {
      destinations: bm.destinations,
      startDate: bm.startDate,
      endDate: bm.endDate || bm.startDate,
      startHour: bm.startHour || '09:00',
      endHour: bm.endHour || '20:00'
    };
    const result = await reservationService.updateReservation(_editingBookingId, updates, bookings);
    if (result.error === 'conflict') {
      showToast('Ce jour est déjà réservé');
      return;
    }
    _editingBookingId = null;
    bmIsEditing = false;
    if (typeof exitPlanningUnifiedMode === 'function') exitPlanningUnifiedMode();
    if (typeof renderCalendar === 'function') renderCalendar();
    showToast('Réservation modifiée');
  } catch (e) {
    showToast('Erreur — réessayez');
  }
}
