// ==========================================
// FLOWS F + G — Guides arrivée / départ
// ==========================================

const FAMRESA_CHECKIN_CATS = [
  { category: 'access', defaultTitle: 'Accéder au logement', subLabel: 'Clé, digicode, boîte à clé…', ph: 'Ex : La clé est dans la boîte aux lettres, code 4821.' },
  { category: 'wifi', defaultTitle: 'Connexion wifi', subLabel: 'Réseau et mot de passe', ph: 'Ex : Réseau Livebox-04B0, mot de passe famille2024' },
  { category: 'directions', defaultTitle: 'Se rendre sur place', subLabel: 'Adresse, itinéraire, transport', ph: "Ex : Depuis l'autoroute, sortie 12, puis 2e à droite." },
  { category: 'parking', defaultTitle: 'Parking', subLabel: 'Place, garage, stationnement', ph: 'Ex : Place n°12 au sous-sol, badge dans le tiroir.' },
  { category: 'house_rules', defaultTitle: 'Règles de la maison', subLabel: "Ce qu'il faut savoir", ph: 'Ex : Pas de chaussures à l\'intérieur, fermer les volets la nuit.' },
  { category: 'contacts', defaultTitle: 'Contacts utiles', subLabel: 'Numéros, voisins, urgences', ph: 'Ex : Voisin Jean-Pierre : 06 12 34 56 78' },
];

const FAMRESA_CHECKOUT_CATS = [
  { category: 'trash', defaultTitle: 'Sortir les poubelles', subLabel: '', ph: 'Ex : Poubelle jaune = tri, poubelle noire = ordures.' },
  { category: 'lights_off', defaultTitle: 'Éteindre et fermer', subLabel: '', ph: 'Ex : Lumières, chauffage, volets, fenêtres.' },
  { category: 'clean', defaultTitle: 'Nettoyage rapide', subLabel: '', ph: 'Ex : Plan de travail et table essuyés.' },
  { category: 'linens', defaultTitle: 'Draps et linge', subLabel: '', ph: 'Ex : Draps dans le panier du cellier.' },
  { category: 'keys', defaultTitle: 'Remettre les clés', subLabel: '', ph: 'Ex : Clés dans la boîte à clé, code 4821.' },
];

window._famresaGuideCtx = { type: 'checkin', resourceId: null, view: 'list' };

function _famresaGuideKey(type) {
  return type === 'checkout' ? 'checkoutGuide' : 'checkinGuide';
}

function _famresaSortedGuides(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && x.enabled !== false)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function famresaOpenGuideEditor(type, resourceId) {
  if (_famresaRole(resourceId) !== 'admin') {
    if (typeof showToast === 'function') showToast('Réservé aux admins');
    return;
  }
  window._famresaGuideCtx = { type, resourceId, view: 'list' };
  famresaRenderGuideEditorView();
  document.getElementById('guides-overlay')?.classList.remove('hidden');
}

function famresaCloseGuidesOverlay() {
  document.getElementById('guides-overlay')?.classList.add('hidden');
  window._famresaGuideCtx = { type: 'checkin', resourceId: null, view: 'list' };
}

function famresaRenderGuideEditorView() {
  const el = document.getElementById('guides-overlay-inner');
  const ctx = window._famresaGuideCtx;
  if (!el || !ctx.resourceId) return;
  const res = resources.find((r) => r.id === ctx.resourceId);
  if (!res) return;
  const key = _famresaGuideKey(ctx.type);
  const list = _famresaSortedGuides(res[key]);

  const isCheckout = ctx.type === 'checkout';
  const title = isCheckout ? 'Guide de départ' : "Guide d'arrivée";

  if (ctx.view === 'pick') {
    const defs = isCheckout ? FAMRESA_CHECKOUT_CATS : FAMRESA_CHECKIN_CATS;
    const taken = new Set((res[key] || []).map((x) => x.category).filter((c) => c && c !== 'custom'));
    const rows = defs
      .map((d) => {
        const dis = taken.has(d.category);
        return `<button type="button" class="famresa-ge-pick-row${dis ? ' is-disabled' : ''}" ${dis ? 'disabled' : ''} onclick="famresaGuidePickCategory('${d.category}')">
          <div class="famresa-ge-pick-main">${_fgEsc(d.defaultTitle)}</div>
          <div class="famresa-ge-pick-sub">${_fgEsc(d.subLabel)}</div>
        </button>`;
      })
      .join('');
    el.innerHTML = `
      <div class="famresa-ge-head">
        <button type="button" class="famresa-ge-back" onclick="famresaGuideViewList()">←</button>
        <div class="famresa-ge-title">Ajouter une instruction</div>
      </div>
      <p class="famresa-ge-sub">Choisis un type ou crée la tienne.</p>
      <div class="famresa-ge-pick-list">${rows}
        <button type="button" class="famresa-ge-pick-row" onclick="famresaGuidePickCategory('custom')">
          <div class="famresa-ge-pick-main">Instruction personnalisée</div>
          <div class="famresa-ge-pick-sub">Crée ta propre rubrique</div>
        </button>
      </div>`;
    return;
  }

  if (ctx.view === 'edit') {
    const item = (res[key] || []).find((x) => x.id === ctx.editingId);
    const cat = ctx.editCategory || 'custom';
    const def = [...FAMRESA_CHECKIN_CATS, ...FAMRESA_CHECKOUT_CATS].find((x) => x.category === cat);
    const ph = def?.ph || 'Décris cette instruction…';
    const t0 = item?.title || def?.defaultTitle || '';
    const s0 = item?.subtitle || '';
    const isNew = !item;
    el.innerHTML = `
      <div class="famresa-ge-head">
        <button type="button" class="famresa-ge-back" onclick="famresaGuideEditBack()">←</button>
        <div class="famresa-ge-title">${_fgEsc(def?.defaultTitle || 'Instruction')}</div>
      </div>
      <div class="famresa-ge-form ob-fields">
        <div class="input-group">
          <label>Titre</label>
          <input type="text" id="fg-edit-title" value="${_fgAttr(t0)}" placeholder="Titre" />
        </div>
        <div class="input-group">
          <label>Détails</label>
          <textarea id="fg-edit-sub" rows="3" placeholder="${_fgAttr(ph)}"></textarea>
        </div>
        <button type="button" class="btn btn-primary" onclick="famresaGuideSaveEdit(${isNew})">${isNew ? 'Ajouter' : 'Enregistrer'}</button>
        ${!isNew ? '<button type="button" class="btn btn-danger-text" onclick="famresaGuideConfirmDelete()">Supprimer cette instruction</button>' : ''}
      </div>`;
    const ta = document.getElementById('fg-edit-sub');
    if (ta) ta.value = s0;
    return;
  }

  if (list.length === 0) {
    el.innerHTML = `
      <div class="famresa-ge-head">
        <button type="button" class="famresa-ge-back" onclick="famresaCloseGuidesOverlay()">←</button>
        <div class="famresa-ge-title">${title}</div>
      </div>
      <div class="famresa-ge-empty">
        <div class="famresa-ge-empty-icon" aria-hidden="true">🔑</div>
        <div class="famresa-ge-empty-title">${isCheckout ? 'Avant de partir' : 'Prépare l\'arrivée'}</div>
        <p class="famresa-ge-empty-sub">${isCheckout ? 'Crée une checklist pour que ta famille laisse la maison en ordre.' : 'Aide ta famille à s\'installer : wifi, accès, règles…'}</p>
        <button type="button" class="btn btn-primary" onclick="famresaGuideViewPick()">Créer le guide</button>
      </div>`;
    return;
  }

  const rows = list
    .map(
      (it) => `
    <div class="famresa-ge-item">
      <div class="famresa-ge-item-text">
        <div class="famresa-ge-item-title">${_fgEsc(it.title || '')}</div>
        <div class="famresa-ge-item-sub">${_fgEsc(it.subtitle || '')}</div>
      </div>
      <div class="famresa-ge-item-actions">
        <button type="button" class="btn btn-ghost-sm" onclick="famresaGuideMove('${_fgAttr(it.id)}',-1)" aria-label="Monter">↑</button>
        <button type="button" class="btn btn-ghost-sm" onclick="famresaGuideMove('${_fgAttr(it.id)}',1)" aria-label="Descendre">↓</button>
        <button type="button" class="famresa-ge-item-edit" onclick="famresaGuideOpenEdit('${_fgAttr(it.id)}')">Modifier</button>
      </div>
    </div>`
    )
    .join('');

  el.innerHTML = `
    <div class="famresa-ge-head">
      <button type="button" class="famresa-ge-back" onclick="famresaCloseGuidesOverlay()">←</button>
      <div class="famresa-ge-title">${title}</div>
    </div>
    <p class="famresa-ge-hint">${isCheckout ? 'Chaque membre pourra cocher les tâches avant de partir.' : 'Visible par tous les membres avant leur séjour.'}</p>
    <div class="famresa-ge-items">${rows}</div>
    <button type="button" class="btn btn-outline famresa-ge-add" onclick="famresaGuideViewPick()">+ Ajouter une instruction</button>`;
}

function _fgEsc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}
function _fgAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function famresaGuideViewList() {
  window._famresaGuideCtx.view = 'list';
  famresaRenderGuideEditorView();
}
function famresaGuideViewPick() {
  window._famresaGuideCtx.view = 'pick';
  famresaRenderGuideEditorView();
}

function famresaGuidePickCategory(category) {
  const ctx = window._famresaGuideCtx;
  ctx.view = 'edit';
  ctx.editCategory = category;
  ctx.editingId = null;
  ctx.editBack = 'pick';
  famresaRenderGuideEditorView();
}

function famresaGuideEditBack() {
  const ctx = window._famresaGuideCtx;
  if (ctx.editBack === 'pick') famresaGuideViewPick();
  else famresaGuideViewList();
}

function famresaGuideOpenEdit(id) {
  const ctx = window._famresaGuideCtx;
  ctx.view = 'edit';
  ctx.editingId = id;
  ctx.editBack = 'list';
  const res = resources.find((r) => r.id === ctx.resourceId);
  const key = _famresaGuideKey(ctx.type);
  const item = (res?.[key] || []).find((x) => x.id === id);
  ctx.editCategory = item?.category || 'custom';
  famresaRenderGuideEditorView();
}

async function famresaGuidePersistArray(nextArr) {
  const ctx = window._famresaGuideCtx;
  const key = _famresaGuideKey(ctx.type);
  await resourceRepository.updatePartial(ctx.resourceId, { [key]: nextArr });
  famresaPatchResourceLocal(ctx.resourceId, { [key]: nextArr });
  if (typeof famresaRenderCompletionCard === 'function') famresaRenderCompletionCard();
  if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
}

async function famresaGuideSaveEdit(isNew) {
  const ctx = window._famresaGuideCtx;
  const res = resources.find((r) => r.id === ctx.resourceId);
  if (!res) return;
  const key = _famresaGuideKey(ctx.type);
  const arr = Array.isArray(res[key]) ? res[key].slice() : [];
  const title = (document.getElementById('fg-edit-title')?.value || '').trim();
  const subtitle = (document.getElementById('fg-edit-sub')?.value || '').trim();
  if (!title) {
    if (typeof showToast === 'function') showToast('Indique un titre');
    return;
  }
  if (isNew) {
    const id = ctx.editCategory === 'custom' ? `custom_${Date.now()}` : ctx.editCategory;
    const maxOrder = arr.reduce((m, x) => Math.max(m, x.order ?? 0), 0);
    arr.push({
      id,
      category: ctx.editCategory || 'custom',
      title,
      subtitle,
      icon: ctx.editCategory || 'custom',
      enabled: true,
      order: maxOrder + 1,
    });
  } else {
    const idx = arr.findIndex((x) => x.id === ctx.editingId);
    if (idx < 0) return;
    arr[idx] = { ...arr[idx], title, subtitle };
  }
  try {
    await famresaGuidePersistArray(arr);
    if (typeof showToast === 'function') showToast(isNew ? 'Instruction ajoutée' : 'Enregistré');
    famresaGuideViewList();
  } catch (e) {
    console.error(e);
    if (typeof showToast === 'function') showToast('Erreur — réessayez');
  }
}

function famresaGuideConfirmDelete() {
  if (!confirm('Supprimer cette instruction ?')) return;
  famresaGuideDeleteNow();
}

async function famresaGuideDeleteNow() {
  const ctx = window._famresaGuideCtx;
  const res = resources.find((r) => r.id === ctx.resourceId);
  if (!res || !ctx.editingId) return;
  const key = _famresaGuideKey(ctx.type);
  const arr = (Array.isArray(res[key]) ? res[key] : []).filter((x) => x.id !== ctx.editingId);
  try {
    await famresaGuidePersistArray(arr);
    if (typeof showToast === 'function') showToast('Supprimé');
    famresaGuideViewList();
  } catch (e) {
    console.error(e);
    if (typeof showToast === 'function') showToast('Erreur — réessayez');
  }
}

async function famresaGuideMove(itemId, delta) {
  const ctx = window._famresaGuideCtx;
  const res = resources.find((r) => r.id === ctx.resourceId);
  if (!res) return;
  const key = _famresaGuideKey(ctx.type);
  const list = _famresaSortedGuides(res[key] || []).map((x) => ({ ...x }));
  const idx = list.findIndex((x) => x.id === itemId);
  if (idx < 0) return;
  const j = idx + delta;
  if (j < 0 || j >= list.length) return;
  const t = list[idx];
  list[idx] = list[j];
  list[j] = t;
  list.forEach((x, i) => {
    x.order = i;
  });
  const byId = new Map(list.map((x) => [x.id, x]));
  const full = (Array.isArray(res[key]) ? res[key] : []).map((x) => byId.get(x.id) || x);
  try {
    await famresaGuidePersistArray(full);
    famresaRenderGuideEditorView();
  } catch (e) {
    console.error(e);
  }
}

function famresaOpenCheckinGuideRead(resourceId) {
  const res = resources.find((r) => r.id === resourceId);
  if (!res || res.type !== 'house') return;
  const list = _famresaSortedGuides(res.checkinGuide);
  if (!list.length) {
    if (typeof showToast === 'function') showToast('Aucun guide pour l’instant');
    return;
  }
  const overlay = document.getElementById('guides-read-overlay');
  const inner = document.getElementById('guides-read-inner');
  if (!overlay || !inner) return;
  const rn = _fgEsc(res.name || 'la maison');
  const rows = list
    .map(
      (it) => `
    <div class="famresa-gr-item">
      <div class="famresa-gr-title">${_fgEsc(it.title || '')}</div>
      <div class="famresa-gr-sub">${_fgEsc(it.subtitle || '')}</div>
    </div>`
    )
    .join('');
  const cout = _famresaSortedGuides(res.checkoutGuide).length;
  const link =
    cout > 0
      ? `<button type="button" class="famresa-gr-link" onclick="famresaCloseReadOverlay();famresaOpenCheckoutChecklist('${resourceId}',null)">Voir le guide de départ ›</button>`
      : '';
  inner.innerHTML = `
    <div class="famresa-ge-head">
      <button type="button" class="famresa-ge-back" onclick="famresaCloseReadOverlay()">←</button>
      <div class="famresa-ge-title">Arrivée à ${rn}</div>
    </div>
    <div class="famresa-gr-hero">${res.photoUrl ? `<img src="${_fgAttr(res.photoUrl)}" alt="">` : ''}</div>
    <div class="famresa-gr-list">${rows}</div>
    ${link}`;
  overlay.classList.remove('hidden');
}

function famresaCloseReadOverlay() {
  document.getElementById('guides-read-overlay')?.classList.add('hidden');
}

function _famresaGetCheckoutTargetBooking(resourceId) {
  if (!currentUser || typeof getUniqueBookingsSorted !== 'function') return null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const mine = getUniqueBookingsSorted()
    .filter((b) => {
      const bRes = b.ressource_id || b.resourceId || resourceId;
      return b.userId === currentUser.id && bRes === resourceId && (b.startDate || b.date);
    })
    .sort((a, b) => (a.startDate || a.date || '').localeCompare(b.startDate || b.date || ''));
  const currentMine = mine.find((b) => {
    const start = b.startDate || b.date || '';
    const end = b.endDate || start;
    return start <= todayStr && end >= todayStr;
  });
  const upcomingMine = mine.find((b) => (b.startDate || b.date || '') >= todayStr);
  return currentMine || upcomingMine || null;
}

function famresaOpenCheckoutChecklist(resourceId, bookingId) {
  const res = resources.find((r) => r.id === resourceId);
  if (!res || res.type !== 'house') return;
  const list = _famresaSortedGuides(res.checkoutGuide);
  if (!list.length) {
    if (typeof showToast === 'function') showToast('Aucun guide de départ');
    return;
  }
  let b =
    bookingId && typeof getUniqueBookingsSorted === 'function'
      ? getUniqueBookingsSorted().find((x) => x.id === bookingId)
      : null;
  if (!b) b = _famresaGetCheckoutTargetBooking(resourceId);
  if (!b || !b.id) {
    if (typeof showToast === 'function') showToast('Aucune réservation trouvée');
    return;
  }
  window._famresaCheckoutCtx = { resourceId, bookingId: b.id, items: list };
  famresaRenderCheckoutChecklistUI();
  document.getElementById('guides-checkout-overlay')?.classList.remove('hidden');
}

function famresaCloseCheckoutOverlay() {
  document.getElementById('guides-checkout-overlay')?.classList.add('hidden');
  window._famresaCheckoutCtx = null;
}

function famresaRenderCheckoutChecklistUI() {
  const ctx = window._famresaCheckoutCtx;
  const el = document.getElementById('guides-checkout-inner');
  if (!ctx || !el) return;
  const res = resources.find((r) => r.id === ctx.resourceId);
  const b = getUniqueBookingsSorted().find((x) => x.id === ctx.bookingId) || {};
  const st = b.checkoutStatus && typeof b.checkoutStatus === 'object' ? b.checkoutStatus : {};
  const list = ctx.items || [];
  const n = list.length;
  const done = list.filter((it) => st[it.id]).length;
  const allDone = n > 0 && done === n;
  const rn = _fgEsc(res?.name || 'la maison');
  const rows = list
    .map((it) => {
      const ok = !!st[it.id];
      return `<button type="button" class="famresa-co-row${ok ? ' is-done' : ''}" onclick="famresaToggleCheckoutItem('${_fgAttr(it.id)}')">
        <span class="famresa-co-check" aria-hidden="true">${ok ? '✓' : ''}</span>
        <span class="famresa-co-text">
          <span class="famresa-co-title">${_fgEsc(it.title || '')}</span>
          <span class="famresa-co-sub">${_fgEsc(it.subtitle || '')}</span>
        </span>
      </button>`;
    })
    .join('');
  el.innerHTML = `
    <div class="famresa-ge-head">
      <button type="button" class="famresa-ge-back" onclick="famresaCloseCheckoutOverlay()">←</button>
      <div class="famresa-ge-title">Départ de ${rn}</div>
    </div>
    <p class="famresa-co-instr">Coche chaque tâche avant de partir.</p>
    <div class="famresa-co-bar-wrap">
      <div class="famresa-co-bar"><span class="famresa-co-bar-fill" style="width:${n ? Math.round((done / n) * 100) : 0}%"></span></div>
      <span class="famresa-co-count">${done}/${n}</span>
    </div>
    <div class="famresa-co-list">${rows}</div>
    ${allDone ? '<p class="famresa-co-done-msg">Tout est en ordre. Bon retour !</p><button type="button" class="btn btn-ghost famresa-co-close" onclick="famresaCloseCheckoutOverlay()">Fermer</button>' : ''}`;
}

async function famresaToggleCheckoutItem(itemId) {
  const ctx = window._famresaCheckoutCtx;
  if (!ctx?.bookingId || !reservationRepository?.update) return;
  const b = getUniqueBookingsSorted().find((x) => x.id === ctx.bookingId);
  const prev = b?.checkoutStatus && typeof b.checkoutStatus === 'object' ? { ...b.checkoutStatus } : {};
  prev[itemId] = !prev[itemId];
  try {
    await reservationRepository.update(ctx.bookingId, { checkoutStatus: prev });
    if (b) b.checkoutStatus = prev;
    famresaRenderCheckoutChecklistUI();
    if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
  } catch (e) {
    console.error(e);
    if (typeof showToast === 'function') showToast('Erreur — réessayez');
  }
}

function famresaOnTripBannerTap(resourceId) {
  const res = resources.find((r) => r.id === resourceId);
  if (!res || res.type !== 'house') return;
  const ctx = typeof getDashboardTripContext === 'function' ? getDashboardTripContext(resourceId) : null;
  if (!ctx?.targetBooking) return;
  if (ctx.isInProgress) {
    if (_famresaSortedGuides(res.checkoutGuide).length) famresaOpenCheckoutChecklist(resourceId, ctx.targetBooking.id);
    else if (_famresaSortedGuides(res.checkinGuide).length) famresaOpenCheckinGuideRead(resourceId);
    else if (typeof showToast === 'function') showToast('Aucun guide pour l’instant');
  } else {
    if (_famresaSortedGuides(res.checkinGuide).length) famresaOpenCheckinGuideRead(resourceId);
    else if (typeof showToast === 'function') showToast('Aucun guide pour l’instant');
  }
}

function famresaCheckoutKpiHtml(res, booking) {
  const list = _famresaSortedGuides(res?.checkoutGuide);
  if (!list.length) {
    return `<div class="famresa-kpi-co"><span class="famresa-kpi-co-label">Guide de sortie</span>
      <button type="button" class="ccv2-btn-manage-link" onclick="famresaOpenGuideEditor('checkout','${res?.id || ''}')">Créer</button></div>`;
  }
  if (!booking || !booking.id) {
    return `<div class="famresa-kpi-co"><span class="famresa-kpi-dot famresa-kpi-dot--grey"></span><span>Non fait</span></div>`;
  }
  const st = booking.checkoutStatus && typeof booking.checkoutStatus === 'object' ? booking.checkoutStatus : {};
  const n = list.length;
  const done = list.filter((it) => st[it.id]).length;
  if (done === 0) {
    return `<div class="famresa-kpi-co"><span class="famresa-kpi-dot famresa-kpi-dot--grey"></span><span>Non fait</span></div>`;
  }
  if (done === n) {
    return `<div class="famresa-kpi-co"><span class="famresa-kpi-dot famresa-kpi-dot--ok"></span><span>Fait</span></div>`;
  }
  return `<div class="famresa-kpi-co"><span class="famresa-kpi-dot famresa-kpi-dot--warn"></span><span>${done}/${n}</span></div>`;
}
