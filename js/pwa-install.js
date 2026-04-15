/* ═══════════════════════════════════════════
   PWA Install Prompt — FamResa
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Constants ──
  var LS_DISMISSED  = 'famresa_pwa_install_dismissed';
  var LS_ACCEPTED   = 'famresa_pwa_install_accepted';
  var SHOW_DELAY_MS = 5000;
  var DISMISS_DAYS  = 30;

  // ── State ──
  var deferredPrompt = null;

  // ── Environment detection ──
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
  }

  function isIosSafari() {
    var ua = navigator.userAgent;
    var isIos = /iP(hone|od|ad)/.test(ua)
             || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
    return isIos && isSafari;
  }

  function wasDismissedRecently() {
    try {
      var ts = localStorage.getItem(LS_DISMISSED);
      if (!ts) return false;
      return (Date.now() - Number(ts)) / (1000 * 60 * 60 * 24) < DISMISS_DAYS;
    } catch (_) { return false; }
  }

  function wasAccepted() {
    try { return localStorage.getItem(LS_ACCEPTED) === '1'; }
    catch (_) { return false; }
  }

  function shouldShow() {
    return !isStandalone() && !wasDismissedRecently() && !wasAccepted();
  }

  // ── Banner show/hide ──
  function showBanner() {
    var el = document.getElementById('pwa-install-banner');
    if (el) el.style.display = 'flex';
  }

  function hideBanner() {
    var el = document.getElementById('pwa-install-banner');
    if (el) el.style.display = 'none';
  }

  // ── iOS modal ──
  function showIosModal() {
    var el = document.getElementById('pwa-ios-overlay');
    if (el) {
      el.classList.add('open');
      document.body.classList.add('pwa-ios-open');
    }
  }

  // ── Global handlers (called from onclick) ──

  window.pwaInstallAccept = function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (result) {
      if (result.outcome === 'accepted') {
        try { localStorage.setItem(LS_ACCEPTED, '1'); } catch (_) {}
        if (typeof showToast === 'function') showToast('FamResa installée !');
      }
      deferredPrompt = null;
      hideBanner();
    });
  };

  window.pwaInstallDismiss = function () {
    try { localStorage.setItem(LS_DISMISSED, String(Date.now())); } catch (_) {}
    hideBanner();
  };

  window.pwaIosClose = function () {
    var el = document.getElementById('pwa-ios-overlay');
    if (el) el.classList.remove('open');
    document.body.classList.remove('pwa-ios-open');
  };

  window.pwaIosDismiss = function () {
    try { localStorage.setItem(LS_DISMISSED, String(Date.now())); } catch (_) {}
    window.pwaIosClose();
  };

  // ── Chrome/Android: listen for beforeinstallprompt ──
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;

    if (!shouldShow()) return;

    setTimeout(showBanner, SHOW_DELAY_MS);
  });

  // ── Track successful install ──
  window.addEventListener('appinstalled', function () {
    try { localStorage.setItem(LS_ACCEPTED, '1'); } catch (_) {}
    deferredPrompt = null;
    hideBanner();
  });

  // ── iOS: show modal after delay ──
  if (isIosSafari() && shouldShow()) {
    setTimeout(showIosModal, SHOW_DELAY_MS);
  }

})();
