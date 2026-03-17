// ==========================================
// DASHBOARD — EXPERIENCE PANELS
// ==========================================
function renderExperiencePanels() {
  const monthEntries = getMonthBookingEntries();
  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  const todayBooking = bookings[todayStr];
  const res = resources.find(r => r.id === selectedResource);

  const activeResource = resources.find(r => r.id === selectedResource);
  const isHouse = res && res.type === 'house';

  // ── Nom, emoji et plaque de la ressource ──
  const cardEmoji = document.getElementById('resource-card-emoji');
  const cardTitle = document.getElementById('resource-card-title');
  const cardPlaque = document.getElementById('resource-card-plaque');
  if (cardEmoji) cardEmoji.textContent = res?.emoji || (isHouse ? '🏠' : '🚗');
  if (cardTitle) cardTitle.textContent = res?.name || (isHouse ? 'Maison' : 'Voiture');
  if (cardPlaque) {
    const plaque = (!isHouse && res?.plaque) ? res.plaque : '';
    cardPlaque.textContent = plaque;
    cardPlaque.classList.toggle('hidden', !plaque);
  }
  // Hero banner : dégradé adapté selon type
  const heroBanner = document.getElementById('resource-main-card')?.querySelector('.car-hero-banner');
  if (heroBanner) {
    heroBanner.style.background = isHouse
      ? 'linear-gradient(135deg, #fef9f0 0%, #fde8cc 100%)'
      : 'linear-gradient(135deg, #eff4ff 0%, #dde7ff 100%)';
  }

  // ── Badge disponibilité ──
  const badge = document.getElementById('availability-badge');
  const statusDot = document.getElementById('car-status-dot');
  const statusText = document.getElementById('car-status-text');
  if (badge && statusDot && statusText) {
    if (todayBooking) {
      badge.className = 'availability-badge reserved';
      statusDot.className = 'dot-warn';
      statusText.textContent = isHouse ? `Séjour de ${todayBooking.userName}` : `En cours · ${todayBooking.userName}`;
    } else {
      badge.className = 'availability-badge available';
      statusDot.className = 'dot-ok';
      statusText.textContent = isHouse ? 'Maison disponible' : 'Disponible maintenant';
    }
  }

  // ── Lignes de détail (qui a réservé, jusqu'à quand, prochaine dispo) ──
  const detailRows = document.getElementById('resource-detail-rows');
  if (detailRows) {
    let html = '';
    if (todayBooking) {
      // Jusqu'à quand
      const endDateStr = todayBooking.endDate || todayBooking.startDate || todayStr;
      if (endDateStr && endDateStr !== todayStr) {
        const endDate = new Date(endDateStr + 'T00:00:00');
        const prettyEnd = endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
        html += `<div class="resource-detail-row"><span>📅</span><span>Jusqu'au ${prettyEnd}</span></div>`;
      }
      // Prochaine dispo : lendemain du endDate
      const nextDay = new Date((endDateStr || todayStr) + 'T00:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      const prettyNext = nextDay.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      html += `<div class="resource-detail-row"><span>✅</span><span>Disponible dès le ${prettyNext}</span></div>`;
    }
    detailRows.innerHTML = html;
  }

  // ── Réservoir (voiture seulement) ──
  const fuelDisplay = document.getElementById('car-fuel-display');
  const fuelCard = document.getElementById('car-fuel-row');
  if (fuelDisplay) {
    if (!isHouse) {
      fuelDisplay.innerHTML = getFuelBarFull(activeResource?.fuelLevel ?? null);
      if (fuelCard) fuelCard.style.display = '';
    } else {
      fuelDisplay.innerHTML = '';
      if (fuelCard) fuelCard.style.display = 'none';
    }
  }

  // ── Info button ──
  const carInfoBtn = document.getElementById('car-info-btn');
  if (carInfoBtn) {
    if (isHouse) {
      carInfoBtn.textContent = 'Info maison';
      carInfoBtn.onclick = showHouseInfo;
    } else {
      carInfoBtn.textContent = 'Info voiture';
      carInfoBtn.onclick = showCarInfo;
    }
  }

  // ── Bouton Réserver ──
  const reserveBtn = document.getElementById('reserve-cta-btn');
  if (reserveBtn) reserveBtn.textContent = isHouse ? 'Réserver la maison' : 'Réserver la voiture';

  // KPI cards — hide km/co2 for houses
  const kpiKmCard = document.getElementById('kpi-km-card');
  const kpiCo2Card = document.getElementById('kpi-co2-card');
  if (kpiKmCard) kpiKmCard.style.display = (!res || res.type === 'car') ? '' : 'none';
  if (kpiCo2Card) kpiCo2Card.style.display = (!res || res.type === 'car') ? '' : 'none';

  // Points accumulator (for leaderboard)
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

  // Quick stats
  const myMonthRides = monthEntries.filter(b => currentUser && b.userId === currentUser.id).length;
  const myRank = ranking.findIndex(r => currentUser && r.label === currentUser.name) + 1;
  const qsRides = document.getElementById('qs-rides');
  const qsRank = document.getElementById('qs-rank');
  if (qsRides) qsRides.textContent = String(myMonthRides);
  if (qsRank) qsRank.textContent = myRank > 0 ? `#${myRank}` : '#—';

  // XP hero card
  renderXpHeroCard();

  // Leaderboard podium
  renderLeaderboard(ranking);

  // History
  renderHistoryList();

  // Post-trip reminder (car only)
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
