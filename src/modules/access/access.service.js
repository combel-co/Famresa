// ==========================================
// ACCESS SERVICE — Business Logic only
// ==========================================
// No UI, no DOM, no Firebase.

const accessService = {
  async listByResourceId(resourceId) {
    const entries = await accessRepository.listByResourceId(resourceId);
    return entries.map((entry) => ({
      id: entry.id,
      profileId: entry.profileId ?? entry.profil_id ?? null,
      resourceId: entry.resourceId ?? entry.ressource_id ?? null,
      familyId: entry.familyId ?? entry.famille_id ?? null,
      role: entry.role || 'member',
      status: entry.status ?? entry.statut ?? 'pending',
      invitedAt: entry.invitedAt ?? entry.invited_at ?? null,
      acceptedAt: entry.acceptedAt ?? entry.accepted_at ?? null,
    }));
  },

  async approveManageAccess({ accessId }) {
    await accessRepository.updateStatus(accessId, 'accepted');
  },

  async rejectManageAccess({ accessId }) {
    await accessRepository.updateStatus(accessId, 'rejected');
  },

  async removeManageAccess({ accessId }) {
    await accessRepository.updateStatus(accessId, 'rejected');
  },
};
