# 🚗 FamCar — Réservation voiture familiale

Application ultra-simple pour réserver la voiture familiale, jour par jour.

## Fonctionnalités

- 📅 Calendrier mensuel avec navigation
- 👤 Identification simple (prénom + email)
- 📸 Photo de profil optionnelle (stockée en base64)
- ✅ Réservation en 2 clics
- 🔄 Mise à jour en temps réel (Firebase)
- 🚗 Support multi-voitures (extensible)
- 📱 100% responsive (mobile-first)

## Mise en route (5 minutes)

### 1. Créer un projet Firebase (gratuit)

1. Aller sur [console.firebase.google.com](https://console.firebase.google.com)
2. Cliquer **Ajouter un projet** → nommer "famcar" → Créer
3. Dans le projet, aller dans **Build > Firestore Database**
4. Cliquer **Créer une base de données** → choisir **mode test** → région `eur3 (europe-west)`
5. Dans **Paramètres du projet** (⚙️) > **Général**, descendre à "Vos applications"
6. Cliquer l'icône **</>** (Web) → nommer "famcar" → **Enregistrer**
7. Copier les valeurs `firebaseConfig`

### 2. Configurer l'application

Ouvrir `index.html` et remplacer le bloc `firebaseConfig` (ligne ~280) :

```javascript
const firebaseConfig = {
  apiKey: "VOTRE_CLÉ_ICI",
  authDomain: "famcar-xxxxx.firebaseapp.com",
  projectId: "famcar-xxxxx",
  storageBucket: "famcar-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 3. Déployer

**Option A — GitHub Pages (gratuit) :**
1. Pusher ce repo sur GitHub
2. Settings > Pages > Source: main branch > `/root`
3. L'app est live sur `https://votreuser.github.io/famcar/`

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
    match /cars/{carId} {
      allow read: if true;
      allow write: if true;
    }
    match /bookings/{bookingId} {
      allow read: if true;
      allow create: if true;
      allow delete: if true;
    }
    match /users/{userId} {
      allow read: if true;
      allow create: if true;
      allow update: if true;
    }
  }
}
```

## Architecture

```
famcar/
├── index.html     ← Toute l'app (HTML + CSS + JS) en un seul fichier
└── README.md      ← Ce fichier
```

Collections Firestore :
- **cars** → `{ name, emoji }`
- **bookings** → `{ carId, date, userId, userName, photo, createdAt }`
- **users** → `{ name, email, photo, createdAt }`

## Stack

- HTML / CSS / Vanilla JS (zéro framework, zéro build)
- Firebase Firestore (temps réel, gratuit jusqu'à 50K lectures/jour)
- Google Fonts (DM Sans + Fraunces)

---

Fait avec ❤️ pour la famille.
