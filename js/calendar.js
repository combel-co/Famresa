// ==========================================
// CALENDAR RENDER — scrollable multi-month
// ==========================================
const CAL_HORIZON_MONTHS = 13;

function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  const today = new Date(); today.setHours(0,0,0,0);
  let html = '';

  for (let m = 0; m < CAL_HORIZON_MONTHS; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDay = d.getDay() - 1;
    if (firstDay < 0) firstDay = 6;

    const monthLabel = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    html += `<div class="cal-month-block">`;
    html += `<div class="cal-month-label">${monthLabel}</div>`;
    html += `<div class="cal-grid">`;

    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const cellDate = new Date(year, month, day);
      const dayOfWeek = cellDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isToday = cellDate.getTime() === today.getTime();
      const isPast = cellDate < today;
      const booking = bookings[dateStr];
      const isMine = booking && currentUser && booking.userId === currentUser.id;

      let classes = ['cal-day'];
      if (isWeekend) classes.push('weekend');
      if (isToday) classes.push('today');
      if (isPast) classes.push('past');
      if (booking && isMine) classes.push('mine');
      else if (booking) classes.push('booked');

      let avatarHtml = '';
      if (booking) {
        const avatarPhoto = booking._currentPhoto || booking.photo || null;
        if (avatarPhoto) {
          avatarHtml = `<div class="booking-avatar"><img src="${avatarPhoto}" alt=""></div>`;
        } else {
          avatarHtml = `<div class="booking-avatar">${getInitials(booking.userName)}</div>`;
        }
      }

      html += `<div class="${classes.join(' ')}" onclick="onDayClick('${dateStr}', ${isPast})">
        <span class="day-num">${day}</span>
        ${avatarHtml}
      </div>`;
    }

    html += `</div></div>`;
  }

  grid.innerHTML = html;

  const nowMonth = today.getMonth();
  const nowYear = today.getFullYear();
  const daysInCurrentMonth = new Date(nowYear, nowMonth + 1, 0).getDate();
  renderKpis(daysInCurrentMonth);
  renderExperiencePanels();
}

function renderKpis(daysInMonth) {
  const today = new Date();
  const kpiYear = today.getFullYear();
  const kpiMonth = today.getMonth();
  const res = resources.find(r => r.id === selectedResource);

  if (res && res.type === 'house') {
    const monthPrefix = `${kpiYear}-${String(kpiMonth + 1).padStart(2, '0')}-`;
    const monthDateKeys = Object.keys(bookings).filter(d => d.startsWith(monthPrefix));
    const totalDaysBooked = monthDateKeys.length;
    const seen = new Set(); const uniqueBookings = [];
    monthDateKeys.forEach(d => { const b = bookings[d]; if (b && !seen.has(b.id)) { seen.add(b.id); uniqueBookings.push(b); } });
    const occupancy = daysInMonth ? Math.round((totalDaysBooked / daysInMonth) * 100) : 0;

    document.getElementById('kpi-bookings').textContent = String(uniqueBookings.length);
    document.getElementById('kpi-bookings-sub').textContent = 'séjours ce mois';
    document.getElementById('kpi-occupancy').textContent = `${occupancy}%`;
    document.getElementById('kpi-occupancy-sub').textContent = `${totalDaysBooked} nuit${totalDaysBooked > 1 ? 's' : ''} réservée${totalDaysBooked > 1 ? 's' : ''}`;
    document.getElementById('kpi-km').textContent = '—';
    document.getElementById('kpi-co2').textContent = '—';
    return;
  }

  // Car KPIs (default)
  const monthPrefix = `${kpiYear}-${String(kpiMonth + 1).padStart(2, '0')}-`;
  const monthDateKeys = Object.keys(bookings).filter(d => d.startsWith(monthPrefix));
  const totalDaysBooked = monthDateKeys.length;
  const seen = new Set(); const uniqueBookings = [];
  monthDateKeys.forEach(d => { const b = bookings[d]; if (b && !seen.has(b.id)) { seen.add(b.id); uniqueBookings.push(b); } });
  const totalBookings = uniqueBookings.length;
  const myDays = monthDateKeys.filter(d => currentUser && bookings[d]?.userId === currentUser.id).length;
  const occupancy = daysInMonth ? Math.round((totalDaysBooked / daysInMonth) * 100) : 0;
  const estimatedKm = uniqueBookings.reduce((sum, b) => sum + estimateDistanceForBooking(b), 0);
  const co2KgPerKm = 0.12;
  const estimatedCo2 = (estimatedKm * co2KgPerKm).toFixed(1);

  document.getElementById('kpi-bookings').textContent = String(totalDaysBooked);
  document.getElementById('kpi-bookings-sub').textContent = currentUser
    ? `Dont ${myDays} jours pour ${currentUser.name}`
    : 'Tous conducteurs';
  document.getElementById('kpi-occupancy').textContent = `${occupancy}%`;
  document.getElementById('kpi-occupancy-sub').textContent = `${totalDaysBooked} jour${totalDaysBooked > 1 ? 's' : ''} réservé${totalDaysBooked > 1 ? 's' : ''}`;
  document.getElementById('kpi-km').textContent = String(estimatedKm);
  document.getElementById('kpi-co2').textContent = String(estimatedCo2);
}

function goToToday() {
  switchTab('calendar');
  const scrollBody = document.getElementById('cal-scroll-body');
  if (scrollBody) scrollBody.scrollTop = 0;
  showToast("Retour à aujourd'hui");
}

// ==========================================
// DAY CLICK
// ==========================================
function onDayClick(dateStr, isPast) {
  const res = resources.find(r => r.id === selectedResource);

  if (isPast) {
    if (currentUser) {
      const booking = bookings[dateStr];
      if (booking && booking.userId === currentUser.id) {
        const date = new Date(dateStr + 'T00:00:00');
        const prettyDate = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        if (res && res.type === 'house') {
          showStaySheet(booking.reservationGroupId || booking.id, booking);
        } else {
          showTripReport(booking, prettyDate);
        }
      }
    }
    return;
  }
  if (!currentUser) { showWelcomeScreen(); return; }

  const booking = bookings[dateStr];
  const date = new Date(dateStr + 'T00:00:00');
  const prettyDate = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  // If booking is already returned (early return done), show trip report instead of action buttons
  if (booking && booking.returnedAt && currentUser && booking.userId === currentUser.id) {
    if (res && res.type === 'house') {
      showStaySheet(booking.reservationGroupId || booking.id, booking);
    } else {
      showTripReport(booking, prettyDate);
    }
    return;
  }

  let html = '';
  if (booking) {
    const isMine = currentUser && booking.userId === currentUser.id;
    if (res && res.type === 'house') {
      showStaySheet(booking.reservationGroupId || booking.id, booking);
      return;
    }
    const avatarPhoto = booking._currentPhoto || booking.photo || null;
    const avatarContent = avatarPhoto ? `<img src="${avatarPhoto}" alt="">` : getInitials(booking.userName);
    const dateRange = booking.startDate && booking.endDate && booking.startDate !== booking.endDate
      ? `${new Date(booking.startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} → ${new Date(booking.endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
      : prettyDate;
    const hoursInfo = booking.startHour && booking.endHour ? `${booking.startHour} → ${booking.endHour}` : '';
    const destInfo = booking.destination || (booking.destinations && booking.destinations.length > 0 ? booking.destinations.map(d => d.name).join(', ') : '');
    const kmInfo = booking.kmEstimate ? `${booking.kmEstimate} km AR` : '';

    html = `
      <div class="sheet-date">${dateRange}</div>
      ${hoursInfo ? `<div style="font-size:14px;color:var(--text-light);margin-bottom:8px">🕐 ${hoursInfo}</div>` : ''}
      <div class="sheet-status">
        <div class="booked-by">
          <div class="avatar-lg">${avatarContent}</div>
          <div class="info">${booking.userName}<small>${isMine ? 'Votre réservation' : 'A réservé ce jour'}</small></div>
        </div>
      </div>
      ${destInfo ? `<div style="background:#f8f8f8;border-radius:10px;padding:10px 14px;margin-bottom:8px;font-size:14px">📍 ${destInfo}${kmInfo ? ` <span style="color:var(--text-light)">(${kmInfo})</span>` : ''}</div>` : ''}
      ${isMine ? `<button class="btn" style="background:#f0f4ff;color:#4338ca;font-weight:600;margin-bottom:4px" onclick="openEditBookingModal('${booking.id}')">✏️ Modifier la réservation</button>` : ''}
      ${isMine && dateStr === new Date().toISOString().slice(0,10) ? `<button class="btn" style="background:#fff8ed;color:#b45309;border:1px solid #fde68a;font-weight:600;margin-bottom:4px" onclick="showEarlyReturnSheet('${booking.id}')">🔑 Rendre plus tôt</button>` : ''}
      ${isMine ? `<button class="btn btn-danger" style="margin-top:4px" onclick="showDeleteBookingSheet('${booking.id}','${dateStr}')">Gérer / Annuler</button>` : ''}
      <button class="btn" style="background:#f5f5f5;color:var(--text)" onclick="closeSheet()">Fermer</button>`;
  } else {
    const activeResource = resources.find(r => r.id === selectedResource);
    const fuelRow = (!res || res.type === 'car') ? `<div class="fuel-info-row"><span>Essence disponible</span>${getFuelBar(activeResource?.fuelLevel)}</div>` : '';
    const clean = activeResource?.carCleanliness || '';
    const cleanLabel = clean === 'clean' ? 'Propre' : clean === 'average' ? 'Moyenne' : clean === 'dirty' ? 'Sale' : 'Non renseigné';
    const cleanRow = (!res || res.type === 'car') ? `<div class="fuel-info-row"><span>État du véhicule</span><span>${cleanLabel}</span></div>` : '';
    html = `
      ${fuelRow}
      ${cleanRow}
      <div class="cal-sheet-actions">
        <button type="button" class="ccv2-btn-reserve cal-sheet-reserve" onclick="goToDashboardBooking()">Réserver</button>
        <button type="button" class="btn cal-sheet-close" onclick="closeSheet()">Fermer</button>
      </div>`;
  }

  document.getElementById('sheet-content').innerHTML = html;
  document.getElementById('overlay').classList.add('open');
}

function goToDashboardBooking() {
  closeSheet();
  switchTab('dashboard');
  openBookingModal();
}
