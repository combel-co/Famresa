// ==========================================
// FIREBASE CLIENT — Init & Core
// ==========================================
// Source of truth for Firebase initialization.
// Loaded via <script> before js/firebase.js.
// Exposes globals: db, ts, __firebaseInitState

// Always set init state FIRST so downstream code (auth.js) never sees undefined.
window.__firebaseInitState = {
  status: 'booting',
  startedAt: new Date().toISOString(),
  sdkPresent: false,
  appInitialized: false,
  firestoreReady: false,
  errorCode: '',
  errorMessage: '',
};

try {
  // Firebase config is loaded from firebase-config.js (gitignored).
  // See firebase-config.example.js for the template.
  const firebaseConfig = window.__firebaseConfig;
  if (!firebaseConfig) throw new Error('Firebase config introuvable — copier firebase-config.example.js vers firebase-config.js et remplir les valeurs.');

  const sdk = window.firebase;
  window.__firebaseInitState.sdkPresent = !!sdk;
  if (!sdk) throw new Error('Firebase SDK introuvable (window.firebase absent)');

  if (!sdk.apps || !sdk.apps.length) {
    sdk.initializeApp(firebaseConfig);
  }
  window.__firebaseInitState.appInitialized = true;

  const db = sdk.firestore();
  const ts = () => sdk.firestore.FieldValue.serverTimestamp();

  // Explicitly expose globals for cross-browser compatibility (notably iOS Safari/PWA)
  window.db = db;
  window.ts = ts;

  window.__firebaseInitState.firestoreReady = true;
  window.__firebaseInitState.status = 'ready';
  window.__firebaseInitState.readyAt = new Date().toISOString();
} catch (e) {
  window.__firebaseInitState.status = 'error';
  window.__firebaseInitState.errorCode = e?.code || '';
  window.__firebaseInitState.errorMessage = e?.message || String(e);
  window.__firebaseInitState.failedAt = new Date().toISOString();
  console.error('[firebase.client] initialization failed:', e);
}
