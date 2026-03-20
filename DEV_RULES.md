# DEV RULES — Execution Guide for Humans & AI

---

## 0. PURPOSE

Ce document définit les règles STRICTES pour écrire du code dans ce projet.

Il s’applique à :
- développeurs humains
- IA (Codex, Claude, etc.)

Objectif :
→ garantir une architecture stable, scalable et cohérente

---

## 1. LECTURE OBLIGATOIRE (AVANT CHAQUE ACTION)

Avant d’écrire du code, TOUJOURS lire dans cet ordre :

1. `ARCHITECTURE.md`
2. `docs/DEV_RULES.md`

---

### Règle absolue

> Si ce n’est pas lu → ne pas coder

---

## 2. PRINCIPES D’ARCHITECTURE

### Séparation stricte

- UI → affichage + interactions utilisateur UNIQUEMENT
- Service → logique métier UNIQUEMENT
- Repository → accès base de données UNIQUEMENT

---

## 3. INTERDICTIONS (CRITIQUES)

Il est STRICTEMENT interdit de :

- appeler Firebase depuis l’UI
- écrire de la logique métier dans l’UI
- écrire de la logique métier dans un repository
- utiliser des variables globales métier (bookings, currentUser…)

---

## 4. OBLIGATIONS

Chaque feature DOIT :

- passer par un service
- utiliser un repository pour la DB
- appartenir à un module métier clair

---

## 5. STRUCTURE DES FICHIERS

Chaque module doit contenir :

- `*.service.js` → logique métier
- `*.repository.js` → accès DB
- `*.model.js` → structure des données
- `*.validator.js` → validation des inputs

---

## 6. MÉTHODE DE DÉVELOPPEMENT

### Process obligatoire

1. Identifier le module métier
2. Créer/modifier le service
3. Créer/modifier le repository
4. Exposer une fonction simple
5. Appeler cette fonction depuis l’UI

---

### Exemple

```js
await reservationService.create(input)
