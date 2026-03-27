// ==========================================
// RESOURCE SERVICE — Business Logic only
// ==========================================
// No UI, no DOM, no Firebase.

const RESOURCE_INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function _resourceInviteCode() {
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += RESOURCE_INVITE_CODE_CHARS[Math.floor(Math.random() * RESOURCE_INVITE_CODE_CHARS.length)];
  }
  return code;
}

function _normalizeResourceInviteCode(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (s.length !== 8) return null;
  for (let i = 0; i < s.length; i += 1) {
    if (!RESOURCE_INVITE_CODE_CHARS.includes(s[i])) return null;
  }
  return s;
}

function _normalizeJoinPin(raw) {
  const s = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (s.length !== 4) return null;
  return s;
}

function _resourceDate(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike.toDate === 'function') return dateLike.toDate();
  const date = new Date(dateLike);
  return Number.isNaN(date.getTime()) ? null : date;
}

function _resourceRelativeTime(dateLike) {
  const date = _resourceDate(dateLike);
  if (!date) return 'Via lien';

  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 3600) return `Via lien · il y a ${Math.max(1, Math.floor(diffSeconds / 60))} min`;
  if (diffSeconds < 86400) return `Via lien · il y a ${Math.floor(diffSeconds / 3600)}h`;
  if (diffSeconds < 172800) return 'Via lien · hier';
  return `Via lien · il y a ${Math.floor(diffSeconds / 86400)} j`;
}

function _resourceJoinedLabel(dateLike) {
  const date = _resourceDate(dateLike);
  if (!date) return 'Récemment';
  return `Depuis ${date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`;
}

function _resourceRoleLabel(role) {
  return {
    admin: 'Admin',
    member: 'Membre',
    guest: 'Invité',
  }[role] || 'Membre';
}

function _resourceRoleClass(role) {
  return {
    admin: 'admin',
    guest: 'guest',
  }[role] || 'member';
}

function _resourceMetaLine(resource) {
  const isHouse = resource.type === 'house';
  const capacity = resource.capacity || resource.capacite || resource.metadata?.capacity || null;
  if (isHouse && capacity) return `Maison · Capacité ${capacity} pers.`;
  return isHouse ? 'Maison' : 'Voiture';
}

function _resourceSubLine(resource) {
  if (resource.type !== 'house') {
    return resource.plaque || 'Non renseigné';
  }
  if (typeof getResourceAddressDisplay === 'function') {
    return getResourceAddressDisplay(resource, 'Non renseigné');
  }
  return resource.address || resource.adresse || 'Non renseigné';
}

function _resourceSortAccepted(a, b, currentUserId) {
  if (a.profileId === currentUserId && b.profileId !== currentUserId) return -1;
  if (b.profileId === currentUserId && a.profileId !== currentUserId) return 1;
  if (a.role === 'admin' && b.role !== 'admin') return -1;
  if (b.role === 'admin' && a.role !== 'admin') return 1;
  return a.name.localeCompare(b.name, 'fr');
}

function _resourceSortPending(a, b) {
  const aDate = _resourceDate(a.invitedAt);
  const bDate = _resourceDate(b.invitedAt);
  if (aDate && bDate) return bDate - aDate;
  if (aDate) return -1;
  if (bDate) return 1;
  return a.name.localeCompare(b.name, 'fr');
}

const resourceService = {
  async getManagePageViewModel({ resourceId, currentUserId, familyId, origin, pathname }) {
    const resource = await resourceRepository.getById(resourceId);
    if (!resource) throw new Error('RESOURCE_NOT_FOUND');

    const [family, accessEntries, bookingCount] = await Promise.all([
      familyService.getById(familyId),
      accessService.listByResourceId(resourceId),
      reservationRepository.countByResourceId(resourceId),
    ]);

    const acceptedEntries = accessEntries.filter((entry) => entry.status === 'accepted');
    const pendingEntries = accessEntries.filter((entry) => entry.status === 'pending');
    const currentAccess = acceptedEntries.find((entry) => entry.profileId === currentUserId) || null;
    const isAdmin = currentAccess?.role === 'admin';
    const role = currentAccess?.role || 'member';
    const canInvite = isAdmin || role === 'member';

    const inviteCode = canInvite
      ? await resourceRepository.ensureInviteCode(resourceId, _resourceInviteCode())
      : (resource.inviteCode || null);

    const identityMap = await userService.getIdentityMap({
      familyId,
      profileIds: accessEntries.map((entry) => entry.profileId),
    });

    const acceptedMembers = acceptedEntries
      .map((entry) => {
        const identity = identityMap[entry.profileId] || {
          name: entry.profileId || 'Membre',
          photo: null,
          createdAt: null,
          initials: '?',
        };
        const isCurrentUser = entry.profileId === currentUserId;
        return {
          accessId: entry.id,
          profileId: entry.profileId,
          name: identity.name,
          displayName: isCurrentUser ? `${identity.name} · moi` : identity.name,
          photo: identity.photo,
          initials: identity.initials,
          joinedLabel: _resourceJoinedLabel(entry.acceptedAt || identity.createdAt),
          role: entry.role,
          roleLabel: _resourceRoleLabel(entry.role),
          roleClass: entry.role === 'guest' ? 'guest-pill' : _resourceRoleClass(entry.role),
          avatarClass: isCurrentUser ? 'me' : (entry.role === 'guest' ? 'guest-av' : ''),
          isCurrentUser,
          canManage: isAdmin && !isCurrentUser,
        };
      })
      .sort((a, b) => _resourceSortAccepted(a, b, currentUserId));

    const pendingMembers = pendingEntries
      .map((entry) => {
        const identity = identityMap[entry.profileId] || {
          name: entry.profileId || 'Membre',
          photo: null,
          initials: '?',
        };
        return {
          accessId: entry.id,
          profileId: entry.profileId,
          name: identity.name,
          photo: identity.photo,
          initials: identity.initials,
          requestLabel: _resourceRelativeTime(entry.invitedAt),
        };
      })
      .sort(_resourceSortPending);

    const shareUrl = inviteCode ? `${origin}${pathname}?resource_join=${inviteCode}` : null;
    const displayUrl = shareUrl ? shareUrl.replace(/^https?:\/\//, '') : null;
    const type = resource.type === 'house' ? 'house' : 'car';

    return {
      resource: {
        id: resource.id,
        name: resource.name || resource.nom || 'Ressource',
        emoji: resource.emoji || (type === 'house' ? '🏠' : '🚗'),
        type,
        familyName: family?.name || 'Famille',
        subLine: _resourceSubLine({ ...resource, type }),
        metaLine: _resourceMetaLine({ ...resource, type }),
        roleLabel: _resourceRoleLabel(currentAccess?.role || 'member'),
        roleClass: _resourceRoleClass(currentAccess?.role || 'member'),
      },
      stats: {
        memberCount: acceptedMembers.length,
        bookingCount,
        pendingCount: pendingMembers.length,
      },
      invite: {
        enabled: canInvite,
        inviteCode,
        joinPinSet: !!(resource.joinPin && String(resource.joinPin).replace(/\D/g, '').length === 4),
        shareUrl,
        displayUrl,
      },
      pendingMembers,
      acceptedMembers,
      permissions: {
        isAdmin,
        canInvite,
        canEdit: isAdmin,
        canDelete: isAdmin,
      },
      actions: {
        editMode: type,
      },
    };
  },

  async ensureManageInviteInfo({ resourceId, origin, pathname }) {
    const resource = await resourceRepository.getById(resourceId);
    if (!resource) throw new Error('RESOURCE_NOT_FOUND');
    const inviteCode = await resourceRepository.ensureInviteCode(resourceId, _resourceInviteCode());
    const shareUrl = `${origin}${pathname}?resource_join=${inviteCode}`;
    return {
      inviteCode,
      shareUrl,
      displayUrl: shareUrl.replace(/^https?:\/\//, ''),
    };
  },

  async updateInviteCodeForResource({ resourceId, rawCode, currentUserId, familyId }) {
    const origin = typeof location !== 'undefined' ? location.origin : '';
    const pathname = typeof location !== 'undefined' ? location.pathname : '/';
    const vm = await this.getManagePageViewModel({
      resourceId,
      currentUserId,
      familyId,
      origin,
      pathname,
    });
    if (!vm.permissions.canInvite) {
      const err = new Error('FORBIDDEN');
      throw err;
    }
    const normalized = _normalizeResourceInviteCode(rawCode);
    if (!normalized) {
      const err = new Error('INVALID');
      throw err;
    }
    if (normalized === (vm.invite.inviteCode || '')) return normalized;
    await resourceRepository.setInviteCode(resourceId, normalized);
    return normalized;
  },

  async updateJoinPinForResource({ resourceId, rawPin, currentUserId, familyId }) {
    const origin = typeof location !== 'undefined' ? location.origin : '';
    const pathname = typeof location !== 'undefined' ? location.pathname : '/';
    const vm = await this.getManagePageViewModel({
      resourceId,
      currentUserId,
      familyId,
      origin,
      pathname,
    });
    if (!vm.permissions.canInvite) {
      const err = new Error('FORBIDDEN');
      throw err;
    }
    const raw = String(rawPin ?? '').trim();
    if (raw === '') {
      await resourceRepository.setJoinPin(resourceId, null);
      return '';
    }
    const normalized = _normalizeJoinPin(raw);
    if (!normalized) {
      const err = new Error('INVALID_PIN');
      throw err;
    }
    await resourceRepository.setJoinPin(resourceId, normalized);
    return normalized;
  },

  async approveManageAccess({ accessId, approverProfileId }) {
    await accessService.approveManageAccess({ accessId, approverProfileId });
  },

  async rejectManageAccess({ accessId, approverProfileId }) {
    await accessService.rejectManageAccess({ accessId, approverProfileId });
  },

  async removeManageAccess({ accessId, approverProfileId }) {
    await accessService.removeManageAccess({ accessId, approverProfileId });
  },

  async deleteManagedResource({ resourceId }) {
    await resourceRepository.deleteById(resourceId);
  },
};
