// ==========================================
// FIREBASE CLIENT — Init & Core
// ==========================================
// Source of truth for Firebase initialization.
// Loaded via <script> before js/firebase.js.
// Exposes globals: db, ts, __firebaseInitState

const firebaseConfig = {
  apiKey: "REDACTED_API_KEY",
  authDomain: "REDACTED_PROJECT_ID.firebaseapp.com",
  projectId: "REDACTED_PROJECT_ID",
  storageBucket: "REDACTED_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REDACTED_SENDER_ID",
  appId: "REDACTED_APP_ID",
  measurementId: "REDACTED_MEASUREMENT_ID"
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
