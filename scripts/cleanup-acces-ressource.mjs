#!/usr/bin/env node
/**
 * Nettoyage Firestore : documents orphelins dans `acces_ressource`.
 *
 * Règles par défaut (dry-run si --apply absent) :
 *   - profil_id / profileId vide ou absent → à supprimer (MISSING_PROFILE_ID)
 *   - aucun document profils/{profil_id} → à supprimer (ORPHAN_PROFILE)
 *
 * Option --check-resource :
 *   - ressource_id / resourceId renseigné mais pas de ressources/{id} → à supprimer (ORPHAN_RESOURCE)
 *
 * Credentials (au choix) :
 *   - GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/compte-service.json
 *   - --service-account=/chemin/vers.json
 *
 * Usage :
 *   npm install
 *   node scripts/cleanup-acces-ressource.mjs
 *   node scripts/cleanup-acces-ressource.mjs --apply
 *   node scripts/cleanup-acces-ressource.mjs --apply --check-resource --out=./cleanup-report.jsonl
 */

import { readFileSync, existsSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import admin from 'firebase-admin';

const COL_ACCESS = 'acces_ressource';
const COL_PROFILS = 'profils';
const COL_RESSOURCES = 'ressources';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function parseArgs(argv) {
  const out = {
    apply: false,
    checkResource: false,
    serviceAccount: null,
    projectId: null,
    outPath: null,
    pageSize: 300,
    help: false,
  };
  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    else if (a === '--check-resource') out.checkResource = true;
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
cleanup-acces-ressource.mjs — supprime les accès ressource sans profil valide (et optionnellement sans ressource).

  Par défaut : dry-run (aucune écriture). Ajouter --apply pour supprimer.

Options :
  --apply              Exécuter les suppressions (sinon simulation)
  --check-resource     Supprimer aussi si la ressource pointée n'existe pas
  --service-account=   Chemin JSON compte de service (sinon GOOGLE_APPLICATION_CREDENTIALS)
  --project-id=        ID projet Firebase (sinon lu depuis le JSON)
  --out=chemin.jsonl   Journal des actions (une ligne JSON par doc)
  --page-size=300      Taille des pages lecture acces_ressource
  -h, --help           Aide

Variables d'environnement :
  GOOGLE_APPLICATION_CREDENTIALS   chemin vers la clé service account
`);
}

function getProfileId(data) {
  const v = data?.profil_id ?? data?.profileId ?? '';
  const s = String(v).trim();
  return s || null;
}

function getResourceId(data) {
  const v = data?.ressource_id ?? data?.resourceId ?? '';
  const s = String(v).trim();
  return s || null;
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

/** Firestore getAll : max 10 références par appel (limite API). */
async function batchDocExists(db, collectionName, ids) {
  const map = new Map();
  const unique = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const refs = chunk.map((id) => db.collection(collectionName).doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, j) => {
      map.set(chunk[j], snap.exists);
    });
  }
  return map;
}

async function* paginateAccessPages(db, pageSize) {
  const col = db.collection(COL_ACCESS);
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

function analyzeDoc(doc, profileExists, resourceExistsMap, checkResource) {
  const data = doc.data() || {};
  const profileId = getProfileId(data);
  const resourceId = getResourceId(data);
  const reasons = [];

  if (!profileId) reasons.push('MISSING_PROFILE_ID');
  else if (profileExists.get(profileId) !== true) reasons.push('ORPHAN_PROFILE');

  if (checkResource && resourceId) {
    if (resourceExistsMap.get(resourceId) !== true) reasons.push('ORPHAN_RESOURCE');
  }

  return { profileId, resourceId, reasons, shouldDelete: reasons.length > 0 };
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
    console.log('Mode APPLY — les documents listés seront supprimés.\n');
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

  let scanned = 0;
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

  for await (const page of paginateAccessPages(db, args.pageSize)) {
    const profileIds = [
      ...new Set(
        page
          .map((d) => getProfileId(d.data()))
          .filter(Boolean)
      ),
    ];
    const resourceIds = args.checkResource
      ? [...new Set(page.map((d) => getResourceId(d.data())).filter(Boolean))]
      : [];

    const profileExists = await batchDocExists(db, COL_PROFILS, profileIds);
    const resourceExistsMap = args.checkResource
      ? await batchDocExists(db, COL_RESSOURCES, resourceIds)
      : new Map();

    for (const doc of page) {
      scanned += 1;
      const data = doc.data() || {};
      const profileId = getProfileId(data);
      const resourceId = getResourceId(data);

      const { reasons, shouldDelete } = analyzeDoc(doc, profileExists, resourceExistsMap, args.checkResource);

      if (!shouldDelete) continue;

      toDelete += 1;
      const entry = {
        ts: new Date().toISOString(),
        mode: args.apply ? 'apply' : 'dry-run',
        accessDocId: doc.id,
        profileId,
        resourceId,
        reasons,
        statut: data.statut ?? data.status ?? null,
      };

      console.log(
        `${args.apply ? '[DELETE]' : '[DRY]'} ${doc.id}  profil=${profileId || '∅'}  ressource=${resourceId || '∅'}  → ${reasons.join('+')}`
      );
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
  console.log(`Scannés : ${scanned}`);
  console.log(`${args.apply ? 'Supprimés' : 'À supprimer (dry-run)'} : ${args.apply ? deleted : toDelete}`);
  if (!args.apply && toDelete > 0) {
    console.log('\nRelance avec --apply pour supprimer ces documents.');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
