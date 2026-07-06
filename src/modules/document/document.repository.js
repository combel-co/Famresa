// ==========================================
// DOCUMENT REPOSITORY — Firebase access only
// ==========================================
// No business logic. Only DB operations.
// Méta : champ `document` sur ressources/{id}.
// Contenu : collection `ressource_document_blobs` (1 doc = 1 fichier base64).

const documentRepository = {
  _blobsRef() {
    return db.collection('ressource_document_blobs');
  },

  /** Crée le blob (contenu base64) et retourne son id. */
  async createBlob({ resourceId, familyId, dataBase64 }) {
    const ref = await this._blobsRef().add({
      ressource_id: resourceId,
      famille_id: familyId || null,
      dataBase64,
      createdAt: ts(),
    });
    return ref.id;
  },

  /** Contenu du blob ou null (inexistant ou soft-deleted). */
  async getBlob(blobId) {
    if (!blobId) return null;
    const doc = await this._blobsRef().doc(blobId).get();
    if (!doc.exists) return null;
    const d = doc.data() || {};
    if (d.deleted === true || !d.dataBase64) return null;
    return { id: doc.id, dataBase64: d.dataBase64 };
  },

  /** Soft delete : les règles Firestore interdisent le delete côté client. */
  async markBlobDeleted(blobId) {
    if (!blobId) return;
    await this._blobsRef().doc(blobId).update({ deleted: true, dataBase64: null });
  },

  /** Écrit la méta document de la ressource (null pour la retirer). */
  async setResourceDocumentMeta(resourceId, meta) {
    if (!resourceId) return;
    await ressourcesRef().doc(resourceId).update({ document: meta || null });
  },
};
