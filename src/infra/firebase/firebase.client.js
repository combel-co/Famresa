// ==========================================
// FIREBASE CLIENT — Init & Core
// ==========================================
// Source of truth for Firebase initialization.
// Loaded via <script> before js/firebase.js.
// Exposes globals: db, ts

const firebaseConfig = {
  apiKey: "AIzaSyCf-3Gpbx8FacaeXiwvfSuhsaOJxv2FHTw",
  authDomain: "famcar-e2bb3.firebaseapp.com",
  projectId: "famcar-e2bb3",
  storageBucket: "famcar-e2bb3.firebasestorage.app",
  messagingSenderId: "349994619294",
  appId: "1:349994619294:web:715e9d592c4b2fc025468f",
  measurementId: "G-B9MYJGRNJ1"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ts = () => firebase.firestore.FieldValue.serverTimestamp();

// Explicitly expose globals for cross-browser compatibility (notably iOS Safari/PWA)
window.db = db;
window.ts = ts;
