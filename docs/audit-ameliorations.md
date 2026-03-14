# Audit produit & UX — Resa-voiture

_Date : 2026-03-13_

## Synthèse rapide

Le site est déjà bien avancé (réservation jour/plage, dashboard, gamification, historique), mais trois chantiers peuvent améliorer fortement la fiabilité opérationnelle et l’adoption.

1. **Chantier 1 (priorité haute) — Workflow post-réservation & carburant** : imposer et tracer la restitution du niveau d’essence pour fiabiliser le prochain départ.
2. **Chantier 2 (priorité haute) — Rationalisation Dashboard vs Calendrier** : supprimer le doublon de réservation dans l’onglet Calendrier et repositionner le Calendrier en vue planning pure.
3. **Chantier 3 (priorité moyenne/haute) — Refonte de l’onglet Paramètres (historique)** : regrouper les lignes multi-jours, enrichir les données de réservoir manquantes et améliorer la lisibilité.

---

## Constat technique observé

- Le niveau d’essence est aujourd’hui écrit sur la collection `cars` (`fuelLevel`) après trajet, **mais pas historisé sur la réservation**. Résultat : l’état courant est visible, mais pas la preuve par réservation passée.
- L’onglet historique affiche une liste ligne-à-ligne issue des bookings “dépliés” à la journée, ce qui crée une sensation de bruit pour les réservations sur plusieurs jours.
- Le mode réservation existe à la fois dans le Dashboard et dans l’onglet Calendrier, ce qui crée une redondance de parcours.

---

## Chantier 1 — Optimisation du dashboard avec focus post-réservation (carburant)

### Problème
Après usage, la saisie du niveau d’essence n’est pas suffisamment “obligatoire” ni persistée au niveau de la réservation. Conséquences :
- valeur historique absente ou incomplète ;
- perte de confiance pour l’utilisateur suivant ;
- difficulté d’analyse (qui rend bas, qui refait le plein, quand).

### Proposition produit (version recommandée)

#### A. Nouveau statut de trajet
Ajouter un état de cycle de vie de réservation :
- `booked`
- `in_use`
- `completed_pending_fuel`
- `completed`

Le passage à `completed` est recommandé après saisie carburant, avec relances si non renseigné.

#### B. Données à écrire sur la réservation
Ajouter des champs sur chaque booking :
- `fuelStartLevel` (copie de la jauge au moment du départ)
- `fuelReturnLevel` (attendu à la restitution, via pop-up de fin de resa)
- `fuelValidatedAt`
- `fuelValidatedBy`
- `odometerStart` / `odometerEnd` (optionnel mais fortement conseillé)

#### C. UX de restitution “impossible à oublier” (sans bloquer une nouvelle resa)
- À la fin de la réservation, afficher un **pop-up/cadre dédié** :
  - “Vous avez utilisé la voiture”
  - “Résumé de votre dernière resa” (dates, destination, km)
  - CTA principal : **“Mettre à jour le réservoir rendu”**
- Si l’utilisateur ferme sans renseigner : rappel discret dans le Dashboard + badge “trajet à finaliser”.
- Les nouvelles réservations restent possibles, mais la restitution reste fortement incitée (rappels + XP).

#### D. Gamification utile (pas gadget)
Mécanique “éthique” proposée :
- +XP si `fuelReturnLevel >= fuelStartLevel`
- bonus si retour `>= 75%`
- badge “Conducteur responsable” sur 5 retours consécutifs correctement renseignés
- malus léger si plusieurs trajets non clôturés

Objectif : inciter à renseigner et à refaire le plein sans générer de frustration excessive.

### Impacts attendus
- Complétude des données carburant > 95%
- Moins de litiges entre utilisateurs
- Meilleure anticipation pour le prochain conducteur

### KPI à suivre
- `% trajets avec fuelReturnLevel renseigné`
- `délai médian de saisie après fin de réservation`
- `% trajets restitués >= 50%`

---

## Chantier 2 — Calendrier : supprimer le doublon de réservation

### Problème
Le Calendrier sert aussi à réserver, alors que la page principale couvre déjà ce besoin avec plus de contexte (carte statut, jauge, parcours guidé).

### Recommandation
Transformer l’onglet Calendrier en **vue de consultation** uniquement :
- visualisation des occupations
- filtres (moi / tous / voiture)
- éventuelle vue mensuelle dense

Et centraliser la réservation sur le Dashboard (single source of action).

### Bénéfices
- Moins d’ambiguïté dans les parcours
- Moins de dette UX
- Réduction des conflits d’usage/maintenabilité

### Ajustement navigation proposé
- Renommer `Calendrier` en “Planning”
- Désactiver le clic de réservation depuis cette vue
- Ajouter un bouton secondaire “Réserver” qui redirige vers Dashboard (ancre booking)

---

## Chantier 3 — Onglet Paramètres/Historique : regrouper et enrichir

### Problème observé
- Trop de lignes, notamment pour les réservations multi-jours affichées jour par jour.
- Valeurs de réservoir absentes sur de nombreuses réservations passées.

### Recommandation structurelle

#### A. Regroupement par réservation
Un bloc unique par booking avec :
- intervalle de dates (`startDate → endDate`)
- conducteur
- destination(s)
- km total
- `fuelStartLevel` / `fuelReturnLevel`
- statut de clôture

#### B. Contrats de données
Rendre attendus en fin de réservation (avec relances, sans blocage de nouvelle resa) :
- `fuelReturnLevel`
- `completedAt`

Et marquer l’historique incomplet explicitement :
- label “Donnée manquante” au lieu de `—`

#### C. Lisibilité et performance
- pagination ou lazy load au-delà de 50 entrées
- filtres par utilisateur et période
- export CSV mensuel (admin)

### Plan de migration data (important)
1. Script one-shot pour rétro-remplir `fuelStartLevel` avec la meilleure approximation disponible.
2. Marquer les anciens trajets sans restitution comme `incomplete_legacy`.
3. Afficher un bandeau “Données historiques partiellement disponibles avant [date migration]”.

---

## Plan d’exécution (6 semaines)

### Semaine 1-2
- Modèle de données booking enrichi
- Règles de validation écriture (carburant fortement recommandé + relances)
- UI pop-up/carte “vous avez utilisé la voiture” + résumé + saisie réservoir rendu

### Semaine 3-4
- Refonte onglet Planning (ex Calendrier) en consultation seule
- Redirection de la réservation vers Dashboard
- Mise en place KPI de suivi

### Semaine 5-6
- Refonte complète Historique
- Regroupement multi-jours
- Migration des anciennes données + libellés d’incomplétude

---

## Risques et parades

- **Risque** : friction utilisateur si saisie carburant perçue comme punitive.  
  **Parade** : parcours non bloquant, rappels progressifs et gamification positive.

- **Risque** : données historiques partielles.  
  **Parade** : migration progressive + transparence UI.

- **Risque** : complexité des règles Firestore.  
  **Parade** : commencer par validations côté client + journalisation serveur ensuite.

---

## Décisions produit recommandées (à valider)

1. La clôture de réservation doit-elle rester non bloquante et pilotée par rappels + incitations ? (recommandé : oui)
2. Le calendrier devient-il strictement lecture seule ? (recommandé : oui)
3. Le score gamification doit-il influencer un classement visible ? (recommandé : oui, mais pondération modérée)
