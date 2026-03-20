// ==========================================
// USER SERVICE — Business Logic only
// ==========================================
// No UI, no DOM, no Firebase.

function _userDisplayName(source, fallback) {
  return source?.nom || source?.name || fallback || 'Membre';
}

function _userInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

const userService = {
  async getIdentity({ familyId, profileId }) {
    const profile = await userRepository.getProfileById(profileId);
    const familyMember = profile ? null : await userRepository.getFamilyMember(familyId, profileId);
    const source = profile || familyMember || null;
    const name = _userDisplayName(source, profileId);

    return {
      id: profileId,
      name,
      photo: source?.photo || null,
      createdAt: source?.createdAt || null,
      initials: _userInitials(name),
    };
  },

  async getIdentityMap({ familyId, profileIds }) {
    const uniqueIds = [...new Set((profileIds || []).filter(Boolean))];
    const entries = await Promise.all(uniqueIds.map(async (profileId) => {
      const identity = await this.getIdentity({ familyId, profileId });
      return [profileId, identity];
    }));
    return Object.fromEntries(entries);
  },
};
