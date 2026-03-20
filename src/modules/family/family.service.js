// ==========================================
// FAMILY SERVICE — Business Logic only
// ==========================================
// No UI, no DOM, no Firebase.

const familyService = {
  async getById(familyId) {
    const family = await familyRepository.getById(familyId);
    if (!family) return null;
    return {
      id: family.id,
      name: family.nom || family.name || 'Famille',
    };
  },
};
