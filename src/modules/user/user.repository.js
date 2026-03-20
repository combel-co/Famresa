// ==========================================
// USER REPOSITORY — Firebase access only
// ==========================================
// No business logic. Only DB operations.

const userRepository = {
  async getProfileById(profileId) {
    if (!profileId) return null;

    try {
      const doc = await profilRef(profileId).get();
      if (doc.exists) return { id: doc.id, ...doc.data() };
    } catch (_) {}

    return null;
  },

  async getFamilyMember(familyId, profileId) {
    if (!familyId || !profileId) return null;

    try {
      const snap = await familleMembresRef()
        .where('famille_id', '==', familyId)
        .where('profil_id', '==', profileId)
        .limit(1)
        .get();
      if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (_) {}

    return null;
  },
};
