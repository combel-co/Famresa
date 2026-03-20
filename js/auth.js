// ==========================================
// AUTH — WELCOME / LOGIN / SIGNUP / PROFILE
// ==========================================

function showWelcomeScreen() {
  hideSplash();
  hideSkeleton();
  document.getElementById('app-header').style.display = 'none';
  document.getElementById('app-main').style.display = 'none';
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('signup-overlay').classList.add('hidden');
  document.getElementById('welcome-screen').style.display = 'flex';
}

// ---- LOGIN ----
function connectUser() {
  document.getElementById('welcome-screen').style.display = 'none';
  const emailEl = document.getElementById('login-email');
  if (emailEl) emailEl.value = '';
  document.querySelectorAll('#login-pin input').forEach(i => i.value = '');
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-overlay').classList.remove('hidden');
  const pins = document.querySelectorAll('#login-pin input');
  setupPinInputs(pins, loginUser);
  setTimeout(() => document.getElementById('login-email')?.focus(), 300);
}

async function loginUser() {
  const email = (document.getElementById('login-email')?.value || '').trim().toLowerCase();
  const pin = Array.from(document.querySelectorAll('#login-pin input')).map(i => i.value.replace(/\D/g, '')).join('');
  const errEl = document.getElementById('login-error');
  if (!email || !email.includes('@')) { errEl.textContent = 'Email invalide'; return; }
  if (pin.length < 4) { errEl.textContent = 'Entrez votre code à 4 chiffres'; return; }
  errEl.textContent = '';
  try {
    // Try new collection first; if permission denied/unavailable, fall through to legacy
    let doc = null, data = null;
    try {
      const newSnap = await profilsRef().where('email', '==', email).get();
      if (!newSnap.empty) {
        const d = newSnap.docs[0].data();
        if (String(d.code_pin ?? d.pin) !== pin) { errEl.textContent = 'Code incorrect'; return; }
        doc = newSnap.docs[0]; data = d;
      }
    } catch(_) { /* profils not accessible yet — fall through to users */ }

    if (!doc) {
      // Legacy path — users collection
      const oldSnap = await db.collection('users').where('email', '==', email).get();
      if (oldSnap.empty) { errEl.textContent = 'Email introuvable'; return; }
      const d = oldSnap.docs[0].data();
      if (String(d.pin) !== pin) { errEl.textContent = 'Code incorrect'; return; }
      doc = oldSnap.docs[0]; data = d;
    }

    const familyId = data.familyId || data.famille_id || null;
    let name = data.nom || data.name || '';
    let photo = data.photo || null;
    // Preserve createdAt for seniority display
    const createdAt = data.createdAt?.toMillis?.() || data.createdAt || null;

    // Try to get richer profile from famille_membres (name/photo may be there)
    if (familyId) {
      try {
        const member = await getFamilleMember(familyId, doc.id);
        if (member) {
          name  = member.nom  || member.name  || name;
          photo = member.photo || photo;
        } else {
          // Fallback: legacy members subcollection
          const memberDoc = await db.collection('families').doc(familyId).collection('members').doc(doc.id).get();
          if (memberDoc.exists) {
            name  = memberDoc.data().name  || name;
            photo = memberDoc.data().photo || photo;
          }
        }
      } catch(e) { /* fallback to profil data */ }
    }

    currentUser = { id: doc.id, name, email: data.email, photo, familyId, createdAt };
    localStorage.setItem('famcar_user', JSON.stringify(currentUser));
    document.getElementById('login-overlay').classList.add('hidden');
    if (!familyId) {
      await runMigrationIfNeeded();
    } else {
      showSkeleton();
      runV2MigrationIfNeeded().catch(e => console.warn('[migration]', e));
      await loadResources();
      enterApp();
      showToast(`Bonjour ${currentUser.name} !`);
      if (_pendingResourceJoinCode) {
        await handleResourceJoinCode(_pendingResourceJoinCode);
        _pendingResourceJoinCode = null;
      }
    }
  } catch(e) { console.error(e); errEl.textContent = 'Erreur — réessayez'; }
}

// ---- SIGNUP ----
let suTempPhoto = null;
let suInviteUrl = '';
let _isSubmittingFamily = false;

function startSignup() {
  document.getElementById('welcome-screen').style.display = 'none';
  suTempPhoto = null;
  suInviteUrl = '';
  suPendingFamilyId = null;
  document.getElementById('signup-overlay').classList.remove('hidden');
  showSignupStep(1);
}

function showSignupStep(id) {
  document.querySelectorAll('.su-step').forEach(s => s.classList.add('hidden'));
  document.getElementById(`su-step-${id}`)?.classList.remove('hidden');
  if (id === 3) {
    suTempPhoto = null;
    const prev = document.getElementById('su-photo-preview');
    if (prev) { prev.innerHTML = '📷'; prev.classList.remove('has-photo'); }
    document.querySelectorAll('#su-name,#su-email').forEach(el => { if (el) el.value = ''; });
    document.querySelectorAll('#su-user-pin input').forEach(i => i.value = '');
    document.getElementById('su-profile-error').textContent = '';
    const pins = document.querySelectorAll('#su-user-pin input');
    setupPinInputs(pins, signupProfileAdvance);
    setTimeout(() => document.getElementById('su-name')?.focus(), 300);
  }
}

function signupChooseJoin() {
  document.querySelectorAll('.su-step').forEach(s => s.classList.add('hidden'));
  document.getElementById('su-step-2a').classList.remove('hidden');
  document.getElementById('su-invite-url').value = '';
  document.getElementById('su-join-error').textContent = '';
  setTimeout(() => document.getElementById('su-invite-url')?.focus(), 300);
}

function signupChooseCreate() {
  document.querySelectorAll('.su-step').forEach(s => s.classList.add('hidden'));
  document.getElementById('su-step-2b').classList.remove('hidden');
  document.getElementById('su-family-name').value = '';
  document.querySelectorAll('#su-family-pin input, #su-family-pin-confirm input').forEach(i => i.value = '');
  document.getElementById('su-create-error').textContent = '';
  const createPins = document.querySelectorAll('#su-family-pin input');
  const confirmPins = document.querySelectorAll('#su-family-pin-confirm input');
  setupPinInputs(createPins, () => confirmPins[0].focus());
  setupPinInputs(confirmPins, signupCreateAdvance);
  setTimeout(() => document.getElementById('su-family-name')?.focus(), 300);
}

async function signupJoinAdvance() {
  const url = (document.getElementById('su-invite-url')?.value || '').trim();
  const errEl = document.getElementById('su-join-error');
  if (!url) { errEl.textContent = 'Collez le lien d\'invitation'; return; }
  let code = '';
  try {
    const u = new URL(url);
    code = u.searchParams.get('join') || '';
  } catch(e) { errEl.textContent = 'Lien invalide'; return; }
  if (!code) { errEl.textContent = 'Lien invalide — paramètre ?join= manquant'; return; }
  errEl.textContent = '';
  try {
    // Try new collection first, fallback to legacy
    let snap = await famillesRef().where('inviteCode', '==', code).limit(1).get();
    if (snap.empty) snap = await db.collection('families').where('inviteCode', '==', code).limit(1).get();
    if (snap.empty) { errEl.textContent = 'Lien invalide ou expiré'; return; }
    suPendingFamilyId = snap.docs[0].id;
    showSignupStep(3);
  } catch(e) { errEl.textContent = 'Erreur — réessayez'; }
}

function generateSignupInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function signupCreateAdvance() {
  if (_isSubmittingFamily) return;
  const familyName = (document.getElementById('su-family-name')?.value || '').trim();
  const pin = Array.from(document.querySelectorAll('#su-family-pin input')).map(i => i.value.replace(/\D/g, '')).join('');
  const confirm = Array.from(document.querySelectorAll('#su-family-pin-confirm input')).map(i => i.value.replace(/\D/g, '')).join('');
  const errEl = document.getElementById('su-create-error');
  if (!familyName) { errEl.textContent = 'Entrez un nom pour votre famille'; return; }
  if (pin.length < 4) { errEl.textContent = 'Entrez le code familial (4 chiffres)'; return; }
  if (pin !== confirm) { errEl.textContent = 'Les codes ne correspondent pas'; return; }
  errEl.textContent = '';
  _isSubmittingFamily = true;
  const inviteCode = generateSignupInviteCode();
  suInviteUrl = `${location.origin}${location.pathname}?join=${inviteCode}`;
  try {
    const familyDocRef = await famillesRef().add({
      nom: familyName, pin, inviteCode,
      created_by: null, // set after user profile is created
      createdAt: ts()
    });
    suPendingFamilyId = familyDocRef.id;
    document.querySelectorAll('.su-step').forEach(s => s.classList.add('hidden'));
    document.getElementById('su-step-2b-link').classList.remove('hidden');
    document.getElementById('su-invite-display').textContent = suInviteUrl;
  } catch(e) { errEl.textContent = 'Erreur — réessayez'; } finally { _isSubmittingFamily = false; }
}

function copyInviteLink() {
  navigator.clipboard?.writeText(suInviteUrl).then(() => showToast('Lien copié !')).catch(() => showToast(suInviteUrl));
}

function handleSignupPhoto(input) {
  const file = input.files[0];
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
      suTempPhoto = canvas.toDataURL('image/jpeg', 0.6);
      const preview = document.getElementById('su-photo-preview');
      if (preview) { preview.innerHTML = `<img src="${suTempPhoto}" alt="">`; preview.classList.add('has-photo'); }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function signupProfileAdvance() {
  const name = (document.getElementById('su-name')?.value || '').trim();
  const email = (document.getElementById('su-email')?.value || '').trim().toLowerCase();
  const pin = Array.from(document.querySelectorAll('#su-user-pin input')).map(i => i.value.replace(/\D/g, '')).join('');
  const errEl = document.getElementById('su-profile-error');
  if (!name) { errEl.textContent = 'Entrez votre prénom'; return; }
  if (!email || !email.includes('@')) { errEl.textContent = 'Email invalide'; return; }
  if (pin.length < 4) { errEl.textContent = 'Entrez votre code secret (4 chiffres)'; return; }
  errEl.textContent = '';
  try {
    // Check email uniqueness in new + legacy
    const [newSnap, oldSnap] = await Promise.all([
      profilsRef().where('email', '==', email).get(),
      db.collection('users').where('email', '==', email).get()
    ]);
    if (!newSnap.empty || !oldSnap.empty) { errEl.textContent = 'Cet email est déjà utilisé'; return; }

    // Create PROFIL
    const ref = await profilsRef().add({
      nom: name, email, code_pin: pin,
      photo: suTempPhoto || null,
      familyId: suPendingFamilyId,
      createdAt: ts()
    });

    // Create FAMILLE_MEMBRE
    await familleMembresRef().add({
      famille_id: suPendingFamilyId,
      profil_id: ref.id,
      role: 'member', // overridden to admin below if they created the family
      nom: name, email, photo: suTempPhoto || null,
      createdAt: ts()
    });

    // Mark as admin if they created the family
    const familyDoc = await familleRef(suPendingFamilyId).get();
    const isCreator = familyDoc.exists && familyDoc.data().created_by === null;
    if (isCreator) {
      await familleRef(suPendingFamilyId).update({ created_by: ref.id });
      // Update the membre doc role to admin
      const memSnap = await familleMembresRef()
        .where('famille_id', '==', suPendingFamilyId)
        .where('profil_id', '==', ref.id)
        .get();
      if (!memSnap.empty) await memSnap.docs[0].ref.update({ role: 'admin' });
    }

    currentUser = { id: ref.id, name, email, photo: suTempPhoto || null, familyId: suPendingFamilyId };
    localStorage.setItem('famcar_user', JSON.stringify(currentUser));
    document.getElementById('signup-overlay').classList.add('hidden');
    if (_pendingResourceJoinCode) {
      await loadResources();
      await handleResourceJoinCode(_pendingResourceJoinCode);
      _pendingResourceJoinCode = null;
    } else {
      loadResources();
    }
    enterApp();
    celebrate('🎉', `Bienvenue ${name} !`, '+50 XP', 'Tu fais partie de la famille !');
  } catch(e) { console.error(e); errEl.textContent = 'Erreur — réessayez'; }
}

// ==========================================
// CAR ONBOARDING (legacy wizard)
// ==========================================
let selectedCarEmoji = '🚗';

function selectCarEmoji(btn, emoji) {
  selectedCarEmoji = emoji;
  document.querySelectorAll('.ob-emoji-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function obStep4Advance() {
  const name = (document.getElementById('ob-car-name')?.value.trim()) || 'Voiture familiale';
  const plaque = (document.getElementById('ob-car-plaque')?.value.trim().toUpperCase()) || '';
  const errEl = document.getElementById('ob-step4-error');
  errEl.textContent = '';
  try {
    if (selectedResource) {
      await ressourcesRef().doc(selectedResource).update({ nom: name, name, emoji: selectedCarEmoji, plaque });
      const res = resources.find(r => r.id === selectedResource);
      if (res) Object.assign(res, { name, emoji: selectedCarEmoji, plaque });
    }
    showOnboardingStep(5);
  } catch (e) { errEl.textContent = 'Erreur — réessayez'; }
}

async function obStep2Advance() {
  if (_isSubmittingFamily) return;
  const create = Array.from(document.querySelectorAll('#ob-pin-create input')).map(i => i.value.replace(/\D/g, '')).join('');
  const confirm = Array.from(document.querySelectorAll('#ob-pin-confirm input')).map(i => i.value.replace(/\D/g, '')).join('');
  const errEl = document.getElementById('ob-pin-error');
  if (create.length < 4) { errEl.textContent = 'Entrez 4 chiffres'; return; }
  if (create !== confirm) { errEl.textContent = 'Les codes ne correspondent pas'; return; }
  errEl.textContent = '';
  _isSubmittingFamily = true;
  try {
    const familyDocRef = await famillesRef().add({
      nom: 'Ma famille', pin: create, inviteCode: generateSignupInviteCode(),
      created_by: null, createdAt: ts()
    });
    suPendingFamilyId = familyDocRef.id;
    showOnboardingStep(3);
  } catch (e) { errEl.textContent = 'Erreur — réessayez'; } finally { _isSubmittingFamily = false; }
}

async function obStep3Advance() {
  const name = document.getElementById('ob-name')?.value.trim() || '';
  const email = document.getElementById('ob-email')?.value.trim() || '';
  const pin = Array.from(document.querySelectorAll('#ob-user-pin input')).map(i => i.value.replace(/\D/g, '')).join('');
  const errEl = document.getElementById('ob-step3-error');
  if (!name) { errEl.textContent = 'Entrez votre prénom'; return; }
  if (!email || !email.includes('@')) { errEl.textContent = 'Email invalide'; return; }
  if (pin.length < 4) { errEl.textContent = 'Entrez votre code à 4 chiffres'; return; }
  errEl.textContent = '';
  try {
    const [newSnap, oldSnap] = await Promise.all([
      profilsRef().where('email', '==', email).get(),
      db.collection('users').where('email', '==', email).get()
    ]);
    if (!newSnap.empty || !oldSnap.empty) { errEl.textContent = 'Cet email est déjà utilisé'; return; }
    const ref = await profilsRef().add({
      nom: name, email, code_pin: pin,
      photo: tempPhoto || null, familyId: suPendingFamilyId, createdAt: ts()
    });
    await familleMembresRef().add({
      famille_id: suPendingFamilyId, profil_id: ref.id, role: 'admin',
      nom: name, email, photo: tempPhoto || null, createdAt: ts()
    });
    await familleRef(suPendingFamilyId).update({ created_by: ref.id });
    currentUser = { id: ref.id, name, email, photo: tempPhoto || null, familyId: suPendingFamilyId };
    localStorage.setItem('famcar_user', JSON.stringify(currentUser));
    showOnboardingStep(4);
  } catch (e) { errEl.textContent = 'Erreur — réessayez'; }
}

function showOnboardingStep(n) {
  document.querySelectorAll('.ob-step').forEach(s => s.classList.add('hidden'));
  document.getElementById(`ob-step-${n}`)?.classList.remove('hidden');
  if (n === 2) {
    const create = document.querySelectorAll('#ob-pin-create input');
    const confirm = document.querySelectorAll('#ob-pin-confirm input');
    setupPinInputs(create, () => confirm[0].focus());
    setupPinInputs(confirm, obStep2Advance);
    setTimeout(() => create[0].focus(), 300);
  }
  if (n === 3) {
    const pins = document.querySelectorAll('#ob-user-pin input');
    setupPinInputs(pins, obStep3Advance);
    setTimeout(() => document.getElementById('ob-name')?.focus(), 300);
  }
  if (n === 4) {
    selectedCarEmoji = '🚗';
    document.querySelectorAll('.ob-emoji-btn').forEach(b => b.classList.remove('active'));
    const firstBtn = document.querySelector('#ob-step-4 .ob-emoji-btn');
    if (firstBtn) firstBtn.classList.add('active');
  }
}

function finishOnboarding() {
  document.getElementById('onboarding-overlay').classList.add('hidden');
  enterApp();
  celebrate('🚗', `Bienvenue ${currentUser?.name || ''} !`, '+50 XP', 'La famille est prête à prendre la route !');
}

// ==========================================
// MIGRATION HELPERS
// ==========================================
function showMigrationBanner() {
  const el = document.getElementById('migration-overlay');
  if (el) el.style.display = 'flex';
  return el;
}

function hideMigrationBanner(el) {
  if (el) el.style.display = 'none';
}

async function runMigrationIfNeeded() {
  const banner = showMigrationBanner();
  try {
    const userDoc = await db.collection('users').doc(currentUser.id).get();
    const existingFamilyId = userDoc.exists ? userDoc.data().familyId : null;

    let familyId;
    if (existingFamilyId) {
      familyId = existingFamilyId;
    } else {
      const configDoc = await db.collection('config').doc('access').get();
      const configData = configDoc.exists ? configDoc.data() : {};
      const familyDocRef = await db.collection('families').add({
        name: configData.familyName || 'Ma famille',
        pin:  configData.pin || '',
        inviteCode: configData.inviteCode || generateSignupInviteCode(),
        migratedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      familyId = familyDocRef.id;
    }

    const existingCarsSnap = await db.collection('families').doc(familyId).collection('cars').limit(1).get();
    if (existingCarsSnap.empty) {
      const carsSnap = await db.collection('cars').get();
      for (const carDoc of carsSnap.docs) {
        await db.collection('families').doc(familyId).collection('cars').doc(carDoc.id).set(carDoc.data());
      }
      const bookingsSnap = await db.collection('bookings').get();
      for (const bDoc of bookingsSnap.docs) {
        await db.collection('families').doc(familyId).collection('bookings').doc(bDoc.id).set(bDoc.data());
      }
    }

    const usersSnap = await db.collection('users').get();
    for (const uDoc of usersSnap.docs) {
      const ud = uDoc.data();
      if (!ud.familyId) {
        await db.collection('families').doc(familyId).collection('members').doc(uDoc.id).set({
          name:  ud.name  || '',
          email: ud.email || '',
          photo: ud.photo || null,
          createdAt: ud.createdAt || null
        });
        await db.collection('users').doc(uDoc.id).update({ familyId });
      }
    }

    currentUser.familyId = familyId;
    localStorage.setItem('famcar_user', JSON.stringify(currentUser));

    hideMigrationBanner(banner);
    // Run v2 schema migration after v1 family migration
    await runV2MigrationIfNeeded().catch(e => console.warn('[migration v2]', e));
    loadResources();
    enterApp();
    showToast('Migration terminée — bienvenue dans la nouvelle version !');
  } catch (e) {
    hideMigrationBanner(banner);
    console.error('Migration failed:', e);
    showWelcomeScreen();
    setTimeout(() => showToast('Erreur migration : ' + (e.message || String(e))), 300);
  }
}

// ==========================================
// PROFILE
// ==========================================
// Legacy — redirects to the Profile tab
function showProfile() {
  switchTab('history');
}

// Edit profile sheet (photo, name, email)
function showEditProfileSheet() {
  if (!currentUser) { showWelcomeScreen(); return; }
  const av = currentUser.photo ? `<img src="${currentUser.photo}" alt="">` : getInitials(currentUser.name);
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Modifier le profil</h2>
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:20px">
        <div class="profile-avatar">${av}</div>
        <label style="font-size:12px;color:var(--accent);cursor:pointer;text-decoration:underline" onclick="document.getElementById('profile-photo-input').click()">Modifier la photo</label>
        <input type="file" id="profile-photo-input" accept="image/*" style="display:none" onchange="changeProfilePhoto(this)">
      </div>
      <div class="input-group">
        <label>Prénom</label>
        <input type="text" id="edit-profile-name" value="${currentUser.name || ''}" autocomplete="off">
      </div>
      <div class="input-group">
        <label>Email</label>
        <input type="email" id="edit-profile-email" value="${currentUser.email || ''}" autocomplete="off">
      </div>
      <div class="lock-error" id="edit-profile-error"></div>
      <button class="btn btn-primary" style="margin-top:8px" onclick="saveProfileEdits()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function saveProfileEdits() {
  const name  = (document.getElementById('edit-profile-name')?.value || '').trim();
  const email = (document.getElementById('edit-profile-email')?.value || '').trim().toLowerCase();
  const errEl = document.getElementById('edit-profile-error');
  if (!name) { errEl.textContent = 'Entrez votre prénom'; return; }
  if (!email || !email.includes('@')) { errEl.textContent = 'Email invalide'; return; }
  errEl.textContent = '';
  try {
    // Update profil
    await profilRef(currentUser.id).update({ nom: name, email });
    // Update famille_membre
    const member = await getFamilleMember(currentUser.familyId, currentUser.id);
    if (member) await familleMembresRef().doc(member.id).update({ nom: name, email });
    // Update local state
    currentUser.name  = name;
    currentUser.email = email;
    localStorage.setItem('famcar_user', JSON.stringify(currentUser));
    updateUserPill();
    renderProfileTab();
    closeSheet();
    showToast('Profil mis à jour ✓');
  } catch(e) { errEl.textContent = 'Erreur — réessayez'; }
}

async function changeProfilePhoto(input) {
  const file = input.files[0];
  if (!file || !currentUser) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const size = 120; canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - min)/2, (img.height - min)/2, min, min, 0, 0, size, size);
      const photo = canvas.toDataURL('image/jpeg', 0.6);
      try {
        // Update profil + famille_membre
        await profilRef(currentUser.id).update({ photo });
        const member = await getFamilleMember(currentUser.familyId, currentUser.id);
        if (member) await familleMembresRef().doc(member.id).update({ photo });
        currentUser.photo = photo;
        localStorage.setItem('famcar_user', JSON.stringify(currentUser));
        updateUserPill();
        renderProfileTab();
        showEditProfileSheet();
        showToast('Photo mise à jour ✓');
      } catch(e) { showToast('Erreur — réessayez'); }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function showChangePin() {
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Nouveau code</h2>
      <p style="color:var(--text-light);font-size:14px;margin-bottom:20px">Choisissez un nouveau code à 4 chiffres</p>
      <div class="pin-input" id="change-pin-input">
        <input type="tel" maxlength="1" inputmode="numeric" autocomplete="off">
        <input type="tel" maxlength="1" inputmode="numeric" autocomplete="off">
        <input type="tel" maxlength="1" inputmode="numeric" autocomplete="off">
        <input type="tel" maxlength="1" inputmode="numeric" autocomplete="off">
      </div>
      <div class="lock-error" id="change-pin-error"></div>
      <button class="btn btn-primary" onclick="saveNewPin()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  const inputs = document.querySelectorAll('#change-pin-input input');
  setTimeout(() => inputs[0].focus(), 100);
  setupPinInputs(inputs);
}

async function saveNewPin() {
  const pin = Array.from(document.querySelectorAll('#change-pin-input input')).map(i => i.value.replace(/\D/g, '')).join('');
  if (pin.length < 4) { document.getElementById('change-pin-error').textContent = 'Entrez 4 chiffres'; return; }
  try {
    await profilRef(currentUser.id).update({ code_pin: pin });
    closeSheet();
    showToast('Code personnel mis à jour ✓');
  } catch (e) { document.getElementById('change-pin-error').textContent = 'Erreur — réessayez'; }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('famcar_user');
  closeSheet();
  showWelcomeScreen();
  showToast('Déconnecté');
}

// ==========================================
// INIT
// ==========================================
const _joinCode = new URLSearchParams(location.search).get('join');
const _resourceJoinCodeFromUrl = new URLSearchParams(location.search).get('resource_join');
let _pendingResourceJoinCode = _resourceJoinCodeFromUrl || null;

document.addEventListener('DOMContentLoaded', async () => {
  if (currentUser?.familyId) {
    // Show skeleton while data loads
    showSkeleton();
    // Run data migration in background (non-blocking)
    runV2MigrationIfNeeded().catch(e => console.warn('[migration]', e));
    await loadResources();
    enterApp();
    if (_pendingResourceJoinCode) {
      await handleResourceJoinCode(_pendingResourceJoinCode);
      _pendingResourceJoinCode = null;
    }
  } else if (currentUser) {
    runMigrationIfNeeded();
  } else {
    showWelcomeScreen();
    if (_joinCode) {
      startSignup();
      signupChooseJoin();
      const urlInput = document.getElementById('su-invite-url');
      if (urlInput) urlInput.value = `${location.origin}${location.pathname}?join=${_joinCode}`;
    }
  }
});
