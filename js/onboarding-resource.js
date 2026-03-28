// ==========================================
// FIRST RESOURCE ONBOARDING (full-screen, post-signup / cold resume)
// ==========================================

window._froState = { type: null, familyId: null, photoHouse: null, photoCar: null };

function _froShowOnly(stepId) {
  ['fro-step-intro', 'fro-step-family', 'fro-step-house', 'fro-step-car'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== stepId);
  });
}

function _froResetTypeButtons() {
  const h = document.getElementById('fro-pick-house');
  const c = document.getElementById('fro-pick-car');
  if (h) h.className = 'btn btn-outline fro-type-btn';
  if (c) c.className = 'btn btn-outline fro-type-btn';
}

function startFirstResourceOnboarding() {
  if (!currentUser?.id) return;
  document.body.classList.add('auth-mode');
  const header = document.getElementById('app-header');
  const main = document.getElementById('app-main');
  const nav = document.querySelector('.bottom-nav');
  if (header) header.style.display = 'none';
  if (main) main.style.display = 'none';
  if (nav) nav.style.display = 'none';
  if (typeof hideSplash === 'function') hideSplash();
  if (typeof hideSkeleton === 'function') hideSkeleton();

  window._froState = { type: null, familyId: null, photoHouse: null, photoCar: null };
  _froResetTypeButtons();
  const fe = document.getElementById('fro-intro-error');
  const ff = document.getElementById('fro-family-error');
  const fh = document.getElementById('fro-house-error');
  const fc = document.getElementById('fro-car-error');
  if (fe) fe.textContent = '';
  if (ff) ff.textContent = '';
  if (fh) fh.textContent = '';
  if (fc) fc.textContent = '';
  const fn = document.getElementById('fro-family-name');
  if (fn) fn.value = '';
  _froClearResourceInputs();

  _froShowOnly('fro-step-intro');
  document.getElementById('first-resource-onboarding')?.classList.remove('hidden');
}

function _froClearResourceInputs() {
  const ids = [
    'fro-house-name', 'fro-house-capacity', 'fro-house-rooms',
    'fro-house-street', 'fro-house-city', 'fro-house-postal', 'fro-house-country',
    'fro-car-name', 'fro-car-seats', 'fro-car-mileage', 'fro-car-lieu'
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const fuel = document.getElementById('fro-car-fuel');
  if (fuel) fuel.value = '';
  const bt = document.getElementById('fro-car-bluetooth');
  if (bt) bt.value = '';
  const phPrev = document.getElementById('fro-house-photo-preview');
  const pcPrev = document.getElementById('fro-car-photo-preview');
  if (phPrev) {
    phPrev.innerHTML = '📷';
    phPrev.classList.remove('has-photo');
  }
  if (pcPrev) {
    pcPrev.innerHTML = '📷';
    pcPrev.classList.remove('has-photo');
  }
  window._froState.photoHouse = null;
  window._froState.photoCar = null;
}

function froPickType(type) {
  window._froState.type = type === 'house' ? 'house' : 'car';
  const h = document.getElementById('fro-pick-house');
  const c = document.getElementById('fro-pick-car');
  if (h) h.className = `btn fro-type-btn ${type === 'house' ? 'btn-primary' : 'btn-outline'}`;
  if (c) c.className = `btn fro-type-btn ${type === 'car' ? 'btn-primary' : 'btn-outline'}`;
  const err = document.getElementById('fro-intro-error');
  if (err) err.textContent = '';
}

function froIntroNext() {
  const err = document.getElementById('fro-intro-error');
  if (!window._froState.type) {
    if (err) err.textContent = 'Choisis maison ou voiture';
    return;
  }
  if (err) err.textContent = '';
  _froShowOnly('fro-step-family');
}

function froBackToIntro() {
  const err = document.getElementById('fro-family-error');
  if (err) err.textContent = '';
  _froShowOnly('fro-step-intro');
}

async function froFamilyNext() {
  const err = document.getElementById('fro-family-error');
  const name = (document.getElementById('fro-family-name')?.value || '').trim();
  if (!name) {
    if (err) err.textContent = 'Indique le nom de l’espace';
    return;
  }
  if (err) err.textContent = '';
  try {
    const fid = await createFamilyForOnboarding(name);
    window._froState.familyId = fid;
    if (window._froState.type === 'house') {
      _froShowOnly('fro-step-house');
    } else {
      _froShowOnly('fro-step-car');
    }
  } catch (e) {
    if (err) err.textContent = 'Erreur — réessaie';
    console.error(e);
  }
}

function froBackToFamily() {
  const fh = document.getElementById('fro-house-error');
  const fc = document.getElementById('fro-car-error');
  if (fh) fh.textContent = '';
  if (fc) fc.textContent = '';
  _froShowOnly('fro-step-family');
}

function froHousePhoto(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  resizePhotoFile(
    f,
    (dataUrl) => {
      window._froState.photoHouse = dataUrl;
      const prev = document.getElementById('fro-house-photo-preview');
      if (prev) {
        prev.innerHTML = `<img src="${dataUrl}" alt="">`;
        prev.classList.add('has-photo');
      }
    },
    window.PHOTO_PRESET_RESOURCE || window.PHOTO_PRESET_AVATAR
  );
}

function froCarPhoto(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  resizePhotoFile(
    f,
    (dataUrl) => {
      window._froState.photoCar = dataUrl;
      const prev = document.getElementById('fro-car-photo-preview');
      if (prev) {
        prev.innerHTML = `<img src="${dataUrl}" alt="">`;
        prev.classList.add('has-photo');
      }
    },
    window.PHOTO_PRESET_RESOURCE || window.PHOTO_PRESET_AVATAR
  );
}

async function froSubmitHouse() {
  const errEl = document.getElementById('fro-house-error');
  if (errEl) errEl.textContent = '';
  const name = (document.getElementById('fro-house-name')?.value || '').trim();
  if (!name) {
    if (errEl) errEl.textContent = 'Donne un nom à ta maison';
    return;
  }
  const fid = window._froState.familyId;
  if (!fid) {
    if (errEl) errEl.textContent = 'Étape famille manquante — recharge la page';
    return;
  }
  try {
    const payload = {
      familyId: fid,
      type: 'house',
      name,
      photoUrl: window._froState.photoHouse || null,
      capacity: document.getElementById('fro-house-capacity')?.value,
      rooms: document.getElementById('fro-house-rooms')?.value,
      address_street: document.getElementById('fro-house-street')?.value,
      address_city: document.getElementById('fro-house-city')?.value,
      address_postal_code: document.getElementById('fro-house-postal')?.value,
      address_country: document.getElementById('fro-house-country')?.value,
    };
    const resourceId = await createResourceFromOnboarding(payload);
    await loadResources({ suppressEmptyWelcomeUI: true });
    try {
      await loadFamilyName();
    } catch (_) {}
    document.getElementById('first-resource-onboarding')?.classList.add('hidden');
    document.body.classList.remove('auth-mode');
    if (typeof celebrateOnboardingResourceCreated === 'function') {
      celebrateOnboardingResourceCreated({
        resourceId,
        resourceName: name,
        isHouse: true,
      });
    }
  } catch (e) {
    console.error(e);
    if (errEl) errEl.textContent = 'Erreur — réessaie';
  }
}

async function froSubmitCar() {
  const errEl = document.getElementById('fro-car-error');
  if (errEl) errEl.textContent = '';
  const name = (document.getElementById('fro-car-name')?.value || '').trim();
  if (!name) {
    if (errEl) errEl.textContent = 'Donne un nom à ta voiture';
    return;
  }
  const fid = window._froState.familyId;
  if (!fid) {
    if (errEl) errEl.textContent = 'Étape famille manquante — recharge la page';
    return;
  }
  const btRaw = document.getElementById('fro-car-bluetooth')?.value;
  let carBluetooth = null;
  if (btRaw === 'true') carBluetooth = true;
  else if (btRaw === 'false') carBluetooth = false;

  try {
    const payload = {
      familyId: fid,
      type: 'car',
      name,
      photoUrl: window._froState.photoCar || null,
      seats: document.getElementById('fro-car-seats')?.value,
      fuelType: document.getElementById('fro-car-fuel')?.value,
      mileageKm: document.getElementById('fro-car-mileage')?.value,
      carBluetooth,
      lieu: document.getElementById('fro-car-lieu')?.value,
    };
    const resourceId = await createResourceFromOnboarding(payload);
    await loadResources({ suppressEmptyWelcomeUI: true });
    try {
      await loadFamilyName();
    } catch (_) {}
    document.getElementById('first-resource-onboarding')?.classList.add('hidden');
    document.body.classList.remove('auth-mode');
    if (typeof celebrateOnboardingResourceCreated === 'function') {
      celebrateOnboardingResourceCreated({
        resourceId,
        resourceName: name,
        isHouse: false,
      });
    }
  } catch (e) {
    console.error(e);
    if (errEl) errEl.textContent = 'Erreur — réessaie';
  }
}

window._onboardingCopyInviteLink = async function _onboardingCopyInviteLink(resourceId) {
  if (!resourceId || typeof resourceService === 'undefined') {
    showToast('Impossible de copier');
    return;
  }
  try {
    const inv = await resourceService.ensureManageInviteInfo({
      resourceId,
      origin: location.origin,
      pathname: location.pathname,
    });
    await navigator.clipboard.writeText(inv.shareUrl);
    showToast('Lien copié !');
  } catch (e) {
    showToast('Impossible de copier le lien');
  }
};

window._onboardingNativeShareResource = async function _onboardingNativeShareResource(resourceId, title) {
  if (!resourceId || typeof resourceService === 'undefined') {
    showToast('Partage indisponible');
    return;
  }
  try {
    const inv = await resourceService.ensureManageInviteInfo({
      resourceId,
      origin: location.origin,
      pathname: location.pathname,
    });
    if (navigator.share) {
      await navigator.share({
        title: title || 'FamResa',
        text: 'Rejoins cette ressource sur FamResa',
        url: inv.shareUrl,
      });
    } else {
      await navigator.clipboard.writeText(inv.shareUrl);
      showToast('Lien copié !');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    showToast('Partage indisponible');
  }
};
