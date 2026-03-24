// ==========================================
// MIGRATION V2 — OLD SCHEMA → NEW SCHEMA
// Runs once per user on first load with new code.
// Flag stored in localStorage: 'famresa_v2_migrated'
// ==========================================

async function runV2MigrationIfNeeded() {
  if (!currentUser?.familyId) return;
  if (localStorage.getItem('famresa_v2_migrated') === '1') return;

  console.log('[migration] Starting v2 schema migration...');
  try {
    const familyId = currentUser.familyId;

    // ── 1. Migrate FAMILLE (families → familles) ──
    const oldFamDoc = await db.collection('families').doc(familyId).get();
    if (oldFamDoc.exists) {
      const d = oldFamDoc.data();
      await famillesRef().doc(familyId).set({
        nom: d.name || d.nom || 'Ma famille',
        pin: d.pin || '',
        inviteCode: d.inviteCode || '',
        created_by: d.created_by || null,
        createdAt: d.createdAt || ts(),
        migratedAt: ts(),
      }, { merge: true });
    }

    // ── 2. Migrate MEMBRES (families/{id}/members → famille_membres) ──
    const membersSnap = await db.collection('families').doc(familyId).collection('members').get();
    if (!membersSnap.empty) {
      // Check if already migrated
      const existingMembres = await familleMembresRef()
        .where('famille_id', '==', familyId).get();
      const migratedIds = new Set(existingMembres.docs.map(d => d.data().profil_id));

      const familyDoc = oldFamDoc.exists ? oldFamDoc : await famillesRef().doc(familyId).get();
      const createdBy = familyDoc.data()?.created_by;

      const batch = db.batch();
      for (const doc of membersSnap.docs) {
        if (migratedIds.has(doc.id)) continue;
        const d = doc.data();
        const role = doc.id === createdBy ? 'admin' : 'member';
        const ref = familleMembresRef().doc();
        batch.set(ref, {
          famille_id: familyId,
          profil_id: doc.id,
          role,
          nom: d.name || '',
          email: d.email || '',
          photo: d.photo || null,
          createdAt: d.createdAt || ts(),
        });
      }
      await batch.commit();
    }

    // ── 3. Migrate PROFILS (users → profils) for all family members ──
    const memberIds = new Set([currentUser.id]);
    try {
      membersSnap.forEach(doc => memberIds.add(doc.id));
    } catch (_) {}

    for (const memberId of memberIds) {
      const existingProfil = await profilRef(memberId).get();
      if (existingProfil.exists) continue;

      const userDoc = await db.collection('users').doc(memberId).get();
      if (!userDoc.exists) continue;

      const d = userDoc.data();
      const memberMeta = membersSnap.docs.find(doc => doc.id === memberId)?.data() || {};
      await profilRef(memberId).set({
        nom: memberMeta.name || d.name || (memberId === currentUser.id ? currentUser.name : '') || '',
        email: d.email || memberMeta.email || (memberId === currentUser.id ? currentUser.email : '') || '',
        code_pin: d.pin || '',
        photo: memberMeta.photo || d.photo || (memberId === currentUser.id ? currentUser.photo : null) || null,
        familyId: d.familyId || familyId,
        createdAt: d.createdAt || memberMeta.createdAt || ts(),
      }, { merge: true });
    }

    // ── 4. Migrate RESSOURCES (families/{id}/resources → ressources) ──
    const resourcesSnap = await db.collection('families').doc(familyId).collection('resources').get();
    const existingRessources = await ressourcesRef()
      .where('famille_id', '==', familyId).get();
    const migratedResIds = new Set(existingRessources.docs.map(d => d.id));

    if (!resourcesSnap.empty) {
      const batch = db.batch();
      for (const doc of resourcesSnap.docs) {
        if (migratedResIds.has(doc.id)) continue;
        const d = doc.data();
        batch.set(ressourcesRef().doc(doc.id), {
          famille_id: familyId,
          nom: d.name || d.nom || 'Ressource',
          name: d.name || d.nom || 'Ressource',
          type: d.type || 'car',
          emoji: d.emoji || '🚗',
          description: d.observations || d.address || '',
          // Keep all original fields too
          ...d,
          migratedAt: ts(),
        });
      }
      await batch.commit();
    } else {
      // Also check legacy cars collection
      const carsSnap = await db.collection('families').doc(familyId).collection('cars').get();
      if (!carsSnap.empty) {
        const batch = db.batch();
        for (const doc of carsSnap.docs) {
          if (migratedResIds.has(doc.id)) continue;
          const d = doc.data();
          batch.set(ressourcesRef().doc(doc.id), {
            famille_id: familyId,
            nom: d.name || 'Voiture familiale',
            name: d.name || 'Voiture familiale',
            type: 'car',
            emoji: d.emoji || '🚗',
            ...d,
            migratedAt: ts(),
          });
        }
        await batch.commit();
      }
    }

    // ── 5. Migrate RESERVATIONS (families/{id}/bookings → reservations) ──
    const bookingsSnap = await db.collection('families').doc(familyId).collection('bookings').get();
    if (!bookingsSnap.empty) {
      const existingRes = await reservationsRef()
        .where('famille_id', '==', familyId).get();
      const migratedBookingIds = new Set(existingRes.docs.map(d => d.id));

      const batch = db.batch();
      for (const doc of bookingsSnap.docs) {
        if (migratedBookingIds.has(doc.id)) continue;
        const d = doc.data();
        batch.set(reservationsRef().doc(doc.id), {
          famille_id: familyId,
          ressource_id: d.resourceId || d.carId || '',
          profil_id: d.userId || '',
          date_debut: d.startDate || d.date || '',
          date_fin: d.endDate || d.date || '',
          // Keep all original fields
          ...d,
          migratedAt: ts(),
        });
      }
      await batch.commit();
    }

    // ── 6. Migrate ACCES_RESSOURCE (resource_access → acces_ressource) ──
    const accessSnap = await db.collection('resource_access')
      .where('profileId', '==', currentUser.id).get();
    if (!accessSnap.empty) {
      const existingAcces = await accesRessourceRef()
        .where('profil_id', '==', currentUser.id).get();
      const migratedAccesIds = new Set(existingAcces.docs.map(d => d.id));

      const batch = db.batch();
      for (const doc of accessSnap.docs) {
        if (migratedAccesIds.has(doc.id)) continue;
        const d = doc.data();
        batch.set(accesRessourceRef().doc(doc.id), {
          ressource_id: d.resourceId || '',
          profil_id: d.profileId || '',
          famille_id: d.familyId || familyId,
          role: d.role || 'member',
          statut: d.status || 'accepted',
          invited_at: d.invited_at || ts(),
          accepted_at: d.accepted_at || null,
        });
      }
      await batch.commit();
    }

    localStorage.setItem('famresa_v2_migrated', '1');
    console.log('[migration] v2 migration complete ✓');
  } catch (e) {
    console.error('[migration] v2 migration failed:', e);
    // Don't block the app — migration will retry on next load
  }
}
