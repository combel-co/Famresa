// ==========================================
// ACCESS REPOSITORY — Firebase access only
// ==========================================
// No business logic. Only DB operations.

const accessRepository = {
  async getById(accessId) {
    if (!accessId) return null;
    const doc = await accesRessourceRef().doc(accessId).get().catch(() => null);
    if (!doc || !doc.exists) return null;
    return accesRessourceToJS(doc.data(), doc.id);
  },

  async listByResourceId(resourceId) {
    const [newSnap, legacySnap] = await Promise.all([
      accesRessourceRef().where('ressource_id', '==', resourceId).get().catch(() => ({ docs: [] })),
      accesRessourceRef().where('resourceId', '==', resourceId).get().catch(() => ({ docs: [] })),
    ]);

    const seen = new Set();
    return [...(newSnap.docs || []), ...(legacySnap.docs || [])]
      .filter((doc) => {
        if (!doc?.id || seen.has(doc.id)) return false;
        seen.add(doc.id);
        return true;
      })
      .map((doc) => accesRessourceToJS(doc.data(), doc.id));
  },

  async updateStatus(accessId, status, extraFields = {}) {
    const update = { statut: status, ...extraFields };
    if (status === 'accepted') update.accepted_at = ts();
    await accesRessourceRef().doc(accessId).update(update);
  },
};
