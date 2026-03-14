# Plan d’amélioration de `index.html`

## Objectif
Réduire le risque de régression et accélérer les évolutions produit (post-trajet carburant, planning, historique) en sortant progressivement du fichier unique `index.html`.

## Constat actuel
- Le fichier mélange HTML, CSS, logique métier, accès Firestore et rendu UI.
- Les flux critiques (réservation, carburant, historique) partagent le même état global.
- Le coût de changement est élevé : une petite modif touche souvent plusieurs zones.

## Plan proposé (3 phases)

### Phase 1 — Stabilisation (1 sprint)
- Introduire des helpers métier centralisés (destination, km, plage date).
- Uniformiser le rendu historique (une réservation = une carte).
- Ajouter des garde-fous runtime sur les appels Firestore secondaires (ex: `fuelReports`).
- Ajouter un journal simple des erreurs non bloquantes pour diagnostic.

### Phase 2 — Modularisation progressive (1 à 2 sprints)
Découpage en modules JS sans changer le comportement final :
- `js/state.js` : état applicatif + sélecteurs.
- `js/services/firestore.js` : accès DB (`cars`, `bookings`, `fuelReports`, `users`).
- `js/features/booking.js` : réservation/créneau/planning.
- `js/features/fuel.js` : relances post-trajet, saisie réservoir.
- `js/features/history.js` : regroupement, filtres, tri.
- `js/ui/*.js` : rendu dashboard, modales, toasts.

### Phase 3 — Qualité et évolutivité (1 sprint)
- Introduire des tests unitaires ciblés sur les fonctions pures:
  - `estimateDistanceForBooking`
  - `getBookingDestinationLabel`
  - regroupement de réservations
- Ajouter des tests E2E basiques (Playwright):
  - création résa
  - relance carburant post-trajet
  - affichage historique groupé
- Séparer CSS en `styles/base.css`, `styles/components.css`, `styles/tabs.css`.

## Gains attendus
- Diminution des bugs de bord sur les parcours critiques.
- Code plus lisible pour l’équipe produit/tech.
- Possibilité d’itérer plus vite sur les onglets Dashboard / Planning / Historique.

## Priorités produit à garder en parallèle
1. Relance carburant non bloquante mais visible (pop-up + carte dashboard).
2. Planning en lecture seule (réservation centralisée Dashboard).
3. Historique orienté “réservation” et non “jour”.
