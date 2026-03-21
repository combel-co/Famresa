// ==========================================
// HISTORY — INVITE LINK
// ==========================================
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

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
