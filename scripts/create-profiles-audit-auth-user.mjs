#!/usr/bin/env node
/**
 * Crée un utilisateur Firebase Authentication (e-mail / mot de passe) dédié à la page
 * admin-profiles-audit.html — sans définir de mot de passe ici.
 *
 * Après exécution : définir le mot de passe vous-même (console Firebase ou lien généré).
 *
 * Prérequis :
 *   - Compte de service avec droits sur Authentication (clé JSON habituelle).
 *   - Dans la console : Authentication → Méthode de connexion → E-mail / Mot de passe activé.
 *
 * Usage :
 *   node scripts/create-profiles-audit-auth-user.mjs --email=audit@votredomaine.com
 *   node scripts/create-profiles-audit-auth-user.mjs --email=... --reset-link
 *
 * Variables : GOOGLE_APPLICATION_CREDENTIALS ou --service-account=
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import admin from 'firebase-admin';

function parseArgs(argv) {
  const out = {
    email: process.env.FAMRESA_AUDIT_EMAIL || null,
    serviceAccount: null,
    projectId: null,
    resetLink: false,
    help: false,
  };
  for (const a of argv) {
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--reset-link') out.resetLink = true;
    else if (a.startsWith('--email=')) out.email = a.slice('--email='.length).trim() || null;
    else if (a.startsWith('--service-account=')) out.serviceAccount = a.slice('--service-account='.length);
    else if (a.startsWith('--project-id=')) out.projectId = a.slice('--project-id='.length);
  }
  return out;
}

function printHelp() {
  console.log(`
create-profiles-audit-auth-user.mjs — crée l’utilisateur Firebase Auth pour admin-profiles-audit.html (sans mot de passe).

  --email=adresse        E-mail du compte (obligatoire si FAMRESA_AUDIT_EMAIL non défini)
  --reset-link           Après création (ou si l’utilisateur existe), afficher un lien
                         de réinitialisation du mot de passe (à ouvrir dans le navigateur)
  --service-account=     Chemin JSON compte de service
  --project-id=          ID projet Firebase
  -h, --help

  GOOGLE_APPLICATION_CREDENTIALS
  FAMRESA_AUDIT_EMAIL
`);
}

function initFirebase({ serviceAccount, projectId }) {
  if (admin.apps.length) return;
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
      'Impossible d’initialiser Firebase Admin. Définissez GOOGLE_APPLICATION_CREDENTIALS ou --service-account=\n',
      e.message || e
    );
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const email = String(args.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Indiquez un e-mail valide : --email=vous@exemple.com (ou FAMRESA_AUDIT_EMAIL).');
    printHelp();
    process.exit(1);
  }

  initFirebase({ serviceAccount: args.serviceAccount, projectId: args.projectId });
  const auth = admin.auth();

  let uid;
  let created = false;

  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    console.log(`Utilisateur déjà présent : ${email} (uid: ${uid})`);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.error(e.message || e);
      process.exit(1);
    }
    const rec = await auth.createUser({
      email,
      emailVerified: false,
    });
    uid = rec.uid;
    created = true;
    console.log(`Utilisateur créé : ${email} (uid: ${uid}) — aucun mot de passe défini par ce script.`);
  }

  console.log(`
Étapes pour définir le mot de passe (à faire de votre côté) :
  1) Console Firebase → Authentication → Méthode de connexion : activer « E-mail / Mot de passe » si besoin.
  2) Onglet Utilisateurs → sélectionner ${email} → menu ⋮ → Réinitialiser le mot de passe / envoyer un e-mail,
     ou définir un mot de passe depuis l’interface selon ce que propose la console.
  3) Ouvrir admin-profiles-audit.html et se connecter avec cet e-mail et le mot de passe choisi.
`);

  if (args.resetLink) {
    try {
      const link = await auth.generatePasswordResetLink(email);
      console.log('Lien de définition / réinitialisation du mot de passe (usage unique, ne pas partager) :\n');
      console.log(link);
      console.log('\nOuvrez ce lien dans un navigateur pour choisir votre mot de passe.');
    } catch (err) {
      console.error('Impossible de générer le lien (modèle e-mail / domaine autorisé ?) :', err.message || err);
      process.exit(created ? 0 : 1);
    }
  } else if (created) {
    console.log('Astuce : relancez avec --reset-link pour obtenir un lien et choisir le mot de passe sans passer par la console.\n');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
