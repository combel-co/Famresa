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

function getNextFreeDate() {
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!bookings[ds] || bookings[ds].returnedAt) return ds;
    d.setDate(d.getDate() + 1);
  }
  return null;
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
    const dateLabel = formatRelativeDate(b.startDate || b.date || '');
    const dest = getBookingDestinationLabel(b);
    return `<div class="ccv2-booking-row">
      <div class="${avClass}">${av}</div>
      <div class="ccv2-booking-info">
        <div class="ccv2-booking-name">${b.userName || 'Utilisateur'}</div>
        <div class="ccv2-booking-dest">${dest}</div>
      </div>
      <div class="ccv2-booking-date">${dateLabel}</div>
    </div>`;
  }).join('');
}

function renderExperiencePanels() {
  const monthEntries = getMonthBookingEntries();
  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  const todayBookingRaw = bookings[todayStr];
  const todayBooking = todayBookingRaw && !todayBookingRaw.returnedAt ? todayBookingRaw : null;
  const res = resources.find(r => r.id === selectedResource);
  const isHouse = res && res.type === 'house';

  // ── Nom, emoji, sous-titre ──
  const cardEmoji = document.getElementById('resource-card-emoji');
  const cardTitle = document.getElementById('resource-card-title');
  const cardSubtitle = document.getElementById('resource-card-subtitle');
  if (cardEmoji) cardEmoji.textContent = res?.emoji || (isHouse ? '🏠' : '🚗');
  if (cardTitle) cardTitle.textContent = res?.name || (isHouse ? 'Maison' : 'Voiture');
  if (cardSubtitle) {
    if (!isHouse && res?.plaque) cardSubtitle.textContent = res.plaque;
    else if (isHouse && res?.address) cardSubtitle.textContent = res.address;
    else cardSubtitle.textContent = isHouse ? 'Maison de famille' : 'Voiture familiale';
  }

  // ── Badge disponibilité ──
  const badge = document.getElementById('availability-badge');
  const statusText = document.getElementById('car-status-text');
  if (badge && statusText) {
    if (todayBooking) {
      badge.className = 'ccv2-badge reserved';
      statusText.textContent = isHouse ? `Séjour de ${todayBooking.userName}` : `En cours · ${todayBooking.userName}`;
    } else {
      badge.className = 'ccv2-badge available';
      statusText.textContent = isHouse ? 'Disponible' : 'Disponible';
    }
  }

  // ── Info grid (voiture) ──
  const infoGrid = document.getElementById('car-info-grid');
  if (infoGrid) infoGrid.style.display = isHouse ? 'none' : '';

  const infoPlaque = document.getElementById('info-plaque');
  const infoAssurance = document.getElementById('info-assurance');
  const infoCt = document.getElementById('info-ct');
  const infoKmOdo = document.getElementById('info-km-odo');
  if (infoPlaque) infoPlaque.textContent = res?.plaque || '—';
  if (infoAssurance) infoAssurance.textContent = res?.assurance || '—';
  if (infoCt) infoCt.textContent = res?.ct || '—';
  if (infoKmOdo) infoKmOdo.textContent = res?.kmOdometer ? `${Number(res.kmOdometer).toLocaleString('fr-FR')} km` : '—';

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
  if (reserveBtn) reserveBtn.textContent = isHouse ? 'Réserver la maison' : 'Réserver la voiture';

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
    const freeDate = getNextFreeDate();
    nextSlot.textContent = freeDate ? `Prochain créneau libre · ${formatRelativeDate(freeDate)}` : '';
  }

  // ── Prochaines réservations ──
  renderUpcomingBookings();

  // KPI hidden elements (backward compat)
  const kpiKmCard = document.getElementById('kpi-km-card');
  const kpiCo2Card = document.getElementById('kpi-co2-card');
  if (kpiKmCard) kpiKmCard.style.display = 'none';
  if (kpiCo2Card) kpiCo2Card.style.display = 'none';

  // Points accumulator (for leaderboard / history tabs)
  const points = {};
  monthEntries.forEach(b => {
    const key = b.userId || b.userName || 'inconnu';
    const label = b.userName || 'Utilisateur';
    if (!points[key]) points[key] = { label, score: 0, rides: 0, photo: b.photo || null };
    const km = estimateDistanceForBooking(b);
    points[key].score += 20 + Math.round(km / 25);
    points[key].rides += 1;
  });
  const ranking = Object.values(points).sort((a,b)=>b.score-a.score);

  const myMonthRides = monthEntries.filter(b => currentUser && b.userId === currentUser.id).length;
  const myRank = ranking.findIndex(r => currentUser && r.label === currentUser.name) + 1;
  const qsRides = document.getElementById('qs-rides');
  const qsRank = document.getElementById('qs-rank');
  if (qsRides) qsRides.textContent = String(myMonthRides);
  if (qsRank) qsRank.textContent = myRank > 0 ? `#${myRank}` : '#—';

  renderXpHeroCard();
  renderLeaderboard(ranking);
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
