// ==========================================
// FUEL HELPERS
// ==========================================
const FUEL_COLORS = { 0: '#ef4444', 25: '#f97316', 50: '#eab308', 75: '#84cc16', 100: '#22c55e' };
const FUEL_LABELS = { 0: 'Vide', 25: '1/4', 50: '1/2', 75: '3/4', 100: 'Plein' };

function getFuelBar(level) {
  if (level === null || level === undefined) {
    return '<span style="color:var(--text-light);font-size:13px">Inconnu</span>';
  }
  return `<div class="fuel-mini-bar">
    <div class="fuel-mini-track"><div class="fuel-mini-fill" style="width:${level}%;background:${FUEL_COLORS[level]}"></div></div>
    <span style="font-size:13px;font-weight:600;color:var(--text)">${FUEL_LABELS[level] || level + '%'}</span>
  </div>`;
}

// Barre pleine largeur pour la carte dashboard
function getFuelBarFull(level) {
  if (level === null || level === undefined) {
    return `<div class="fuel-full-bar">
      <div class="fuel-full-bar-label"><span>Réservoir</span><span class="fuel-full-value" style="color:var(--text-light)">Inconnu</span></div>
      <div class="fuel-full-track"><div class="fuel-full-fill" style="width:0%;background:#e5e7eb"></div></div>
    </div>`;
  }
  const color = FUEL_COLORS[level] || '#84cc16';
  const label = FUEL_LABELS[level] || (level + '%');
  return `<div class="fuel-full-bar">
    <div class="fuel-full-bar-label"><span>Réservoir</span><span class="fuel-full-value" style="color:${color}">${label}</span></div>
    <div class="fuel-full-track"><div class="fuel-full-fill" style="width:${level}%;background:${color}"></div></div>
  </div>`;
}

// Barre pour la grille info ccv2
function getFuelBarGrid(level) {
  if (level === null || level === undefined) {
    return '<span style="color:#9b9b9b;font-size:12px">Inconnu</span>';
  }
  const color = FUEL_COLORS[level] || '#84cc16';
  const label = FUEL_LABELS[level] || (level + '%');
  return `<div class="ccv2-fuel-bar">
    <div class="ccv2-fuel-track"><div class="ccv2-fuel-fill" style="width:${level}%;background:${color}"></div></div>
    <span style="font-size:12px;font-weight:500;color:${color}">${label}</span>
  </div>`;
}

// ==========================================
// FUEL RETURN SHEET
// ==========================================
let selectedFuelLevel = null;

const FUEL_LEVELS_DEF = [
  { value: 0,   label: 'Vide',  color: '#ef4444', heightPct: 6   },
  { value: 25,  label: '1/4',   color: '#f97316', heightPct: 30  },
  { value: 50,  label: '1/2',   color: '#eab308', heightPct: 55  },
  { value: 75,  label: '3/4',   color: '#84cc16', heightPct: 78  },
  { value: 100, label: 'Plein', color: '#10b981', heightPct: 100 },
];

function renderFuelButtons() {
  return FUEL_LEVELS_DEF.map(f => `
    <button class="fuel-btn" onclick="selectFuel(${f.value}, this)" type="button">
      <div class="fuel-bar-wrap">
        <div class="fuel-bar-fill" style="height:${f.heightPct}%;background:${f.color}"></div>
      </div>
      <div class="fuel-label">${f.label}</div>
    </button>`).join('');
}

function showFuelSheet() {
  selectedFuelLevel = null;
  document.getElementById('sheet-content').innerHTML = `
    <div style="text-align:center;padding-bottom:4px">
      <h3 style="font-size:22px;font-weight:700;margin-bottom:6px">Niveau d'essence rendu ?</h3>
      <p style="font-size:14px;color:var(--text-light)">Aidez la famille à planifier le prochain plein</p>
    </div>
    <div class="fuel-selector">${renderFuelButtons()}</div>
    <button class="btn btn-primary" id="fuel-confirm-btn" onclick="confirmFuel()" disabled style="opacity:0.4">Confirmer</button>
    <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Passer</button>`;
  document.getElementById('overlay').classList.add('open');
}

function selectFuel(value, btn) {
  selectedFuelLevel = value;
  document.querySelectorAll('.fuel-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const confirmBtn = document.getElementById('fuel-confirm-btn');
  if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.style.opacity = '1'; }
}

function confirmFuel() {
  const level = selectedFuelLevel;
  selectedFuelLevel = null;
  closeSheet();
  if (level !== null && level >= 50) {
    celebrate('⛽', 'Youpi ! Merci !', '🌟', 'La voiture est bien ravitaillée');
  } else if (level !== null) {
    showToast('Pense à refaire le plein avant la prochaine sortie');
  }
}

function showTripReport(booking, prettyDate) {
  const existingFuelLevel = getFuelReturnLevelForBooking(booking);
  const hasFuel = existingFuelLevel !== null && existingFuelLevel !== undefined;

  let fuelSection;
  if (!hasFuel) {
    fuelSection = `
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px">Niveau d'essence rendu ?</div>
        <div class="fuel-selector">${renderFuelButtons()}</div>
        <button class="btn btn-primary" id="fuel-confirm-btn" onclick="confirmFuelAfterTrip('${booking.id}')" disabled style="opacity:0.4;margin-top:8px">Enregistrer</button>
      </div>`;
  } else {
    const labels = { 0: 'Vide', 25: '1/4', 50: '1/2', 75: '3/4', 100: 'Plein' };
    fuelSection = `<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);color:var(--text-light);font-size:13px">Essence rendue : <strong>${labels[existingFuelLevel] || existingFuelLevel + '%'}</strong></div>`;
  }

  document.getElementById('sheet-content').innerHTML = `
    <div class="sheet-date">${prettyDate}</div>
    <div style="font-size:14px;color:var(--text-light);margin-bottom:4px">${getBookingDestinationLabel(booking)} · ${estimateDistanceForBooking(booking)} km</div>
    ${fuelSection}
    <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:16px" onclick="closeSheet()">Fermer</button>`;
  document.getElementById('overlay').classList.add('open');
}

async function confirmFuelAfterTrip(bookingId) {
  const level = selectedFuelLevel;
  if (level === null) return;
  selectedFuelLevel = null;
  try {
    // Update the resource's fuelLevel
    const res = resources.find(r => r.id === selectedResource);
    if (res && res.type === 'car') {
      await ressourcesRef().doc(selectedResource).update({ fuelLevel: level });
    }

    const booking = getUniqueBookingsSorted().find(b => b.id === bookingId);
    await reservationsRef().doc(bookingId).update({
      fuelReturnLevel: level,
      fuelUpdatedAt: ts()
    });

    const resource = resources.find(r => r.id === selectedResource);
    if (resource) resource.fuelLevel = level;
    if (booking) booking.fuelReturnLevel = level;
    fuelReportsByBooking[bookingId] = { ...(fuelReportsByBooking[bookingId] || {}), bookingId, fuelReturnLevel: level };

    closeSheet();
    renderExperiencePanels();
    const xpFuel = level >= 50 ? 10 : 5;
    if (level >= 50) {
      celebrate('✓', 'Merci ! Réservoir mis à jour', `+${xpFuel} XP`, 'Le prochain conducteur voit le bon niveau');
    } else {
      celebrate('✓', 'Niveau enregistré', `+${xpFuel} XP`, 'Pense à refaire le plein avant la prochaine sortie');
    }
  } catch(e) { showToast('Erreur — réessayez'); }
}

// ==========================================
// POST-TRIP REMINDER
// ==========================================
function getPendingFuelBookingForCurrentUser() {
  if (!currentUser) return null;
  // Only show fuel reminder for car resources
  const res = resources.find(r => r.id === selectedResource);
  if (res && res.type !== 'car') return null;
  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  const minePast = getUniqueBookingsSorted().filter(b => (b.userId === currentUser.id) && ((b.endDate || b.date || '') < todayStr));
  return minePast.find(b => getFuelReturnLevelForBooking(b) === null) || null;
}

function renderPostTripReminder() {
  const el = document.getElementById('post-trip-reminder');
  if (!el) return;
  const booking = getPendingFuelBookingForCurrentUser();
  if (!booking) { el.innerHTML = ''; return; }
  const destination = getBookingDestinationLabel(booking);
  const km = estimateDistanceForBooking(booking);
  el.innerHTML = `<div class="post-trip-card">
    <div class="post-trip-title">Vous avez utilisé la voiture</div>
    <div class="post-trip-sub">Résumé de votre dernière resa</div>
    <div class="post-trip-meta">${formatBookingDateRange(booking)} · ${destination} · ${km} km</div>
    <button class="btn btn-primary" type="button" onclick="openFuelReminder('${booking.id}')">Mettre à jour le réservoir rendu</button>
  </div>`;
}

function openFuelReminder(bookingId) {
  const booking = getUniqueBookingsSorted().find(b => b.id === bookingId);
  if (!booking) return;
  showTripReport(booking, formatBookingDateRange(booking));
}

function maybePromptPendingFuel() {
  if (!currentUser || !selectedResource) return;
  if (document.getElementById('overlay')?.classList.contains('open')) return;
  const booking = getPendingFuelBookingForCurrentUser();
  if (!booking) return;
  if (pendingFuelPromptBookingId === booking.id) return;

  const storageKey = `famcar_fuel_prompt_seen_${booking.id}`;
  if (localStorage.getItem(storageKey) === '1') return;

  pendingFuelPromptBookingId = booking.id;
  localStorage.setItem(storageKey, '1');
  setTimeout(() => {
    if (document.getElementById('overlay')?.classList.contains('open')) return;
    showTripReport(booking, formatBookingDateRange(booking));
  }, 250);
}
