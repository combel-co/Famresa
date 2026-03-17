// ==========================================
// FIREBASE CONFIG
// ==========================================
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

function familyRef() {
  if (!currentUser?.familyId) throw new Error('No familyId on currentUser');
  return db.collection('families').doc(currentUser.familyId);
}

// ==========================================
// RESOURCE ACCESS
// ==========================================
function resourceAccessRef() {
  return db.collection('resource_access');
}

async function getMyResourceAccessEntries(profileId, familyId) {
  const snap = await resourceAccessRef()
    .where('profileId', '==', profileId)
    .where('familyId', '==', familyId)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function createResourceAccess(data) {
  const now = firebase.firestore.FieldValue.serverTimestamp();
  return await resourceAccessRef().add({
    ...data,
    invited_at: now,
    accepted_at: data.status === 'accepted' ? now : null
  });
}

async function updateResourceAccessStatus(accessId, status) {
  const update = { status };
  if (status === 'accepted') update.accepted_at = firebase.firestore.FieldValue.serverTimestamp();
  await resourceAccessRef().doc(accessId).update(update);
}

async function getPendingRequestsForFamily(familyId) {
  const snap = await resourceAccessRef()
    .where('familyId', '==', familyId)
    .where('status', '==', 'pending')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getAccessEntriesForResource(resourceId) {
  const snap = await resourceAccessRef()
    .where('resourceId', '==', resourceId)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
