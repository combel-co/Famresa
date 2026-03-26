# 🏠 FamResa — Ressources familiales partagées

Application pour gérer et réserver les ressources familiales partagées : voitures, maisons de vacances, etc.

## Fonctionnalités

- 📅 Calendrier mensuel avec navigation
- 🏠🚗 Multi-ressources (voitures + maisons, extensible)
- 👥 Gestion multi-familles avec code d'invitation
- 👤 Identification simple (prénom + code PIN)
- 📸 Photo de profil optionnelle
- ✅ Réservation en 2 clics
- 🔄 Mise à jour en temps réel (Firebase)
- 📱 100% responsive (mobile-first, PWA)
- 🏆 Système XP et tableau de bord gamifié
- 🏡 Checklists arrivée/départ pour les maisons
- 📝 Journal de séjour (notes, problèmes, réparations)
- 📖 Guide maison éditable

## Mise en route (5 minutes)

### 1. Créer un projet Firebase (gratuit)

1. Aller sur [console.firebase.google.com](https://console.firebase.google.com)
2. Cliquer **Ajouter un projet** → nommer "famresa" → Créer
3. Dans le projet, aller dans **Build > Firestore Database**
4. Cliquer **Créer une base de données** → choisir **mode test** → région `eur3 (europe-west)`
5. Dans **Paramètres du projet** (⚙️) > **Général**, descendre à "Vos applications"
6. Cliquer l'icône **</>** (Web) → nommer "famresa" → **Enregistrer**
7. Copier les valeurs `firebaseConfig`

### 2. Configurer l'application

Ouvrir `js/firebase.js` et remplacer le bloc `firebaseConfig` :

```javascript
const firebaseConfig = {
  apiKey: "VOTRE_CLÉ_ICI",
  authDomain: "famresa-xxxxx.firebaseapp.com",
  projectId: "famresa-xxxxx",
  storageBucket: "famresa-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 3. Déployer

**Option A — GitHub Pages (gratuit) :**
1. Pusher ce repo sur GitHub
2. Settings > Pages > Source: main branch > `/root`
3. L'app est live sur `https://votreuser.github.io/Famresa/`

**Option B — Firebase Hosting (gratuit) :**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting  # choisir le projet, dossier "."
firebase deploy
```

### 4. Sécuriser Firestore (recommandé)

Dans Firestore > Règles, remplacer par :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /families/{familyId}/{document=**} {
      allow read, write: if true;
    }
    match /users/{userId} {
      allow read: if true;
      allow create, update: if true;
    }
    match /config/{doc} {
      allow read: if true;
    }
  }
}
```

## Architecture

```
Resa-voiture/
├── index.html        ← Structure HTML + chargement des modules
├── manifest.json     ← PWA manifest
├── sw.js             ← Service worker (cache offline)
├── css/
│   └── style.css     ← Styles globaux
└── js/
    ├── firebase.js   ← Config Firebase + helper familyRef()
    ├── app.js        ← État global, tab switching, helpers
    ├── auth.js       ← Login, signup, migration, profil
    ├── booking.js    ← Création/annulation de réservations
    ├── calendar.js   ← Rendu du calendrier mensuel
    ├── dashboard.js  ← Tableau de bord, KPIs, statut ressource
    ├── resources.js  ← Gestion multi-ressources, tabs
    ├── fuel.js       ← Suivi carburant (voitures)
    ├── stay.js       ← Vue séjour (maisons)
    ├── checklist.js  ← Checklists arrivée/départ
    ├── events.js     ← Journal de séjour
    ├── guide.js      ← Guide maison
    ├── leaderboard.js← Classement famille
    ├── history.js    ← Historique des réservations
    ├── xp.js         ← Système XP et niveaux
    ├── celebration.js← Animations de célébration
    └── ui.js         ← Utilitaires UI (toast, sheet, etc.)
```

Collections Firestore (sous `families/{familyId}/`) :
- **resources** → `{ name, emoji, type: 'car'|'house', fuelLevel? }`
- **bookings** → `{ resourceId, startDate, endDate, userId, userName, photo, destination?, motif?, reservationGroupId? }`
- **members** → `{ name, email, photo, pin, xp, level, createdAt }`
- **checklistStatus** → `{ groupId, type: 'checkin'|'checkout', item, userId, doneAt }`
- **stayEvents** → `{ groupId, type: 'note'|'problem'|'repair', text, userId, createdAt }`
- **guideCards** → `{ title, content, order, updatedAt }`

Collections racine :
- **users** → `{ name, email, familyId }` (référence légère pour login)
- **config** → `{ pin, familyName, inviteCode }` (migration legacy)

## Stack

- HTML / CSS / Vanilla JS (zéro framework, zéro build)
- Firebase Firestore (temps réel, gratuit jusqu'à 50K lectures/jour)
- Google Fonts (DM Sans)
- PWA avec Service Worker (offline-ready)

---

Fait avec ❤️ pour la famille.
