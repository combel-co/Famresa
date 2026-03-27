// ==========================================
// FIREBASE CONFIG
// ==========================================
// Init + db + ts are now in src/infra/firebase/firebase.client.js
// Mappers (reservationToJS, jsToReservation, accesRessourceToJS)
// are now in src/infra/firebase/firebase.mapper.js

// ==========================================
// COLLECTION REFERENCES — NEW SCHEMA
// ==========================================

// PROFIL (was: users)
function profilsRef() { return db.collection('profils'); }
function profilRef(id) { return profilsRef().doc(id); }
const _profilPhotoCache = new Map();

async function getProfilPhoto(profilId) {
  const id = String(profilId || '').trim();
  if (!id || id === 'external') return null;
  if (_profilPhotoCache.has(id)) return _profilPhotoCache.get(id);
  try {
    const snap = await profilRef(id).get();
    if (!snap.exists) {
      _profilPhotoCache.set(id, null);
      return null;
    }
    const photo = snap.data()?.photo || null;
    _profilPhotoCache.set(id, photo);
    return photo;
  } catch (_) {
    return null;
  }
}

async function getCurrentPhotoForBooking(booking) {
  const profileId = booking?.userId || booking?.profil_id || booking?.profileId || null;
  const livePhoto = await getProfilPhoto(profileId);
  return livePhoto || booking?.photo || null;
}

function _normalizeAddressPart(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getResourceStructuredAddress(resource) {
  const r = resource || {};
  return {
    street: _normalizeAddressPart(r.address_street || r.addressStreet || r.street || r.adresse_rue || ''),
    city: _normalizeAddressPart(r.address_city || r.addressCity || r.city || r.ville || ''),
    postalCode: _normalizeAddressPart(r.address_postal_code || r.addressPostalCode || r.postalCode || r.code_postal || ''),
    country: _normalizeAddressPart(r.address_country || r.addressCountry || r.country || r.pays || '')
  };
}

function formatStructuredAddress(addressObj) {
  const a = addressObj || {};
  const street = _normalizeAddressPart(a.street);
  const city = _normalizeAddressPart(a.city);
  const postalCode = _normalizeAddressPart(a.postalCode);
  const country = _normalizeAddressPart(a.country);
  // Affichage : rue, ville, code postal, pays
  return [street, city, postalCode, country].filter(Boolean).join(', ');
}

function getResourceAddressDisplay(resource, fallback = 'Adresse non renseignée') {
  const structured = formatStructuredAddress(getResourceStructuredAddress(resource));
  if (structured) return structured;
  const flat = _normalizeAddressPart(resource?.address || resource?.adresse || '');
  return flat || fallback;
}

function hasUsableResourceAddress(resource) {
  return getResourceAddressDisplay(resource, '') !== '';
}

function getEncodedResourceAddress(resource) {
  const label = getResourceAddressDisplay(resource, '');
  return label ? encodeURIComponent(label) : '';
}

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

async function getRessourcesByIds(resourceIds) {
  const ids = [...new Set((resourceIds || []).filter(Boolean))];
  if (ids.length === 0) return [];
  const docs = await Promise.all(ids.map(async (id) => {
    try {
      const snap = await ressourcesRef().doc(id).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...snap.data() };
    } catch (_) {
      return null;
    }
  }));
  return docs
    .filter(Boolean)
    .sort((a, b) => (a.nom || a.name || '').localeCompare(b.nom || b.name || ''));
}

// RESERVATION (was: families/{id}/bookings)
// Maps Firestore fields ↔ JS fields
function reservationsRef() { return db.collection('reservations'); }

// reservationToJS + jsToReservation → src/infra/firebase/firebase.mapper.js

async function getReservationsByRessource(ressourceId) {
  const snap = await reservationsRef()
    .where('ressource_id', '==', ressourceId)
    .get();
  return snap.docs.map(d => reservationToJS(d.data(), d.id));
}

// ACCES_RESSOURCE (was: resource_access)
function accesRessourceRef() { return db.collection('acces_ressource'); }

// accesRessourceToJS → src/infra/firebase/firebase.mapper.js

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

// Finds access docs for (resourceId, profilId), handling both new and legacy field names.
// Returns raw Firestore DocumentSnapshots (not mapped JS objects).
async function findResourceAccessDocs(resourceId, profilId) {
  const [newSnap, legacySnap] = await Promise.all([
    accesRessourceRef()
      .where('ressource_id', '==', resourceId)
      .where('profil_id', '==', profilId)
      .get()
      .catch(() => ({ docs: [] })),
    accesRessourceRef()
      .where('resourceId', '==', resourceId)
      .where('profileId', '==', profilId)
      .get()
      .catch(() => ({ docs: [] })),
  ]);

  const seen = new Set();
  return [...(newSnap.docs || []), ...(legacySnap.docs || [])].filter((doc) => {
    if (!doc?.id || seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
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
