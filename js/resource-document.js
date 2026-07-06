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
    bodyEl.innerHTML = `<img class="doc-viewer-img" src="${dataUrl}" alt="${_docEscapeHtml(meta.label || 'Document')}">`;
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
