# ARCHITECTURE — Shared Resource Platform

---

## 0. OBJECTIF

Construire une plateforme scalable de gestion de ressources partagées :

- voitures
- maisons
- objets (futur)
- comptes / finances (futur)

Contraintes :
- UI découplée
- logique métier centralisée
- scalable
- utilisable par devs + IA (Codex / Claude)

---

## 1. PRINCIPE FONDAMENTAL

> Tout est une RESOURCE

Une voiture, une maison, un objet → même modèle.

---

## 2. RÈGLES FONDAMENTALES (NON NÉGOCIABLES)

### Séparation stricte

- UI → affichage uniquement
- Service → logique métier
- Repository → accès base de données

---

### ❌ Interdictions

- Firebase dans UI
- logique métier dans UI
- logique métier dans repository
- variables globales métier (bookings, currentUser…)

---

### ✅ Obligations

- toute action passe par un service
- toute donnée passe par un repository
- 1 module = 1 domaine métier

---

## 3. STRUCTURE CIBLE


/src
/modules
/resource
/reservation
/availability
/user
/family
/access

/infra
/firebase
firebase.client.js
firebase.mapper.js

/shared
utils.js
errors.js

/ui
/pages
/components


---

## 4. PATTERN MODULE (OBLIGATOIRE)

Chaque module doit contenir :


/reservation
reservation.service.js
reservation.repository.js
reservation.model.js
reservation.validator.js


---

### Rôle

- service → logique métier
- repository → Firebase uniquement
- model → structure données
- validator → validation input

---

## 5. MODÈLE MÉTIER

### Resource


id
type (car, house…)
familyId
metadata


---

### Reservation


id
resourceId
userId

startDate
endDate

type

metadata:
destination
km
motif


---

### Availability

(optionnel mais recommandé)


resourceId
date
isAvailable


---

## 6. FLUX STANDARD


UI
→ reservation.service.create()
→ availability.service.check()
→ reservation.repository.create()
→ DB


---

## 7. MÉTHODE DE DEV (OBLIGATOIRE)

Pour chaque feature :

1. Identifier le module métier
2. Ajouter/modifier service
3. Ajouter/modifier repository
4. exposer une fonction simple
5. appeler depuis UI

---

## 8. MÉTHODE UI (ULTRA SIMPLE)

### Règle

> UI appelle UNE fonction service

---

### Exemple


await reservationService.create(input)


---

### Interdiction

- pas de logique métier dans UI
- pas d’accès Firebase

---

## 9. MÉTHODE DE MIGRATION (IMPORTANT)

Pour refactor sans casser :

### Étape 1 — Wrapper

Garder UI actuelle :


confirmRangeBooking()
→ appelle service


---

### Étape 2 — déplacer logique

- copier code vers service
- nettoyer progressivement UI

---

### Étape 3 — créer repository

- isoler Firebase

---

### Étape 4 — supprimer logique UI

---

## 10. GESTION DES CONFLITS (CRITIQUE)

Toujours utiliser transaction Firestore :


runTransaction()

→ vérifier disponibilité
→ créer réservation


Sinon :
- double booking
- incohérences

---

## 11. PRIORITÉS ACTUELLES (PLAN D’ACTION)


[ ] créer reservation.service
[ ] créer reservation.repository
[ ] créer availability.service
[ ] déplacer logique booking.js
[ ] supprimer accès Firebase du front
[ ] ajouter transaction Firestore


---

## 12. RÈGLE POUR DEV / IA

Toujours se poser :

> "Dans quel module métier va cette feature ?"

Si la réponse est floue → problème d’architecture

---

## 13. BONNES PRATIQUES POUR IA (IMPORTANT)

Toujours :

- créer service
- créer repository
- respecter structure modules/
- écrire fonctions simples et explicites

---

## 14. OBJECTIF FINAL

- scalable
- maintenable
- extensible
- compréhensible par humain + IA

---

## 15. RÈGLE D’OR

> Si une feature est difficile à placer → l’architecture est mauvaise

---

## 16. DOCUMENT VIVANT

Ce fichier doit être mis à jour :

- à chaque refactor majeur
- à chaque ajout de module
- à chaque changement de structure

---

## 17. CSP, Lighthouse et scripts tiers (Firebase)

**Avertissement « Content Security Policy bloque eval »** : l’application charge le SDK **Firebase compat** depuis `gstatic.com` (`firebase-app-compat.js`, `firebase-firestore-compat.js` dans `index.html`). Les bundles compat peuvent utiliser des mécanismes que les outils d’audit associent à `eval` / exécution dynamique, même si le code métier du dépôt n’appelle pas `eval()`. Pour confirmer la source : DevTools → onglet **Issues** ou la stack indiquée par Lighthouse, et vérifier le fichier (souvent un script hébergé tiers).

**Pistes si le problème doit disparaître** : migration vers le SDK **modulaire** Firebase v9+ (bundler : esbuild, Vite, etc.) pour réduire ce type d’avertissement ; **éviter** d’ajouter `unsafe-eval` au CSP sans décision de sécurité explicite.

**Avertissement « unload / polyfills.js »** : il n’y a pas de fichier `polyfills.js` dans ce dépôt ; le nom correspond souvent à un **chunk minifié** dans une dépendance CDN (Firebase ou autre). Les écouteurs `unload` sont dépréciés côté navigateur ; la correction durable passe par une **version plus récente** du SDK ou du fournisseur concerné, pas par un correctif local dans le HTML applicatif.

**Vérification** : `rg` sur le dépôt pour `eval\(` / `new Function` / `unload` — si rien n’apparaît dans `js/` ou `src/`, traiter comme **tiers**.
