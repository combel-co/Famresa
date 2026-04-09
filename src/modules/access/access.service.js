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

function _entryAccepted(entry) {
  return (entry.status ?? entry.statut) === 'accepted';
}

function _entryRole(entry) {
  return entry.role || 'member';
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

  /**
   * Change le rôle d’un accès accepté (ex. membre → admin). Réservé aux admins de la ressource.
   * @throws {Error} ACCESS_FORBIDDEN, ACCESS_NOT_FOUND, ACCESS_INVALID_STATE, LAST_ADMIN, INVALID_ROLE
   */
  async setAccessRole({ accessId, newRole, actorProfileId }) {
    const allowed = new Set(['admin', 'member', 'guest']);
    if (!allowed.has(newRole)) throw new Error('INVALID_ROLE');

    await _assertResourceAdmin({ accessId, approverProfileId: actorProfileId });

    const target = await accessRepository.getById(accessId);
    if (!target) throw new Error('ACCESS_NOT_FOUND');
    if (!_entryAccepted(target)) throw new Error('ACCESS_INVALID_STATE');

    const currentRole = _entryRole(target);
    if (currentRole === newRole) return;

    const resourceId = target.resourceId ?? target.ressource_id ?? null;
    if (!resourceId) throw new Error('ACCESS_RESOURCE_ID_MISSING');

    const entries = await accessRepository.listByResourceId(resourceId);
    const adminCount = entries.filter((e) => _entryAccepted(e) && _entryRole(e) === 'admin').length;

    if (currentRole === 'admin' && newRole !== 'admin' && adminCount <= 1) {
      throw new Error('LAST_ADMIN');
    }

    await accessRepository.updateRole(accessId, newRole);
  },

  /**
   * Accepte l’accès d’un invité en attente si le PIN ressource (joinPin) correspond.
   * Ne requiert pas d’être admin (auto-déblocage).
   */
  async acceptPendingWithJoinPin({ resourceId, profileId, pin }) {
    if (!resourceId || !profileId) throw new Error('INVALID');
    const resource = await resourceRepository.getById(resourceId);
    if (!resource) throw new Error('RESOURCE_NOT_FOUND');
    const stored = String(resource.joinPin || '').replace(/\D/g, '');
    const normalized = String(pin || '').replace(/\D/g, '').slice(0, 4);
    if (!stored || stored.length !== 4) throw new Error('NO_JOIN_PIN');
    if (normalized !== stored) throw new Error('PIN_MISMATCH');

    const entries = await accessRepository.listByResourceId(resourceId);
    const pending = entries.find((entry) => {
      const pid = entry.profileId ?? entry.profil_id;
      const st = entry.status ?? entry.statut;
      return pid === profileId && st === 'pending';
    });
    if (!pending) {
      const accepted = entries.find((entry) => {
        const pid = entry.profileId ?? entry.profil_id;
        const st = entry.status ?? entry.statut;
        return pid === profileId && st === 'accepted';
      });
      if (accepted) throw new Error('ALREADY_ACCEPTED');
      throw new Error('NO_PENDING');
    }
    const familyId = resource.famille_id || resource.familyId || null;
    const extra = familyId ? { famille_id: familyId } : {};
    await accessRepository.updateStatus(pending.id, 'accepted', extra);
  },
};
