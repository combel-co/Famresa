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

  if (groups.length === 0 && resources.length === 0) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-light);font-size: calc(14px * var(--ui-text-scale))">
      ⏳ Aucune ressource accessible — en attente d'invitation
    </div>`;
    return;
  }

  const sectionsHtml = groups.map((group) => {
    const resCards = group.resources.map(res => {
      const isAvailable = !bookings[todayStr] || bookings[todayStr].resourceId !== res.id;
      const availBadge = isAvailable
        ? `<div class="pf-resource-badge">Disponible</div>`
        : `<div class="pf-resource-badge" style="background:#fff7ed;color:#9a3412;border-color:#fed7aa">Occupé</div>`;
      const sub = res.type === 'house'
        ? (res.address || 'Maison')
        : ((res.carLocation || res.lieu || '').trim() || 'Lieu non renseigné');
      const role = window._myResourceRoles?.[res.id];
      const roleStyle = role ? (roleColors[role] || roleColors.member) : null;
      const rolePill = roleStyle
        ? `<div style="margin-top:6px;display:inline-block;font-size: calc(10px * var(--ui-text-scale));font-weight:700;padding:2px 8px;border-radius:20px;background:${roleStyle.bg};color:${roleStyle.color}">${roleStyle.label}</div>`
        : '';
      const manageBtn = `<div style="margin-top:8px;font-size: calc(11px * var(--ui-text-scale));color:var(--accent);font-weight:600;cursor:pointer"
              onclick="event.stopPropagation();showResourceManagePage('${res.id}')">Gérer l'accès ›</div>`;

      return `<div class="pf-resource-card" onclick="selectResource('${res.id}');showResourceManagePage('${res.id}')">
        <div class="pf-resource-icon">${res.emoji || (res.type === 'house' ? '🏠' : '🚗')}</div>
        <div class="pf-resource-main">
          <div class="pf-resource-title">${res.name}</div>
          <div class="pf-resource-sub">${sub}</div>
          ${availBadge}
          ${rolePill}
          ${manageBtn}
        </div>
      </div>`;
    });

    const showLabel = groups.length > 1;
    const labelHtml = showLabel
      ? `<div class="pf-section-lbl">${group.familyName}</div>`
      : `<div class="pf-section-lbl">Ressources partagées</div>`;

    return `<div class="pf-family-section">
      ${labelHtml}
      <div class="pf-resources-grid">${resCards.join('')}</div>
    </div>`;
  }).join('');

  const standaloneAddHtml = `
    <div class="pf-family-section pf-add-standalone-wrap">
      <div class="pf-resources-grid pf-resources-grid-add">
        <div class="pf-resource-card pf-add-card pf-add-card-compact" onclick="showAddResourceSheet()">
          <div class="pf-add-plus">+</div>
          <div class="pf-resource-main">
            <div class="pf-resource-title">Ajouter une ressource</div>
            <div class="pf-resource-sub">Choix de la famille dans l'etape suivante</div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = sectionsHtml + standaloneAddHtml;
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
          <div style="font-weight:700;font-size: calc(14px * var(--ui-text-scale));margin-bottom:2px">${userNames[item.profil_id || item.profileId] || '—'}</div>
          <div style="font-size: calc(12px * var(--ui-text-scale));color:var(--text-light);margin-bottom:12px">Demande d'accès · ${resName}</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" style="flex:1;padding:8px;font-size: calc(13px * var(--ui-text-scale))"
              onclick="selectResource('${item.resourceId}');showResourceManagePage('${item.resourceId}')">Voir →</button>
          </div>
        </div>`;
      }).join('')}`;
    promoCard.parentNode.insertBefore(adminPanel, promoCard);
  } catch(e) { /* silent */ }
}

function closeErrorDashboard() {
  document.getElementById('error-dashboard-overlay')?.classList.add('hidden');
  const root = document.getElementById('error-dashboard-content');
  if (root) root.innerHTML = '';
}

async function showErrorDashboard() {
  const isAnyAdmin = Object.values(window._myResourceRoles || {}).includes('admin');
  if (!isAnyAdmin) {
    showToast('Réservé aux admins');
    return;
  }

  const code = window.prompt('Code admin requis');
  if (!code) return;
  const ok = await (window.verifyDiagAdminCode ? window.verifyDiagAdminCode(code) : false);
  if (!ok) {
    showToast('Code admin invalide');
    return;
  }

  const overlay = document.getElementById('error-dashboard-overlay');
  const root = document.getElementById('error-dashboard-content');
  if (!overlay || !root) return;

  overlay.classList.remove('hidden');
  root.innerHTML = `
    <div class="rm-page">
      <div class="rm-head">
        <button class="rm-back" onclick="closeErrorDashboard()">← Retour</button>
        <div class="rm-title">Erreurs de connexion</div>
      </div>
      <div id="error-dashboard-body" style="padding:14px 16px;color:#6b7280">Chargement…</div>
    </div>
  `;

  const body = document.getElementById('error-dashboard-body');
  try {
    const familyId = currentUser?.familyId || null;
    const snap = await db.collection('erreur')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(item => !familyId || !item.familyId || item.familyId === familyId);

    if (!items.length) {
      body.innerHTML = `<div style="padding:10px 0">Aucune erreur récente 🎉</div>`;
      return;
    }

    body.innerHTML = items.map(item => {
      const dt = item.createdAt?.toDate ? item.createdAt.toDate() : (item.at ? new Date(item.at) : null);
      const when = dt ? dt.toLocaleString('fr-FR') : 'Date inconnue';
      const stage = item.stage || 'unknown';
      const codeTxt = item.errorCode ? ` (${item.errorCode})` : '';
      const ref = item.ref || 'n/a';
      const email = item.email || '—';
      const msg = (item.errorMessage || '—').toString().slice(0, 180);
      return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin-bottom:10px">
        <div style="font-size: calc(12px * var(--ui-text-scale));color:#6b7280">${when}</div>
        <div style="font-weight:700;font-size: calc(13px * var(--ui-text-scale));margin-top:2px">${stage}${codeTxt}</div>
        <div style="font-size: calc(12px * var(--ui-text-scale));margin-top:4px;color:#374151">Ref: ${ref}</div>
        <div style="font-size: calc(12px * var(--ui-text-scale));color:#374151">Email: ${email}</div>
        <div style="font-size: calc(12px * var(--ui-text-scale));color:#6b7280;margin-top:6px">${msg}</div>
      </div>`;
    }).join('');
  } catch (e) {
    body.innerHTML = `<div style="color:#b91c1c">Impossible de charger les erreurs.</div>`;
  }
}
