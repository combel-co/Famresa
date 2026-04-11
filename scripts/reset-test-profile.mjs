#!/usr/bin/env node
/**
 * Reset quotidien d'un profil test (dry-run par defaut).
 *
 * Scope:
 * - profils/{profileId} (reset des champs de profil)
 * - reservations liees au profil
 * - acces_ressource lie a profil / ressources ciblees
 * - famille_membres lie au profil
 * - checklist_statuts lie au profil
 * - ressources creees par le profil (et reservations/acces associes a ces ressources)
 *
 * Mode securise:
 * - --apply requis pour ecriture/suppression
 * - archivage avant reset/suppression
 *
 * Usage:
 *   node scripts/reset-test-profile.mjs --profile-id=PROFILE_TEST
 *   node scripts/reset-test-profile.mjs --profile-id=PROFILE_TEST --apply
 *   node scripts/reset-test-profile.mjs --profile-id=PROFILE_TEST --apply --project-id=my-project --out=./reset-test-profile.jsonl
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
    profileId: null,
    apply: false,
    serviceAccount: null,
    projectId: null,
    outPath: null,
    archivePrefix: 'archives_test_reset',
    seedName: 'Profil test',
    seedEmail: 'test+reset@famresa.local',
    seedPin: '0000',
    seedPhoto: '',
    seedFamilyId: '',
    help: false,
  };

  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--profile-id=')) out.profileId = a.slice('--profile-id='.length).trim();
    else if (a.startsWith('--service-account=')) out.serviceAccount = a.slice('--service-account='.length).trim();
    else if (a.startsWith('--project-id=')) out.projectId = a.slice('--project-id='.length).trim();
    else if (a.startsWith('--out=')) out.outPath = a.slice('--out='.length).trim();
    else if (a.startsWith('--archive-collection-prefix=')) out.archivePrefix = a.slice('--archive-collection-prefix='.length).trim() || out.archivePrefix;
    else if (a.startsWith('--seed-name=')) out.seedName = a.slice('--seed-name='.length);
    else if (a.startsWith('--seed-email=')) out.seedEmail = a.slice('--seed-email='.length);
    else if (a.startsWith('--seed-pin=')) out.seedPin = a.slice('--seed-pin='.length);
    else if (a.startsWith('--seed-photo=')) out.seedPhoto = a.slice('--seed-photo='.length);
    else if (a.startsWith('--seed-family-id=')) out.seedFamilyId = a.slice('--seed-family-id='.length);
  }

  return out;
}

function printHelp() {
  console.log(`
reset-test-profile.mjs — reset d'un profil test (dry-run par defaut)

Options:
  --profile-id=ID                    Identifiant profil cible (obligatoire)
  --apply                            Execute les ecritures/suppressions
  --archive-collection-prefix=NAME   Prefix des collections d'archive (defaut: archives_test_reset)
  --service-account=/path/key.json   Compte de service (sinon GOOGLE_APPLICATION_CREDENTIALS)
  --project-id=ID                    ID projet Firebase (sinon JSON / env)
  --out=./report.jsonl               Journal JSONL des actions

  --seed-name="Profil test"          Nom reinjecte sur le profil
  --seed-email="mail@test.local"     Email reinjecte
  --seed-pin="0000"                  PIN reinjecte
  --seed-photo="https://..."         Photo reinjectee (optionnel)
  --seed-family-id=FAM_ID            FamilyId de seed (optionnel)

  -h, --help                         Affiche l'aide
`);
}

function initFirebase({ serviceAccount, projectId }) {
  const saPath = serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saPath) {
    const p = resolve(saPath);
    if (!existsSync(p)) {
      throw new Error(`Fichier compte de service introuvable: ${p}`);
    }
    const json = JSON.parse(readFileSync(p, 'utf8'));
    const pid = projectId || json.project_id;
    if (!pid) throw new Error('project_id manquant');
    admin.initializeApp({
      credential: admin.credential.cert(json),
      projectId: pid,
    });
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
  const ts = nowIso();
  const key = `${runId}__${sourceRef.path.replace(/\//g, '__')}`;
  const targetCollection = `${archivePrefix}_${sourceRef.parent.id}`;
  const targetRef = db.collection(targetCollection).doc(key);
  const payload = {
    runId,
    ts,
    mode,
    sourcePath: sourceRef.path,
    sourceCollection: sourceRef.parent.id,
    sourceId: sourceRef.id,
    data: sourceData,
  };
  await targetRef.set(payload, { merge: true });
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
  if (!args.profileId) {
    console.error('Erreur: --profile-id est obligatoire.');
    process.exit(1);
  }

  const runId = `reset_${args.profileId}_${Date.now()}`;
  const mode = args.apply ? 'apply' : 'dry-run';
  console.log(`[${mode}] reset profil test: ${args.profileId}`);

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

  const profileRef = db.collection(COL.profils).doc(args.profileId);
  const profileSnap = await profileRef.get();
  const profileData = profileSnap.exists ? profileSnap.data() || {} : null;

  const reservationRefs = await queryRefsByFields(db, COL.reservations, PROFILE_LINK_FIELDS, args.profileId);
  const accessRefsByProfile = await queryRefsByFields(db, COL.access, PROFILE_LINK_FIELDS, args.profileId);
  const memberRefs = await queryRefsByFields(db, COL.members, PROFILE_LINK_FIELDS, args.profileId);
  const checklistRefs = await queryRefsByFields(db, COL.checklistStatus, PROFILE_LINK_FIELDS, args.profileId);
  const createdResourceRefs = await queryRefsByFields(db, COL.resources, RESOURCE_OWNER_FIELDS, args.profileId);
  const createdResourceIds = createdResourceRefs.map((r) => r.id);

  const accessRefsByResource = await queryRefsByResourceIds(db, COL.access, createdResourceIds);
  const reservationRefsByResource = await queryRefsByResourceIds(db, COL.reservations, createdResourceIds);

  const accessRefs = uniqByPath([...accessRefsByProfile, ...accessRefsByResource]);
  const finalReservationRefs = uniqByPath([...reservationRefs, ...reservationRefsByResource]);

  const stats = {
    reservations: finalReservationRefs.length,
    access: accessRefs.length,
    members: memberRefs.length,
    checklist_status: checklistRefs.length,
    resources_created: createdResourceRefs.length,
    profile_exists: !!profileData,
  };
  writeLog({ type: 'plan', profileId: args.profileId, stats });

  if (args.apply) {
    const toArchive = [];

    if (profileData) toArchive.push({ ref: profileRef, data: profileData });

    for (const ref of finalReservationRefs) {
      const snap = await ref.get();
      if (snap.exists) toArchive.push({ ref, data: snap.data() || {} });
    }
    for (const ref of accessRefs) {
      const snap = await ref.get();
      if (snap.exists) toArchive.push({ ref, data: snap.data() || {} });
    }
    for (const ref of memberRefs) {
      const snap = await ref.get();
      if (snap.exists) toArchive.push({ ref, data: snap.data() || {} });
    }
    for (const ref of checklistRefs) {
      const snap = await ref.get();
      if (snap.exists) toArchive.push({ ref, data: snap.data() || {} });
    }
    for (const ref of createdResourceRefs) {
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
    writeLog({ type: 'archive_done', count: toArchive.length, archivePrefix: args.archivePrefix });

    const deletedReservations = await commitDeleteBatches(db, finalReservationRefs);
    const deletedAccess = await commitDeleteBatches(db, accessRefs);
    const deletedMembers = await commitDeleteBatches(db, memberRefs);
    const deletedChecklist = await commitDeleteBatches(db, checklistRefs);
    const deletedResources = await commitDeleteBatches(db, createdResourceRefs);

    writeLog({
      type: 'delete_done',
      deleted: {
        reservations: deletedReservations,
        access: deletedAccess,
        members: deletedMembers,
        checklist_status: deletedChecklist,
        resources_created: deletedResources,
      },
    });

    const seed = {
      nom: args.seedName,
      name: args.seedName,
      email: args.seedEmail,
      code_pin: args.seedPin,
      pin: args.seedPin,
      photo: args.seedPhoto || '',
      familyId: args.seedFamilyId || '',
      resetAt: nowIso(),
      updatedAt: nowIso(),
      isTestProfile: true,
      resetProfile: true,
    };
    if (!profileData) seed.createdAt = nowIso();

    await profileRef.set(seed, { merge: true });
    writeLog({ type: 'profile_seeded', profilePath: profileRef.path, seed: { ...seed, code_pin: '***', pin: '***' } });
  }

  await db.collection(`${args.archivePrefix}_manifests`).doc(runId).set({
    runId,
    mode,
    profileId: args.profileId,
    createdAt: nowIso(),
    stats,
    applyExecuted: !!args.apply,
  });

  if (out) {
    out.end();
    await new Promise((resolveDone, rejectDone) => {
      out.on('finish', resolveDone);
      out.on('error', rejectDone);
    });
  }

  if (!args.apply) {
    console.log('\nDry-run termine. Relancer avec --apply pour executer archivage + reset.');
  } else {
    console.log('\nReset applique avec succes.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

