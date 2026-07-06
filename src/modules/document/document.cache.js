// ==========================================
// DOCUMENT CACHE — stockage local (IndexedDB)
// ==========================================
// Cache du contenu des documents pour la consultation hors ligne
// (rempli à la première consultation en ligne). Aucune logique métier.

const documentCache = {
  _DB_NAME: 'famresa-documents',
  _STORE: 'blobs',

  _open() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('NO_IDB'));
        return;
      }
      const req = indexedDB.open(this._DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this._STORE)) {
          db.createObjectStore(this._STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  /** Contenu (dataURL base64) ou null. Ne lève jamais. */
  async get(blobId) {
    if (!blobId) return null;
    try {
      const db = await this._open();
      return await new Promise((resolve) => {
        const tx = db.transaction(this._STORE, 'readonly');
        const rq = tx.objectStore(this._STORE).get(blobId);
        rq.onsuccess = () => resolve(rq.result || null);
        rq.onerror = () => resolve(null);
      });
    } catch (_) {
      return null;
    }
  },

  /** Écriture silencieuse (l'échec du cache ne doit jamais bloquer le flux). */
  async set(blobId, dataBase64) {
    if (!blobId || !dataBase64) return;
    try {
      const db = await this._open();
      await new Promise((resolve) => {
        const tx = db.transaction(this._STORE, 'readwrite');
        tx.objectStore(this._STORE).put(dataBase64, blobId);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      });
    } catch (_) {}
  },

  async remove(blobId) {
    if (!blobId) return;
    try {
      const db = await this._open();
      await new Promise((resolve) => {
        const tx = db.transaction(this._STORE, 'readwrite');
        tx.objectStore(this._STORE).delete(blobId);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      });
    } catch (_) {}
  },

  async has(blobId) {
    return !!(await this.get(blobId));
  },
};
