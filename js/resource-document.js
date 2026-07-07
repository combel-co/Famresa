// ==========================================
// RESOURCE DOCUMENT — carte dashboard + visionneuse
// ==========================================
// UI uniquement : toute la logique passe par documentService.

let _docPendingPrepared = null;
let _docReplacing = false;

const _DOC_SVG_DOWNLOAD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4 19h16"/></svg>';
const _DOC_SVG_PLUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
const _DOC_SVG_FILE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4"/></svg>';
const _DOC_SVG_OFFLINE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M2 7c5.5-5 14.5-5 20 0"/><path d="M5.5 10.5c3.7-3.3 9.3-3.3 13 0"/><path d="M9 14c1.8-1.5 4.2-1.5 6 0"/><circle cx="12" cy="17.5" r="1"/><path d="M3 3l18 18"/></svg>';

function _docEscapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _docSelectedResource() {
  if (typeof resources === 'undefined' || !Array.isArray(resources)) return null;
  return resources.find((r) => r.id === selectedResource) || null;
}

function _docIsAdmin() {
  return window._myResourceRoles?.[selectedResource] === 'admin';
}

function _docFormatSize(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(n / 1024))} Ko`;
}

function _docTypeLabel(mimeType) {
  return mimeType === 'application/pdf' ? 'PDF' : 'JPEG';
}

function _docShowError(msg) {
  const viewer = document.getElementById('document-viewer-overlay');
  const viewerOpen = viewer && !viewer.classList.contains('hidden');
  if (viewerOpen) {
    showToast(msg);
    return;
  }
  const errEl = document.getElementById('resource-document-error');
  if (errEl) errEl.textContent = msg;
}

// ── Carte dashboard ──

async function renderResourceDocumentCard(res) {
  const card = document.getElementById('resource-document-card');
  const body = document.getElementById('resource-document-body');
  if (!card || !body) return;
  if (!res) {
    card.style.display = 'none';
    return;
  }
  const errEl = document.getElementById('resource-document-error');
  if (errEl) errEl.textContent = '';
  card.style.display = '';

  const meta = res.document || null;
  const isAdmin = _docIsAdmin();

  if (!meta) {
    if (isAdmin) {
      body.innerHTML = `
        <button type="button" class="doc-row" onclick="pickResourceDocument(false)">
          <span class="doc-row-icon">${_DOC_SVG_PLUS}</span>
          <span class="doc-row-text">
            <span class="doc-row-label">Ajouter un document</span>
            <span class="doc-row-sub">PDF ou JPEG</span>
          </span>
          <span class="doc-row-chevron">›</span>
        </button>`;
    } else {
      body.innerHTML = `
        <div class="doc-row doc-row--muted">
          <span class="doc-row-icon">${_DOC_SVG_FILE}</span>
          <span class="doc-row-text">
            <span class="doc-row-label">Aucun document</span>
          </span>
        </div>`;
    }
    return;
  }

  const label = _docEscapeHtml(meta.label || 'Document');
  const sub = `${_docTypeLabel(meta.mimeType)} · ${_docFormatSize(meta.size)}`;

  let offlineUnavailable = false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    try {
      offlineUnavailable = !(await documentService.isAvailableOffline(meta));
    } catch (_) {}
    // La ressource affichée a pu changer pendant le check asynchrone.
    if (_docSelectedResource()?.id !== res.id) return;
  }

  if (offlineUnavailable) {
    body.innerHTML = `
      <div class="doc-row doc-row--offline">
        <span class="doc-row-icon">${_DOC_SVG_OFFLINE}</span>
        <span class="doc-row-text">
          <span class="doc-row-label">${label}</span>
          <span class="doc-row-sub">Non disponible hors ligne</span>
        </span>
      </div>`;
    return;
  }

  body.innerHTML = `
    <button type="button" class="doc-row" onclick="openResourceDocument()">
      <span class="doc-row-icon">${_DOC_SVG_DOWNLOAD}</span>
      <span class="doc-row-text">
        <span class="doc-row-label">${label}</span>
        <span class="doc-row-sub">${sub}</span>
      </span>
      <span class="doc-row-chevron">›</span>
    </button>`;
}

// ── Ajout / remplacement ──

function pickResourceDocument(replacing) {
  _docReplacing = replacing === true;
  const errEl = document.getElementById('resource-document-error');
  if (errEl) errEl.textContent = '';
  const input = document.getElementById('resource-document-input');
  if (input) {
    input.value = '';
    input.click();
  }
}

async function onResourceDocumentFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    _docPendingPrepared = await documentService.prepareFile(file);
  } catch (e) {
    const code = String(e?.message || '');
    _docShowError(
      code === 'UNSUPPORTED_FORMAT'
        ? 'Format non pris en charge — PDF ou JPEG uniquement'
        : code === 'FILE_TOO_LARGE'
          ? 'Fichier trop lourd — 700 Ko max pour un PDF'
          : 'Impossible de lire ce fichier — réessaie'
    );
    return;
  }
  _docShowLabelSheet(_docPendingPrepared);
}

function _docShowLabelSheet(prepared) {
  const defaultLabel = _docReplacing
    ? (_docSelectedResource()?.document?.label || documentService.defaultLabel(prepared))
    : documentService.defaultLabel(prepared);
  document.getElementById('sheet-content').innerHTML = `
    <div class="login-sheet">
      <h2>${_docReplacing ? 'Remplacer le document' : 'Ajouter un document'}</h2>
      <p style="color:var(--text-light);font-size: calc(13px * var(--ui-text-scale));margin-bottom:18px">${_docTypeLabel(prepared.mimeType)} · ${_docFormatSize(prepared.size)}</p>
      <div class="input-group">
        <label for="doc-label-input">Nom du document</label>
        <input type="text" id="doc-label-input" value="${_docEscapeHtml(defaultLabel)}" maxlength="60" autocomplete="off">
      </div>
      <div class="lock-error" id="doc-label-error"></div>
      <button class="btn btn-primary" id="doc-label-save-btn" onclick="confirmResourceDocumentSave()">Enregistrer</button>
      <button class="btn" style="background:#f5f5f5;color:var(--text);margin-top:10px" onclick="closeSheet()">Annuler</button>
    </div>`;
  document.getElementById('overlay').classList.add('open');
  const labelInput = document.getElementById('doc-label-input');
  if (labelInput) {
    labelInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      confirmResourceDocumentSave();
    });
  }
}

async function confirmResourceDocumentSave() {
  const res = _docSelectedResource();
  const prepared = _docPendingPrepared;
  const errEl = document.getElementById('doc-label-error');
  if (!res || !prepared) {
    if (errEl) errEl.textContent = 'Erreur — recharge la page';
    return;
  }
  const label = (document.getElementById('doc-label-input')?.value || '').trim();
  const btn = document.getElementById('doc-label-save-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '...';
  }
  try {
    const meta = await documentService.attach({
      resourceId: res.id,
      familyId: res.famille_id || res.familyId || null,
      label,
      prepared,
      previousMeta: res.document || null,
    });
    res.document = meta;
    _docPendingPrepared = null;
    closeSheet();
    closeDocumentViewer();
    renderResourceDocumentCard(res);
    showToast(_docReplacing ? 'Document remplacé ✓' : 'Document ajouté ✓');
    _docReplacing = false;
  } catch (e) {
    console.error(e);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Enregistrer';
    }
    if (errEl) errEl.textContent = 'Erreur — réessaie';
  }
}

// ── Consultation ──

function _docDataUrlToBlob(dataUrl, mimeType) {
  const i = String(dataUrl).indexOf(',');
  const bin = atob(String(dataUrl).slice(i + 1));
  const arr = new Uint8Array(bin.length);
  for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
  return new Blob([arr], { type: mimeType || 'application/octet-stream' });
}

async function openResourceDocument() {
  const res = _docSelectedResource();
  const meta = res?.document;
  if (!meta) return;

  const overlay = document.getElementById('document-viewer-overlay');
  const titleEl = document.getElementById('doc-viewer-title');
  const bodyEl = document.getElementById('doc-viewer-body');
  const actionsEl = document.getElementById('doc-viewer-actions');
  if (!overlay || !bodyEl) return;

  if (titleEl) titleEl.textContent = meta.label || 'Document';
  bodyEl.innerHTML = '<div class="doc-viewer-loading">Chargement…</div>';
  if (actionsEl) actionsEl.innerHTML = '';
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');

  let dataUrl;
  try {
    dataUrl = await documentService.getContent(meta);
  } catch (e) {
    closeDocumentViewer();
    const code = String(e?.message || '');
    showToast(
      code === 'OFFLINE_UNAVAILABLE'
        ? 'Document non disponible hors ligne'
        : 'Impossible d\'ouvrir le document'
    );
    renderResourceDocumentCard(res);
    return;
  }

  window._docViewerDataUrl = dataUrl;
  if (meta.mimeType === 'application/pdf') {
    bodyEl.innerHTML = `
      <div class="doc-viewer-pdf">
        <span class="doc-viewer-pdf-icon">${_DOC_SVG_FILE}</span>
        <div class="doc-viewer-pdf-name">${_docEscapeHtml(meta.label || 'Document')}</div>
        <div class="doc-viewer-pdf-sub">PDF · ${_docFormatSize(meta.size)}</div>
        <button type="button" class="btn btn-primary doc-viewer-pdf-open" onclick="openResourceDocumentExternal()">Ouvrir le PDF</button>
      </div>`;
  } else {
    bodyEl.innerHTML = `
      <div class="doc-viewer-zoom">
        <img class="doc-viewer-img" src="${dataUrl}" alt="${_docEscapeHtml(meta.label || 'Document')}" draggable="false">
      </div>`;
    const zoomEl = bodyEl.querySelector('.doc-viewer-zoom');
    const imgEl = bodyEl.querySelector('.doc-viewer-img');
    if (zoomEl && imgEl) _docEnableImageZoom(zoomEl, imgEl);
  }

  if (actionsEl) {
    const adminActions = _docIsAdmin()
      ? `
        <button type="button" class="doc-viewer-action" onclick="pickResourceDocument(true)">Remplacer</button>
        <button type="button" class="doc-viewer-action doc-viewer-action--danger" onclick="confirmDeleteResourceDocument()">Supprimer</button>`
      : '';
    actionsEl.innerHTML = `
      <button type="button" class="doc-viewer-action" onclick="downloadResourceDocument()">Télécharger</button>
      ${adminActions}`;
  }
}

// Zoom image visionneuse : pincement, double-tap, molette, déplacement au doigt.
// Les éléments sont recréés à chaque ouverture (innerHTML), donc pas de cleanup à gérer.
function _docEnableImageZoom(container, img) {
  const MIN_SCALE = 1;
  const MAX_SCALE = 4;
  const DOUBLE_TAP_SCALE = 2.5;
  const st = {
    scale: 1,
    tx: 0,
    ty: 0,
    pointers: new Map(),
    startScale: 1,
    startTx: 0,
    startTy: 0,
    startDist: 0,
    startMidX: 0,
    startMidY: 0,
    downX: 0,
    downY: 0,
    downTime: 0,
    moved: false,
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
  };

  function apply() {
    img.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale})`;
    container.classList.toggle('is-zoomed', st.scale > 1.01);
  }

  function clampPan() {
    const maxX = Math.max(0, (img.clientWidth * st.scale - container.clientWidth) / 2);
    const maxY = Math.max(0, (img.clientHeight * st.scale - container.clientHeight) / 2);
    st.tx = Math.min(maxX, Math.max(-maxX, st.tx));
    st.ty = Math.min(maxY, Math.max(-maxY, st.ty));
  }

  function centerOf() {
    const r = container.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // Zoome vers newScale en gardant le point écran (px, py) fixe.
  function zoomAt(px, py, newScale) {
    const c = centerOf();
    const qx = px - c.x;
    const qy = py - c.y;
    const k = newScale / st.scale;
    st.tx = qx - (qx - st.tx) * k;
    st.ty = qy - (qy - st.ty) * k;
    st.scale = newScale;
    clampPan();
    apply();
  }

  function gestureStart() {
    const pts = [...st.pointers.values()];
    st.startScale = st.scale;
    st.startTx = st.tx;
    st.startTy = st.ty;
    if (pts.length >= 2) {
      st.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      st.startMidX = (pts[0].x + pts[1].x) / 2;
      st.startMidY = (pts[0].y + pts[1].y) / 2;
    } else if (pts.length === 1) {
      st.startMidX = pts[0].x;
      st.startMidY = pts[0].y;
    }
  }

  container.addEventListener('pointerdown', (e) => {
    container.setPointerCapture(e.pointerId);
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pointers.size === 1) {
      st.downX = e.clientX;
      st.downY = e.clientY;
      st.downTime = Date.now();
      st.moved = false;
    }
    gestureStart();
  });

  container.addEventListener('pointermove', (e) => {
    if (!st.pointers.has(e.pointerId)) return;
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...st.pointers.values()];
    if (Math.hypot(e.clientX - st.downX, e.clientY - st.downY) > 12) st.moved = true;

    if (pts.length >= 2) {
      // Pincement : zoom autour du milieu des deux doigts + suivi de leur déplacement.
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const c = centerOf();
      st.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.startScale * (dist / st.startDist)));
      const k = st.scale / st.startScale;
      st.tx = (midX - c.x) - ((st.startMidX - c.x) - st.startTx) * k;
      st.ty = (midY - c.y) - ((st.startMidY - c.y) - st.startTy) * k;
      clampPan();
      apply();
    } else if (pts.length === 1 && st.scale > 1) {
      st.tx = st.startTx + (pts[0].x - st.startMidX);
      st.ty = st.startTy + (pts[0].y - st.startMidY);
      clampPan();
      apply();
    }
  });

  function onPointerEnd(e) {
    if (!st.pointers.has(e.pointerId)) return;
    const wasSingle = st.pointers.size === 1;
    st.pointers.delete(e.pointerId);
    gestureStart();

    // Double-tap : deux taps rapides et proches → zoom / dézoom.
    if (e.type === 'pointerup' && wasSingle && !st.moved && Date.now() - st.downTime < 300) {
      const now = Date.now();
      const isDouble =
        now - st.lastTapTime < 350 &&
        Math.hypot(e.clientX - st.lastTapX, e.clientY - st.lastTapY) < 40;
      if (isDouble) {
        st.lastTapTime = 0;
        if (st.scale > 1.01) {
          st.scale = 1;
          st.tx = 0;
          st.ty = 0;
          apply();
        } else {
          zoomAt(e.clientX, e.clientY, DOUBLE_TAP_SCALE);
        }
      } else {
        st.lastTapTime = now;
        st.lastTapX = e.clientX;
        st.lastTapY = e.clientY;
      }
    }
  }
  container.addEventListener('pointerup', onPointerEnd);
  container.addEventListener('pointercancel', onPointerEnd);

  // Molette (desktop) : zoom vers le curseur.
  container.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.002);
      zoomAt(e.clientX, e.clientY, Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.scale * factor)));
    },
    { passive: false }
  );
}

function closeDocumentViewer() {
  const overlay = document.getElementById('document-viewer-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  window._docViewerDataUrl = null;
}

function openResourceDocumentExternal() {
  const meta = _docSelectedResource()?.document;
  const dataUrl = window._docViewerDataUrl;
  if (!meta || !dataUrl) return;
  try {
    const blob = _docDataUrlToBlob(dataUrl, meta.mimeType);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (_) {
    showToast('Impossible d\'ouvrir le document');
  }
}

function downloadResourceDocument() {
  const meta = _docSelectedResource()?.document;
  const dataUrl = window._docViewerDataUrl;
  if (!meta || !dataUrl) return;
  try {
    const blob = _docDataUrlToBlob(dataUrl, meta.mimeType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = meta.fileName || (meta.mimeType === 'application/pdf' ? 'document.pdf' : 'document.jpg');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (_) {
    showToast('Impossible de télécharger le document');
  }
}

async function confirmDeleteResourceDocument() {
  const res = _docSelectedResource();
  const meta = res?.document;
  if (!res || !meta) return;
  if (!window.confirm(`Supprimer « ${meta.label || 'ce document'} » ?`)) return;
  try {
    await documentService.remove({ resourceId: res.id, meta });
    res.document = null;
    closeDocumentViewer();
    renderResourceDocumentCard(res);
    showToast('Document supprimé');
  } catch (e) {
    console.error(e);
    showToast('Erreur — réessaie');
  }
}
