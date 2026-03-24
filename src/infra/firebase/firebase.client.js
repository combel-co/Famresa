// ==========================================
// FIREBASE CLIENT — Init & Core
// ==========================================
// Source of truth for Firebase initialization.
// Loaded via <script> before js/firebase.js.
// Exposes globals: db, ts, __firebaseInitState

const firebaseConfig = {
  apiKey: "AIzaSyCf-3Gpbx8FacaeXiwvfSuhsaOJxv2FHTw",
  authDomain: "famcar-e2bb3.firebaseapp.com",
  projectId: "famcar-e2bb3",
  storageBucket: "famcar-e2bb3.firebasestorage.app",
  messagingSenderId: "349994619294",
  appId: "1:349994619294:web:715e9d592c4b2fc025468f",
  measurementId: "G-B9MYJGRNJ1"
};

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
