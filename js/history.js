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
        <div class="pf-promo-icon faq-pf-icon-text" aria-hidden="true">Inviter</div>
        <div class="pf-promo-text">
          <div class="pf-promo-title">Comment faire découvrir l'application à un ami&nbsp;?</div>
          <div class="pf-promo-desc">Touchez cette ligne pour ouvrir le partage ou copier le lien.</div>
        </div>
        <div class="pf-promo-chevron">›</div>
      </div>
      <div class="faq-install">
        <div class="faq-install-title">Raccourci sur l'écran d'accueil</div>
        <div class="faq-install-grid">
          <div class="faq-install-path">
            <div class="faq-install-path-h">iPhone · Safari</div>
            <div class="faq-install-step"><span class="faq-install-num">1</span><span>Ouvrir FamResa dans Safari (pas dans un autre navigateur pour cette étape).</span></div>
            <div class="faq-install-step"><span class="faq-install-num">2</span><span>Utiliser le bouton <strong>Partager</strong> du navigateur (barre du bas).</span></div>
            <div class="faq-install-step"><span class="faq-install-num">3</span><span>Choisir <strong>Sur l'écran d'accueil</strong>, puis valider.</span></div>
          </div>
          <div class="faq-install-path faq-install-path--android">
            <div class="faq-install-path-h">Android · Chrome</div>
            <div class="faq-install-step"><span class="faq-install-num">1</span><span>Ouvrir FamResa dans Chrome.</span></div>
            <div class="faq-install-step"><span class="faq-install-num">2</span><span>Ouvrir le <strong>menu du navigateur</strong> (trois points, en haut à droite).</span></div>
            <div class="faq-install-step"><span class="faq-install-num">3</span><span>Choisir <strong>Ajouter à l'écran d'accueil</strong> ou <strong>Installer l'application</strong>.</span></div>
          </div>
        </div>
        <div class="faq-install-notes">
          <strong>Bon à savoir</strong>
          <ul>
            <li>Sur iPhone avec Chrome : ouvrir le même lien dans Safari pour poser le raccourci.</li>
            <li>L'icône sur l'écran d'accueil ne se met pas à jour seule : supprimer le raccourci puis l'ajouter à nouveau si l'image FamResa change.</li>
            <li>En navigation privée, la session peut être limitée : se reconnecter si besoin.</li>
          </ul>
        </div>
      </div>
      <button type="button" class="btn" style="background:#f5f5f5;color:var(--text);margin-top:16px;width:100%" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}
