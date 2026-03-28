// ==========================================
// FLOWS E — Complétion progressive (dashboard + liste + détails)
// ==========================================

function famresaCompletionDismissKey(resourceId) {
  const uid = currentUser?.id || 'anon';
  return `famresa_completion_dismiss_${uid}_${resourceId}`;
}

function famresaIsCompletionDismissed(resourceId) {
  try {
    return localStorage.getItem(famresaCompletionDismissKey(resourceId)) === '1';
  } catch (_) {
    return false;
  }
}

function famresaDismissCompletionCard(resourceId) {
  try {
    localStorage.setItem(famresaCompletionDismissKey(resourceId), '1');
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
    const ci = String(res.checkIn || res.checkin || '').trim();
    const co = String(res.checkOut || res.checkout || '').trim();
    const addrOk = typeof hasUsableResourceAddress === 'function' && hasUsableResourceAddress(res);
    const checks = [capOk, roomsOk, !!ci, !!co, addrOk];
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
  const res = resources.find((r) => r.id === rid);
  const pct = total ? Math.round((done / total) * 100) : 100;
  const rows = tasks
    .map((t) => {
      const right = t.done
        ? `<span class="famresa-cpl-row__ok">✓</span><span class="famresa-cpl-row__muted">${t.id === 'resource_infos' && t.done ? 'Complets' : t.detail || 'Ajoutée'}</span>`
        : `<span class="famresa-cpl-row__warn">${t.detail || 'À faire'}</span><span class="famresa-cpl-row__chev">›</span>`;
      return `<button type="button" class="famresa-cpl-row" onclick="famresaCompletionRowAction('${t.action}')">
        <span class="famresa-cpl-row__label">${_famresaEsc(t.label)}</span>
        <span class="famresa-cpl-row__right">${right}</span>
      </button>`;
    })
    .join('');
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
    const ci = _famresaAttr(res.checkIn || res.checkin || '');
    const co = _famresaAttr(res.checkOut || res.checkout || '');
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
          <label>Heure d'arrivée</label>
          <input type="text" id="fcg-det-ci" placeholder="Ex : 16:00" value="${ci}" />
        </div>
        <div class="input-group">
          <label>Heure de départ</label>
          <input type="text" id="fcg-det-co" placeholder="Ex : 11:00" value="${co}" />
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
}

async function famresaSaveCompletionDetails() {
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
      const ci = (document.getElementById('fcg-det-ci')?.value || '').trim();
      const co = (document.getElementById('fcg-det-co')?.value || '').trim();
      const patch = {
        nom: nm,
        name: nm,
        checkIn: ci,
        checkOut: co,
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
        checkIn: document.getElementById('fcg-det-ci')?.value || '',
        checkOut: document.getElementById('fcg-det-co')?.value || '',
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
    famresaOpenCompletionList();
    if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
  } catch (e) {
    console.error(e);
    if (typeof showToast === 'function') showToast('Erreur — réessayez');
  }
}
