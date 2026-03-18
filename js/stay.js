// ==========================================
// STAY — HOUSE STAY VIEW SHEET
// ==========================================

async function showStaySheet(groupId, bookingHint) {
  const res = resources.find(r => r.id === selectedResource);
  // Fetch all booking docs in this stay group
  let stayBookings = [];
  try {
    const snap = await reservationsRef()
      .where('reservationGroupId', '==', groupId).get();
    snap.forEach(doc => stayBookings.push(reservationToJS(doc.data(), doc.id)));
  } catch(e) {
    // Fallback to hint
    if (bookingHint) stayBookings = [bookingHint];
  }

  if (stayBookings.length === 0 && bookingHint) stayBookings = [bookingHint];

  // Sort by date to get start/end
  stayBookings.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const first = stayBookings[0] || bookingHint;
  const last = stayBookings[stayBookings.length - 1] || bookingHint;

  const startDate = first?.startDate || first?.date || '';
  const endDate = last?.endDate || last?.date || startDate;
  const userName = first?.userName || '—';
  const motif = first?.motif || '';
  const isMine = currentUser && first?.userId === currentUser.id;

  const fmt = (ds) => {
    if (!ds) return '—';
    const d = new Date(ds + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  };
  const nights = stayBookings.length;

  // Load checklist progress summary
  let checklistSummary = '';
  try {
    const allChecks = await checklistStatutsRef().where('groupId', '==', groupId).get();
    const ciDone = allChecks.docs.filter(d => d.data().type === 'checkin').length;
    const coDone = allChecks.docs.filter(d => d.data().type === 'checkout').length;
    checklistSummary = `<div style="display:flex;gap:12px;margin-bottom:16px">
      <div style="flex:1;background:var(--accent-light);border-radius:10px;padding:10px 12px;text-align:center">
        <div style="font-size:11px;color:var(--text-light);margin-bottom:2px">Checkin</div>
        <div style="font-weight:700;color:var(--accent)">${ciDone} ✓</div>
      </div>
      <div style="flex:1;background:#f0fdf4;border-radius:10px;padding:10px 12px;text-align:center">
        <div style="font-size:11px;color:var(--text-light);margin-bottom:2px">Checkout</div>
        <div style="font-weight:700;color:#16a34a">${coDone} ✓</div>
      </div>
    </div>`;
  } catch(e) { checklistSummary = ''; }

  const cancelBtn = isMine
    ? `<button class="btn btn-danger" style="margin-top:10px" onclick="confirmCancelStay('${groupId}')">Annuler le séjour</button>`
    : '';

  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>${res?.emoji || '🏠'} Séjour</h2>
      <div style="color:var(--text-light);font-size:13px;margin-bottom:16px">${res?.name || 'Maison'}</div>
      <div style="background:#f8f9fa;border-radius:12px;padding:14px;margin-bottom:16px">
        <div style="font-weight:700;font-size:16px;margin-bottom:4px">${fmt(startDate)} → ${fmt(endDate)}</div>
        <div style="color:var(--text-light);font-size:13px">${nights} nuit${nights > 1 ? 's' : ''} · ${userName}</div>
        ${motif ? `<div style="color:var(--text-light);font-size:13px;margin-top:4px">${motif}</div>` : ''}
      </div>
      ${checklistSummary}
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-primary" onclick="showChecklistSheet('${groupId}', 'checkin')">✅ Checklist arrivée</button>
        <button class="btn btn-primary" onclick="showChecklistSheet('${groupId}', 'checkout')">📋 Checklist départ</button>
        <button class="btn" style="background:var(--accent-light);color:var(--accent)" onclick="showEventsSheet('${groupId}')">📝 Journal du séjour</button>
        <button class="btn" style="background:#f0fdf4;color:#16a34a" onclick="showGuideSheet()">📖 Guide maison</button>
      </div>
      ${cancelBtn}
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

function confirmCancelStay(groupId) {
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Annuler le séjour ?</h2>
      <p style="color:var(--text-light);font-size:14px;margin-bottom:20px">Cette action supprimera toutes les réservations liées à ce séjour. Elle est irréversible.</p>
      <button class="btn btn-danger" onclick="cancelStay('${groupId}')">Confirmer l'annulation</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Retour</button>
    </div>`;
}
