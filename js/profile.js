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

  // Name
  const pfName = document.getElementById('pf-name');
  if (pfName) pfName.textContent = u?.name || '—';

  // Resources by family
  _renderResourcesByFamily();

  // Async: pending access requests for admins
  _renderAdminPendingSection();
}

function _renderResourcesByFamily() {
  const container = document.getElementById('pf-resources-by-family');
  if (!container) return;

  const groups = profileService.getResourcesByFamily(_userFamilies, resources);
  const todayStr = new Date().toISOString().slice(0, 10);

  const roleColors = {
    admin:  { bg: '#f0f4ff', color: '#4338ca', label: 'Admin' },
    member: { bg: '#f0fdf4', color: '#16a34a', label: 'Membre' },
    guest:  { bg: '#fefce8', color: '#a16207', label: 'Invité' },
  };

  const isAnyAdmin = Object.values(window._myResourceRoles || {}).includes('admin');

  if (groups.length === 0 && resources.length === 0) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-light);font-size:14px">
      ⏳ Aucune ressource accessible — en attente d'invitation
    </div>`;
    return;
  }

  const sectionsHtml = groups.map((group, groupIdx) => {
    const showAddCard = isAnyAdmin && groupIdx === groups.length - 1;

    const resCards = group.resources.map(res => {
      const isAvailable = !bookings[todayStr] || bookings[todayStr].resourceId !== res.id;
      const availBadge = isAvailable
        ? `<div class="pf-resource-badge"><div class="pf-bdot"></div>Disponible</div>`
        : `<div class="pf-resource-badge" style="background:#fff7ed;color:#9a3412;border-color:#fed7aa"><div class="pf-bdot" style="background:#ea580c"></div>Occupé</div>`;
      const sub = res.type === 'house'
        ? (res.address || 'Maison')
        : (res.plaque || 'Voiture');
      const role = window._myResourceRoles?.[res.id];
      const roleStyle = role ? (roleColors[role] || roleColors.member) : null;
      const rolePill = roleStyle
        ? `<div style="margin-top:6px;display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${roleStyle.bg};color:${roleStyle.color}">${roleStyle.label}</div>`
        : '';
      const manageBtn = `<div style="margin-top:8px;font-size:11px;color:var(--accent);font-weight:600;cursor:pointer"
              onclick="event.stopPropagation();showResourceManagePage('${res.id}')">Gérer l'accès ›</div>`;

      return `<div class="pf-resource-card" onclick="selectResource('${res.id}');showResourceManagePage('${res.id}')">
        <div class="pf-resource-icon">${res.emoji || (res.type === 'house' ? '🏠' : '🚗')}</div>
        <div class="pf-resource-title">${res.name}</div>
        <div class="pf-resource-sub">${sub}</div>
        ${availBadge}
        ${rolePill}
        ${manageBtn}
      </div>`;
    });

    if (showAddCard) {
      resCards.push(`<div class="pf-resource-card pf-add-card" onclick="showAddResourceSheet()">
        <div class="pf-add-plus">+</div>
        <div class="pf-resource-title">Ajouter une ressource</div>
        <div class="pf-resource-sub">Voiture, maison, vélo…</div>
      </div>`);
    }

    const showLabel = groups.length > 1;
    const labelHtml = showLabel
      ? `<div class="pf-section-lbl">${group.familyName}</div>`
      : `<div class="pf-section-lbl">Ressources partagées</div>`;

    return `<div class="pf-family-section">
      ${labelHtml}
      <div class="pf-resources-grid">${resCards.join('')}</div>
    </div>`;
  }).join('');

  // If no groups but user is admin, still show "add" button
  const addOnlyHtml = (groups.length === 0 && isAnyAdmin)
    ? `<div class="pf-family-section">
        <div class="pf-section-lbl">Ressources partagées</div>
        <div class="pf-resources-grid">
          <div class="pf-resource-card pf-add-card" onclick="showAddResourceSheet()">
            <div class="pf-add-plus">+</div>
            <div class="pf-resource-title">Ajouter une ressource</div>
            <div class="pf-resource-sub">Voiture, maison, vélo…</div>
          </div>
        </div>
      </div>`
    : '';

  container.innerHTML = sectionsHtml + addOnlyHtml;
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
