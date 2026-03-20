// ==========================================
// FIREBASE CLIENT — Init & Core
// ==========================================
// Source of truth for Firebase initialization.
// Loaded via <script> before js/firebase.js.
// Exposes globals: db, ts

const firebaseConfig = {
  apiKey: "REDACTED_API_KEY",
  authDomain: "REDACTED_PROJECT_ID.firebaseapp.com",
  projectId: "REDACTED_PROJECT_ID",
  storageBucket: "REDACTED_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REDACTED_SENDER_ID",
  appId: "REDACTED_APP_ID",
  measurementId: "REDACTED_MEASUREMENT_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ts = () => firebase.firestore.FieldValue.serverTimestamp();
