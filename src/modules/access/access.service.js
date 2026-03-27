// ==========================================
// ACCESS SERVICE — Business Logic only
// ==========================================
// No UI, no DOM, no Firebase.

async function _assertResourceAdmin({ accessId, approverProfileId }) {
  if (!approverProfileId) throw new Error('ACCESS_APPROVER_REQUIRED');
  const targetEntry = await accessRepository.getById(accessId);
  if (!targetEntry) throw new Error('ACCESS_NOT_FOUND');

  const resourceId = targetEntry.resourceId ?? targetEntry.ressource_id ?? null;
  if (!resourceId) throw new Error('ACCESS_RESOURCE_ID_MISSING');

  const entries = await accessRepository.listByResourceId(resourceId);
  const approverEntry = entries.find((entry) => {
    const profileId = entry.profileId ?? entry.profil_id;
    const status = entry.status ?? entry.statut;
    return profileId === approverProfileId && status === 'accepted' && entry.role === 'admin';
  });

  if (!approverEntry) throw new Error('ACCESS_FORBIDDEN');
}

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

  async approveManageAccess({ accessId, approverProfileId }) {
    await _assertResourceAdmin({ accessId, approverProfileId });
    await accessRepository.updateStatus(accessId, 'accepted');
  },

  async rejectManageAccess({ accessId, approverProfileId }) {
    await _assertResourceAdmin({ accessId, approverProfileId });
    await accessRepository.updateStatus(accessId, 'rejected');
  },

  async removeManageAccess({ accessId, approverProfileId }) {
    await _assertResourceAdmin({ accessId, approverProfileId });
    await accessRepository.updateStatus(accessId, 'rejected');
  },
};
