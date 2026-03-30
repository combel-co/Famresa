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

/** Petit (a) vs grand (A) — localStorage famresa_ui_scale: 'normal' | 'large', défaut appliqué: grand */
function setTextSizePreference(isLarge) {
  try {
    var root = document.documentElement;
    if (isLarge) {
      root.classList.add('ui-large');
      localStorage.setItem('famresa_ui_scale', 'large');
    } else {
      root.classList.remove('ui-large');
      localStorage.setItem('famresa_ui_scale', 'normal');
    }
    syncPfTextSizeToggle();
    var h = document.getElementById('app-header');
    if (h && h.offsetHeight > 0) {
      root.style.setProperty('--header-h', h.offsetHeight + 'px');
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        if (typeof syncResourceTabsHeight === 'function') syncResourceTabsHeight();
      });
    } else if (typeof syncResourceTabsHeight === 'function') {
      syncResourceTabsHeight();
    }
  } catch (e) {}
}

function syncPfTextSizeToggle() {
  var large = document.documentElement.classList.contains('ui-large');
  var bSmall = document.getElementById('pf-text-size-small');
  var bLarge = document.getElementById('pf-text-size-large');
  if (bSmall) bSmall.setAttribute('aria-pressed', large ? 'false' : 'true');
  if (bLarge) bLarge.setAttribute('aria-pressed', large ? 'true' : 'false');
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    syncPfTextSizeToggle();
  });
}

// Reusable PIN input setup (auto-advance, backspace, auto-submit)
function setupPinInputs(inputs, onComplete, options) {
  const opts = options || {};
  const maskDelayMs = typeof opts.maskDelayMs === 'number' ? opts.maskDelayMs : 1500;
  const maskChar = typeof opts.maskChar === 'string' && opts.maskChar.length ? opts.maskChar : '•';

  let _completing = false;
  const guardedComplete = onComplete ? () => {
    if (_completing) return;
    _completing = true;
    onComplete();
    setTimeout(() => { _completing = false; }, 1000);
  } : null;

  const list = Array.from(inputs || []);

  function _clearMaskTimer(input) {
    if (input && input.__pinMaskTimerId) {
      clearTimeout(input.__pinMaskTimerId);
      input.__pinMaskTimerId = null;
    }
  }

  function _setRealValue(input, digit) {
    _clearMaskTimer(input);
    if (!digit) {
      delete input.dataset.pinValue;
      input.value = '';
      return;
    }
    input.dataset.pinValue = digit;
    input.value = digit;
    input.__pinMaskTimerId = setTimeout(() => {
      // Only mask if value hasn't been cleared/changed since scheduling
      if (input.dataset.pinValue === digit) input.value = maskChar;
    }, maskDelayMs);
  }

  function _getRealValue(input) {
    const dv = input?.dataset?.pinValue;
    if (dv && /^\d$/.test(dv)) return dv;
    const v = String(input?.value || '').replace(/\D/g, '');
    return v ? v.slice(-1) : '';
  }

  function _isComplete() {
    return list.every((inp) => !!_getRealValue(inp));
  }

  function _maybeComplete() {
    if (guardedComplete && _isComplete()) guardedComplete();
  }

  function _focusNext(fromIdx) {
    for (let j = fromIdx + 1; j < list.length; j++) {
      if (!_getRealValue(list[j])) {
        _focusInput(list[j]);
        return;
      }
    }
    // Otherwise, keep focus on last
    _focusInput(list[list.length - 1]);
  }

  function _focusPrev(fromIdx) {
    for (let j = fromIdx - 1; j >= 0; j--) {
      _focusInput(list[j]);
      return;
    }
  }

  function _focusInput(input) {
    if (!input) return;
    // iOS Safari is sometimes flaky when moving focus inside the same input event.
    // Queue a micro-delay and a frame to make the transition reliable.
    const applyFocus = () => {
      try {
        input.focus();
        if (typeof input.select === 'function') input.select();
      } catch (_) {}
    };
    setTimeout(() => {
      applyFocus();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(applyFocus);
    }, 0);
  }

  list.forEach((input, i) => {
    if (input.__pinListenersBound) return;
    input.__pinListenersBound = true;
    input.autocomplete = 'one-time-code';

    input.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      const digits = String(text).replace(/\D/g, '');
      if (!digits) return;
      e.preventDefault();

      let idx = i;
      for (const ch of digits) {
        if (idx >= list.length) break;
        _setRealValue(list[idx], ch);
        idx++;
      }
      if (idx < list.length) _focusInput(list[idx]);
      else _focusInput(list[list.length - 1]);
      _maybeComplete();
    });

    input.addEventListener('input', (e) => {
      const raw = String(e.target.value || '');
      const digits = raw.replace(/\D/g, '');

      // If user typed multiple chars (mobile autofill), distribute like a paste
      if (digits.length > 1) {
        let idx = i;
        for (const ch of digits) {
          if (idx >= list.length) break;
          _setRealValue(list[idx], ch);
          idx++;
        }
        if (idx < list.length) _focusInput(list[idx]);
        else _focusInput(list[list.length - 1]);
        _maybeComplete();
        return;
      }

      const digit = digits ? digits.slice(-1) : '';
      _setRealValue(input, digit);

      if (digit) {
        if (i < list.length - 1) _focusNext(i);
        _maybeComplete();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        const hasReal = !!_getRealValue(input);
        const isMasked = input.value === maskChar && hasReal;

        if (isMasked || input.value) {
          // Clear current digit first
          e.preventDefault();
          _setRealValue(input, '');
          return;
        }

        // If already empty, go to previous
        if (i > 0) _focusPrev(i);
        return;
      }

      if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); _focusInput(list[i - 1]); }
      if (e.key === 'ArrowRight' && i < list.length - 1) { e.preventDefault(); _focusInput(list[i + 1]); }
      if (e.key === 'Enter' && guardedComplete) guardedComplete();
    });
  });
}

function clearPinInputs(selectorOrInputs) {
  const inputs = typeof selectorOrInputs === 'string'
    ? document.querySelectorAll(selectorOrInputs)
    : selectorOrInputs;
  Array.from(inputs || []).forEach((input) => {
    if (!input) return;
    if (input.__pinMaskTimerId) {
      clearTimeout(input.__pinMaskTimerId);
      input.__pinMaskTimerId = null;
    }
    delete input.dataset.pinValue;
    input.value = '';
  });
}

function getPinFromInputs(selectorOrInputs) {
  const inputs = typeof selectorOrInputs === 'string'
    ? document.querySelectorAll(selectorOrInputs)
    : selectorOrInputs;
  return Array.from(inputs || [])
    .map((i) => (i?.dataset?.pinValue || String(i?.value || '')).replace(/\D/g, ''))
    .join('');
}

/** Avatar / profil (Firestore, petit champ). */
window.PHOTO_PRESET_AVATAR = { maxSize: 448, quality: 0.84 };
/** Photo ressource (bandeau dashboard plein largeur). */
window.PHOTO_PRESET_RESOURCE = { maxSize: 1024, quality: 0.86 };

function resizePhotoFile(file, callback, options) {
  if (!file) return;
  const opts = Object.assign({}, window.PHOTO_PRESET_AVATAR, options || {});
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const side = Math.min(img.width, img.height);
      const out = Math.min(opts.maxSize, side);
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        out,
        out
      );
      callback(canvas.toDataURL('image/jpeg', opts.quality));
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
  }, window.PHOTO_PRESET_AVATAR);
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

if (!window.__splashController) {
  window.__splashController = {
    minMs: 1400,
    startedAt: Date.now(),
    hideTimerId: null,
    hiding: false,
    lifecycleBound: false,
    wasHidden: false,
    lastResumeAt: 0,
  };
}

function showSplash(options) {
  const opts = options || {};
  const ctrl = window.__splashController;
  const splash = document.getElementById('splash-screen');
  if (!ctrl || !splash) return;

  if (ctrl.hideTimerId) {
    clearTimeout(ctrl.hideTimerId);
    ctrl.hideTimerId = null;
  }

  if (opts.resetTimer !== false) ctrl.startedAt = Date.now();
  ctrl.hiding = false;

  splash.style.display = 'flex';
  splash.style.opacity = '1';

  // Restart the progress animation each time splash is shown.
  const bar = document.getElementById('splash-bar');
  if (bar) {
    bar.style.animation = 'none';
    // Force reflow before re-applying animation.
    void bar.offsetWidth;
    bar.style.animation = 'splashFill 1.4s cubic-bezier(0.4,0,0.2,1) forwards';
  }
}

function hideSplash() {
  const ctrl = window.__splashController;
  if (window.__startupCacheCheckPending) {
    window.__startupHideSplashRequested = true;
    return;
  }

  if (!ctrl) return;

  const remainingMs = Math.max(0, ctrl.minMs - (Date.now() - ctrl.startedAt));
  if (remainingMs > 0) {
    if (ctrl.hideTimerId) clearTimeout(ctrl.hideTimerId);
    ctrl.hideTimerId = setTimeout(() => {
      ctrl.hideTimerId = null;
      hideSplash();
    }, remainingMs);
    return;
  }

  const splash = document.getElementById('splash-screen');
  if (!splash || ctrl.hiding) return;
  ctrl.hiding = true;
  splash.style.opacity = '0';
  setTimeout(() => {
    splash.style.display = 'none';
    ctrl.hiding = false;
  }, 300);
}

function _initSplashLifecycle() {
  const ctrl = window.__splashController;
  if (!ctrl || ctrl.lifecycleBound) return;
  ctrl.lifecycleBound = true;

  function _resumeWithSplash() {
    const now = Date.now();
    if (now - ctrl.lastResumeAt < 1000) return; // guard double events on iOS
    ctrl.lastResumeAt = now;
    showSplash({ resetTimer: true });
    hideSplash();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      ctrl.wasHidden = true;
      return;
    }
    if (document.visibilityState === 'visible' && ctrl.wasHidden) {
      ctrl.wasHidden = false;
      _resumeWithSplash();
    }
  });

  window.addEventListener('pageshow', (e) => {
    // On iOS, pageshow can fire when returning from bfcache/background.
    if (e.persisted || ctrl.wasHidden) _resumeWithSplash();
  });
}

_initSplashLifecycle();

function showSkeleton() {
  hideSplash();
  document.getElementById('skeleton-screen').style.display = 'block';
}

function hideSkeleton() {
  document.getElementById('skeleton-screen').style.display = 'none';
}

function _syncSheetBottomOffset() {
  const nav = document.querySelector('.bottom-nav');
  const isNavVisible = !!nav && nav.style.display !== 'none';
  const offset = isNavVisible ? `${Math.ceil(nav.getBoundingClientRect().height)}px` : '0px';
  document.documentElement.style.setProperty('--sheet-bottom-offset', offset);
}

window.addEventListener('resize', () => {
  requestAnimationFrame(_syncSheetBottomOffset);
}, { passive: true });

async function enterApp(targetTab) {
  hideSplash();
  hideSkeleton();
  document.body.classList.remove('auth-mode');
  const header = document.getElementById('app-header');
  const bottomNav = document.querySelector('.bottom-nav');
  header.style.display = 'flex';
  header.style.visibility = 'visible';
  document.getElementById('app-main').style.display = 'block';
  if (bottomNav) bottomNav.style.display = 'flex';
  requestAnimationFrame(_syncSheetBottomOffset);
  // Sync CSS variable to actual rendered header height (fixes sticky gap on all screen sizes)
  requestAnimationFrame(_syncHeaderHeight);
  updateUserPill();
  switchTab(targetTab || activeTab || 'dashboard');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      loadFamilyName().catch(() => {});
      renderCalendar();
    });
  });
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

/** Pull-to-refresh uniquement sur Accueil (dashboard) et Planning (calendar), pas Profil ni écran « Gérer la ressource ». */
function _ptrAllowed() {
  if (typeof activeTab === 'undefined') return false;
  if (activeTab !== 'dashboard' && activeTab !== 'calendar') return false;
  const rm = document.getElementById('resource-manage-overlay');
  if (rm && !rm.classList.contains('hidden')) return false;
  return true;
}

let _ptrSilentRefreshing = false;

async function _runPtrSilentRefresh() {
  if (_ptrSilentRefreshing) return;
  _ptrSilentRefreshing = true;
  try {
    if (typeof refreshAppDataSilently === 'function') {
      await refreshAppDataSilently();
    }
  } catch (e) {
    console.error(e);
  } finally {
    _ptrSilentRefreshing = false;
  }
}

function _initPullToRefresh() {
  if (_pullToRefreshBound) return;
  _pullToRefreshBound = true;

  const indicator = document.getElementById('ptr-indicator');
  const fillCircle = indicator?.querySelector('.ptr-fill');

  window.addEventListener('touchstart', (e) => {
    if (!_isAppVisible()) { _ptrArmed = false; return; }
    if (document.querySelector('#overlay.open')) { _ptrArmed = false; return; }
    if (!_ptrAllowed()) { _ptrArmed = false; return; }
    const main = document.getElementById('app-main');
    const atTop = main ? main.scrollTop <= 0 : (window.scrollY || 0) <= 0;
    if (!atTop) { _ptrArmed = false; return; }
    _ptrStartY = e.touches?.[0]?.clientY || 0;
    _ptrArmed = true;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!_ptrArmed || !indicator || !fillCircle) return;
    if (!_ptrAllowed()) {
      indicator.style.height = '0';
      indicator.classList.remove('active');
      _ptrArmed = false;
      fillCircle.style.strokeDashoffset = _PTR_CIRCUMFERENCE;
      return;
    }
    const currentY = e.touches?.[0]?.clientY || 0;
    const delta = currentY - _ptrStartY;
    if (delta <= 0) {
      indicator.style.height = '0';
      indicator.classList.remove('active');
      return;
    }

    // Block native overscroll (iOS bounce) while pulling
    e.preventDefault();

    // Progress from 0 to 1 based on pull distance
    const progress = Math.min(delta / _PTR_THRESHOLD, 1);
    const indicatorH = Math.min(delta * 0.45, 48);
    indicator.classList.add('active');
    indicator.style.height = indicatorH + 'px';
    fillCircle.style.strokeDashoffset = _PTR_CIRCUMFERENCE * (1 - progress);

    if (progress >= 1) {
      _ptrArmed = false;
      indicator.classList.remove('active');
      indicator.classList.remove('refreshing');
      indicator.style.height = '0';
      if (fillCircle) fillCircle.style.strokeDashoffset = _PTR_CIRCUMFERENCE;
      _runPtrSilentRefresh();
    }
  }, { passive: false });

  function _ptrReset() {
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
