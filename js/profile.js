// ==========================================
// PROFILE TAB
// ==========================================
function renderProfileTab() {
  const u = currentUser;

  // Avatar
  const pfAvatar = document.getElementById('pf-avatar');
  if (pfAvatar) {
    pfAvatar.innerHTML = u?.photo
      ? `<img src="${u.photo}" alt="">`
      : getInitials(u?.name || '?');
  }

  // Name + sub
  const pfName = document.getElementById('pf-name');
  const pfSub  = document.getElementById('pf-sub');
  if (pfName) pfName.textContent = u?.name || '—';
  if (pfSub)  pfSub.textContent  = u?.email || '—';

  // Family name
  const pfFamilyName = document.getElementById('pf-family-name');
  if (pfFamilyName) pfFamilyName.textContent = _currentFamilyName || 'Famille';

  // KPIs
  const allBookings = getUniqueBookingsSorted();
  const myBookings  = allBookings.filter(b => u && b.userId === u.id);

  const pfRides     = document.getElementById('pf-kpi-rides');
  const pfTotal     = document.getElementById('pf-kpi-total');
  const pfSeniority = document.getElementById('pf-kpi-seniority');
  if (pfRides) pfRides.textContent = String(myBookings.length);
  if (pfTotal) pfTotal.textContent = String(allBookings.length);
  if (pfSeniority) {
    const created = u?.createdAt;
    if (created) {
      const months = Math.max(0, Math.floor((Date.now() - new Date(created)) / (30 * 24 * 3600 * 1000)));
      pfSeniority.textContent = months >= 12
        ? `${Math.floor(months / 12)} an${Math.floor(months / 12) > 1 ? 's' : ''}`
        : `${months || 1} mois`;
    } else {
      pfSeniority.textContent = '—';
    }
  }

  // Resources grid
  const grid = document.getElementById('pf-resources-grid');
  if (!grid) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const resCards = resources.map(res => {
    const isAvailable = !bookings[todayStr] || bookings[todayStr].resourceId !== res.id;
    const badgeHtml = isAvailable
      ? `<div class="pf-resource-badge"><div class="pf-bdot"></div>Disponible</div>`
      : `<div class="pf-resource-badge" style="background:#fff7ed;color:#9a3412;border-color:#fed7aa"><div class="pf-bdot" style="background:#ea580c"></div>Occupé</div>`;
    const sub = res.type === 'house'
      ? (res.address || 'Maison')
      : (res.plaque ? res.plaque : 'Voiture');
    return `<div class="pf-resource-card" onclick="selectResource('${res.id}');switchTab('dashboard')">
      <div class="pf-resource-icon">${res.emoji || '🚗'}</div>
      <div class="pf-resource-title">${res.name}</div>
      <div class="pf-resource-sub">${sub}</div>
      ${badgeHtml}
    </div>`;
  });

  resCards.push(`<div class="pf-resource-card pf-add-card" onclick="showAddResourceSheet()">
    <div class="pf-add-plus">+</div>
    <div class="pf-resource-title">Ajouter une ressource</div>
    <div class="pf-resource-sub">Voiture, maison, vélo…</div>
  </div>`);

  grid.innerHTML = resCards.join('');
}
