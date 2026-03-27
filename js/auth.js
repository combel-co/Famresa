// ==========================================
// AUTH — WELCOME / LOGIN / SIGNUP / PROFILE
// ==========================================
const AUTH_BUILD = 'auth-v14-20260324';

function showWelcomeScreen() {
  hideSplash();
  hideSkeleton();
  document.body.classList.add('auth-mode');
  document.documentElement.style.setProperty('--sheet-bottom-offset', '0px');
  document.getElementById('app-header').style.display = 'none';
  document.getElementById('app-main').style.display = 'none';
  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) bottomNav.style.display = 'none';
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('signup-overlay').classList.add('hidden');
  document.getElementById('welcome-screen').style.display = 'flex';
}

// ---- LOGIN ----
function connectUser() {
  document.body.classList.add('auth-mode');
  document.documentElement.style.setProperty('--sheet-bottom-offset', '0px');
  document.getElementById('welcome-screen').style.display = 'none';
  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) bottomNav.style.display = 'none';
  const emailEl = document.getElementById('login-email');
  if (emailEl) emailEl.value = '';
  clearPinInputs('#login-pin input');
  document.getElementById('login-error').textContent = '';
  const diagBox = document.getElementById('login-diagnostic');
  const diagText = document.getElementById('login-diagnostic-text');
  if (diagBox) diagBox.style.display = 'none';
  if (diagText) diagText.textContent = '';
  document.getElementById('login-overlay').classList.remove('hidden');
  _setupLoginDiagGesture();
  const pins = document.querySelectorAll('#login-pin input');
  setupPinInputs(pins, loginUser);
  // Keep the PIN flow stable on iOS: do not steal focus back to email.
  // If needed, user can tap email manually.
}

// Legacy hook kept for compatibility with older auth flows.
function _setupLoginDiagGesture() {
  // No-op: diagnostic is now opened via the explicit "i" button.
}

function _renderLoginDiagnostic(payload) {
  const diagBox = document.getElementById('login-diagnostic');
  const diagText = document.getElementById('login-diagnostic-text');
  if (!diagBox || !diagText) return;

  if (!payload) {
    diagText.textContent = 'Aucun diagnostic enregistré pour le moment. Réessayez puis copiez le diagnostic si le problème continue.';
    return;
  }

  diagText.textContent = `Diagnostic ${payload.ref || 'n/a'} (${payload.build || 'build ?'}): ${payload.stage || 'unknown'}${payload.errorCode ? ` (${payload.errorCode})` : ''}. Vous pouvez copier ce message et me l’envoyer.`;
}

window.toggleLoginDiagnostic = function toggleLoginDiagnostic() {
  const diagBox = document.getElementById('login-diagnostic');
  if (!diagBox) return;
  if (diagBox.style.display === 'block') {
    diagBox.style.display = 'none';
    return;
  }
  _renderLoginDiagnostic(window.showLastLoginDiagnostic());
  diagBox.style.display = 'block';
};

async function _validateDiagAdminCode(inputCode) {
  const code = String(inputCode || '').trim();
  if (!code) return false;
  if (sessionStorage.getItem('famresa_diag_admin_unlocked') === '1') return true;

  const localCode = localStorage.getItem('famresa_diag_admin_code');
  if (localCode && code === localCode) return true;

  // Server-side config fallback (if available): config/access.adminDiagCode | diagAdminCode | pin
  try {
    if (window.db) {
      const cfg = await db.collection('config').doc('access').get();
      if (cfg.exists) {
        const d = cfg.data() || {};
        const serverCode = String(d.adminDiagCode || d.diagAdminCode || d.pin || '').trim();
        if (serverCode && code === serverCode) return true;
      }
    }
  } catch (_) {}

  return false;
}
window.verifyDiagAdminCode = _validateDiagAdminCode;

window.openLoginDiagnosticSecure = async function openLoginDiagnosticSecure() {
  const code = window.prompt('Code admin requis');
  if (!code) return;
  const ok = await _validateDiagAdminCode(code);
  if (!ok) {
    showToast('Code admin invalide');
    return;
  }
  sessionStorage.setItem('famresa_diag_admin_unlocked', '1');
  window.toggleLoginDiagnostic();
};

function _isAuthDebugEnabled() {
  try {
    const qs = new URLSearchParams(location.search);
    return qs.get('debug_auth') === '1' || localStorage.getItem('famresa_debug_auth') === '1';
  } catch (_) {
    return false;
  }
}

function _authPublicErrorMessage(err) {
  const code = String(err?.code || '').toLowerCase();
  if (code.includes('permission-denied')) return 'Accès refusé Firestore (règles) — contactez l’admin';
  if (code.includes('unavailable')) return 'Serveur indisponible — vérifiez votre connexion';
  if (code.includes('deadline-exceeded')) return 'Délai dépassé — réessayez';
  if (code.includes('failed-precondition')) return 'Configuration Firestore incomplète';
  return 'Erreur — réessayez';
}

function _stageReason(stage) {
  switch (stage) {
    case 'query_profils_by_email':
    case 'query_users_by_email':
      return 'Impossible de vérifier le compte';
    case 'firebase_ready_check':
      return 'Initialisation Firebase incomplète (cache PWA probable)';
    case 'auto_create_profil':
      return 'Impossible d’initialiser le profil';
    case 'run_v1_migration':
    case 'run_v2_migration':
      return 'Migration des données incomplète';
    case 'load_resources':
      return 'Chargement des ressources impossible';
    default:
      return 'Erreur de connexion';
  }
}

function _authErrorForUI(err, stage) {
  const code = String(err?.code || '').trim();
  const base = _authPublicErrorMessage(err);
  if (base !== 'Erreur — réessayez') return base;
  const stageMsg = _stageReason(stage);
  if (_isAuthDebugEnabled()) {
    const raw = String(err?.message || '').slice(0, 120);
    return `${stageMsg}${code ? ` (${code})` : ''}${raw ? ` — ${raw}` : ''}`;
  }
  return stageMsg;
}

function _recordAuthDiag(diag) {
  try {
    const ref = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const payload = {
      ...diag,
      build: AUTH_BUILD,
      ref,
      at: new Date().toISOString(),
      userAgent: navigator.userAgent,
      swControlled: !!navigator.serviceWorker?.controller,
      familyId: currentUser?.familyId || diag?.familyId || null,
      firebaseInit: window.__firebaseInitState || null,
    };
    localStorage.setItem('famresa_last_login_diag', JSON.stringify(payload));
    window.__famresaLastLoginDiag = payload;
    _persistAuthDiagToFirestore(payload);
    return payload;
  } catch (_) {}
  return null;
}

async function _persistAuthDiagToFirestore(payload) {
  try {
    if (!window.db || !payload) return;
    await db.collection('erreur').add({
      source: 'login',
      ref: payload.ref || '',
      build: payload.build || '',
      stage: payload.stage || '',
      errorCode: payload.errorCode || '',
      errorMessage: payload.errorMessage || '',
      email: payload.email || '',
      familyId: payload.familyId || currentUser?.familyId || null,
      userAgent: payload.userAgent || '',
      swControlled: !!payload.swControlled,
      firebaseInit: payload.firebaseInit || null,
      createdAt: ts(),
    });
  } catch (_) {
    // Never block login flow if diagnostics persistence fails
  }
}

window.showLastLoginDiagnostic = function showLastLoginDiagnostic() {
  try {
    const raw = localStorage.getItem('famresa_last_login_diag');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    console.table(parsed);
    return parsed;
  } catch (_) {
    return null;
  }
};

window.copyLastLoginDiagnostic = async function copyLastLoginDiagnostic() {
  const payload = window.showLastLoginDiagnostic();
  if (!payload) {
    showToast('Aucun diagnostic trouvé');
    return;
  }
  const message = [
    `Build: ${payload.build || '-'}`,
    `Ref: ${payload.ref || '-'}`,
    `Etape: ${payload.stage || '-'}`,
    `Code: ${payload.errorCode || '-'}`,
    `Message: ${payload.errorMessage || '-'}`,
    `Date: ${payload.at || '-'}`,
  ].join('\n');

  try {
    await navigator.clipboard.writeText(message);
    showToast('Diagnostic copié ✓');
  } catch (_) {
    showToast(`Diagnostic: ${payload.ref || 'n/a'}`);
  }
};

async function loginUser() {
  const email = (document.getElementById('login-email')?.value || '').trim().toLowerCase();
  const pin = getPinFromInputs('#login-pin input');
  const errEl = document.getElementById('login-error');
  if (!email || !email.includes('@')) { errEl.textContent = 'Email invalide'; return; }
  if (pin.length < 4) { errEl.textContent = 'Entrez votre code à 4 chiffres'; return; }
  errEl.textContent = '';
  showSkeleton();
  let stage = 'start';
  const diag = { flow: 'loginUser', email, stage };
  try {
    stage = 'firebase_ready_check'; diag.stage = stage;
    // Use window.* only to avoid Safari TDZ errors in partial/stale PWA runtimes.
    const initState = window.__firebaseInitState || {};
    const hasFirebase = !!window.firebase && typeof window.firebase.firestore === 'function';
    const hasDb = !!window.db && typeof window.db.collection === 'function';

    if (initState.status === 'error') {
      const reason = initState.errorMessage || 'initialisation Firebase échouée';
      throw new Error(`Firebase init failed: ${reason}`);
    }

    if (!hasFirebase || !hasDb) {
      const phase = initState.status === 'booting' ? 'en cours' : 'incomplète';
      throw new Error(`Firebase ${phase} (SDK ou cache PWA obsolète)`);
    }

    // Try new collection first; if permission denied/unavailable, fall through to legacy
    let doc = null, data = null;
    try {
      stage = 'query_profils_by_email'; diag.stage = stage;
      const newSnap = await profilsRef().where('email', '==', email).get();
      if (!newSnap.empty) {
        const d = newSnap.docs[0].data();
        if (String(d.code_pin ?? d.pin) !== pin) { hideSkeleton(); errEl.textContent = 'Code incorrect'; return; }
        doc = newSnap.docs[0]; data = d;
        diag.source = 'profils';
      }
    } catch(_) { /* profils not accessible yet — fall through to users */ }

    const allowLegacyFallback = (typeof isLegacyFallbackAllowed === 'function')
      ? isLegacyFallbackAllowed()
      : true;

    if (!doc && allowLegacyFallback) {
      // Legacy path — users collection
      stage = 'query_users_by_email'; diag.stage = stage;
      const oldSnap = await db.collection('users').where('email', '==', email).get();
      if (oldSnap.empty) { hideSkeleton(); errEl.textContent = 'Email introuvable'; return; }
      const d = oldSnap.docs[0].data();
      if (String(d.pin) !== pin) { hideSkeleton(); errEl.textContent = 'Code incorrect'; return; }
      doc = oldSnap.docs[0]; data = d;
      diag.source = 'users_legacy';

      // Auto-migrate legacy user profile (users -> profils) to avoid login dead-ends
      try {
        stage = 'auto_create_profil'; diag.stage = stage;
        const existingProfil = await profilRef(doc.id).get();
        if (!existingProfil.exists) {
          await profilRef(doc.id).set({
            nom: d.name || '',
            email: d.email || email,
            code_pin: d.pin || '',
            photo: d.photo || null,
            familyId: d.familyId || null,
            createdAt: d.createdAt || ts(),
          }, { merge: true });
        }
      } catch (_) { /* non-blocking */ }
    }

    if (!doc) { hideSkeleton(); errEl.textContent = 'Email introuvable'; return; }

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
      stage = 'run_v1_migration'; diag.stage = stage;
      await runMigrationIfNeeded();
    } else {
      showSkeleton();
      stage = 'run_v2_migration'; diag.stage = stage;
      await runV2MigrationIfNeeded();
      stage = 'load_resources'; diag.stage = stage;
      await loadResources();
      stage = 'enter_app'; diag.stage = stage;
      enterApp('dashboard');
      showToast(`Bonjour ${currentUser.name} !`);
      if (_pendingResourceJoinCode) {
        await handleResourceJoinCode(_pendingResourceJoinCode);
        _pendingResourceJoinCode = null;
      }
    }
  } catch(e) {
    hideSkeleton();
    diag.stage = stage;
    diag.errorCode = e?.code || '';
    diag.errorMessage = e?.message || String(e);
    const payload = _recordAuthDiag(diag);
    if (_isAuthDebugEnabled()) {
      console.error('[auth login diagnostic]', diag, e);
    } else {
      console.error(e);
    }
    const uiError = _authErrorForUI(e, stage);
    errEl.textContent = uiError;
    const diagBox = document.getElementById('login-diagnostic');
    if (diagBox && payload && _isAuthDebugEnabled()) {
      _renderLoginDiagnostic(payload);
      diagBox.style.display = 'block';
    }
    if (_isAuthDebugEnabled()) showToast(`Diagnostic login enregistré`);
  }
}

// ---- SIGNUP ----
let suTempPhoto = null;
let suInviteUrl = '';
let _isSubmittingFamily = false;

function startSignup() {
  document.body.classList.add('auth-mode');
  document.documentElement.style.setProperty('--sheet-bottom-offset', '0px');
  document.getElementById('welcome-screen').style.display = 'none';
  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) bottomNav.style.display = 'none';
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
    clearPinInputs('#su-user-pin input');
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
  clearPinInputs('#su-family-pin input, #su-family-pin-confirm input');
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
  if (!url) { errEl.textContent = 'Entrez le code d\'invitation'; return; }
  let code = '';
  try {
    const u = new URL(url);
    code = u.searchParams.get('join') || '';
  } catch(e) {
    // Not a URL — treat as raw invite code
    code = url.replace(/\s/g, '').toUpperCase();
  }
  if (!code) { errEl.textContent = 'Code invalide'; return; }
  errEl.textContent = '';
  try {
    // Try new collection first, fallback to legacy
    let snap = await famillesRef().where('inviteCode', '==', code).limit(1).get();
    if (snap.empty) snap = await db.collection('families').where('inviteCode', '==', code).limit(1).get();
    if (snap.empty) { errEl.textContent = 'Code invalide ou expiré'; return; }
    suPendingFamilyId = snap.docs[0].id;
    showSignupStep(3);
  } catch(e) { errEl.textContent = 'Erreur — réessayez'; }
}

async function signupCreateAdvance() {
  if (_isSubmittingFamily) return;
  const familyName = (document.getElementById('su-family-name')?.value || '').trim();
  const pin = getPinFromInputs('#su-family-pin input');
  const confirm = getPinFromInputs('#su-family-pin-confirm input');
  const errEl = document.getElementById('su-create-error');
  if (!familyName) { errEl.textContent = 'Entrez un nom pour votre famille'; return; }
  if (pin.length < 4) { errEl.textContent = 'Entrez le code familial (4 chiffres)'; return; }
  if (pin !== confirm) { errEl.textContent = 'Les codes ne correspondent pas'; return; }
  errEl.textContent = '';
  _isSubmittingFamily = true;
  const inviteCode = generateInviteCode();
  suInviteUrl = inviteCode;
  try {
    const familyDocRef = await famillesRef().add({
      nom: familyName, pin, inviteCode,
      created_by: null, // set after user profile is created
      createdAt: ts()
    });
    suPendingFamilyId = familyDocRef.id;
    document.querySelectorAll('.su-step').forEach(s => s.classList.add('hidden'));
    document.getElementById('su-step-2b-link').classList.remove('hidden');
    document.getElementById('su-invite-display').textContent = `Code d'invitation : ${inviteCode}`;
  } catch(e) { errEl.textContent = 'Erreur — réessayez'; } finally { _isSubmittingFamily = false; }
}

function copyInviteLink() {
  const appUrl = `${location.origin}${location.pathname}`;
  const message = `Rejoins la famille sur Resa-voiture !\n${appUrl}\nCode d'invitation : ${suInviteUrl}`;
  navigator.clipboard?.writeText(message).then(() => showToast('Code copié !')).catch(() => showToast('Code : ' + suInviteUrl));
}

function handleSignupPhoto(input) {
  resizePhotoFile(input.files[0], (dataUrl) => {
    suTempPhoto = dataUrl;
    const preview = document.getElementById('su-photo-preview');
    if (preview) { preview.innerHTML = `<img src="${dataUrl}" alt="">`; preview.classList.add('has-photo'); }
  });
}

async function signupProfileAdvance() {
  const name = (document.getElementById('su-name')?.value || '').trim();
  const email = (document.getElementById('su-email')?.value || '').trim().toLowerCase();
  const pin = getPinFromInputs('#su-user-pin input');
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
    showSkeleton();
    await loadResources();
    if (_pendingResourceJoinCode) {
      await handleResourceJoinCode(_pendingResourceJoinCode);
      _pendingResourceJoinCode = null;
    }
    enterApp('dashboard');
    celebrate('🎉', `Bienvenue ${name} !`, '+50 XP', 'Tu fais partie de la famille !');
  } catch(e) { hideSkeleton(); console.error(e); errEl.textContent = 'Erreur — réessayez'; }
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
  const create = getPinFromInputs('#ob-pin-create input');
  const confirm = getPinFromInputs('#ob-pin-confirm input');
  const errEl = document.getElementById('ob-pin-error');
  if (create.length < 4) { errEl.textContent = 'Entrez 4 chiffres'; return; }
  if (create !== confirm) { errEl.textContent = 'Les codes ne correspondent pas'; return; }
  errEl.textContent = '';
  _isSubmittingFamily = true;
  try {
    const familyDocRef = await famillesRef().add({
      nom: 'Ma famille', pin: create, inviteCode: generateInviteCode(),
      created_by: null, createdAt: ts()
    });
    suPendingFamilyId = familyDocRef.id;
    showOnboardingStep(3);
  } catch (e) { errEl.textContent = 'Erreur — réessayez'; } finally { _isSubmittingFamily = false; }
}

async function obStep3Advance() {
  const name = document.getElementById('ob-name')?.value.trim() || '';
  const email = document.getElementById('ob-email')?.value.trim() || '';
  const pin = getPinFromInputs('#ob-user-pin input');
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
    clearPinInputs(create);
    clearPinInputs(confirm);
    setupPinInputs(create, () => confirm[0].focus());
    setupPinInputs(confirm, obStep2Advance);
    setTimeout(() => create[0].focus(), 300);
  }
  if (n === 3) {
    const pins = document.querySelectorAll('#ob-user-pin input');
    clearPinInputs(pins);
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
  enterApp('dashboard');
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
        inviteCode: configData.inviteCode || generateInviteCode(),
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
    await runV2MigrationIfNeeded();
    await loadResources();
    enterApp('dashboard');
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
  switchTab('profile');
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

function changeProfilePhoto(input) {
  if (!input.files[0] || !currentUser) return;
  resizePhotoFile(input.files[0], async (photo) => {
    try {
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
  });
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
  const pin = getPinFromInputs('#change-pin-input input');
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
    // Ensure migration completes before loading resources
    await runV2MigrationIfNeeded();
    await loadResources();
    enterApp('dashboard');
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
      if (urlInput) urlInput.value = _joinCode;
    }
  }
});
