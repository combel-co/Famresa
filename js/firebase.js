// ==========================================
// FIREBASE CONFIG
// ==========================================
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

// ==========================================
// COLLECTION REFERENCES — NEW SCHEMA
// ==========================================

// PROFIL (was: users)
function profilsRef() { return db.collection('profils'); }
function profilRef(id) { return profilsRef().doc(id); }

// FAMILLE (was: families)
function famillesRef() { return db.collection('familles'); }
function familleRef(id) { return famillesRef().doc(id || currentUser?.familyId); }

// Compat alias for old code still using familyRef()
function familyRef() {
  if (!currentUser?.familyId) throw new Error('No familyId on currentUser');
  return familleRef(currentUser.familyId);
}

// FAMILLE_MEMBRE (was: families/{id}/members)
function familleMembresRef() { return db.collection('famille_membres'); }

async function getFamilleMembers(familyId) {
  const snap = await familleMembresRef()
    .where('famille_id', '==', familyId)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getFamilleMember(familyId, profilId) {
  const snap = await familleMembresRef()
    .where('famille_id', '==', familyId)
    .where('profil_id', '==', profilId)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// RESSOURCE (was: families/{id}/resources)
function ressourcesRef() { return db.collection('ressources'); }

async function getFamilleRessources(familyId) {
  const snap = await ressourcesRef()
    .where('famille_id', '==', familyId)
    .get();
  // Sort by nom client-side (avoids composite index)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nom || a.name || '').localeCompare(b.nom || b.name || ''));
}

// RESERVATION (was: families/{id}/bookings)
// Maps Firestore fields ↔ JS fields
function reservationsRef() { return db.collection('reservations'); }

function reservationToJS(data, id) {
  return {
    id,
    ...data,
    // Map new field names → JS internal names used throughout the app
    userId:     data.profil_id    ?? data.userId,
    resourceId: data.ressource_id ?? data.resourceId,
    carId:      data.ressource_id ?? data.carId,
    startDate:  data.date_debut   ?? data.startDate,
    endDate:    data.date_fin     ?? data.endDate,
  };
}

function jsToReservation(data) {
  return {
    ...data,
    // Map JS field names → new Firestore field names
    profil_id:    data.userId     ?? data.profil_id,
    ressource_id: data.resourceId ?? data.ressource_id,
    date_debut:   data.startDate  ?? data.date_debut,
    date_fin:     data.endDate    ?? data.date_fin,
  };
}

async function getReservationsByRessource(ressourceId) {
  const snap = await reservationsRef()
    .where('ressource_id', '==', ressourceId)
    .get();
  return snap.docs.map(d => reservationToJS(d.data(), d.id));
}

// ACCES_RESSOURCE (was: resource_access)
function accesRessourceRef() { return db.collection('acces_ressource'); }

function accesRessourceToJS(data, id) {
  return {
    id,
    ...data,
    profileId:  data.profil_id    ?? data.profileId,
    resourceId: data.ressource_id ?? data.resourceId,
    status:     data.statut       ?? data.status,
  };
}

async function getMyResourceAccessEntries(profilId, familyId) {
  // Single-field query (no composite index needed) + client-side filter
  const snap = await accesRessourceRef()
    .where('profil_id', '==', profilId)
    .get();
  return snap.docs
    .map(d => accesRessourceToJS(d.data(), d.id))
    .filter(e => {
      // Filter by family via ressource lookup isn't possible here without joins.
      // Keep famille_id on acces_ressource for this filter during transition.
      return !familyId || e.famille_id === familyId || e.familyId === familyId;
    });
}

async function createResourceAccess(data) {
  return await accesRessourceRef().add({
    profil_id:    data.profileId  ?? data.profil_id,
    ressource_id: data.resourceId ?? data.ressource_id,
    famille_id:   data.familyId   ?? data.famille_id,
    role:         data.role,
    statut:       data.status     ?? data.statut ?? 'pending',
    invited_at:   ts(),
    accepted_at:  (data.status === 'accepted' || data.statut === 'accepted') ? ts() : null,
  });
}

async function updateResourceAccessStatus(accessId, status) {
  const update = { statut: status };
  if (status === 'accepted') update.accepted_at = ts();
  await accesRessourceRef().doc(accessId).update(update);
}

async function getPendingRequestsForFamily(familyId) {
  const snap = await accesRessourceRef()
    .where('famille_id', '==', familyId)
    .get();
  return snap.docs
    .map(d => accesRessourceToJS(d.data(), d.id))
    .filter(e => (e.statut ?? e.status) === 'pending');
}

async function getAccessEntriesForResource(resourceId) {
  const snap = await accesRessourceRef()
    .where('ressource_id', '==', resourceId)
    .get();
  return snap.docs.map(d => accesRessourceToJS(d.data(), d.id));
}

// CHECKLIST_STATUTS (was: families/{id}/checklistStatus)
function checklistStatutsRef() { return db.collection('checklist_statuts'); }

// EVENEMENTS_SEJOUR (was: families/{id}/houseEvents)
function evenementsSejourRef() { return db.collection('evenements_sejour'); }

// GUIDES_MAISON (was: families/{id}/houseGuides)
function guidesMaisonRef() { return db.collection('guides_maison'); }
