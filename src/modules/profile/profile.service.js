// ==========================================
// PROFILE SERVICE — Business Logic only
// ==========================================
// No UI, no DOM, no Firebase.

const profileService = {
  /**
   * Groups resources by their family, preserving family order.
   * @param {Array<{id:string, name:string}>} families
   * @param {Array<{id:string, famille_id:string}>} resources
   * @returns {Array<{familyId:string, familyName:string, resources:Array}>}
   */
  getResourcesByFamily(families, resources) {
    const list = resources || [];
    const grouped = (families || [])
      .map(f => ({
        familyId: f.id,
        familyName: f.name,
        resources: list.filter(r => (r.famille_id || r.familleId) === f.id),
      }))
      .filter(group => group.resources.length > 0);
    if (grouped.length > 0 || list.length === 0) return grouped;
    // Filet : familles pas encore chargées ou membre invité sans entrée famille_membres
    return [{
      familyId: '__shared__',
      familyName: 'Ressources partagées',
      resources: list.slice(),
    }];
  },
};
