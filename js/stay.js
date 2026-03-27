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
        <div style="font-size: calc(11px * var(--ui-text-scale));color:var(--text-light);margin-bottom:2px">Checkin</div>
        <div style="font-weight:700;color:var(--accent)">${ciDone} ✓</div>
      </div>
      <div style="flex:1;background:#f0fdf4;border-radius:10px;padding:10px 12px;text-align:center">
        <div style="font-size: calc(11px * var(--ui-text-scale));color:var(--text-light);margin-bottom:2px">Checkout</div>
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
      <div style="color:var(--text-light);font-size: calc(13px * var(--ui-text-scale));margin-bottom:16px">${res?.name || 'Maison'}</div>
      <div style="background:#f8f9fa;border-radius:12px;padding:14px;margin-bottom:16px">
        <div style="font-weight:700;font-size: calc(16px * var(--ui-text-scale));margin-bottom:4px">${fmt(startDate)} → ${fmt(endDate)}</div>
        <div style="color:var(--text-light);font-size: calc(13px * var(--ui-text-scale))">${nights} nuit${nights > 1 ? 's' : ''} · ${userName}</div>
        ${motif ? `<div style="color:var(--text-light);font-size: calc(13px * var(--ui-text-scale));margin-top:4px">${motif}</div>` : ''}
      </div>
      ${checklistSummary}
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-primary" onclick="showChecklistSheet('${groupId}', 'checkin')">✅ Checklist arrivée</button>
        <button class="btn btn-primary" onclick="showChecklistSheet('${groupId}', 'checkout')">📋 Checklist départ</button>
        <button class="btn" style="background:#eff6ff;color:var(--accent)" onclick="showHouseExitReportSheet('${groupId}')">🧾 Etat de sortie</button>
        <button class="btn" style="background:var(--accent-light);color:var(--accent)" onclick="showEventsSheet('${groupId}')">📝 Journal du séjour</button>
        <button class="btn" style="background:#f0fdf4;color:#16a34a" onclick="showGuideSheet()">📖 Guide maison</button>
      </div>
      ${cancelBtn}
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

function showHouseExitReportSheet(groupId) {
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Etat laisse a la maison</h2>
      <div class="input-group">
        <label>Etat</label>
        <select id="house-exit-state">
          <option value="">Non renseigne</option>
          <option value="nickel">Nickel</option>
          <option value="cleanup">A nettoyer</option>
          <option value="issue">Probleme signale</option>
        </select>
      </div>
      <div class="input-group">
        <label>Note (optionnel)</label>
        <textarea id="house-exit-note" rows="3" placeholder="Ex: draps laves, ampoule salon HS" style="resize:none;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size: calc(14px * var(--ui-text-scale));width:100%"></textarea>
      </div>
      <button class="btn btn-primary" onclick="submitHouseExitReport('${groupId}')">Valider</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="showStaySheet('${groupId}')">Retour</button>
    </div>`;
}

async function submitHouseExitReport(groupId) {
  const state = document.getElementById('house-exit-state')?.value || '';
  const note = (document.getElementById('house-exit-note')?.value || '').trim();
  try {
    await reservationService.reportHouseExitState(selectedResource, {
      state,
      note,
      reportedBy: currentUser?.name || null
    });
    const res = resources.find(r => r.id === selectedResource);
    if (res) {
      res.houseExitState = state || null;
      res.houseExitNote = note || '';
      res.reportedBy = currentUser?.name || null;
      res.reportedAt = new Date().toISOString();
    }
    showToast('Etat de sortie enregistre ✓');
    showStaySheet(groupId);
  } catch (_) {
    showToast('Erreur — reessayez');
  }
}

function confirmCancelStay(groupId) {
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Annuler le séjour ?</h2>
      <p style="color:var(--text-light);font-size: calc(14px * var(--ui-text-scale));margin-bottom:20px">Cette action supprimera toutes les réservations liées à ce séjour. Elle est irréversible.</p>
      <button class="btn btn-danger" onclick="cancelStay('${groupId}')">Confirmer l'annulation</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Retour</button>
    </div>`;
}
