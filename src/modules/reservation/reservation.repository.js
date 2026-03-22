// ==========================================
// RESERVATION REPOSITORY — Firebase access only
// ==========================================
// No business logic. Only DB operations.
// Uses globals: reservationsRef, db, ts

const reservationRepository = {

  /**
   * Create a single reservation document.
   */
  async create(data) {
    return reservationsRef().add({
      ...data,
      createdAt: ts()
    });
  },

  /**
   * Create multiple reservation documents in a single batch.
   * @param {Array<Object>} docsData - array of document data
   */
  async createBatch(docsData) {
    const batch = db.batch();
    for (const data of docsData) {
      const ref = reservationsRef().doc();
      batch.set(ref, { ...data, createdAt: ts() });
    }
    await batch.commit();
  },

  /**
   * Delete a single reservation by ID.
   * Also attempts deletion from the legacy families/{familyId}/bookings collection
   * so that bookings created before the migration are fully removed.
   */
  async delete(bookingId, familyId) {
    await reservationsRef().doc(bookingId).delete();
    if (familyId) {
      try {
        await db.collection('families').doc(familyId)
          .collection('bookings').doc(bookingId).delete();
      } catch (_) {}
    }
  },

  /**
   * Delete all reservations matching a stay group ID.
   */
  async deleteByGroup(groupId) {
    const snap = await reservationsRef()
      .where('reservationGroupId', '==', groupId).get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  },

  /**
   * Update fields on a single reservation.
   */
  async update(bookingId, data) {
    await reservationsRef().doc(bookingId).update(data);
  },

  /**
   * Count unique reservations linked to a resource across new and legacy fields.
   */
  async countByResourceId(resourceId) {
    const [newSnap, legacySnap, carSnap] = await Promise.all([
      reservationsRef().where('ressource_id', '==', resourceId).get().catch(() => ({ docs: [] })),
      reservationsRef().where('resourceId', '==', resourceId).get().catch(() => ({ docs: [] })),
      reservationsRef().where('carId', '==', resourceId).get().catch(() => ({ docs: [] })),
    ]);

    const ids = new Set();
    [...(newSnap.docs || []), ...(legacySnap.docs || []), ...(carSnap.docs || [])].forEach((doc) => {
      if (doc?.id) ids.add(doc.id);
    });
    return ids.size;
  },

  /**
   * Generate a unique group ID for stay reservations.
   */
  generateGroupId() {
    return 'stay_' + db.collection('reservations').doc().id;
  }
};
