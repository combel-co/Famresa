// ==========================================
// FAMILY REPOSITORY — Firebase access only
// ==========================================
// No business logic. Only DB operations.

const familyRepository = {
  async ensureInviteCode(familyId, newCode) {
    if (!familyId) return null;
    const doc = await familleRef(familyId).get();
    if (!doc.exists) return null;
    const existing = doc.data().inviteCode;
    if (existing) return existing;
    await familleRef(familyId).update({ inviteCode: newCode });
    return newCode;
  },

  async getById(familyId) {
    if (!familyId) return null;

    try {
      const doc = await familleRef(familyId).get();
      if (doc.exists) return { id: doc.id, ...doc.data() };
    } catch (_) {}

    try {
      const legacyDoc = await db.collection('families').doc(familyId).get();
      if (legacyDoc.exists) return { id: legacyDoc.id, ...legacyDoc.data() };
    } catch (_) {}

    return null;
  },
};
