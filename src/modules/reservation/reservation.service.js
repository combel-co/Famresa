// ==========================================
// RESERVATION SERVICE — Business Logic only
// ==========================================
// No UI, no DOM, no Firebase.
// Uses reservationRepository for all DB access.

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
  async createCarReservation({ resourceId, userId, userName, photo, startDate, endDate, startHour, endHour, destinations, bookings }) {
    const conflict = this.checkConflicts(startDate, endDate, bookings);
    if (conflict) return { error: 'conflict', date: conflict };

    const kmEstimate = destinations.reduce((s, d) => s + d.km * 2, 0);

    await reservationRepository.create({
      ressource_id: resourceId,
      profil_id: userId,
      userId, userName, photo: photo || null,
      date_debut: startDate, date_fin: endDate,
      startDate, endDate, startHour, endHour,
      destinations: destinations.map(d => ({ name: d.name, kmFromParis: d.km })),
      destination: destinations.map(d => d.name).join(', '),
      kmEstimate
    });

    const xpGained = 20 + Math.round(kmEstimate / 25);
    return { success: true, xpGained, kmEstimate, destinations };
  },

  /**
   * Create a house stay (one doc per day, batch write).
   * @returns {{ success: true } | { error, date }}
   */
  async createStayReservation({ resourceId, userId, userName, photo, startDate, endDate, motif, bookings }) {
    const dates = getDateRange(startDate, endDate);
    for (const ds of dates) {
      if (bookings[ds]) return { error: 'conflict', date: ds };
    }

    const groupId = reservationRepository.generateGroupId();
    const docsData = dates.map(date => ({
      ressource_id: resourceId,
      profil_id: userId,
      userId, userName, photo: photo || null,
      date_debut: startDate, date_fin: endDate,
      date, startDate, endDate,
      reservationGroupId: groupId,
      motif: motif || null
    }));

    await reservationRepository.createBatch(docsData);
    return { success: true };
  },

  /**
   * Cancel a single reservation.
   */
  async cancel(bookingId) {
    await reservationRepository.delete(bookingId);
  },

  /**
   * Cancel all reservations in a stay group.
   */
  async cancelStay(groupId) {
    await reservationRepository.deleteByGroup(groupId);
  },

  /**
   * Shorten a car booking (early return).
   */
  async truncate(bookingId, newEndDate) {
    await reservationRepository.update(bookingId, {
      endDate: newEndDate,
      date_fin: newEndDate
    });
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
