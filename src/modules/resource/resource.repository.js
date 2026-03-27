// ==========================================
// RESOURCE REPOSITORY — Firebase access only
// ==========================================
// No business logic. Only DB operations.

const resourceRepository = {
  async getById(resourceId) {
    if (!resourceId) return null;

    try {
      const doc = await ressourcesRef().doc(resourceId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (_) {
      return null;
    }
  },

  async ensureInviteCode(resourceId, inviteCode) {
    const docRef = ressourcesRef().doc(resourceId);
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const currentCode = doc.data().inviteCode;
    if (currentCode) return currentCode;

    await docRef.update({ inviteCode });
    return inviteCode;
  },

  /** Sets invite code on resource; throws Error with message DUPLICATE if another resource uses it */
  async setInviteCode(resourceId, inviteCode) {
    const docRef = ressourcesRef().doc(resourceId);
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const snap = await ressourcesRef().where('inviteCode', '==', inviteCode).limit(2).get();
    const conflict = snap.docs.find((d) => d.id !== resourceId);
    if (conflict) {
      const err = new Error('DUPLICATE');
      throw err;
    }

    await docRef.update({ inviteCode });
    return inviteCode;
  },

  async deleteById(resourceId) {
    await ressourcesRef().doc(resourceId).delete();
  },

  async updateStatus(resourceId, statusData) {
    await ressourcesRef().doc(resourceId).update({
      vehicleStatus: statusData
    });
  },

  async updateFuelLevel(resourceId, fuelLevel) {
    await ressourcesRef().doc(resourceId).update({ fuelLevel });
  },
};
