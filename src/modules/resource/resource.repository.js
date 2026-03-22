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

  async deleteById(resourceId) {
    await ressourcesRef().doc(resourceId).delete();
  },

  async updateStatus(resourceId, statusData) {
    await ressourcesRef().doc(resourceId).update({
      vehicleStatus: statusData
    });
  },
};
