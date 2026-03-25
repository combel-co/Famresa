// ==========================================
// UI HELPERS
// ==========================================
function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function closeSheet() {
  document.getElementById('overlay').classList.remove('open');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// Reusable PIN input setup (auto-advance, backspace, auto-submit)
function setupPinInputs(inputs, onComplete) {
  let _completing = false;
  const guardedComplete = onComplete ? () => {
    if (_completing) return;
    _completing = true;
    onComplete();
    setTimeout(() => { _completing = false; }, 1000);
  } : null;

  inputs.forEach((input, i) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val.length > 1) e.target.value = val.slice(-1);
      if (val && i < inputs.length - 1) inputs[i + 1].focus();
      if (i === inputs.length - 1 && val && guardedComplete) guardedComplete();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) inputs[i - 1].focus();
      if (e.key === 'Enter' && guardedComplete) guardedComplete();
    });
  });
}

function resizePhotoFile(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 120; canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - min)/2, (img.height - min)/2, min, min, 0, 0, size, size);
      callback(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function handlePhoto(input) {
  resizePhotoFile(input.files[0], (dataUrl) => {
    tempPhoto = dataUrl;
    const preview = document.getElementById('photo-preview');
    if (preview) { preview.innerHTML = `<img src="${dataUrl}" alt="">`; preview.classList.add('has-photo'); }
  });
}

function updateUserPill() {
  const avatar = document.getElementById('header-avatar');
  const name = document.getElementById('header-name');
  if (currentUser) {
    name.textContent = currentUser.name;
    avatar.innerHTML = currentUser.photo ? `<img src="${currentUser.photo}" alt="">` : getInitials(currentUser.name);
  } else {
    avatar.innerHTML = '?';
    name.textContent = 'Se connecter';
  }
}

function _syncHeaderHeight() {
  var h = document.getElementById('app-header');
  if (h && h.offsetHeight > 0)
    document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
}

function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.style.display = 'none', 300);
  }
}

function showSkeleton() {
  hideSplash();
  document.getElementById('skeleton-screen').style.display = 'block';
}

function hideSkeleton() {
  document.getElementById('skeleton-screen').style.display = 'none';
}

function enterApp(targetTab) {
  hideSplash();
  hideSkeleton();
  const header = document.getElementById('app-header');
  header.style.display = 'flex';
  header.style.visibility = 'visible';
  document.getElementById('app-main').style.display = 'block';
  // Sync CSS variable to actual rendered header height (fixes sticky gap on all screen sizes)
  requestAnimationFrame(_syncHeaderHeight);
  updateUserPill();
  loadFamilyName();
  switchTab(targetTab || activeTab || 'dashboard');
  renderCalendar();
  _initPullToRefresh();
  setTimeout(() => maybePromptPendingFuel(), 350);
}

let _pullToRefreshBound = false;
let _ptrStartY = 0;
let _ptrArmed = false;
const _PTR_THRESHOLD = 160;
const _PTR_CIRCUMFERENCE = 94.25; // 2 * π * 15

function _isAppVisible() {
  const appMain = document.getElementById('app-main');
  return !!appMain && appMain.style.display !== 'none';
}

function _initPullToRefresh() {
  if (_pullToRefreshBound) return;
  _pullToRefreshBound = true;

  const indicator = document.getElementById('ptr-indicator');
  const fillCircle = indicator?.querySelector('.ptr-fill');

  window.addEventListener('touchstart', (e) => {
    if (!_isAppVisible()) { _ptrArmed = false; return; }
    if (document.querySelector('#overlay.open, #booking-modal.open')) { _ptrArmed = false; return; }
    const main = document.getElementById('app-main');
    const atTop = main ? main.scrollTop <= 0 : (window.scrollY || 0) <= 0;
    if (!atTop) { _ptrArmed = false; return; }
    _ptrStartY = e.touches?.[0]?.clientY || 0;
    _ptrArmed = true;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!_ptrArmed || !indicator || !fillCircle) return;
    const currentY = e.touches?.[0]?.clientY || 0;
    const delta = currentY - _ptrStartY;
    if (delta <= 0) {
      indicator.style.height = '0';
      indicator.classList.remove('active');
      return;
    }

    // Progress from 0 to 1 based on pull distance
    const progress = Math.min(delta / _PTR_THRESHOLD, 1);
    const indicatorH = Math.min(delta * 0.45, 48);
    indicator.classList.add('active');
    indicator.style.height = indicatorH + 'px';
    fillCircle.style.strokeDashoffset = _PTR_CIRCUMFERENCE * (1 - progress);

    if (progress >= 1) {
      _ptrArmed = false;
      indicator.classList.remove('active');
      indicator.classList.add('refreshing');
      indicator.style.height = '';
      showToast('Actualisation…');
      setTimeout(() => location.reload(), 400);
    }
  }, { passive: true });

  function _ptrReset() {
    if (!_ptrArmed && indicator?.classList.contains('refreshing')) return;
    _ptrArmed = false;
    if (indicator) {
      indicator.classList.remove('active');
      indicator.style.height = '0';
    }
    if (fillCircle) fillCircle.style.strokeDashoffset = _PTR_CIRCUMFERENCE;
  }

  window.addEventListener('touchend', _ptrReset, { passive: true });
  window.addEventListener('touchcancel', _ptrReset, { passive: true });
}
