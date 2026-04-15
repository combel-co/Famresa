#!/usr/bin/env node
/**
 * Nettoyage Firestore : documents `profils` sans lien famille ni accès ressource.
 *
 * Critères « orphelin » (conservateurs) :
 *   - Aucune entrée dans `famille_membres` pointant vers ce profil (`profil_id` ou `profileId`).
 *   - Aucune entrée dans `acces_ressource` pour ce profil (`profil_id` / `profileId`).
 *
 * Garde-fou : ne supprime pas si l’id apparaît encore dans au moins une réservation
 * (`profil_id`, `profileId` ou `userId`), pour éviter des données réservation orphelines.
 *
 * Par défaut : dry-run. `--apply` supprime réellement `profils/{id}`.
 *
 * Credentials :
 *   - GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/compte-service.json
 *   - --service-account=/chemin/vers.json
 *
 * Usage :
 *   node scripts/cleanup-orphan-profils.mjs
 *   node scripts/cleanup-orphan-profils.mjs --apply --only-test
 *   node scripts/cleanup-orphan-profils.mjs --out=./orphan-profils.jsonl
 */

import { readFileSync, existsSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import admin from 'firebase-admin';

const COL_PROFILS = 'profils';
const COL_MEMBRES = 'famille_membres';
const COL_ACCESS = 'acces_ressource';
const COL_RESERVATIONS = 'reservations';

function parseArgs(argv) {
  const out = {
    apply: false,
    onlyTest: false,
    serviceAccount: null,
    projectId: null,
    outPath: null,
    pageSize: 300,
    help: false,
  };
  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    else if (a === '--only-test') out.onlyTest = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--service-account=')) out.serviceAccount = a.slice('--service-account='.length);
    else if (a.startsWith('--project-id=')) out.projectId = a.slice('--project-id='.length);
    else if (a.startsWith('--out=')) out.outPath = a.slice('--out='.length);
    else if (a.startsWith('--page-size=')) out.pageSize = Math.max(50, parseInt(a.slice('--page-size='.length), 10) || 300);
  }
  return out;
}

function printHelp() {
  console.log(`
cleanup-orphan-profils.mjs — liste ou supprime les profils sans famille_membres ni acces_ressource.

  Par défaut : dry-run. Ajouter --apply pour supprimer les documents profils.

Critères :
  - Pas de ligne famille_membres avec ce profil (profil_id / profileId).
  - Pas de ligne acces_ressource pour ce profil.
  - Refus si l’id est encore référencé par une réservation (profil_id / profileId / userId).

Options :
  --apply              Exécuter les suppressions
  --only-test          Ne traiter que les docs avec isTestProfile === true
  --service-account=   Chemin JSON compte de service
  --project-id=        ID projet Firebase
  --out=chemin.jsonl   Journal JSONL
  --page-size=300      Pagination des lectures
  -h, --help           Aide

Variables :
  GOOGLE_APPLICATION_CREDENTIALS
`);
}

function getProfileIdFromAccess(data) {
  const v = data?.profil_id ?? data?.profileId ?? '';
  const s = String(v).trim();
  return s || null;
}

function addMembreRefs(set, data) {
  for (const key of ['profil_id', 'profileId']) {
    const v = data?.[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) set.add(s);
  }
}

function addReservationRefs(set, data) {
  for (const key of ['profil_id', 'profileId', 'userId']) {
    const v = data?.[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) set.add(s);
  }
}

function initFirebase({ serviceAccount, projectId }) {
  const saPath = serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saPath) {
    const p = resolve(saPath);
    if (!existsSync(p)) {
      console.error(`Fichier introuvable : ${p}`);
      process.exit(1);
    }
    const json = JSON.parse(readFileSync(p, 'utf8'));
    const pid = projectId || json.project_id;
    if (!pid) {
      console.error('project_id manquant : utilisez --project-id= ou un JSON de service account complet.');
      process.exit(1);
    }
    admin.initializeApp({
      credential: admin.credential.cert(json),
      projectId: pid,
    });
    return;
  }
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
    });
  } catch (e) {
    console.error(
      'Impossible d’initialiser Firebase Admin. Définissez GOOGLE_APPLICATION_CREDENTIALS ou --service-account=/chemin/vers.json\n',
      e.message || e
    );
    process.exit(1);
  }
}

async function* paginateByDocId(db, collectionName, pageSize) {
  const col = db.collection(collectionName);
  let last = null;
  for (;;) {
    let q = col.orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    yield snap.docs;
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }
}

async function loadMembreProfilIds(db, pageSize) {
  const set = new Set();
  let n = 0;
  for await (const page of paginateByDocId(db, COL_MEMBRES, pageSize)) {
    for (const doc of page) {
      n += 1;
      addMembreRefs(set, doc.data() || {});
    }
  }
  console.log(`Scan ${COL_MEMBRES} : ${n} document(s), ${set.size} id(s) profil distinct(s).`);
  return set;
}

async function loadAccessProfilIds(db, pageSize) {
  const set = new Set();
  let n = 0;
  for await (const page of paginateByDocId(db, COL_ACCESS, pageSize)) {
    for (const doc of page) {
      n += 1;
      const pid = getProfileIdFromAccess(doc.data() || {});
      if (pid) set.add(pid);
    }
  }
  console.log(`Scan ${COL_ACCESS} : ${n} document(s), ${set.size} id(s) profil distinct(s).`);
  return set;
}

async function loadReservationProfilIds(db, pageSize) {
  const set = new Set();
  let n = 0;
  for await (const page of paginateByDocId(db, COL_RESERVATIONS, pageSize)) {
    for (const doc of page) {
      n += 1;
      addReservationRefs(set, doc.data() || {});
    }
  }
  console.log(`Scan ${COL_RESERVATIONS} : ${n} document(s), ${set.size} id(s) profil référencé(s).`);
  return set;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.apply) {
    console.log('Mode DRY-RUN (aucune suppression). Passez --apply pour supprimer.\n');
  } else {
    console.log('Mode APPLY — les profils listés seront supprimés.\n');
  }
  if (args.onlyTest) {
    console.log('Filtre --only-test : uniquement les documents avec isTestProfile === true.\n');
  }

  initFirebase({ serviceAccount: args.serviceAccount, projectId: args.projectId });
  const db = admin.firestore();

  let outStream = null;
  if (args.outPath) {
    outStream = createWriteStream(resolve(args.outPath), { flags: 'a' });
  }

  const writeLog = (obj) => {
    const line = JSON.stringify(obj) + '\n';
    if (outStream) outStream.write(line);
  };

  const inMembres = await loadMembreProfilIds(db, args.pageSize);
  const inAccess = await loadAccessProfilIds(db, args.pageSize);
  const inReservations = await loadReservationProfilIds(db, args.pageSize);

  let scannedProfils = 0;
  let skippedNotOrphan = 0;
  let blockedReservations = 0;
  let toDelete = 0;
  let deleted = 0;
  const deleteBuffer = [];

  const flushDeletes = async () => {
    if (deleteBuffer.length === 0) return;
    if (!args.apply) {
      deleteBuffer.length = 0;
      return;
    }
    const batch = db.batch();
    for (const ref of deleteBuffer) batch.delete(ref);
    await batch.commit();
    deleted += deleteBuffer.length;
    deleteBuffer.length = 0;
  };

  for await (const page of paginateByDocId(db, COL_PROFILS, args.pageSize)) {
    for (const doc of page) {
      scannedProfils += 1;
      const id = doc.id;
      const data = doc.data() || {};

      if (args.onlyTest && data.isTestProfile !== true) continue;

      if (inMembres.has(id) || inAccess.has(id)) {
        skippedNotOrphan += 1;
        continue;
      }

      if (inReservations.has(id)) {
        blockedReservations += 1;
        const entry = {
          ts: new Date().toISOString(),
          mode: args.apply ? 'apply' : 'dry-run',
          profilId: id,
          action: 'SKIP_HAS_RESERVATIONS',
        };
        console.log(`[SKIP] ${id}  → encore référencé par ${COL_RESERVATIONS}`);
        writeLog(entry);
        continue;
      }

      toDelete += 1;
      const entry = {
        ts: new Date().toISOString(),
        mode: args.apply ? 'apply' : 'dry-run',
        profilId: id,
        action: args.apply ? 'DELETE' : 'WOULD_DELETE',
      };
      console.log(`${args.apply ? '[DELETE]' : '[DRY]'} ${id}`);
      writeLog(entry);

      deleteBuffer.push(doc.ref);
      if (deleteBuffer.length >= 450) await flushDeletes();
    }
  }

  await flushDeletes();

  if (outStream) {
    outStream.end();
    await new Promise((r, j) => {
      outStream.on('finish', r);
      outStream.on('error', j);
    });
  }

  console.log('\n---');
  console.log(`Profils scannés : ${scannedProfils}`);
  console.log(`Ignorés (lien famille ou accès ressource) : ${skippedNotOrphan}`);
  console.log(`Bloqués (réservations) : ${blockedReservations}`);
  console.log(`${args.apply ? 'Supprimés' : 'À supprimer (dry-run)'} : ${args.apply ? deleted : toDelete}`);
  if (!args.apply && toDelete > 0) {
    console.log('\nRelance avec --apply pour supprimer ces profils.');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
