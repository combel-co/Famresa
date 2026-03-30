// ==========================================
// CELEBRATION OVERLAY
// ==========================================
let _celebrateCloseTimer = null;

function _clearCelebrateCloseTimer() {
  if (_celebrateCloseTimer) {
    clearTimeout(_celebrateCloseTimer);
    _celebrateCloseTimer = null;
  }
}

function _closeCelebrationCommon() {
  const celEl = document.getElementById('celebration');
  if (celEl) celEl.style.display = 'none';
  document.body?.classList.remove('celebration-active');
  _restoreThemeColor();
  if (typeof renderXpHeroCard === 'function') renderXpHeroCard();
  const inviteFoot = document.getElementById('cel-invite-footer');
  if (inviteFoot) inviteFoot.style.display = 'none';
  const onboardCard = document.getElementById('cel-onboarding-card');
  if (onboardCard) onboardCard.style.display = 'none';
  const xpEl = document.getElementById('cel-xp');
  if (xpEl) xpEl.style.display = '';
  const celSub = document.getElementById('cel-sub');
  if (celSub) celSub.style.display = '';
}

function _setThemeColor(color) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  if (!meta.dataset.prevColor) meta.dataset.prevColor = meta.getAttribute('content') || '';
  meta.setAttribute('content', color);
}

function _restoreThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const prev = meta.dataset.prevColor;
  if (typeof prev === 'string') meta.setAttribute('content', prev || '#ffffff');
  delete meta.dataset.prevColor;
}

/**
 * @param {function} [onClose] — appelé après fermeture auto
 * @param {{ closeDelayMs?: number }} [opts] — closeDelayMs défaut 2500 ; raccourcir pour enchaîner onboarding sans attendre 2,5 s
 */
function celebrate(icon, title, xpText, subtitle, onClose, opts) {
  const closeDelayMs =
    opts && typeof opts.closeDelayMs === 'number' ? opts.closeDelayMs : 2500;
  _clearCelebrateCloseTimer();
  const onboardCard = document.getElementById('cel-onboarding-card');
  if (onboardCard) onboardCard.style.display = 'none';
  const inviteFoot = document.getElementById('cel-invite-footer');
  if (inviteFoot) inviteFoot.style.display = 'none';
  const xpEl = document.getElementById('cel-xp');
  const hideXp = opts && opts.hideXp === true;
  if (xpEl) {
    if (hideXp) {
      xpEl.style.display = 'none';
    } else {
      xpEl.style.display = '';
    }
  }

  const colors = ['rgba(255,255,255,0.85)', '#f59e0b', 'rgba(255,255,255,0.5)', '#10b981', '#a5b4fc', '#fde68a'];
  const container = document.getElementById('confetti-container');
  if (container) {
    container.innerHTML = '';
    for (let i = 0; i < 18; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const size = Math.round(6 + Math.random() * 7);
      piece.style.width = size + 'px';
      piece.style.height = size + 'px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.borderRadius = Math.random() > 0.4 ? '50%' : '2px';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      piece.style.animationDelay = Math.random() * 0.8 + 's';
      container.appendChild(piece);
    }
  }
  const celEl = document.getElementById('celebration');
  if (!celEl) return;
  document.getElementById('cel-emoji').textContent = icon || '✓';
  document.getElementById('cel-title').textContent = title || 'Super !';
  document.getElementById('cel-xp').textContent = xpText || '';
  const celSubEl = document.getElementById('cel-sub');
  if (celSubEl) {
    celSubEl.textContent = subtitle || '';
    celSubEl.style.display = '';
  }
  const recapCard = document.getElementById('cel-recap-card');
  const recap = window.__lastCelebrationRecap;
  if (recapCard && recap) {
    document.getElementById('cel-recap-icon').textContent = recap.icon || '🏠';
    document.getElementById('cel-recap-name').textContent = recap.name || 'Ressource';
    document.getElementById('cel-recap-sub').textContent = recap.sub || 'Réservation famille';
    document.getElementById('cel-recap-arrivee').textContent = recap.arrivee || '—';
    document.getElementById('cel-recap-depart').textContent = recap.depart || '—';
    document.getElementById('cel-recap-duree').textContent = recap.duree || '—';
    document.getElementById('cel-recap-participants').textContent = recap.participants || '—';
    recapCard.style.display = '';
  } else if (recapCard) {
    recapCard.style.display = 'none';
  }
  window.__lastCelebrationRecap = null;
  document.body?.classList.add('celebration-active');
  _setThemeColor('#2f7759');
  celEl.style.display = 'flex';

  const runClose = () => {
    _closeCelebrationCommon();
    if (typeof onClose === 'function') {
      try {
        onClose();
      } catch (e) {
        console.warn('[celebrate onClose]', e);
      }
    }
  };

  if (closeDelayMs <= 0) {
    _celebrateCloseTimer = setTimeout(runClose, 0);
    return;
  }

  _celebrateCloseTimer = setTimeout(runClose, closeDelayMs);
}

/**
 * Bienvenue après invitation (mot de passe) — bouton manuel, pas de fermeture auto.
 */
function celebrateInviteWelcome({ resourceName, resourceId, isHouse }) {
  _clearCelebrateCloseTimer();
  const obCard0 = document.getElementById('cel-onboarding-card');
  if (obCard0) obCard0.style.display = 'none';
  const colors = ['rgba(255,255,255,0.85)', '#f59e0b', 'rgba(255,255,255,0.5)', '#10b981', '#a5b4fc', '#fde68a'];
  const container = document.getElementById('confetti-container');
  if (container) {
    container.innerHTML = '';
    for (let i = 0; i < 22; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const size = Math.round(6 + Math.random() * 7);
      piece.style.width = size + 'px';
      piece.style.height = size + 'px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.borderRadius = Math.random() > 0.4 ? '50%' : '2px';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      piece.style.animationDelay = Math.random() * 0.8 + 's';
      container.appendChild(piece);
    }
  }

  const celEl = document.getElementById('celebration');
  if (!celEl) return;

  document.getElementById('cel-emoji').textContent = '🎉';
  document.getElementById('cel-title').textContent = `Bienvenue dans ${resourceName || 'la maison ou voiture'} !`;
  const xpEl = document.getElementById('cel-xp');
  if (xpEl) {
    xpEl.textContent = '';
    xpEl.style.display = 'none';
  }
  const celSubInvite = document.getElementById('cel-sub');
  if (celSubInvite) {
    celSubInvite.textContent = 'Tu peux maintenant réserver.';
    celSubInvite.style.display = '';
  }

  const recapCard = document.getElementById('cel-recap-card');
  if (recapCard) recapCard.style.display = 'none';
  window.__lastCelebrationRecap = null;

  const inviteFoot = document.getElementById('cel-invite-footer');
  const cta = document.getElementById('cel-invite-cta');
  if (inviteFoot) inviteFoot.style.display = 'block';
  if (cta) {
    cta.textContent = 'Voir le planning →';
    cta.onclick = () => {
      finishInviteWelcomeCelebration(resourceId, !!isHouse);
    };
  }

  document.body?.classList.add('celebration-active');
  _setThemeColor('#2f7759');
  celEl.style.display = 'flex';
}

/**
 * After first resource onboarding — share / copy link / accueil (v2, no booking CTA).
 */
function celebrateOnboardingResourceCreated({ resourceId, resourceName, isHouse }) {
  _clearCelebrateCloseTimer();
  const colors = ['rgba(255,255,255,0.85)', '#f59e0b', 'rgba(255,255,255,0.5)', '#10b981', '#a5b4fc', '#fde68a'];
  const container = document.getElementById('confetti-container');
  if (container) {
    container.innerHTML = '';
    for (let i = 0; i < 22; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const size = Math.round(6 + Math.random() * 7);
      piece.style.width = size + 'px';
      piece.style.height = size + 'px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.borderRadius = Math.random() > 0.4 ? '50%' : '2px';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      piece.style.animationDelay = Math.random() * 0.8 + 's';
      container.appendChild(piece);
    }
  }

  const celEl = document.getElementById('celebration');
  if (!celEl) return;

  document.getElementById('cel-emoji').textContent = isHouse ? '🏠' : '🚗';
  document.getElementById('cel-title').textContent = `${resourceName || 'Ta maison ou voiture'} est prête !`;
  const xpEl = document.getElementById('cel-xp');
  if (xpEl) {
    xpEl.textContent = '';
    xpEl.style.display = 'none';
  }
  const celSub = document.getElementById('cel-sub');
  if (celSub) {
    celSub.textContent = 'Invite ta famille pour qu\'ils puissent réserver.';
    celSub.style.display = '';
  }

  const recapCard = document.getElementById('cel-recap-card');
  if (recapCard) recapCard.style.display = 'none';
  window.__lastCelebrationRecap = null;

  const inviteFoot = document.getElementById('cel-invite-footer');
  if (inviteFoot) inviteFoot.style.display = 'none';

  const obCard = document.getElementById('cel-onboarding-card');
  const inviteFamilyBtn = document.getElementById('cel-onboarding-invite-family');
  const copyLinkBtn = document.getElementById('cel-onboarding-copy-link');
  const dashBtn = document.getElementById('cel-onboarding-dashboard');

  if (obCard) {
    obCard.style.display = 'block';
    if (inviteFamilyBtn) {
      inviteFamilyBtn.onclick = () => {
        if (typeof window._onboardingNativeShareResource === 'function') {
          window._onboardingNativeShareResource(resourceId, resourceName);
        }
      };
    }
    if (copyLinkBtn) {
      copyLinkBtn.onclick = () => {
        if (typeof window._onboardingCopyInviteLink === 'function') {
          window._onboardingCopyInviteLink(resourceId);
        }
      };
    }
    if (dashBtn) {
      dashBtn.onclick = () => {
        if (typeof finishOnboardingResourceCelebration === 'function') {
          finishOnboardingResourceCelebration(resourceId, !!isHouse, { openBooking: false });
        }
      };
    }
  }

  document.body?.classList.add('celebration-active');
  _setThemeColor('#2f7759');
  celEl.style.display = 'flex';
}

function _celEscapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function finishOnboardingResourceCelebration(resourceId, isHouse, opts) {
  _closeCelebrationCommon();
  document.body.classList.remove('auth-mode');
  if (resourceId && typeof selectResource === 'function') selectResource(resourceId);
  if (typeof enterApp === 'function') {
    enterApp('dashboard').then(() => {
      if (opts && opts.openBooking && typeof switchToBookingMode === 'function') {
        switchToBookingMode();
      }
    });
  }
}

function finishInviteWelcomeCelebration(resourceId, isHouse) {
  _closeCelebrationCommon();
  if (resourceId && typeof selectResource === 'function') selectResource(resourceId);
  if (typeof enterApp === 'function') {
    enterApp('calendar');
  }
}

function maybeShowBookingTipAfterInvite(resourceId, isHouse) {
  if (!resourceId) return;
  const key = `famresa_booking_tip_${resourceId}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch (_) {
    return;
  }
  const copy = document.getElementById('booking-tip-copy');
  const overlay = document.getElementById('booking-tip-overlay');
  if (!copy || !overlay) return;
  copy.innerHTML = isHouse
    ? 'Pour réserver un séjour, ouvrez l\'onglet <strong>Planning</strong> en bas de l\'écran, puis choisissez vos dates.'
    : 'Pour réserver la voiture, ouvrez l\'onglet <strong>Planning</strong> en bas de l\'écran, puis choisissez vos dates.';
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  window._bookingTipResourceId = resourceId;
}

function dismissBookingTipOverlay() {
  const overlay = document.getElementById('booking-tip-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
  const id = window._bookingTipResourceId;
  window._bookingTipResourceId = null;
  if (id) {
    try {
      localStorage.setItem(`famresa_booking_tip_${id}`, '1');
    } catch (_) {}
  }
}
