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

  if (resources.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;text-align:center;color:var(--text-light);font-size:14px">
      ⏳ Aucune ressource accessible — en attente d'invitation
    </div>`;
  } else {
    const roleColors = {
      admin: { bg: '#f0f4ff', color: '#4338ca', label: 'Admin' },
      member: { bg: '#f0fdf4', color: '#16a34a', label: 'Membre' },
      guest: { bg: '#fefce8', color: '#a16207', label: 'Invité' }
    };

    const resCards = resources.map(res => {
      const isAvailable = !bookings[todayStr] || bookings[todayStr].resourceId !== res.id;
      const availBadge = isAvailable
        ? `<div class="pf-resource-badge"><div class="pf-bdot"></div>Disponible</div>`
        : `<div class="pf-resource-badge" style="background:#fff7ed;color:#9a3412;border-color:#fed7aa"><div class="pf-bdot" style="background:#ea580c"></div>Occupé</div>`;
      const sub = res.type === 'house'
        ? (res.address || 'Maison')
        : (res.plaque ? res.plaque : 'Voiture');
      const role = window._myResourceRoles?.[res.id];
      const roleStyle = role ? roleColors[role] || roleColors.member : null;
      const rolePill = roleStyle
        ? `<div style="margin-top:6px;display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${roleStyle.bg};color:${roleStyle.color}">${roleStyle.label}</div>`
        : '';
      const manageBtn = `<div style="margin-top:8px;font-size:11px;color:var(--accent);font-weight:600;cursor:pointer"
              onclick="event.stopPropagation();showResourceManagePage('${res.id}')">Gérer l'accès ›</div>`;

      return `<div class="pf-resource-card" onclick="selectResource('${res.id}');showResourceManagePage('${res.id}')">
        <div class="pf-resource-icon">${res.emoji || '🚗'}</div>
        <div class="pf-resource-title">${res.name}</div>
        <div class="pf-resource-sub">${sub}</div>
        ${availBadge}
        ${rolePill}
        ${manageBtn}
      </div>`;
    });

    // Show "add resource" card only for admins
    const isAnyAdmin = Object.values(window._myResourceRoles || {}).includes('admin');
    if (isAnyAdmin) {
      resCards.push(`<div class="pf-resource-card pf-add-card" onclick="showAddResourceSheet()">
        <div class="pf-add-plus">+</div>
        <div class="pf-resource-title">Ajouter une ressource</div>
        <div class="pf-resource-sub">Voiture, maison, vélo…</div>
      </div>`);
    }

    grid.innerHTML = resCards.join('');
  }

  // Async: load pending requests for admins
  _renderAdminPendingSection();
}

async function _renderAdminPendingSection() {
  if (!currentUser?.familyId) return;
  const isAnyAdmin = Object.values(window._myResourceRoles || {}).includes('admin');
  if (!isAnyAdmin) return;

  try {
    const pending = await getPendingRequestsForFamily(currentUser.familyId);
    if (!pending.length) return;

    // Fetch resource names
    const resourceNames = {};
    resources.forEach(r => { resourceNames[r.id] = `${r.emoji || ''} ${r.name}`; });

    // Fetch user names
    const userNames = {};
    await Promise.all(pending.map(async item => {
      const pid = item.profil_id || item.profileId;
      try {
        const pDoc = await profilRef(pid).get();
        if (pDoc.exists) {
          userNames[pid] = pDoc.data().nom || pDoc.data().name || pid;
        } else {
          const member = await getFamilleMember(currentUser.familyId, pid);
          userNames[pid] = member?.nom || member?.name || pid;
        }
      } catch(e) { userNames[pid] = pid; }
    }));

    // Inject admin panel before the promo card
    const promoCard = document.querySelector('.pf-promo-card');
    if (!promoCard) return;
    const adminPanel = document.createElement('div');
    adminPanel.style.cssText = 'margin-bottom:16px';
    adminPanel.innerHTML = `
      <div class="pf-section-lbl" style="color:#b45309">⏳ Demandes d'accès en attente (${pending.length})</div>
      ${pending.map(item => {
        const resName = resourceNames[item.resourceId] || item.resourceId;
        const userName = userNames[item.profileId] || item.profileId;
        return `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;margin-bottom:10px">
          <div style="font-weight:700;font-size:14px;margin-bottom:2px">${userNames[item.profil_id || item.profileId] || '—'}</div>
          <div style="font-size:12px;color:var(--text-light);margin-bottom:12px">Demande d'accès · ${resName}</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" style="flex:1;padding:8px;font-size:13px"
              onclick="selectResource('${item.resourceId}');showResourceManagePage('${item.resourceId}')">Voir →</button>
          </div>
        </div>`;
      }).join('')}`;
    promoCard.parentNode.insertBefore(adminPanel, promoCard);
  } catch(e) { /* silent */ }
}
