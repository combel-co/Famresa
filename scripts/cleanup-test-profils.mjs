#!/usr/bin/env node
/**
 * Nettoie les profils de test en conservant un compte de référence.
 *
 * Par défaut:
 * - conserve le profil dont l'email est test@gmail.com
 * - supprime les autres profils "test" + données liées
 * - archive chaque document avant suppression (mode --apply)
 *
 * Dry-run par défaut (aucune écriture).
 */

import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import admin from 'firebase-admin';

const COL = {
  profils: 'profils',
  reservations: 'reservations',
  access: 'acces_ressource',
  members: 'famille_membres',
  resources: 'ressources',
  checklistStatus: 'checklist_statuts',
};

const PROFILE_LINK_FIELDS = ['profil_id', 'profileId', 'userId'];
const RESOURCE_LINK_FIELDS = ['ressource_id', 'resourceId', 'carId'];
const RESOURCE_OWNER_FIELDS = ['created_by', 'createdBy', 'ownerId', 'owner_id', 'owner_profile_id', 'profil_id'];
const __dirname = fileURLToPath(new URL('.', import.meta.url));

function parseArgs(argv) {
  const out = {
    keepEmail: 'test@gmail.com',
    apply: false,
    serviceAccount: null,
    projectId: null,
    outPath: null,
    archivePrefix: 'archives_test_cleanup',
    help: false,
  };
  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--keep-email=')) out.keepEmail = a.slice('--keep-email='.length).trim().toLowerCase();
    else if (a.startsWith('--service-account=')) out.serviceAccount = a.slice('--service-account='.length).trim();
    else if (a.startsWith('--project-id=')) out.projectId = a.slice('--project-id='.length).trim();
    else if (a.startsWith('--out=')) out.outPath = a.slice('--out='.length).trim();
    else if (a.startsWith('--archive-collection-prefix=')) out.archivePrefix = a.slice('--archive-collection-prefix='.length).trim() || out.archivePrefix;
  }
  return out;
}

function printHelp() {
  console.log(`
cleanup-test-profils.mjs — supprime les profils de test (sauf un email conservé)

Options:
  --keep-email=test@gmail.com         Email à conserver (défaut: test@gmail.com)
  --apply                             Exécute les suppressions (sinon dry-run)
  --archive-collection-prefix=NAME    Prefix des collections d'archive (défaut: archives_test_cleanup)
  --service-account=/path/key.json    Compte de service (sinon GOOGLE_APPLICATION_CREDENTIALS)
  --project-id=ID                     ID projet Firebase (sinon JSON / env)
  --out=./cleanup-test-profils.jsonl  Journal JSONL
  -h, --help                          Aide
`);
}

function initFirebase({ serviceAccount, projectId }) {
  const saPath = serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saPath) {
    const p = resolve(saPath);
    if (!existsSync(p)) throw new Error(`Fichier compte de service introuvable: ${p}`);
    const json = JSON.parse(readFileSync(p, 'utf8'));
    const pid = projectId || json.project_id;
    if (!pid) throw new Error('project_id manquant');
    admin.initializeApp({ credential: admin.credential.cert(json), projectId: pid });
    return;
  }
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
  });
}

function nowIso() {
  return new Date().toISOString();
}

function uniqByPath(refs) {
  const map = new Map();
  for (const r of refs) map.set(r.path, r);
  return [...map.values()];
}

function looksLikeTestProfile(data) {
  const name = String(data.nom || data.name || '').trim();
  const email = String(data.email || '').trim();
  return data.isTestProfile === true || /test/i.test(name) || /test/i.test(email);
}

async function paginateCollection(db, name, pageSize, onPage) {
  const FieldPath = admin.firestore.FieldPath;
  let last = null;
  let total = 0;
  for (;;) {
    let q = db.collection(name).orderBy(FieldPath.documentId()).limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    await onPage(snap.docs);
    total += snap.docs.length;
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }
  return total;
}

async function queryRefsByFields(db, collection, fields, value) {
  const refs = [];
  for (const field of fields) {
    const snap = await db.collection(collection).where(field, '==', value).get();
    snap.docs.forEach((d) => refs.push(d.ref));
  }
  return uniqByPath(refs);
}

async function queryRefsByResourceIds(db, collection, resourceIds) {
  const refs = [];
  const ids = [...new Set(resourceIds.filter(Boolean))];
  if (ids.length === 0) return refs;
  for (const field of RESOURCE_LINK_FIELDS) {
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const snap = await db.collection(collection).where(field, 'in', chunk).get();
      snap.docs.forEach((d) => refs.push(d.ref));
    }
  }
  return uniqByPath(refs);
}

async function archiveDoc(db, { archivePrefix, runId, sourceRef, sourceData, mode }) {
  const key = `${runId}__${sourceRef.path.replace(/\//g, '__')}`;
  const targetCollection = `${archivePrefix}_${sourceRef.parent.id}`;
  const targetRef = db.collection(targetCollection).doc(key);
  await targetRef.set(
    {
      runId,
      ts: nowIso(),
      mode,
      sourcePath: sourceRef.path,
      sourceCollection: sourceRef.parent.id,
      sourceId: sourceRef.id,
      data: sourceData,
    },
    { merge: true }
  );
}

async function commitDeleteBatches(db, refs) {
  let deleted = 0;
  for (let i = 0; i < refs.length; i += 450) {
    const chunk = refs.slice(i, i + 450);
    const batch = db.batch();
    chunk.forEach((r) => batch.delete(r));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const keepEmail = String(args.keepEmail || '').trim().toLowerCase();
  if (!keepEmail || !keepEmail.includes('@')) {
    throw new Error('Email à conserver invalide. Utilisez --keep-email=test@gmail.com');
  }

  const runId = `cleanup_test_profiles_${Date.now()}`;
  const mode = args.apply ? 'apply' : 'dry-run';
  initFirebase({ serviceAccount: args.serviceAccount, projectId: args.projectId });

  const db = admin.firestore();
  let out = null;
  if (args.outPath) out = createWriteStream(resolve(__dirname, '..', args.outPath), { flags: 'a' });
  const writeLog = (line) => {
    const row = { ts: nowIso(), runId, mode, ...line };
    const txt = JSON.stringify(row);
    console.log(txt);
    if (out) out.write(txt + '\n');
  };

  const profiles = [];
  await paginateCollection(db, COL.profils, 300, (docs) => {
    docs.forEach((d) => profiles.push({ id: d.id, data: d.data() || {}, ref: d.ref }));
  });

  const testProfiles = profiles.filter((p) => looksLikeTestProfile(p.data));
  const keepProfiles = testProfiles.filter((p) => String(p.data.email || '').trim().toLowerCase() === keepEmail);
  const deleteProfiles = testProfiles.filter((p) => String(p.data.email || '').trim().toLowerCase() !== keepEmail);

  writeLog({
    type: 'plan',
    keepEmail,
    totals: {
      profils: profiles.length,
      profils_test_detectes: testProfiles.length,
      profils_keep: keepProfiles.length,
      profils_delete: deleteProfiles.length,
    },
    keepProfileIds: keepProfiles.map((p) => p.id),
    deleteProfileIds: deleteProfiles.map((p) => p.id),
  });

  if (!args.apply) {
    console.log('\nDry-run terminé. Relancez avec --apply pour supprimer et archiver.');
  } else {
    for (const p of deleteProfiles) {
      const profileId = p.id;
      const profileRef = p.ref;

      const reservationRefs = await queryRefsByFields(db, COL.reservations, PROFILE_LINK_FIELDS, profileId);
      const accessRefsByProfile = await queryRefsByFields(db, COL.access, PROFILE_LINK_FIELDS, profileId);
      const memberRefs = await queryRefsByFields(db, COL.members, PROFILE_LINK_FIELDS, profileId);
      const checklistRefs = await queryRefsByFields(db, COL.checklistStatus, PROFILE_LINK_FIELDS, profileId);
      const createdResourceRefs = await queryRefsByFields(db, COL.resources, RESOURCE_OWNER_FIELDS, profileId);
      const createdResourceIds = createdResourceRefs.map((r) => r.id);

      const accessRefsByResource = await queryRefsByResourceIds(db, COL.access, createdResourceIds);
      const reservationRefsByResource = await queryRefsByResourceIds(db, COL.reservations, createdResourceIds);
      const accessRefs = uniqByPath([...accessRefsByProfile, ...accessRefsByResource]);
      const finalReservationRefs = uniqByPath([...reservationRefs, ...reservationRefsByResource]);

      writeLog({
        type: 'profile_plan',
        profileId,
        email: String(p.data.email || ''),
        stats: {
          reservations: finalReservationRefs.length,
          access: accessRefs.length,
          members: memberRefs.length,
          checklist_status: checklistRefs.length,
          resources_created: createdResourceRefs.length,
        },
      });

      const toArchive = [{ ref: profileRef, data: p.data }];
      for (const ref of [...finalReservationRefs, ...accessRefs, ...memberRefs, ...checklistRefs, ...createdResourceRefs]) {
        const snap = await ref.get();
        if (snap.exists) toArchive.push({ ref, data: snap.data() || {} });
      }
      for (const item of toArchive) {
        await archiveDoc(db, {
          archivePrefix: args.archivePrefix,
          runId,
          sourceRef: item.ref,
          sourceData: item.data,
          mode,
        });
      }

      const deletedReservations = await commitDeleteBatches(db, finalReservationRefs);
      const deletedAccess = await commitDeleteBatches(db, accessRefs);
      const deletedMembers = await commitDeleteBatches(db, memberRefs);
      const deletedChecklist = await commitDeleteBatches(db, checklistRefs);
      const deletedResources = await commitDeleteBatches(db, createdResourceRefs);
      await profileRef.delete();

      writeLog({
        type: 'profile_deleted',
        profileId,
        deleted: {
          profile: 1,
          reservations: deletedReservations,
          access: deletedAccess,
          members: deletedMembers,
          checklist_status: deletedChecklist,
          resources_created: deletedResources,
        },
      });
    }

    console.log('\nNettoyage appliqué avec succès.');
  }

  await db.collection(`${args.archivePrefix}_manifests`).doc(runId).set({
    runId,
    mode,
    keepEmail,
    createdAt: nowIso(),
    applyExecuted: !!args.apply,
  });

  if (out) {
    out.end();
    await new Promise((resolveDone, rejectDone) => {
      out.on('finish', resolveDone);
      out.on('error', rejectDone);
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
