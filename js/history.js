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
    const famDoc = await familleRef(currentUser.familyId).get();
    let code = famDoc.exists && famDoc.data().inviteCode;
    if (!code) {
      code = generateInviteCode();
      await familleRef(currentUser.familyId).update({ inviteCode: code });
    }
    const url = `${location.origin}${location.pathname}?join=${code}`;
    el.textContent = url;
    navigator.clipboard?.writeText(url).then(() => showToast('Lien copié !')).catch(() => showToast('Lien affiché ci-dessus'));
  } catch(e) { el.textContent = 'Erreur de chargement.'; }
}
