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
   */
  async delete(bookingId) {
    await reservationsRef().doc(bookingId).delete();
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
   * Generate a unique group ID for stay reservations.
   */
  generateGroupId() {
    return 'stay_' + db.collection('reservations').doc().id;
  }
};
