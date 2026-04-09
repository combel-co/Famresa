// ==========================================
// RESERVATION SERVICE — Business Logic only
// ==========================================
// No UI, no DOM, no Firebase.
// Uses reservationRepository for all DB access.

const BOOKING_HORIZON_MONTHS = 13;

const DEST_PRESETS = [
  { name: 'Paris intra-muros', km: 6 },
  { name: 'Versailles', km: 23 },
  { name: 'Roissy CDG', km: 33 },
  { name: 'Orly', km: 19 },
  { name: 'Reims', km: 145 },
  { name: 'Orléans', km: 134 },
  { name: 'Rouen', km: 136 },
  { name: 'Lyon', km: 465 },
  { name: 'Nantes', km: 385 },
  { name: 'Bordeaux', km: 585 },
  { name: 'Marseille', km: 770 },
  { name: 'Lille', km: 225 },
];

const reservationService = {

  BOOKING_HORIZON_MONTHS,
  DEST_PRESETS,

  /**
   * Check date conflicts against existing bookings.
   * @returns {string|null} conflicting date string, or null if OK
   */
  checkConflicts(startDate, endDate, bookings) {
    const cur = new Date(startDate + 'T00:00:00');
    const endObj = new Date(endDate + 'T00:00:00');
    while (cur <= endObj) {
      const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
      if (bookings[ds]) return ds;
      cur.setDate(cur.getDate() + 1);
    }
    return null;
  },

  /**
   * Create a car reservation.
   * @returns {{ success, xpGained, kmEstimate, destinations } | { error, date }}
   */
  async createCarReservation({ resourceId, userId, userName, photo, startDate, endDate, startHour, endHour, destinations, bookings, createdBy }) {
    const conflict = this.checkConflicts(startDate, endDate, bookings);
    if (conflict) return { error: 'conflict', date: conflict };

    const kmEstimate = destinations.reduce((s, d) => s + d.km * 2, 0);

    const doc = {
      ressource_id: resourceId,
      profil_id: userId,
      userId, userName, photo: photo || null,
      date_debut: startDate, date_fin: endDate,
      startDate, endDate, startHour, endHour,
      destinations: destinations.map(d => ({ name: d.name, kmFromParis: d.km })),
      destination: destinations.map(d => d.name).join(', '),
      kmEstimate
    };
    if (createdBy) doc.createdBy = createdBy;

    await reservationRepository.create(doc);

    const xpGained = 20 + Math.round(kmEstimate / 25);
    return { success: true, xpGained, kmEstimate, destinations };
  },

  /**
   * Create a house stay (one doc per day, batch write).
   * @param {Object} [stayOccupancyByDate] - date -> { totalPeople, byGroup }
   * @param {number|null|undefined} [resourceCapacity] - si défini (>0), capacité partagée entre groupes
   * @param {string|null} [excludeReservationGroupId] - exclure ce groupe du total (mise à jour)
   * @returns {{ success: true, reservationGroupId } | { error: 'conflict'|'capacity', date }}
   */
  async createStayReservation({
    resourceId,
    userId,
    userName,
    photo,
    startDate,
    endDate,
    motif,
    bookings,
    createdBy,
    peopleCount,
    reservationGroupId: existingGroupId,
    stayOccupancyByDate,
    resourceCapacity,
    excludeReservationGroupId
  }) {
    const dates = getDateRange(startDate, endDate);

    const pc = peopleCount != null && peopleCount !== '' ? Number(peopleCount) : null;
    const peopleOk = Number.isFinite(pc) && pc > 0 ? pc : null;
    const newPeopleCount = peopleOk != null ? peopleOk : 1;

    const capRaw = resourceCapacity != null && resourceCapacity !== '' ? Number(resourceCapacity) : NaN;
    const useCapacity = Number.isFinite(capRaw) && capRaw > 0;

    if (useCapacity) {
      const occMap = stayOccupancyByDate && typeof stayOccupancyByDate === 'object' ? stayOccupancyByDate : {};
      for (const ds of dates) {
        const occ = occMap[ds];
        let current = occ && typeof occ.totalPeople === 'number' ? occ.totalPeople : 0;
        if (excludeReservationGroupId && occ && occ.byGroup && typeof occ.byGroup[excludeReservationGroupId] === 'number') {
          current -= occ.byGroup[excludeReservationGroupId];
        }
        if (current + newPeopleCount > capRaw) {
          return { error: 'capacity', date: ds };
        }
      }
    } else {
      for (const ds of dates) {
        if (bookings[ds]) return { error: 'conflict', date: ds };
      }
    }

    const companions = peopleOk != null ? Math.max(0, peopleOk - 1) : null;

    const groupId = existingGroupId || reservationRepository.generateGroupId();
    const docsData = dates.map(date => {
      const doc = {
        ressource_id: resourceId,
        profil_id: userId,
        userId, userName, photo: photo || null,
        date_debut: startDate, date_fin: endDate,
        date, startDate, endDate,
        reservationGroupId: groupId,
        motif: motif || null
      };
      if (peopleOk != null) {
        doc.peopleCount = peopleOk;
        doc.guestCount = companions;
        doc.companions = companions;
      }
      if (createdBy) doc.createdBy = createdBy;
      return doc;
    });

    await reservationRepository.createBatch(docsData);
    return { success: true, reservationGroupId: groupId };
  },

  /**
   * Replace a house stay (same group id) with new dates / motif / occupancy.
   * @param {{ groupId: string, resourceId: string, userId: string, userName: string, photo: any, startDate: string, endDate: string, motif: string, bookings: object, stayOccupancyByDate?: object, resourceCapacity?: number|null, createdBy: any, peopleCount: number, familyId?: string }} params
   */
  async updateStayReservation({
    groupId,
    resourceId,
    userId,
    userName,
    photo,
    startDate,
    endDate,
    motif,
    bookings,
    stayOccupancyByDate,
    resourceCapacity,
    createdBy,
    peopleCount,
    familyId
  }) {
    const snap = await reservationsRef()
      .where('reservationGroupId', '==', groupId)
      .get();
    if (snap.empty) return { error: 'not_found' };

    await reservationRepository.deleteByGroup(groupId);

    const createResult = await this.createStayReservation({
      resourceId,
      userId,
      userName,
      photo,
      startDate,
      endDate,
      motif,
      bookings: bookings || {},
      stayOccupancyByDate,
      resourceCapacity,
      excludeReservationGroupId: groupId,
      createdBy,
      peopleCount,
      reservationGroupId: groupId
    });
    if (createResult.error) return createResult;
    return { success: true };
  },

  /**
   * Cancel a single reservation.
   */
  async cancel(bookingId, familyId) {
    await reservationRepository.delete(bookingId, familyId);
  },

  /**
   * Cancel all reservations in a stay group.
   */
  async cancelStay(groupId) {
    await reservationRepository.deleteByGroup(groupId);
  },

  /**
   * Update a car reservation (destination, dates, hours).
   * @returns {{ success: true } | { error, message }}
   */
  async updateReservation(bookingId, updates, bookings) {
    const allowed = {};
    if (updates.destinations !== undefined) {
      allowed.destinations = updates.destinations.map(d => ({ name: d.name, kmFromParis: d.km || d.kmFromParis }));
      allowed.destination = updates.destinations.map(d => d.name).join(', ');
      allowed.kmEstimate = updates.destinations.reduce((s, d) => s + (d.km || d.kmFromParis || 0) * 2, 0);
    }
    if (updates.startDate !== undefined) {
      allowed.startDate = updates.startDate;
      allowed.date_debut = updates.startDate;
    }
    if (updates.endDate !== undefined) {
      allowed.endDate = updates.endDate;
      allowed.date_fin = updates.endDate;
    }
    if (updates.startHour !== undefined) allowed.startHour = updates.startHour;
    if (updates.endHour !== undefined) allowed.endHour = updates.endHour;

    // Check date conflicts if dates changed (exclude current booking)
    if (allowed.startDate || allowed.endDate) {
      const start = allowed.startDate || updates.currentStartDate;
      const end = allowed.endDate || updates.currentEndDate;
      if (start && end && bookings) {
        const cur = new Date(start + 'T00:00:00');
        const endObj = new Date(end + 'T00:00:00');
        while (cur <= endObj) {
          const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
          if (bookings[ds] && bookings[ds].id !== bookingId) {
            return { error: 'conflict', message: 'Ce jour est déjà réservé' };
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }

    await reservationRepository.update(bookingId, allowed);
    return { success: true };
  },

  /**
   * Shorten a car booking (early return by date).
   */
  async truncate(bookingId, newEndDate) {
    await reservationRepository.update(bookingId, {
      endDate: newEndDate,
      date_fin: newEndDate
    });
  },

  /**
   * Early return with time update, optional vehicle status, and fuel level.
   * @param {string} bookingId
   * @param {string} resourceId
   * @param {{ returnHour: string, needsCleaning?: boolean, needsRepair?: boolean, notes?: string, fuelLevel?: number|null, cleanliness?: string|null, reportedBy?: string|null }} options
   */
  async earlyReturn(bookingId, resourceId, { returnHour, needsCleaning, needsRepair, notes, fuelLevel, cleanliness, reportedBy }) {
    const today = new Date().toISOString().slice(0, 10);

    // Mark reservation as returned
    const reservationUpdate = {
      endHour: returnHour,
      endDate: today,
      date_fin: today,
      returnedAt: new Date().toISOString()
    };
    if (fuelLevel !== null && fuelLevel !== undefined) {
      reservationUpdate.fuelReturnLevel = fuelLevel;
    }
    if (cleanliness) reservationUpdate.carCleanliness = cleanliness;
    if (notes) reservationUpdate.carReturnNote = notes;
    if (reportedBy) reservationUpdate.reportedBy = reportedBy;
    reservationUpdate.reportedAt = new Date().toISOString();
    await reservationRepository.update(bookingId, reservationUpdate);

    // Update resource: fuel level and/or vehicle status
    if (fuelLevel !== null && fuelLevel !== undefined) {
      await resourceRepository.updateFuelLevel(resourceId, fuelLevel);
    }
    if (needsCleaning || needsRepair || notes) {
      await resourceRepository.updateStatus(resourceId, {
        needsCleaning: needsCleaning || false,
        needsRepair: needsRepair || false,
        notes: notes || '',
        carCleanliness: cleanliness || null,
        carReturnNote: notes || '',
        reportedBy: reportedBy || null,
        reportedAt: new Date().toISOString()
      });
    }
  },

  /**
   * Declare house exit state (manual, declarative).
   */
  async reportHouseExitState(resourceId, { state, note, reportedBy }) {
    await resourceRepository.updateStatus(resourceId, {
      houseExitState: state || null,
      houseExitNote: note || '',
      reportedBy: reportedBy || null,
      reportedAt: new Date().toISOString()
    });
  },

  /**
   * Get list of family members eligible as bookers (admin feature).
   * @returns {Array<{ id, name, photo, initials }>}
   */
  async getEligibleBookers(familyId) {
    const members = await userRepository.getFamilyMembers(familyId);
    return members.map(m => {
      const name = m.nom || m.name || 'Membre';
      const initials = String(name).trim().split(/\s+/).map(p => p[0] || '').join('').toUpperCase().slice(0, 2) || '?';
      return { id: m.profil_id || m.id, name, photo: m.photo || null, initials };
    });
  },

  /**
   * Membres avec accès accepté à la ressource (profils enrichis).
   * Repli : famille via getEligibleBookers si aucune entrée d’accès.
   * @returns {Array<{ id, name, photo, initials }>}
   */
  async getBookersForResource(resourceId, familyIdFallback) {
    const seen = new Set();
    const out = [];
    const pushFromProfile = (prof) => {
      if (!prof) return;
      const id = prof.id;
      if (!id || seen.has(id)) return;
      seen.add(id);
      const name = prof.nom || prof.name || 'Membre';
      const initials = String(name).trim().split(/\s+/).map((p) => p[0] || '').join('').toUpperCase().slice(0, 2) || '?';
      out.push({ id, name, photo: prof.photo || null, initials });
    };

    try {
      const entries = await accessRepository.listByResourceId(resourceId);
      const accepted = entries.filter((e) => {
        const st = String(e.status || e.statut || '').toLowerCase();
        return st === 'accepted' || st === 'accepté';
      });
      for (const e of accepted) {
        const pid = e.profileId || e.profil_id;
        if (!pid) continue;
        const prof = await userRepository.getProfileById(pid);
        if (prof) pushFromProfile(prof);
      }
    } catch (_) {}

    if (out.length === 0 && familyIdFallback) {
      return this.getEligibleBookers(familyIdFallback);
    }

    out.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return out;
  },

  /**
   * Count total reservations for a user across all resources.
   */
  async countUserReservations(userId) {
    return reservationRepository.countByUserId(userId);
  },

  /**
   * Compute availability bands for a given month.
   */
  computeAvailBands(year, month, daysInMonth, bookings) {
    const today = new Date(); today.setHours(0,0,0,0);
    const bands = []; let start = null;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const free = new Date(year, month, d) >= today && !bookings[ds];
      if (free && start === null) start = d;
      if (!free && start !== null) { if ((d-1) - start >= 1) bands.push(`${start} → ${d-1}`); start = null; }
    }
    if (start !== null && daysInMonth - start >= 1) bands.push(`${start} → ${daysInMonth}`);
    return bands.slice(0, 3);
  }
};
