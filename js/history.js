// ==========================================
// HISTORY — INVITE LINK
// ==========================================
async function loadAndCopyInviteLink() {
  const el = document.getElementById('invite-link-display');
  try {
    const code = await familyService.getInviteCode(currentUser.familyId, generateInviteCode);
    if (!code) { el.textContent = 'Erreur de chargement.'; return; }
    const appUrl = `${location.origin}${location.pathname}`;
    const message = `Rejoins la famille sur Resa-voiture !\n${appUrl}\nCode d'invitation : ${code}`;
    el.textContent = `Code : ${code}`;
    navigator.clipboard?.writeText(message)
      .then(() => showToast('Code copié !'))
      .catch(() => showToast('Code : ' + code));
  } catch(e) { el.textContent = 'Erreur de chargement.'; }
}

async function shareApp() {
  const appUrl = `${location.origin}${location.pathname}`;
  const shareTitle = 'FamResa';
  const shareText = "Je t'invite a utiliser FamResa pour reserver et partager les ressources familiales.";
  const clipboardMessage = `${shareText}\n${appUrl}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: appUrl,
      });
      return;
    }
  } catch (e) {
    // iOS returns AbortError when the user closes the sheet without sharing.
    if (e?.name === 'AbortError') return;
  }

  try {
    await navigator.clipboard?.writeText(clipboardMessage);
    showToast('Lien de partage copie');
  } catch (e) {
    showToast('Impossible de partager pour le moment');
  }
}

function showFaqSheet() {
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Aide &amp; FAQ</h2>
      <div class="pf-promo-card" onclick="shareApp()" role="button" tabindex="0" style="margin-top:12px;margin-bottom:0">
        <div class="pf-promo-icon">📤</div>
        <div class="pf-promo-text">
          <div class="pf-promo-title">Comment faire découvrir l'application à un ami&nbsp;?</div>
          <div class="pf-promo-desc">Simple, cliquer sur le bouton partager ci-dessous</div>
        </div>
        <div class="pf-promo-chevron">›</div>
      </div>
      <button type="button" class="btn" style="background:#f5f5f5;color:var(--text);margin-top:16px;width:100%" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}
