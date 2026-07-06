// ==========================================
// DOCUMENT SERVICE — business logic
// ==========================================
// Un document (PDF ou JPEG) par ressource.
// Méta légère sur ressources/{id}.document (extensible en documents[] plus tard),
// contenu base64 dans ressource_document_blobs (chargé au tap uniquement),
// cache local IndexedDB rempli à la première consultation (offline ensuite).

const DOCUMENT_MAX_PDF_BYTES = 700 * 1024;
const DOCUMENT_JPEG_TARGET_BYTES = 500 * 1024;
const DOCUMENT_JPEG_MAX_DIM = 1600;
const DOCUMENT_LABEL_MAX_LENGTH = 60;

const documentService = {
  isPdf(file) {
    const t = String(file?.type || '').toLowerCase();
    return t === 'application/pdf' || String(file?.name || '').toLowerCase().endsWith('.pdf');
  },

  isAllowedFile(file) {
    if (!file) return false;
    if (this.isPdf(file)) return true;
    const t = String(file.type || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    return t === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg');
  },

  /** Taille binaire approximative d'un dataURL base64. */
  _dataUrlBytes(dataUrl) {
    const i = String(dataUrl).indexOf(',');
    const b64 = i >= 0 ? String(dataUrl).slice(i + 1) : String(dataUrl);
    return Math.floor((b64.length * 3) / 4);
  },

  _readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('READ_FAILED'));
      reader.readAsDataURL(file);
    });
  },

  /** Recompression JPEG dégressive (qualité puis dimension) jusqu'à la cible. */
  async _compressJpeg(file) {
    const srcUrl = await this._readFileAsDataUrl(file);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('READ_FAILED'));
      el.src = srcUrl;
    });
    let dim = DOCUMENT_JPEG_MAX_DIM;
    let quality = 0.85;
    let out = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, dim / Math.max(img.width || 1, img.height || 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
      canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      out = canvas.toDataURL('image/jpeg', quality);
      if (this._dataUrlBytes(out) <= DOCUMENT_JPEG_TARGET_BYTES) return out;
      if (quality > 0.6) quality -= 0.12;
      else dim = Math.round(dim * 0.75);
    }
    if (out && this._dataUrlBytes(out) <= DOCUMENT_MAX_PDF_BYTES) return out;
    throw new Error('FILE_TOO_LARGE');
  },

  /**
   * Valide + prépare le fichier → { dataBase64, mimeType, size, fileName }.
   * Erreurs : UNSUPPORTED_FORMAT, FILE_TOO_LARGE, READ_FAILED.
   */
  async prepareFile(file) {
    if (!this.isAllowedFile(file)) throw new Error('UNSUPPORTED_FORMAT');
    if (this.isPdf(file)) {
      if (file.size > DOCUMENT_MAX_PDF_BYTES) throw new Error('FILE_TOO_LARGE');
      const dataBase64 = await this._readFileAsDataUrl(file);
      return {
        dataBase64,
        mimeType: 'application/pdf',
        size: this._dataUrlBytes(dataBase64),
        fileName: file.name || 'document.pdf',
      };
    }
    const dataBase64 = await this._compressJpeg(file);
    return {
      dataBase64,
      mimeType: 'image/jpeg',
      size: this._dataUrlBytes(dataBase64),
      fileName: file.name || 'photo.jpg',
    };
  },

  /** Libellé par défaut : nom de fichier sans extension. */
  defaultLabel(prepared) {
    return String(prepared?.fileName || 'Document').replace(/\.[^.]+$/, '');
  },

  /**
   * Associe (ou remplace) le document d'une ressource. Retourne la méta écrite.
   * Le remplacement crée un nouveau blob (jamais de cache périmé chez les membres),
   * l'ancien est soft-deleted en arrière-plan.
   */
  async attach({ resourceId, familyId, label, prepared, previousMeta }) {
    if (!resourceId || !prepared?.dataBase64) throw new Error('INVALID_DOCUMENT');
    const cleanLabel = (String(label || '').trim() || this.defaultLabel(prepared))
      .slice(0, DOCUMENT_LABEL_MAX_LENGTH);
    const blobId = await documentRepository.createBlob({
      resourceId,
      familyId,
      dataBase64: prepared.dataBase64,
    });
    const meta = {
      label: cleanLabel,
      fileName: prepared.fileName,
      mimeType: prepared.mimeType,
      size: prepared.size,
      blobId,
      updatedAt: Date.now(),
    };
    await documentRepository.setResourceDocumentMeta(resourceId, meta);
    documentCache.set(blobId, prepared.dataBase64);
    if (previousMeta?.blobId) {
      documentRepository.markBlobDeleted(previousMeta.blobId).catch(() => {});
      documentCache.remove(previousMeta.blobId);
    }
    return meta;
  },

  /** Retire le document (soft delete du blob — pas de delete client). */
  async remove({ resourceId, meta }) {
    if (!resourceId) throw new Error('INVALID_DOCUMENT');
    await documentRepository.setResourceDocumentMeta(resourceId, null);
    if (meta?.blobId) {
      documentRepository.markBlobDeleted(meta.blobId).catch(() => {});
      documentCache.remove(meta.blobId);
    }
  },

  /**
   * Contenu (dataURL) : cache local d'abord, sinon Firestore puis mise en cache.
   * Erreurs : NOT_FOUND, OFFLINE_UNAVAILABLE.
   */
  async getContent(meta) {
    if (!meta?.blobId) throw new Error('NOT_FOUND');
    const cached = await documentCache.get(meta.blobId);
    if (cached) return cached;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('OFFLINE_UNAVAILABLE');
    }
    const blob = await documentRepository.getBlob(meta.blobId);
    if (!blob?.dataBase64) throw new Error('NOT_FOUND');
    documentCache.set(meta.blobId, blob.dataBase64);
    return blob.dataBase64;
  },

  async isAvailableOffline(meta) {
    if (!meta?.blobId) return false;
    return documentCache.has(meta.blobId);
  },
};
