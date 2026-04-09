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

/** Voiture — guide entretien (même schéma que checkinGuide, clé Firestore maintenanceGuide) */
const FAMRESA_MAINTENANCE_CATS = [
  { category: 'm_revision', defaultTitle: 'Révisions & vidanges', subLabel: 'Dernier passage, prochaine échéance', ph: 'Ex : Vidange faite à 45 000 km, prochaine à 60 000 km ou mars 2027.' },
  { category: 'm_tires', defaultTitle: 'Pneus & freins', subLabel: 'Usure, pression, disques', ph: 'Ex : Pneus été montés, 5 mm de gazon restant.' },
  { category: 'm_insurance_ct', defaultTitle: 'Assurance & contrôle technique', subLabel: 'Échéances', ph: 'Ex : CT valide jusqu’au 12/2026, assurance MMA n°…' },
  { category: 'm_breakdown', defaultTitle: 'Panne & dépannage', subLabel: 'Qui appeler, où est la roue de secours', ph: 'Ex : Dépannage MMA 0 800 … ; roue sous le coffre.' },
  { category: 'm_fuel_adblue', defaultTitle: 'Carburant / AdBlue', subLabel: 'Type, cartes, stations', ph: 'Ex : Diesel B7, carte Total dans la boîte à gants.' },
  { category: 'm_other', defaultTitle: 'Autres notes entretien', subLabel: '', ph: 'Ex : Courroie distribution changée en 2023.' },
];

window._famresaGuideCtx = { type: 'checkin', resourceId: null, view: 'list' };

function _famresaGuideKey(type) {
  if (type === 'checkout') return 'checkoutGuide';
  if (type === 'maintenance') return 'maintenanceGuide';
  return 'checkinGuide';
}

function _famresaSortedGuides(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && x.enabled !== false)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function _famresaTodayLocalStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _famresaCalendarDaysBetween(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return NaN;
  const a = new Date(String(fromYmd).slice(0, 10) + 'T12:00:00');
  const b = new Date(String(toYmd).slice(0, 10) + 'T12:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function _famresaBookingStartStr(b) {
  return (b?.startDate || b?.date || '').slice(0, 10);
}

function _famresaBookingEndStr(b) {
  const s = _famresaBookingStartStr(b);
  return (b?.endDate || b?.date_fin || s || '').slice(0, 10);
}

function _famresaGetTargetBookingForGuides(resourceId) {
  if (typeof resolveTripTargetBooking !== 'function' || !currentUser) return null;
  return resolveTripTargetBooking(resourceId).targetBooking || null;
}

/** Guide d’entrée : visible à partir de J-7 avant l’arrivée jusqu’à la fin du séjour */
function _famresaCheckinGuideUnlocked(b, todayStr) {
  if (!b) return false;
  const start = _famresaBookingStartStr(b);
  const end = _famresaBookingEndStr(b) || start;
  if (!start) return false;
  if (todayStr > end) return false;
  const daysUntilStart = _famresaCalendarDaysBetween(todayStr, start);
  return daysUntilStart <= 7;
}

function _famresaCheckinGuideInteractive(b, todayStr) {
  return !!_famresaBookingStartStr(b) && todayStr === _famresaBookingStartStr(b);
}

/** Guide de sortie : coches uniquement le jour du départ (date de fin de séjour) */
function _famresaCheckoutGuideInteractive(b, todayStr) {
  const end = _famresaBookingEndStr(b);
  return !!end && todayStr === end;
}

function famresaOpenGuideEditor(type, resourceId, options) {
  if (_famresaRole(resourceId) !== 'admin') {
    if (typeof showToast === 'function') showToast('Réservé aux admins');
    return;
  }
  const opts = options || {};
  window._famresaGuideCtx = { type, resourceId, view: 'list', onClose: opts.onClose || null };
  famresaRenderGuideEditorView();
  document.getElementById('guides-overlay')?.classList.remove('hidden');
}

function famresaCloseGuidesOverlay() {
  document.getElementById('guides-overlay')?.classList.add('hidden');
  const cb = window._famresaGuideCtx && typeof window._famresaGuideCtx.onClose === 'function' ? window._famresaGuideCtx.onClose : null;
  window._famresaGuideCtx = { type: 'checkin', resourceId: null, view: 'list' };
  if (cb) cb();
}

function famresaRenderGuideEditorView() {
  const el = document.getElementById('guides-overlay-inner');
  const ctx = window._famresaGuideCtx;
  if (!el || !ctx.resourceId) return;
  const res = resources.find((r) => r.id === ctx.resourceId);
  if (!res) return;
  const key = _famresaGuideKey(ctx.type);
  const list = _famresaSortedGuides(res[key]);

  const isMaintenance = ctx.type === 'maintenance';
  const isCheckout = ctx.type === 'checkout';
  const title = isMaintenance ? 'Entretien' : isCheckout ? 'Guide de départ' : "Guide d'arrivée";

  if (ctx.view === 'pick') {
    const defs = isMaintenance ? FAMRESA_MAINTENANCE_CATS : isCheckout ? FAMRESA_CHECKOUT_CATS : FAMRESA_CHECKIN_CATS;
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
    const def = [...FAMRESA_CHECKIN_CATS, ...FAMRESA_CHECKOUT_CATS, ...FAMRESA_MAINTENANCE_CATS].find((x) => x.category === cat);
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
    const emptyIcon = isMaintenance ? '🔧' : '🔑';
    const emptyTitle = isMaintenance ? 'Notes d\'entretien' : isCheckout ? 'Avant de partir' : 'Prépare l\'arrivée';
    const emptySub = isMaintenance
      ? 'Ajoute des points clés : révisions, pneus, assurance… pour toute la famille.'
      : isCheckout
        ? 'Crée une checklist pour que ta famille laisse la maison en ordre.'
        : 'Aide ta famille à s\'installer : wifi, accès, règles…';
    el.innerHTML = `
      <div class="famresa-ge-head">
        <button type="button" class="famresa-ge-back" onclick="famresaCloseGuidesOverlay()">←</button>
        <div class="famresa-ge-title">${title}</div>
      </div>
      <div class="famresa-ge-empty">
        <div class="famresa-ge-empty-icon" aria-hidden="true">${emptyIcon}</div>
        <div class="famresa-ge-empty-title">${emptyTitle}</div>
        <p class="famresa-ge-empty-sub">${emptySub}</p>
        <button type="button" class="btn btn-primary" onclick="famresaGuideViewPick()">${isMaintenance ? 'Ajouter une note' : 'Créer le guide'}</button>
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
    <p class="famresa-ge-hint">${isMaintenance ? 'Infos pratiques pour l’entretien et l’usage au quotidien.' : isCheckout ? 'Chaque membre pourra cocher les tâches avant de partir.' : 'Visible par tous les membres avant leur séjour.'}</p>
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

/** Lecture seule (sans réservation ciblée) — overlay « gr » */
function famresaOpenCheckinGuideStatic(resourceId) {
  const res = resources.find((r) => r.id === resourceId);
  if (!res || res.type !== 'house') return;
  const list = _famresaSortedGuides(res.checkinGuide);
  if (!list.length) return;
  famresaCloseCheckinOverlay();
  famresaCloseCheckoutOverlay();
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
      ? `<button type="button" class="famresa-gr-link" onclick='famresaCloseReadOverlay();famresaOpenCheckoutGuideRead(${JSON.stringify(resourceId)})'>Voir le guide de départ ›</button>`
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

function famresaOpenCheckinGuideRead(resourceId) {
  const res = resources.find((r) => r.id === resourceId);
  if (!res || res.type !== 'house') return;
  const list = _famresaSortedGuides(res.checkinGuide);
  if (!list.length) {
    if (typeof showToast === 'function') showToast('Aucun guide pour l’instant');
    return;
  }
  const b = _famresaGetTargetBookingForGuides(resourceId);
  const todayStr = _famresaTodayLocalStr();
  if (!b) {
    famresaOpenCheckinGuideStatic(resourceId);
    return;
  }
  if (!_famresaCheckinGuideUnlocked(b, todayStr)) {
    if (typeof showToast === 'function') {
      showToast('Guide d’entrée disponible à partir de 7 jours avant ton arrivée.');
    }
    return;
  }
  famresaCloseReadOverlay();
  famresaCloseCheckoutOverlay();
  const interactive = _famresaCheckinGuideInteractive(b, todayStr);
  window._famresaCheckinCtx = {
    resourceId,
    bookingId: b.id,
    items: list,
    interactive,
  };
  famresaRenderCheckinChecklistUI();
  document.getElementById('guides-checkin-overlay')?.classList.remove('hidden');
}

function famresaCloseCheckinOverlay() {
  document.getElementById('guides-checkin-overlay')?.classList.add('hidden');
  window._famresaCheckinCtx = null;
}

function famresaRenderCheckinChecklistUI() {
  const ctx = window._famresaCheckinCtx;
  const el = document.getElementById('guides-checkin-inner');
  if (!ctx || !el) return;
  const res = resources.find((r) => r.id === ctx.resourceId);
  const b = getUniqueBookingsSorted().find((x) => x.id === ctx.bookingId) || {};
  const stRaw = b.checkinStatus && typeof b.checkinStatus === 'object' ? b.checkinStatus : {};
  const canEdit = ctx.interactive === true;
  const st = canEdit ? stRaw : {};
  const list = ctx.items || [];
  const n = list.length;
  const done = list.filter((it) => st[it.id]).length;
  const allDone = canEdit && n > 0 && done === n;
  const rn = _fgEsc(res?.name || 'la maison');
  const instr = canEdit
    ? 'Coche chaque étape le jour de ton arrivée.'
    : 'Consultation seule : le jour de ton arrivée, tu pourras cocher chaque étape ici.';
  const rows = list
    .map((it) => {
      const ok = !!st[it.id];
      const rowInner = `
        <span class="famresa-co-check" aria-hidden="true">${ok ? '✓' : ''}</span>
        <span class="famresa-co-text">
          <span class="famresa-co-title">${_fgEsc(it.title || '')}</span>
          <span class="famresa-co-sub">${_fgEsc(it.subtitle || '')}</span>
        </span>`;
      if (canEdit) {
        return `<button type="button" class="famresa-co-row${ok ? ' is-done' : ''}" onclick="famresaToggleCheckinItem('${_fgAttr(it.id)}')">${rowInner}</button>`;
      }
      return `<div class="famresa-co-row is-readonly${ok ? ' is-done' : ''}">${rowInner}</div>`;
    })
    .join('');
  el.innerHTML = `
    <div class="famresa-ge-head">
      <button type="button" class="famresa-ge-back" onclick="famresaCloseCheckinOverlay()">←</button>
      <div class="famresa-ge-title">Arrivée à ${rn}</div>
    </div>
    <p class="famresa-co-instr">${_fgEsc(instr)}</p>
    <div class="famresa-co-bar-wrap">
      <div class="famresa-co-bar"><span class="famresa-co-bar-fill" style="width:${n ? Math.round((done / n) * 100) : 0}%"></span></div>
      <span class="famresa-co-count">${done}/${n}</span>
    </div>
    <div class="famresa-co-list">${rows}</div>
    ${allDone ? '<p class="famresa-co-done-msg">Parfait, bon séjour !</p><button type="button" class="btn btn-ghost famresa-co-close" onclick="famresaCloseCheckinOverlay()">Fermer</button>' : ''}`;
}

async function famresaToggleCheckinItem(itemId) {
  const ctx = window._famresaCheckinCtx;
  if (ctx?.interactive !== true || !ctx?.bookingId || !reservationRepository?.update) return;
  const b = getUniqueBookingsSorted().find((x) => x.id === ctx.bookingId);
  const prev = b?.checkinStatus && typeof b.checkinStatus === 'object' ? { ...b.checkinStatus } : {};
  prev[itemId] = !prev[itemId];
  try {
    await reservationRepository.update(ctx.bookingId, { checkinStatus: prev });
    if (b) b.checkinStatus = prev;
    famresaRenderCheckinChecklistUI();
    if (typeof renderExperiencePanels === 'function') renderExperiencePanels();
  } catch (e) {
    console.error(e);
    if (typeof showToast === 'function') showToast('Erreur — réessayez');
  }
}

/** Consultation du guide de sortie sans réservation active (même présentation que l’arrivée). */
function famresaOpenCheckoutGuideRead(resourceId) {
  const res = resources.find((r) => r.id === resourceId);
  if (!res || res.type !== 'house') return;
  const list = _famresaSortedGuides(res.checkoutGuide);
  if (!list.length) {
    if (typeof showToast === 'function') showToast('Aucun guide de départ');
    return;
  }
  famresaCloseCheckinOverlay();
  famresaCloseCheckoutOverlay();
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
  inner.innerHTML = `
    <div class="famresa-ge-head">
      <button type="button" class="famresa-ge-back" onclick="famresaCloseReadOverlay()">←</button>
      <div class="famresa-ge-title">Départ de ${rn}</div>
    </div>
    <div class="famresa-gr-hero">${res.photoUrl ? `<img src="${_fgAttr(res.photoUrl)}" alt="">` : ''}</div>
    <p class="famresa-co-instr" style="margin:0 0 12px;font-size: calc(13px * var(--ui-text-scale));color:var(--text-secondary)">Liste des tâches avant de partir. Avec une réservation, tu peux les consulter pendant le séjour ; les coches sont possibles le jour du départ.</p>
    <div class="famresa-gr-list">${rows}</div>`;
  overlay.classList.remove('hidden');
}

function famresaCloseReadOverlay() {
  document.getElementById('guides-read-overlay')?.classList.add('hidden');
}

function _famresaGetCheckoutTargetBooking(resourceId) {
  if (!currentUser || typeof resolveTripTargetBooking !== 'function') return null;
  const { targetBooking } = resolveTripTargetBooking(resourceId);
  return targetBooking || null;
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
    famresaOpenCheckoutGuideRead(resourceId);
    return;
  }
  famresaCloseReadOverlay();
  famresaCloseCheckinOverlay();
  const interactive = _famresaCheckoutGuideInteractive(b, _famresaTodayLocalStr());
  window._famresaCheckoutCtx = { resourceId, bookingId: b.id, items: list, interactive };
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
  const stRaw = b.checkoutStatus && typeof b.checkoutStatus === 'object' ? b.checkoutStatus : {};
  const canEdit = ctx.interactive === true;
  const st = canEdit ? stRaw : {};
  const list = ctx.items || [];
  const n = list.length;
  const done = list.filter((it) => st[it.id]).length;
  const allDone = canEdit && n > 0 && done === n;
  const rn = _fgEsc(res?.name || 'la maison');
  const instr = canEdit
    ? 'Coche chaque tâche le jour du départ.'
    : 'Consultation seule : le jour du départ, tu pourras cocher chaque tâche ici.';
  const rows = list
    .map((it) => {
      const ok = !!st[it.id];
      const rowInner = `
        <span class="famresa-co-check" aria-hidden="true">${ok ? '✓' : ''}</span>
        <span class="famresa-co-text">
          <span class="famresa-co-title">${_fgEsc(it.title || '')}</span>
          <span class="famresa-co-sub">${_fgEsc(it.subtitle || '')}</span>
        </span>`;
      if (canEdit) {
        return `<button type="button" class="famresa-co-row${ok ? ' is-done' : ''}" onclick="famresaToggleCheckoutItem('${_fgAttr(it.id)}')">${rowInner}</button>`;
      }
      return `<div class="famresa-co-row is-readonly${ok ? ' is-done' : ''}">${rowInner}</div>`;
    })
    .join('');
  el.innerHTML = `
    <div class="famresa-ge-head">
      <button type="button" class="famresa-ge-back" onclick="famresaCloseCheckoutOverlay()">←</button>
      <div class="famresa-ge-title">Départ de ${rn}</div>
    </div>
    <p class="famresa-co-instr">${_fgEsc(instr)}</p>
    <div class="famresa-co-bar-wrap">
      <div class="famresa-co-bar"><span class="famresa-co-bar-fill" style="width:${n ? Math.round((done / n) * 100) : 0}%"></span></div>
      <span class="famresa-co-count">${done}/${n}</span>
    </div>
    <div class="famresa-co-list">${rows}</div>
    ${allDone ? '<p class="famresa-co-done-msg">Tout est en ordre. Bon retour !</p><button type="button" class="btn btn-ghost famresa-co-close" onclick="famresaCloseCheckoutOverlay()">Fermer</button>' : ''}`;
}

async function famresaToggleCheckoutItem(itemId) {
  const ctx = window._famresaCheckoutCtx;
  if (ctx?.interactive !== true || !ctx?.bookingId || !reservationRepository?.update) return;
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

/** Deux cellules grille maison : libellés house-raw-label, Créer / Consulter alignés à droite (comme l'itinéraire). */
function famresaHouseGuideRowsHtml(res) {
  if (!res || res.type !== 'house') return '';
  const id = res.id;
  const idJs = JSON.stringify(id);
  const cinList = _famresaSortedGuides(res.checkinGuide);
  const coutList = _famresaSortedGuides(res.checkoutGuide);
  const isAdmin = typeof _famresaRole === 'function' && _famresaRole(id) === 'admin';

  const hideRm = typeof hideResourceManagePage === 'function' ? 'hideResourceManagePage();' : '';

  const tripCtx = typeof getDashboardTripContext === 'function' ? getDashboardTripContext(id) : null;
  const checkoutBookingId = tripCtx?.targetBooking?.id;
  const checkoutBookingArg = checkoutBookingId != null ? JSON.stringify(checkoutBookingId) : 'null';

  /* Mini-cards à droite: "Consulter" si rempli, sinon "À compléter". */
  const checkinRight = cinList.length
    ? `<button type="button" class="house-raw-guide-card is-complete" onclick='${hideRm}famresaOpenCheckinGuideRead(${idJs})'>Consulter</button>`
    : isAdmin
      ? `<button type="button" class="house-raw-guide-card is-todo" onclick='${hideRm}famresaOpenGuideEditor("checkin",${idJs})'>À compléter</button>`
      : '<span class="house-raw-guide-card is-todo is-disabled">À compléter</span>';

  const checkoutRight = coutList.length
    ? `<button type="button" class="house-raw-guide-card is-complete" onclick='${hideRm}famresaOpenCheckoutChecklist(${idJs},${checkoutBookingArg})'>Consulter</button>`
    : isAdmin
      ? `<button type="button" class="house-raw-guide-card is-todo" onclick='${hideRm}famresaOpenGuideEditor("checkout",${idJs})'>À compléter</button>`
      : '<span class="house-raw-guide-card is-todo is-disabled">À compléter</span>';

  return `
    <div class="house-raw-cell house-raw-cell-full">
      <div class="house-raw-label">Guide d'entrée</div>
      <div class="house-raw-guide-row">${checkinRight}</div>
    </div>
    <div class="house-raw-cell house-raw-cell-full">
      <div class="house-raw-label">Guide de sortie</div>
      <div class="house-raw-guide-row">${checkoutRight}</div>
    </div>`;
}
