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
      <div style="margin-top:18px;padding:14px;background:#fff;border:0.5px solid #e5e4df;border-radius:16px;text-align:left">
        <div style="font-size: calc(13px * var(--ui-text-scale));font-weight:600;color:var(--text);margin-bottom:10px">Raccourci sur l'écran d'accueil</div>
        <p style="font-size: calc(12px * var(--ui-text-scale));color:#4b5563;line-height:1.45;margin:0 0 10px"><strong>iPhone (Safari)</strong> : touchez <strong>Partager</strong>, puis « Sur l'écran d'accueil ».</p>
        <p style="font-size: calc(12px * var(--ui-text-scale));color:#4b5563;line-height:1.45;margin:0 0 10px"><strong>Android (Chrome)</strong> : menu <strong>⋮</strong> → « Ajouter à l'écran d'accueil » ou « Installer l'application ».</p>
        <p style="font-size: calc(11px * var(--ui-text-scale));color:#9b9b9b;line-height:1.4;margin:0 0 10px">Sur <strong>iPhone</strong>, si vous utilisez <strong>Chrome</strong>, ouvrez plutôt FamResa dans <strong>Safari</strong> pour ajouter le raccourci à l'écran d'accueil (méthode la plus fiable).</p>
        <p style="font-size: calc(11px * var(--ui-text-scale));color:#9b9b9b;line-height:1.4;margin:0 0 8px">Sur <strong>iPhone</strong>, l'icône du raccourci est enregistrée une seule fois au moment de l'ajout : elle ne se met pas à jour toute seule quand FamResa change d'image. Pour voir la nouvelle icône, supprimez le raccourci puis ajoutez-le à nouveau depuis Safari.</p>
        <p style="font-size: calc(11px * var(--ui-text-scale));color:#9b9b9b;line-height:1.4;margin:0">En navigation privée, le stockage local peut être limité : reconnectez-vous si une session disparaît.</p>
      </div>
      <button type="button" class="btn" style="background:#f5f5f5;color:var(--text);margin-top:16px;width:100%" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}
