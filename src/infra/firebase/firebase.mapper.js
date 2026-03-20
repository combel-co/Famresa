// ==========================================
// FIREBASE MAPPER — Firestore ↔ JS mapping
// ==========================================
// Centralizes field-name translation between
// Firestore documents and internal JS objects.
// Loaded via <script> before js/firebase.js.

function reservationToJS(data, id) {
  return {
    id,
    ...data,
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
    profil_id:    data.userId     ?? data.profil_id,
    ressource_id: data.resourceId ?? data.ressource_id,
    date_debut:   data.startDate  ?? data.date_debut,
    date_fin:     data.endDate    ?? data.date_fin,
  };
}

function accesRessourceToJS(data, id) {
  return {
    id,
    ...data,
    profileId:  data.profil_id    ?? data.profileId,
    resourceId: data.ressource_id ?? data.resourceId,
    status:     data.statut       ?? data.status,
  };
}
