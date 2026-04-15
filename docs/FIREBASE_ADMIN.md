# Consignes — clé Firebase Admin (FamResa)

Scripts concernés : [`scripts/reset-test-profile.mjs`](../scripts/reset-test-profile.mjs), [`scripts/cleanup-acces-ressource.mjs`](../scripts/cleanup-acces-ressource.mjs), [`scripts/cleanup-orphan-profils.mjs`](../scripts/cleanup-orphan-profils.mjs), [`scripts/create-profiles-audit-auth-user.mjs`](../scripts/create-profiles-audit-auth-user.mjs).

## Emplacement du fichier (exemple machine locale)

Chemin utilisé sur le poste de développement (adapter si besoin) :

`/Users/gaspipou/Documents/Notion/Projects/API - Github/FamResa/famcar-e2bb3-firebase-adminsdk-fbsvc-b7bfdb2261.json`

**Important** : le chemin peut contenir des **espaces**. Dans le terminal, entourez toujours le chemin de **guillemets**.

## Sécurité

- Ne **jamais** commiter ce JSON dans ce dépôt (le `.gitignore` ignore déjà des motifs du type `*-service-account*.json` / `*credentials*.json` — gardez la clé en dehors du repo ou sous un nom couvert par ces règles).
- En cas de fuite : **révoquer** la clé dans Firebase Console et en générer une nouvelle.

## Où lancer les commandes

À la racine du dépôt **Resa-voiture** (ce repo) :

```bash
cd "/Users/gaspipou/Documents/Notion/Projects/Github-projects/Resa-voiture"
npm install
```

## Activer la clé pour une session terminal

**zsh / bash** (session courante) :

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/Users/gaspipou/Documents/Notion/Projects/API - Github/FamResa/famcar-e2bb3-firebase-adminsdk-fbsvc-b7bfdb2261.json"
```

**Alternative** (sans variable d’environnement), ajouter à chaque commande :

`--service-account="/Users/gaspipou/Documents/Notion/Projects/API - Github/FamResa/famcar-e2bb3-firebase-adminsdk-fbsvc-b7bfdb2261.json"`

Le **project id** est lu depuis le JSON (`famcar-e2bb3`). Si besoin : `--project-id=famcar-e2bb3`.

## Exemples

### 1. Export de la variable (todo : configuration session)

À faire une fois par onglet de terminal avant les scripts.

### 2. Reset profil test — dry-run (todo : simulation)

Remplacez `PROFIL_ID` par l’id Firestore du document `profils/{id}` :

```bash
cd "/Users/gaspipou/Documents/Notion/Projects/Github-projects/Resa-voiture"
export GOOGLE_APPLICATION_CREDENTIALS="/Users/gaspipou/Documents/Notion/Projects/API - Github/FamResa/famcar-e2bb3-firebase-adminsdk-fbsvc-b7bfdb2261.json"
node scripts/reset-test-profile.mjs --profile-id=PROFIL_ID
```

### 3. Reset profil test — application réelle (todo : apply)

Après validation du dry-run :

```bash
node scripts/reset-test-profile.mjs --profile-id=PROFIL_ID --apply
```

### Nettoyage accès ressource

```bash
node scripts/cleanup-acces-ressource.mjs
node scripts/cleanup-acces-ressource.mjs --apply
```

Option utile : `--check-resource` (voir `--help` sur le script).

### Nettoyage profils orphelins

Supprime (ou simule) les documents `profils/{id}` qui n’ont **ni** ligne dans `famille_membres` **ni** ligne dans `acces_ressource` pour cet id. Les profils encore référencés par une réservation (`profil_id`, `profileId` ou `userId`) sont **ignorés** et journalisés.

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/chemin/vers/votre-compte-service.json"
npm run cleanup:profils
npm run cleanup:profils:apply
```

Équivalent direct :

```bash
node scripts/cleanup-orphan-profils.mjs
node scripts/cleanup-orphan-profils.mjs --apply
```

Limiter aux profils de test (`isTestProfile: true`) :

```bash
node scripts/cleanup-orphan-profils.mjs --only-test
node scripts/cleanup-orphan-profils.mjs --apply --only-test
```

Journal JSONL optionnel : `--out=./orphan-profils.jsonl`. Aide complète : `node scripts/cleanup-orphan-profils.mjs --help`.

### Compte Firebase pour la page « audit profils » (sans mot de passe dans le script)

Le script crée l’utilisateur **Authentication** avec l’e-mail uniquement ; **vous choisissez le mot de passe** ensuite (console ou lien).

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/chemin/vers/votre-compte-service.json"
npm run audit:user:create -- --email=audit-famresa@votredomaine.com
```

Pour recevoir un **lien** permettant de définir le mot de passe dans le navigateur (après activation d’**E-mail / Mot de passe** dans Authentication) :

```bash
npm run audit:user:create -- --email=audit-famresa@votredomaine.com --reset-link
```

Puis ouvrir [`admin-profiles-audit.html`](../admin-profiles-audit.html) et se connecter avec cet e-mail et le mot de passe choisi.

## Erreur « permission denied » sur Firestore

Vérifier dans Google Cloud Console que le compte de service associé à cette clé a les droits d’accès aux données Firestore du projet.
