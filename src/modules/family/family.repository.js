// ==========================================
// FAMILY REPOSITORY — Firebase access only
// ==========================================
// No business logic. Only DB operations.

const familyRepository = {
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
