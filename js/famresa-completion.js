// ==========================================
// FLOWS E — Complétion progressive (dashboard + liste + détails)
// ==========================================

function famresaCompletionDismissKey(resourceId) {
  const uid = currentUser?.id || 'anon';
  return `famresa_completion_dismiss_${uid}_${resourceId}`;
}

function famresaIsCompletionDismissed(resourceId) {
  try {
    return sessionStorage.getItem(famresaCompletionDismissKey(resourceId)) === '1';
  } catch (_) {
    return false;
  }
}

function famresaDismissCompletionCard(resourceId) {
  try {
    sessionStorage.setItem(famresaCompletionDismissKey(resourceId), '1');
  } catch (_) {}
  famresaRenderCompletionCard();
}

function _famresaRole(resourceId) {
  return window._myResourceRoles?.[resourceId] || 'member';
}

function _famresaProfilePhotoDone() {
  return !!(currentUser?.photo && String(currentUser.photo).trim());
}

function _famresaResourcePhotoDone(res) {
  return !!(res?.photoUrl && String(res.photoUrl).trim());
}

function _famresaEnabledGuideCount(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.filter((x) => x && x.enabled !== false).length;
}

function famresaResourceDetailGaps(res) {
  if (!res) return { empty: 999, total: 1 };
  const isHouse = res.type === 'house';
  if (isHouse) {
    const capNum = res.capacity != null && res.capacity !== '' ? Number(res.capacity) : NaN;
    const capOk = Number.isFinite(capNum) && capNum > 0;
    const rooms = Number(res.rooms || res.bedrooms || res.chambres || 0);
    const roomsOk = rooms > 0;
    const addrOk = typeof hasUsableResourceAddress === 'function' && hasUsableResourceAddress(res);
    const checks = [capOk, roomsOk, addrOk];
    const total = checks.length;
    const empty = checks.filter((x) => !x).length;
    return { empty, total };
  }
  const seats = Number(res.seatCount ?? res.seats ?? 0);
  const seatsOk = seats > 0;
  const ft = String(res.fuelType || '').trim();
  const km = String(res.mileageKm != null ? res.mileageKm : '').trim();
  const btOk = res.carBluetooth === true || res.carBluetooth === false;
  const loc = String(res.lieu || res.carLocation || '').trim();
  const checks = [seatsOk, !!ft, !!km, btOk, !!loc];
  const total = checks.length;
  const empty = checks.filter((x) => !x).length;
  return { empty, total };
}

function _famresaInfosDone(res) {
  const g = famresaResourceDetailGaps(res);
  return g.empty === 0;
}

function famresaCompletionTasks(resourceId) {
  const res = resources.find((r) => r.id === resourceId);
  const role = _famresaRole(resourceId);
  const isHouse = res?.type === 'house';
  const tasks = [];

  if (role !== 'admin') {
    tasks.push({
      id: 'profile_photo',
      label: 'Ta photo de profil',
      done: _famresaProfilePhotoDone(),
      detail: '',
      action: 'profile_photo',
    });
    return { tasks, total: 1, done: tasks.filter((t) => t.done).length };
  }

  tasks.push({
    id: 'profile_photo',
    label: 'Ta photo de profil',
    done: _famresaProfilePhotoDone(),
    detail: '',
    action: 'profile_photo',
  });
  tasks.push({
    id: 'resource_photo',
    label: res ? `Photo de ${res.name || 'la ressource'}` : 'Photo de la ressource',
    done: res ? _famresaResourcePhotoDone(res) : false,
    detail: '',
    action: 'resource_photo',
  });
  const gaps = res ? famresaResourceDetailGaps(res) : { empty: 1, total: 1 };
  tasks.push({
    id: 'resource_infos',
    label: res ? `Détails de ${res.name || 'la ressource'}` : 'Détails de la ressource',
    done: res ? _famresaInfosDone(res) : false,
    detail: !res || _famresaInfosDone(res) ? '' : `${gaps.empty} champ${gaps.empty > 1 ? 's' : ''} vide${gaps.empty > 1 ? 's' : ''}`,
    action: 'resource_infos',
  });

  if (isHouse) {
    const cin = _famresaEnabledGuideCount(res?.checkinGuide);
    tasks.push({
      id: 'checkin_guide',
      label: "Guide d'arrivée",
      done: cin > 0,
      detail: cin > 0 ? `${cin} instruction${cin > 1 ? 's' : ''}` : 'Pas encore créé',
      action: 'checkin_guide',
    });
    const cout = _famresaEnabledGuideCount(res?.checkoutGuide);
    tasks.push({
      id: 'checkout_guide',
      label: 'Guide de départ',
      done: cout > 0,
      detail: cout > 0 ? `${cout} instruction${cout > 1 ? 's' : ''}` : 'Pas encore créé',
      action: 'checkout_guide',
    });
  }

  const done = tasks.filter((t) => t.done).length;
  return { tasks, total: tasks.length, done };
}

function famresaCompletionPercent(resourceId) {
  const { done, total } = famresaCompletionTasks(resourceId);
  if (!total) return 100;
  return Math.round((done / total) * 100);
}

function famresaPatchResourceLocal(resourceId, patch) {
  const r = resources.find((x) => x.id === resourceId);
  if (r) Object.assign(r, patch);
}

function famresaCplBuildTaskRows(tasks, handlerName) {
  return tasks
    .map((t) => {
      const detailEsc = _famresaEsc(t.detail || '');
      let right;
      if (t.rowStyle === 'link') {
        right = `<span class="famresa-cpl-row__muted">${detailEsc || 'Ouvrir'}</span><span class="famresa-cpl-row__chev">›</span>`;
      } else if (t.done) {
        const muted =
          t.id === 'resource_infos' && t.done ? 'Complets' : detailEsc || 'Ajoutée';
        right = `<span class="famresa-cpl-row__ok">✓</span><span class="famresa-cpl-row__muted">${muted}</span>`;
      } else {
        right = `<span class="famresa-cpl-row__warn">${detailEsc || 'À faire'}</span><span class="famresa-cpl-row__chev">›</span>`;
      }
      const act = _famresaAttr(t.action);
      return `<button type="button" class="famresa-cpl-row" onclick="${handlerName}('${act}')">
        <span class="famresa-cpl-row__label">${_famresaEsc(t.label)}</span>
        <span class="famresa-cpl-row__right">${right}</span>
      </button>`;
    })
    .join('');
}

function famresaRenderCompletionCard() {
  const wrap = document.getElementById('dash-completion-card');
  if (!wrap) return;
  if (!selectedResource || !currentUser) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  if (famresaIsCompletionDismissed(selectedResource)) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  const pct = famresaCompletionPercent(selectedResource);
  if (pct >= 100) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  const { done, total } = famresaCompletionTasks(selectedResource);
  const frac = total ? done / total : 0;
  const deg = Math.round(frac * 360);
  wrap.style.display = '';
  wrap.innerHTML = `
    <div class="famresa-completion-card" role="button" tabindex="0" onclick="famresaOpenCompletionList()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();famresaOpenCompletionList();}" aria-label="Compléter ton espace">
      <div class="famresa-completion-card__progress" style="--fcg-deg:${deg}deg" aria-hidden="true"></div>
      <div class="famresa-completion-card__body">
        <div class="famresa-completion-card__title">Complète ton espace</div>
        <div class="famresa-completion-card__sub">${done} info${total > 1 ? 's' : ''} sur ${total}</div>
      </div>
      <span class="famresa-completion-card__chev" aria-hidden="true">›</span>
      <button type="button" class="famresa-completion-card__close" onclick="event.stopPropagation();famresaDismissCompletionCard(selectedResource)" aria-label="Fermer">×</button>
    </div>`;
}

function famresaOpenCompletionList() {
  const rid = selectedResource;
  if (!rid) return;
  const overlay = document.getElementById('completion-overlay');
  const inner = document.getElementById('completion-overlay-inner');
  if (!overlay || !inner) return;
  const { tasks, done, total } = famresaCompletionTasks(rid);
  const rows = famresaCplBuildTaskRows(tasks, 'famresaCompletionRowAction');
  inner.innerHTML = `
    <div class="famresa-cpl-header">
      <button type="button" class="famresa-cpl-back" onclick="famresaCloseCompletionOverlay()" aria-label="Retour">←</button>
      <span class="famresa-cpl-header-title">Complète ton espace</span>
    </div>
    <div class="famresa-cpl-circle-wrap">
      <div class="famresa-cpl-circle" style="--fcg-deg:${Math.round((done / Math.max(total, 1)) * 360)}deg">
        <span>${done}/${total}</span>
      </div>
    </div>
    <p class="famresa-cpl-lead">Plus ton espace est complet, plus c'est pratique pour ta famille.</p>
    <div class="famresa-cpl-list">${rows}</div>`;
  overlay.classList.remove('hidden');
}

function famresaCloseCompletionOverlay() {
  document.getElementById('completion-overlay')?.classList.add('hidden');
  famresaRenderCompletionCard();
}

// ——— Hub « Modifier la ressource » (MECE, zone admin) ———
window._reh = window._reh || { active: false, resourceId: null, stack: ['root'] };

function famresaRehOnBackdropClick(e) {
  if (e.target !== e.currentTarget) return;
  famresaResourceEditHubClose();
}

function famresaRehSvgCheck() {
  return `<span class="reh-check-ring" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12l4 4 8-8"/></svg></span>`;
}

function famresaRehPhotoStatus(res) {
  return _famresaResourcePhotoDone(res) ? 'complete' : 'empty';
}

function famresaRehDetailsStatus(res) {
  if (!res) return 'empty';
  const g = famresaResourceDetailGaps(res);
  const baseDone = g.empty === 0;
  if (res.type === 'house') {
    if (g.empty === g.total) return 'empty';
    if (!baseDone) return 'partial';
    return 'complete';
  }
  const plaqueOk = String(res.plaque || '').trim().length > 0;
  const assurOk = String(res.assurance || '').trim().length > 0;
  if (g.empty === g.total && !plaqueOk && !assurOk) return 'empty';
  if (!baseDone || !plaqueOk || !assurOk) return 'partial';
  return 'complete';
}

function famresaRehGuideRootStatus(res) {
  if (!res) return 'empty';
  if (res.type === 'house') {
    const cin = _famresaEnabledGuideCount(res.checkinGuide);
    const cout = _famresaEnabledGuideCount(res.checkoutGuide);
    if (cin === 0 && cout === 0) return 'empty';
    if (cin > 0 && cout > 0) return 'complete';
    return 'partial';
  }
  const m = _famresaEnabledGuideCount(res.maintenanceGuide);
  return m > 0 ? 'complete' : 'empty';
}

function famresaRehProgress(res) {
  const p = famresaRehPhotoStatus(res) === 'complete' ? 1 : 0;
  const d = famresaRehDetailsStatus(res) === 'complete' ? 1 : 0;
  const g = famresaRehGuideRootStatus(res) === 'complete' ? 1 : 0;
  return { done: p + d + g, total: 3 };
}

function famresaRehStatusRight(status) {
  if (status === 'empty') return `<span class="reh-pill-todo">À compléter</span>`;
  if (status === 'partial') return `<span class="reh-pill-warn">Incomplet</span>`;
  return `<span class="reh-done-wrap">${famresaRehSvgCheck()}<span class="reh-modify-link">Modifier</span></span>`;
}

function famresaRehBuildRow(label, status, view) {
  const v = _famresaAttr(view);
  return `<button type="button" class="reh-menu-row" onclick="famresaRehPush('${v}')">
    <span class="reh-menu-row__label">${_famresaEsc(label)}</span>
    <span class="reh-menu-row__right">${famresaRehStatusRight(status)}</span>
  </button>`;
}

function famresaRehBuildGuideRow(label, status, guideType) {
  const gt = _famresaAttr(guideType);
  const st = status === 'complete' ? 'complete' : 'empty';
  return `<button type="button" class="reh-menu-row" onclick="famresaRehOpenGuideFromHub('${gt}')">
    <span class="reh-menu-row__label">${_famresaEsc(label)}</span>
    <span class="reh-menu-row__right">${famresaRehStatusRight(st)}</span>
  </button>`;
}

function famresaRehOpenGuideFromHub(guideType) {
  const rid = window._reh?.resourceId || window._resourceEditHubId || selectedResource;
  if (!rid || typeof famresaOpenGuideEditor !== 'function') return;
  selectResource(rid);
  famresaOpenGuideEditor(guideType, rid, {
    onClose() {
      if (window._reh && window._reh.active) famresaRehRender();
    },
  });
}

function famresaRehPush(view) {
  if (!window._reh.active) return;
  window._reh.stack.push(view);
  famresaRehRender();
}

function famresaRehGoBack() {
  if (!window._reh.active) return;
  if (window._reh.stack.length <= 1) {
    famresaResourceEditHubClose();
    return;
  }
  window._reh.stack.pop();
  famresaRehRender();
}

function famresaResourceEditHubOpen(resourceId) {
  window._resourceEditHubId = resourceId;
  window._reh = { active: true, resourceId, stack: ['root'] };
  selectResource(resourceId);
  const overlay = document.getElementById('resource-edit-hub-overlay');
  if (!overlay) return;
  famresaRehRender();
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function famresaResourceEditHubClose() {
  const id = window._resourceEditHubId;
  window._reh = { active: false, resourceId: null, stack: ['root'] };
  window._resourceEditHubId = null;
  window._resourcePhotoDraft = null;
  document.getElementById('resource-edit-hub-overlay')?.classList.add('hidden');
  document.getElementById('resource-edit-hub-overlay')?.setAttribute('aria-hidden', 'true');
  if (typeof showResourceManagePage === 'function' && id) showResourceManagePage(id);
}

function famresaRehRender() {
  const rid = window._reh?.resourceId || window._resourceEditHubId || selectedResource;
  if (!rid || !window._reh.active) return;
  const inner = document.getElementById('resource-edit-hub-inner');
  const overlay = document.getElementById('resource-edit-hub-overlay');
  if (!inner || !overlay) return;
  const res = resources.find((r) => r.id === rid);
  if (!res) return;
  const top = window._reh.stack[window._reh.stack.length - 1];
  if (top === 'root') famresaRehRenderRoot(inner, rid, res);
  else if (top === 'photo') famresaRehRenderPhoto(inner, rid, res);
  else if (top === 'details') famresaRehRenderDetails(inner, rid, res);
  else if (top === 'guide') famresaRehRenderGuideMenu(inner, rid, res);
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function famresaRehRenderRoot(inner, rid, res) {
  const { done, total } = famresaRehProgress(res);
  const sp = famresaRehPhotoStatus(res);
  const sd = famresaRehDetailsStatus(res);
  const sg = famresaRehGuideRootStatus(res);
  const rows = [
    famresaRehBuildRow('Photo', sp, 'photo'),
    famresaRehBuildRow('Détails', sd, 'details'),
    famresaRehBuildRow('Guide', sg, 'guide'),
  ].join('');
  inner.innerHTML = `
    <div class="famresa-cpl-header">
      <button type="button" class="famresa-cpl-back" onclick="famresaRehGoBack()" aria-label="Retour">←</button>
      <span class="famresa-cpl-header-title">Modifier la ressource</span>
    </div>
    <div class="famresa-cpl-circle-wrap">
      <div class="famresa-cpl-circle" style="--fcg-deg:${Math.round((done / Math.max(total, 1)) * 360)}deg">
        <span>${done}/${total}</span>
      </div>
    </div>
    <p class="famresa-cpl-lead">Photo, détails et guides — tout ce qui concerne cette ressource.</p>
    <div class="reh-menu-list">${rows}</div>
    <div class="reh-footer-close">
      <button type="button" class="btn" style="width:100%;background:#f5f5f5;color:var(--text)" onclick="famresaResourceEditHubClose()">Fermer</button>
    </div>`;
}

function famresaRehRenderPhoto(inner, rid, res) {
  window._resourcePhotoDraft = null;
  const photoPreview = res.photoUrl
    ? `<img src="${_famresaAttr(res.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : _famresaEsc(res.emoji || (res.type === 'house' ? '🏠' : '🚗'));
  inner.innerHTML = `
    <div class="famresa-cpl-header">
      <button type="button" class="famresa-cpl-back" onclick="famresaRehGoBack()" aria-label="Retour">←</button>
      <span class="famresa-cpl-header-title">Photo</span>
    </div>
    <div class="famresa-cpl-form ob-fields" style="text-align:center">
      <div id="resource-photo-preview" class="reh-photo-preview">${photoPreview}</div>
      <label style="font-size: calc(12px * var(--ui-text-scale));color:var(--accent);cursor:pointer;text-decoration:underline" onclick="document.getElementById('reh-photo-input').click()">Modifier la photo</label>
      <input type="file" id="reh-photo-input" accept="image/*" style="display:none" onchange="handleResourcePhoto(this)">
      <button type="button" class="btn btn-primary famresa-cpl-save" onclick="famresaRehSavePhoto()">Enregistrer</button>
    </div>`;
}

function famresaRehRenderDetails(inner, rid, res) {
  const isHouse = res.type === 'house';
  const titleName = _famresaEsc(res.name || (isHouse ? 'la maison' : 'la voiture'));
  if (isHouse) {
    const cap = res.capacity != null ? String(res.capacity) : '';
    const rooms = res.rooms != null ? String(res.rooms) : '';
    const st = _famresaAttr(res.address_street || '');
    const city = _famresaAttr(res.address_city || '');
    const pc = _famresaAttr(res.address_postal_code || '');
    const country = _famresaAttr(res.address_country || '');
    const rawName = _famresaAttr(res.name || '');
    const obs = _famresaAttr(res.observations || '');
    inner.innerHTML = `
      <div class="famresa-cpl-header">
        <button type="button" class="famresa-cpl-back" onclick="famresaRehGoBack()" aria-label="Retour">←</button>
        <span class="famresa-cpl-header-title">Détails · ${titleName}</span>
      </div>
      <div class="famresa-cpl-form ob-fields">
        <div class="input-group">
          <label>Nom</label>
          <input type="text" id="fcg-det-name" value="${rawName}" />
        </div>
        <div class="reh-field-grid">
          <div class="input-group">
            <label>Capacité</label>
            <input type="number" id="fcg-det-cap" min="1" placeholder="6" value="${_famresaAttr(cap)}" />
          </div>
          <div class="input-group">
            <label>Chambres</label>
            <input type="number" id="fcg-det-rooms" min="0" placeholder="3" value="${_famresaAttr(rooms)}" />
          </div>
        </div>
        <div class="input-group">
          <label>Rue</label>
          <input type="text" id="fcg-det-street" placeholder="Rue" value="${st}" />
        </div>
        <div class="input-group">
          <label>Ville</label>
          <input type="text" id="fcg-det-city" placeholder="Ville" value="${city}" />
        </div>
        <div class="reh-field-grid">
          <div class="input-group">
            <label>Code postal</label>
            <input type="text" id="fcg-det-pc" placeholder="33220" value="${pc}" />
          </div>
          <div class="input-group">
            <label>Pays</label>
            <input type="text" id="fcg-det-country" placeholder="France" value="${country}" />
          </div>
        </div>
        <div class="input-group">
          <label>Observations</label>
          <textarea id="fcg-det-obs" class="reh-textarea" rows="2" placeholder="Notes importantes…">${obs}</textarea>
        </div>
        <button type="button" class="btn btn-primary famresa-cpl-save" onclick="famresaRehSaveDetails()">Enregistrer</button>
      </div>`;
    return;
  }
  const seats = res.seatCount ?? res.seats ?? '';
  const ft = res.fuelType || '';
  const km = res.mileageKm != null ? String(res.mileageKm) : '';
  const bt = res.carBluetooth === true ? 'yes' : res.carBluetooth === false ? 'no' : '';
  const lieu = _famresaAttr(res.lieu || res.carLocation || '');
  const rawName = _famresaAttr(res.name || '');
  const plaque = _famresaAttr(res.plaque || '');
  const assurance = _famresaAttr(res.assurance || '');
  const obs = _famresaAttr(res.observations || '');
  inner.innerHTML = `
    <div class="famresa-cpl-header">
      <button type="button" class="famresa-cpl-back" onclick="famresaRehGoBack()" aria-label="Retour">←</button>
      <span class="famresa-cpl-header-title">Détails · ${titleName}</span>
    </div>
    <div class="famresa-cpl-form ob-fields">
      <div class="input-group">
        <label>Nom</label>
        <input type="text" id="fcg-det-name" value="${rawName}" />
      </div>
      <div class="reh-field-grid">
        <div class="input-group">
          <label>Plaque</label>
          <input type="text" id="fcg-det-plaque" placeholder="AB-123-CD" value="${plaque}" style="text-transform:uppercase" />
        </div>
        <div class="input-group">
          <label>Lieu</label>
          <input type="text" id="fcg-det-lieu" placeholder="Parking…" value="${lieu}" />
        </div>
      </div>
      <div class="reh-field-grid">
        <div class="input-group">
          <label>Places</label>
          <input type="number" id="fcg-det-seats" min="1" placeholder="5" value="${_famresaEsc(String(seats))}" />
        </div>
        <div class="input-group">
          <label>Énergie</label>
          <select id="fcg-det-fuel">
            <option value="">—</option>
            <option value="essence" ${ft === 'essence' ? 'selected' : ''}>Essence</option>
            <option value="diesel" ${ft === 'diesel' ? 'selected' : ''}>Diesel</option>
            <option value="electrique" ${ft === 'electrique' ? 'selected' : ''}>Électrique</option>
            <option value="hybride" ${ft === 'hybride' ? 'selected' : ''}>Hybride</option>
          </select>
        </div>
      </div>
      <div class="reh-field-grid">
        <div class="input-group">
          <label>Km</label>
          <input type="text" id="fcg-det-km" placeholder="45 000" value="${_famresaEsc(km)}" />
        </div>
        <div class="input-group">
          <label>Bluetooth</label>
          <select id="fcg-det-bt">
            <option value="">—</option>
            <option value="yes" ${bt === 'yes' ? 'selected' : ''}>Oui</option>
            <option value="no" ${bt === 'no' ? 'selected' : ''}>Non</option>
          </select>
        </div>
      </div>
      <div class="input-group">
        <label>Assurance</label>
        <input type="text" id="fcg-det-assurance" placeholder="Compagnie / n° contrat" value="${assurance}" />
      </div>
      <div class="input-group">
        <label>Observations</label>
        <textarea id="fcg-det-obs" class="reh-textarea" rows="2" placeholder="Notes…">${obs}</textarea>
      </div>
      <button type="button" class="btn btn-primary famresa-cpl-save" onclick="famresaRehSaveDetails()">Enregistrer</button>
    </div>`;
}

function famresaRehRenderGuideMenu(inner, rid, res) {
  const isHouse = res.type === 'house';
  const cin = _famresaEnabledGuideCount(res.checkinGuide);
  const cout = _famresaEnabledGuideCount(res.checkoutGuide);
  const maint = _famresaEnabledGuideCount(res.maintenanceGuide);
  const rows = isHouse
    ? [famresaRehBuildGuideRow("Guide d'entrée", cin > 0 ? 'complete' : 'empty', 'checkin'), famresaRehBuildGuideRow('Guide de sortie', cout > 0 ? 'complete' : 'empty', 'checkout')].join('')
    : famresaRehBuildGuideRow('Entretien', maint > 0 ? 'complete' : 'empty', 'maintenance');
  inner.innerHTML = `
    <div class="famresa-cpl-header">
      <button type="button" class="famresa-cpl-back" onclick="famresaRehGoBack()" aria-label="Retour">←</button>
      <span class="famresa-cpl-header-title">Guide</span>
    </div>
    <p class="famresa-cpl-lead" style="margin-bottom:8px">${isHouse ? 'Arrivée et départ des séjours.' : 'Infos d’entretien pour toute la famille.'}</p>
    <div class="reh-menu-list">${rows}</div>`;
}

async function famresaRehSavePhoto() {
  const rid = window._reh?.resourceId || selectedResource;
  const photoUrl = window._resourcePhotoDraft;
  if (!rid || !photoUrl) {
    if (typeof showToast === 'function') showToast('Choisis une photo');
    return;
  }
  try {
    await ressourcesRef().doc(rid).update({ photoUrl });
    const res = resources.find((r) => r.id === rid);
    if (res) res.photoUrl = photoUrl;
    window._resourcePhotoDraft = null;
    if (typeof showToast === 'function') showToast('Photo enregistrée');
    if (typeof renderResourceTabs === 'function') renderResourceTabs();
    if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
    famresaRehGoBack();
  } catch (e) {
    console.error(e);
    if (typeof showToast === 'function') showToast('Erreur — réessayez');
  }
}

async function famresaRehSaveDetails() {
  const rid = window._reh?.resourceId || selectedResource;
  if (!rid || !window._reh?.active) return;
  const res = resources.find((r) => r.id === rid);
  if (!res) return;
  const nm = (document.getElementById('fcg-det-name')?.value || '').trim();
  if (!nm) {
    if (typeof showToast === 'function') showToast('Indique un nom');
    return;
  }
  try {
    if (res.type === 'house') {
      const capRaw = document.getElementById('fcg-det-cap')?.value;
      const roomsRaw = document.getElementById('fcg-det-rooms')?.value;
      const street = (document.getElementById('fcg-det-street')?.value || '').trim();
      const city = (document.getElementById('fcg-det-city')?.value || '').trim();
      const postalCode = (document.getElementById('fcg-det-pc')?.value || '').trim();
      const country = (document.getElementById('fcg-det-country')?.value || '').trim();
      const observations = (document.getElementById('fcg-det-obs')?.value || '').trim();
      const address = formatStructuredAddress({ street, city, postalCode, country });
      const updates = {
        address,
        address_street: street,
        address_city: city,
        address_postal_code: postalCode,
        address_country: country,
        observations,
        name: nm,
        nom: nm,
      };
      const capTrim = String(capRaw ?? '').trim();
      if (capTrim === '') {
        updates.capacity = null;
        updates.capacite = null;
      } else {
        const capParsed = parseInt(capTrim, 10);
        if (Number.isFinite(capParsed) && capParsed > 0) {
          updates.capacity = capParsed;
          updates.capacite = capParsed;
        }
      }
      const roomsTrim = String(roomsRaw ?? '').trim();
      if (roomsTrim === '') updates.rooms = null;
      else {
        const roomsParsed = parseInt(roomsTrim, 10);
        if (Number.isFinite(roomsParsed) && roomsParsed >= 0) updates.rooms = roomsParsed;
      }
      await ressourcesRef().doc(rid).update(updates);
      Object.assign(res, updates);
    } else {
      const plaque = (document.getElementById('fcg-det-plaque')?.value || '').trim().toUpperCase();
      const lieu = (document.getElementById('fcg-det-lieu')?.value || '').trim();
      const assurance = (document.getElementById('fcg-det-assurance')?.value || '').trim();
      const observations = (document.getElementById('fcg-det-obs')?.value || '').trim();
      const seatRaw = document.getElementById('fcg-det-seats')?.value;
      const seatParsed = parseInt(String(seatRaw || '').trim(), 10);
      const fuelType = (document.getElementById('fcg-det-fuel')?.value || '').trim();
      const mileageRaw = (document.getElementById('fcg-det-km')?.value || '').trim();
      const btRaw = document.getElementById('fcg-det-bt')?.value || '';
      const updates = {
        plaque,
        assurance,
        observations,
        carLocation: lieu,
        lieu,
        name: nm,
        nom: nm,
      };
      if (Number.isFinite(seatParsed) && seatParsed > 0) updates.seatCount = seatParsed;
      else updates.seatCount = null;
      if (fuelType) updates.fuelType = fuelType;
      else updates.fuelType = null;
      if (mileageRaw) {
        const digits = String(mileageRaw).replace(/\D/g, '');
        const n = parseInt(digits, 10);
        updates.mileageKm = digits && Number.isFinite(n) ? n : mileageRaw;
      } else updates.mileageKm = null;
      if (btRaw === 'yes') updates.carBluetooth = true;
      else if (btRaw === 'no') updates.carBluetooth = false;
      else updates.carBluetooth = null;
      await ressourcesRef().doc(rid).update(updates);
      Object.assign(res, updates);
    }
    if (typeof showToast === 'function') showToast('Modifications enregistrées');
    if (typeof renderResourceTabs === 'function') renderResourceTabs();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
    if (typeof renderProfileTab === 'function') renderProfileTab();
    famresaRehGoBack();
  } catch (e) {
    console.error(e);
    if (typeof showToast === 'function') showToast('Erreur — réessayez');
  }
}

function famresaCompletionRowAction(action) {
  const rid = selectedResource;
  if (!rid) return;
  if (action === 'profile_photo') {
    famresaCloseCompletionOverlay();
    if (typeof showEditProfileSheet === 'function') showEditProfileSheet();
    return;
  }
  if (action === 'resource_photo') {
    famresaCloseCompletionOverlay();
    if (typeof showCarInfo === 'function') showCarInfo();
    return;
  }
  if (action === 'resource_infos') {
    famresaOpenCompletionDetailsForm();
    return;
  }
  if (action === 'checkin_guide') {
    famresaCloseCompletionOverlay();
    if (typeof famresaOpenGuideEditor === 'function') famresaOpenGuideEditor('checkin', rid);
    return;
  }
  if (action === 'checkout_guide') {
    famresaCloseCompletionOverlay();
    if (typeof famresaOpenGuideEditor === 'function') famresaOpenGuideEditor('checkout', rid);
    return;
  }
}

function _famresaEsc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function _famresaAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function famresaOpenCompletionDetailsForm() {
  const rid = selectedResource;
  const res = resources.find((r) => r.id === rid);
  const inner = document.getElementById('completion-overlay-inner');
  const overlay = document.getElementById('completion-overlay');
  if (!inner || !overlay || !res) return;
  const isHouse = res.type === 'house';
  const titleName = _famresaEsc(res.name || (isHouse ? 'Ma maison' : 'Ma voiture'));

  if (isHouse) {
    const cap = res.capacity != null ? String(res.capacity) : '';
    const rooms = res.rooms != null ? String(res.rooms) : '';
    const st = _famresaAttr(res.address_street || '');
    const city = _famresaAttr(res.address_city || '');
    const pc = _famresaAttr(res.address_postal_code || '');
    const country = _famresaAttr(res.address_country || '');
    const rawName = _famresaAttr(res.name || '');
    inner.innerHTML = `
      <div class="famresa-cpl-header">
        <button type="button" class="famresa-cpl-back" onclick="famresaOpenCompletionList()" aria-label="Retour">←</button>
        <span class="famresa-cpl-header-title">Détails de ${titleName}</span>
      </div>
      <div class="famresa-cpl-form ob-fields">
        <div class="input-group">
          <label>Nom</label>
          <input type="text" id="fcg-det-name" value="${rawName}" />
        </div>
        <div class="input-group">
          <label>Capacité (personnes)</label>
          <input type="number" id="fcg-det-cap" min="1" placeholder="Ex : 6" value="${_famresaAttr(cap)}" />
        </div>
        <div class="input-group">
          <label>Chambres</label>
          <input type="number" id="fcg-det-rooms" min="0" placeholder="Ex : 3" value="${_famresaAttr(rooms)}" />
        </div>
        <div class="input-group">
          <label>Rue</label>
          <input type="text" id="fcg-det-street" placeholder="Rue" value="${st}" />
        </div>
        <div class="input-group">
          <label>Ville</label>
          <input type="text" id="fcg-det-city" placeholder="Ville" value="${city}" />
        </div>
        <div class="input-group">
          <label>Code postal</label>
          <input type="text" id="fcg-det-pc" placeholder="Code postal" value="${pc}" />
        </div>
        <div class="input-group">
          <label>Pays</label>
          <input type="text" id="fcg-det-country" placeholder="Pays" value="${country}" />
        </div>
        <button type="button" class="btn btn-primary famresa-cpl-save" onclick="famresaSaveCompletionDetails()">Enregistrer</button>
      </div>`;
  } else {
    const seats = res.seatCount ?? res.seats ?? '';
    const ft = res.fuelType || '';
    const km = res.mileageKm != null ? String(res.mileageKm) : '';
    const bt = res.carBluetooth === true ? 'yes' : res.carBluetooth === false ? 'no' : '';
    const lieu = _famresaAttr(res.lieu || res.carLocation || '');
    const rawName = _famresaAttr(res.name || '');
    inner.innerHTML = `
      <div class="famresa-cpl-header">
        <button type="button" class="famresa-cpl-back" onclick="famresaOpenCompletionList()" aria-label="Retour">←</button>
        <span class="famresa-cpl-header-title">Détails de ${titleName}</span>
      </div>
      <div class="famresa-cpl-form ob-fields">
        <div class="input-group">
          <label>Nom</label>
          <input type="text" id="fcg-det-name" value="${rawName}" />
        </div>
        <div class="input-group">
          <label>Places</label>
          <input type="number" id="fcg-det-seats" min="1" placeholder="Ex : 5" value="${_famresaEsc(String(seats))}" />
        </div>
        <div class="input-group">
          <label>Énergie</label>
          <select id="fcg-det-fuel">
            <option value="">—</option>
            <option value="essence" ${ft === 'essence' ? 'selected' : ''}>Essence</option>
            <option value="diesel" ${ft === 'diesel' ? 'selected' : ''}>Diesel</option>
            <option value="electrique" ${ft === 'electrique' ? 'selected' : ''}>Électrique</option>
            <option value="hybride" ${ft === 'hybride' ? 'selected' : ''}>Hybride</option>
          </select>
        </div>
        <div class="input-group">
          <label>Kilométrage</label>
          <input type="text" id="fcg-det-km" placeholder="Ex : 45 000" value="${_famresaEsc(km)}" />
        </div>
        <div class="input-group">
          <label>Bluetooth</label>
          <select id="fcg-det-bt">
            <option value="">—</option>
            <option value="yes" ${bt === 'yes' ? 'selected' : ''}>Oui</option>
            <option value="no" ${bt === 'no' ? 'selected' : ''}>Non</option>
          </select>
        </div>
        <div class="input-group">
          <label>Lieu habituel</label>
          <input type="text" id="fcg-det-lieu" placeholder="Ex : Garage rue des Lilas" value="${lieu}" />
        </div>
        <button type="button" class="btn btn-primary famresa-cpl-save" onclick="famresaSaveCompletionDetails()">Enregistrer</button>
      </div>`;
  }
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

async function _famresaPersistFcgDetailForm(afterSave) {
  const rid = selectedResource;
  if (!rid || !resourceRepository?.updatePartial) return;
  const res = resources.find((r) => r.id === rid);
  if (!res) return;
  const isHouse = res.type === 'house';
  const nm = (document.getElementById('fcg-det-name')?.value || '').trim();
  if (!nm) {
    if (typeof showToast === 'function') showToast('Indique un nom');
    return;
  }
  try {
    if (isHouse) {
      const cap = parseInt(String(document.getElementById('fcg-det-cap')?.value || ''), 10);
      const rooms = parseInt(String(document.getElementById('fcg-det-rooms')?.value || ''), 10);
      const patch = {
        nom: nm,
        name: nm,
        address_street: (document.getElementById('fcg-det-street')?.value || '').trim(),
        address_city: (document.getElementById('fcg-det-city')?.value || '').trim(),
        address_postal_code: (document.getElementById('fcg-det-pc')?.value || '').trim(),
        address_country: (document.getElementById('fcg-det-country')?.value || '').trim(),
      };
      if (Number.isFinite(cap) && cap > 0) patch.capacity = cap;
      if (Number.isFinite(rooms) && rooms >= 0) patch.rooms = rooms;
      await resourceRepository.updatePartial(rid, patch);
      famresaPatchResourceLocal(rid, {
        name: nm,
        nom: nm,
        capacity: patch.capacity ?? res.capacity,
        rooms: patch.rooms ?? res.rooms,
        address_street: patch.address_street,
        address_city: patch.address_city,
        address_postal_code: patch.address_postal_code,
        address_country: patch.address_country,
      });
    } else {
      const seats = parseInt(String(document.getElementById('fcg-det-seats')?.value || ''), 10);
      const ft = (document.getElementById('fcg-det-fuel')?.value || '').trim();
      const km = (document.getElementById('fcg-det-km')?.value || '').trim();
      const btv = document.getElementById('fcg-det-bt')?.value || '';
      const lieu = (document.getElementById('fcg-det-lieu')?.value || '').trim();
      const patch = {
        nom: nm,
        name: nm,
        fuelType: ft,
        mileageKm: km,
        lieu,
        carLocation: lieu,
      };
      if (Number.isFinite(seats) && seats > 0) patch.seatCount = seats;
      if (btv === 'yes') patch.carBluetooth = true;
      else if (btv === 'no') patch.carBluetooth = false;
      await resourceRepository.updatePartial(rid, patch);
      famresaPatchResourceLocal(rid, {
        name: nm,
        nom: nm,
        seatCount: patch.seatCount ?? res.seatCount,
        fuelType: ft,
        mileageKm: km || null,
        lieu,
        carLocation: lieu,
        carBluetooth: btv === 'yes' ? true : btv === 'no' ? false : res.carBluetooth,
      });
    }
    if (typeof showToast === 'function') showToast('Modifications enregistrées');
    if (typeof afterSave === 'function') afterSave();
    if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
  } catch (e) {
    console.error(e);
    if (typeof showToast === 'function') showToast('Erreur — réessayez');
  }
}

async function famresaSaveCompletionDetails() {
  await _famresaPersistFcgDetailForm(() => famresaOpenCompletionList());
}
