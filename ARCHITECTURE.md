# ARCHITECTURE GUIDE — Resa Voiture → Shared Resource Platform

## 1. Vision produit
Cette application est une plateforme de gestion de ressources partagées :
- voitures
- maisons
- objets
- comptes communs (futur)

Tout repose sur le concept central : RESOURCE.

---

## 2. Règles d’architecture (NON NÉGOCIABLES)

### Séparation stricte
- UI → affichage uniquement
- Service → logique métier
- Repository → accès base de données

### Interdictions
- Pas d’appel Firebase dans UI
- Pas de logique métier dans UI
- Pas de logique métier dans repository
- Pas de variables globales métier

### Obligations
- Toute action passe par un service
- Toute donnée passe par un repository

---

## 3. Structure cible

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

  /ui

---

## 4. Pattern module

Chaque module doit respecter :

- xxx.service.js → logique métier
- xxx.repository.js → accès Firebase
- xxx.model.js → structure
- xxx.validator.js → validation

---

## 5. Modèles

### Resource
- id
- type (car, house...)
- familyId

### Reservation
- id
- resourceId
- userId
- startDate
- endDate
- metadata

---

## 6. Flux réservation

UI → reservation.service.create()
→ availability.service.check()
→ reservation.repository.create()

---

## 7. Méthode de migration

Étape 1 : créer modules
Étape 2 : déplacer logique métier
Étape 3 : créer repositories
Étape 4 : nettoyer UI

---

## 8. Règle pour dev / IA

Toujours se demander :
"Dans quel module métier cette feature appartient ?"

---

## 9. Objectif

- Code scalable
- Code lisible
- Ajout de features rapide

---

Ce fichier doit être mis à jour à chaque évolution majeure.
