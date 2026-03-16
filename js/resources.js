// ==========================================
// RESOURCES — MULTI-RESOURCE SUPPORT
// ==========================================

// Load resources from Firestore (replaces loadCars)
// Reads from 'resources' collection; auto-migrates from 'cars' if empty
async function loadResources() {
  try {
    let snap = await familyRef().collection('resources').orderBy('name').get();

    if (snap.empty) {
      // Migrate cars → resources
      const carsSnap = await familyRef().collection('cars').get();
      if (!carsSnap.empty) {
        const batch = db.batch();
        carsSnap.forEach(doc => {
          const ref = familyRef().collection('resources').doc(doc.id);
          batch.set(ref, { ...doc.data(), type: 'car' }, { merge: true });
        });
        await batch.commit();
        snap = await familyRef().collection('resources').orderBy('name').get();
      }
    }

    resources = [];
    snap.forEach(doc => resources.push({ id: doc.id, ...doc.data() }));

    if (resources.length === 0) {
      const ref = await familyRef().collection('resources').add({
        name: 'Voiture familiale', emoji: '🚗', type: 'car', fuelLevel: null
      });
      resources = [{ id: ref.id, name: 'Voiture familiale', emoji: '🚗', type: 'car', fuelLevel: null }];
    }

    // Ensure all resources have a type
    resources = resources.map(r => ({ ...r, type: r.type || 'car' }));

    selectedResource = resources[0].id;
    renderResourceTabs();
    subscribeBookings();
    subscribeFuelReports();
  } catch (e) {
    console.error('Firebase error:', e);
    document.getElementById('cal-grid').innerHTML =
      '<div class="loading" style="flex-direction:column;gap:8px;color:var(--danger)">⚠️ Connexion impossible<br><small style="color:var(--text-light)">Vérifiez votre connexion ou Firebase.</small></div>';
  }
}

// ==========================================
// RESOURCE TABS RENDER
// ==========================================
function renderResourceTabs() {
  const container = document.getElementById('resource-tabs');
  if (!container) return;

  const cars   = resources.filter(r => r.type !== 'house');
  const houses = resources.filter(r => r.type === 'house');
  const activeRes  = resources.find(r => r.id === selectedResource);
  const activeType = activeRes?.type === 'house' ? 'house' : 'car';

  const tab = (icon, label, type, hasItems) => {
    const isActive = activeType === type && hasItems;
    const cls = `resource-tab${isActive ? ' active' : ''}${!hasItems ? ' placeholder' : ''}`;
    const click = hasItems ? `onclick="selectResourceType('${type}')"` : '';
    return `<div class="${cls}" ${click}>
      <span class="resource-tab-icon">${icon}</span>
      <span class="resource-tab-label">${label}</span>
    </div>`;
  };

  container.innerHTML =
    tab('🚗', 'Voitures', 'car',   cars.length   > 0) +
    tab('🏠', 'Maison',   'house', houses.length > 0) +
    `<div class="resource-tab placeholder" style="position:relative;">
      <span class="resource-tab-icon">✨</span>
      <span class="resource-tab-label">Autres</span>
      <span class="resource-tab-badge">Bientôt</span>
    </div>`;
}

function selectResourceType(type) {
  const match = resources.find(r => (type === 'house' ? r.type === 'house' : r.type !== 'house'));
  if (match) selectResource(match.id);
}

// ==========================================
// SELECT RESOURCE
// ==========================================
function selectResource(resourceId) {
  selectedResource = resourceId;
  renderResourceTabs();
  if (unsubscribe) unsubscribe();
  subscribeBookings();
  // Re-render calendar badge
  const activeRes = resources.find(r => r.id === resourceId);
  const badge = document.getElementById('active-car-badge');
  if (badge && activeRes) {
    badge.textContent = `${activeRes.emoji || '🚗'} ${activeRes.name}`;
    badge.disabled = resources.length <= 1;
  }
  // Adapt dashboard for resource type
  renderCalendar();
  renderExperiencePanels();
}

// Kept for backward compatibility with calendar car badge click
function cycleCar() {
  if (resources.length <= 1) return;
  const currentIndex = resources.findIndex(r => r.id === selectedResource);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % resources.length : 0;
  selectResource(resources[nextIndex].id);
  showToast(`Ressource active : ${resources[nextIndex].name}`);
}

// ==========================================
// BOOKINGS SUBSCRIPTION
// ==========================================
function subscribeBookings() {
  if (unsubscribe) unsubscribe();

  // Query by resourceId (new), but also by carId (legacy) — merge results
  const snap1 = familyRef().collection('bookings')
    .where('resourceId', '==', selectedResource)
    .onSnapshot(handleBookingsSnapshot);

  // Also subscribe to legacy carId bookings (for backward compat during migration window)
  let snap2 = null;
  const hasLegacy = resources.some(r => r.id === selectedResource && r.type === 'car');
  if (hasLegacy) {
    snap2 = familyRef().collection('bookings')
      .where('carId', '==', selectedResource)
      .onSnapshot(snap => {
        // Merge with existing bookings (only add new entries)
        snap.forEach(doc => {
          const d = { id: doc.id, ...doc.data() };
          // Skip if already loaded via resourceId subscription
          if (d.resourceId && d.resourceId === selectedResource) return;
          expandBookingToMap(d);
        });
        renderCalendar();
        renderExperiencePanels();
        if (document.getElementById('booking-modal')?.classList.contains('open')) renderBmCalendar();
      });
  }

  unsubscribe = () => {
    snap1();
    if (snap2) snap2();
  };
}

function handleBookingsSnapshot(snap) {
  bookings = {};
  snap.forEach(doc => {
    const d = { id: doc.id, ...doc.data() };
    expandBookingToMap(d);
  });
  renderCalendar();
  renderExperiencePanels();
  if (document.getElementById('booking-modal')?.classList.contains('open')) renderBmCalendar();
}

function expandBookingToMap(d) {
  if (d.startDate && d.endDate) {
    let cur = new Date(d.startDate + 'T00:00:00');
    const end = new Date(d.endDate + 'T00:00:00');
    while (cur <= end) {
      const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
      bookings[ds] = d;
      cur.setDate(cur.getDate() + 1);
    }
  } else if (d.date) {
    bookings[d.date] = d;
  }
}

function subscribeFuelReports() {
  fuelReportsByBooking = {};
}

// ==========================================
// ADD RESOURCE
// ==========================================
function showAddResourceSheet() {
  let selectedType = 'car';
  let selectedEmoji = '🚗';
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Ajouter une ressource</h2>
      <p style="color:var(--text-light);font-size:14px;margin-bottom:20px">Voiture, maison ou autre bien partagé</p>
      <div style="display:flex;gap:12px;margin-bottom:20px">
        <button id="type-car-btn" class="btn btn-primary" style="flex:1;padding:12px" onclick="setResourceType('car', this)">🚗 Voiture</button>
        <button id="type-house-btn" class="btn btn-outline" style="flex:1;padding:12px" onclick="setResourceType('house', this)">🏠 Maison</button>
      </div>
      <div class="input-group">
        <label>Nom</label>
        <input type="text" id="add-res-name" placeholder="Ex: Clio, Maison Bretagne..." autocomplete="off">
      </div>
      <div class="lock-error" id="add-res-error"></div>
      <button class="btn btn-primary" style="margin-top:8px" onclick="confirmAddResource()">Ajouter</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Annuler</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

function setResourceType(type, btn) {
  document.getElementById('type-car-btn').className = 'btn btn-outline';
  document.getElementById('type-house-btn').className = 'btn btn-outline';
  btn.className = 'btn btn-primary';
  // Store on a data attribute since we're in inline HTML context
  document.getElementById('add-res-name').dataset.type = type;
}

async function confirmAddResource() {
  const nameInput = document.getElementById('add-res-name');
  const name = (nameInput?.value || '').trim();
  const type = nameInput?.dataset.type || 'car';
  const errEl = document.getElementById('add-res-error');
  if (!name) { if (errEl) errEl.textContent = 'Entrez un nom'; return; }
  try {
    const emoji = type === 'house' ? '🏠' : '🚗';
    const ref = await familyRef().collection('resources').add({
      name, type, emoji,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    resources.push({ id: ref.id, name, type, emoji });
    closeSheet();
    selectResource(ref.id);
    showToast(`${emoji} ${name} ajouté(e)`);
  } catch(e) { if (errEl) errEl.textContent = 'Erreur — réessayez'; }
}

// ==========================================
// CAR INFO SHEET (adapted for resources)
// ==========================================
async function showCarInfo() {
  const res = resources.find(r => r.id === selectedResource);
  if (!res) return;
  if (res.type === 'house') { showHouseInfo(); return; }
  const plaque = res.plaque || '';
  const assurance = res.assurance || '';
  const observations = res.observations || '';
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Info voiture</h2>
      <div style="color:var(--text-light);font-size:13px;margin-bottom:20px">${res.emoji || '🚗'} ${res.name}</div>
      <div class="input-group">
        <label>Plaque d'immatriculation</label>
        <input type="text" id="car-plaque" placeholder="Ex: AB-123-CD" value="${plaque}" style="text-transform:uppercase">
      </div>
      <div class="input-group">
        <label>Assurance</label>
        <input type="text" id="car-assurance" placeholder="Compagnie / n° de contrat" value="${assurance}">
      </div>
      <div class="input-group">
        <label>Observations</label>
        <textarea id="car-observations" placeholder="Carrosserie, entretien, notes..." rows="3" style="resize:none;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;width:100%">${observations}</textarea>
      </div>
      <button class="btn btn-primary" onclick="saveCarInfo()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function saveCarInfo() {
  const plaque = (document.getElementById('car-plaque')?.value || '').trim().toUpperCase();
  const assurance = (document.getElementById('car-assurance')?.value || '').trim();
  const observations = (document.getElementById('car-observations')?.value || '').trim();
  try {
    await familyRef().collection('resources').doc(selectedResource).update({ plaque, assurance, observations });
    // Also update legacy cars collection
    try { await familyRef().collection('cars').doc(selectedResource).update({ plaque, assurance, observations }); } catch(e) {}
    const res = resources.find(r => r.id === selectedResource);
    if (res) Object.assign(res, { plaque, assurance, observations });
    closeSheet();
    showToast('Infos enregistrées ✓');
  } catch(e) { showToast('Erreur — réessayez'); }
}

// ==========================================
// CALENDAR BADGE (backward compat)
// ==========================================
function renderCarSelector() {
  const badge = document.getElementById('active-car-badge');
  if (!badge) return;
  if (resources.length === 0 || !selectedResource) {
    badge.textContent = '🚗 Aucune ressource';
    badge.disabled = true;
    return;
  }
  const active = resources.find(r => r.id === selectedResource) || resources[0];
  badge.textContent = `${active.emoji || '🚗'} ${active.name}`;
  badge.disabled = resources.length <= 1;
}

// ==========================================
// HOUSE INFO
// ==========================================
function showHouseInfo() {
  const res = resources.find(r => r.id === selectedResource);
  if (!res) return;
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>Info maison</h2>
      <div style="color:var(--text-light);font-size:13px;margin-bottom:20px">${res.emoji || '🏠'} ${res.name}</div>
      <div class="input-group">
        <label>Adresse</label>
        <input type="text" id="house-address" placeholder="123 rue..." value="${res.address || ''}">
      </div>
      <div class="input-group">
        <label>Observations</label>
        <textarea id="house-observations" placeholder="Notes importantes..." rows="3" style="resize:none;padding:10px;border:1px solid var(--border);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:14px;width:100%">${res.observations || ''}</textarea>
      </div>
      <button class="btn btn-primary" onclick="saveHouseInfo()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Fermer</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
}

async function saveHouseInfo() {
  const address = (document.getElementById('house-address')?.value || '').trim();
  const observations = (document.getElementById('house-observations')?.value || '').trim();
  try {
    await familyRef().collection('resources').doc(selectedResource).update({ address, observations });
    const res = resources.find(r => r.id === selectedResource);
    if (res) Object.assign(res, { address, observations });
    closeSheet();
    showToast('Infos maison enregistrées ✓');
  } catch(e) { showToast('Erreur — réessayez'); }
}
