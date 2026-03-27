// ==========================================
// CELEBRATION OVERLAY
// ==========================================
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

function celebrate(icon, title, xpText, subtitle) {
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
  document.getElementById('cel-sub').textContent = subtitle || '';
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
  setTimeout(() => {
    celEl.style.display = 'none';
    document.body?.classList.remove('celebration-active');
    _restoreThemeColor();
    renderXpHeroCard();
  }, 2500);
}
