# Changelog — FamResa

Format : `[vX] AAAA-MM-JJ — description`  
Chaque bump de version doit mettre à jour `version.js` **et** ce fichier.

---

## [v35] 2026-07-06
- Build `famresa-build-20260706-1`
- Onboarding : « Passer » (plein écran) et nouveau « Plus tard » (wizard inscription, étape type) affichent l'état vide guidé (« Créer une maison ou une voiture » / « J'ai un lien d'invitation ») au lieu d'un dashboard fantôme sans ressource.
- Wizard inscription : points de progression (6 étapes, 4 en flux invitation), touche Entrée / « OK » clavier mobile pour valider chaque étape (prénom, email, famille, ressource), tutoiement harmonisé avec le reste de l'app.
- Onboarding plein écran : titre décalé pour ne plus chevaucher le bouton retour, libellé « Ajouter une photo (optionnel) » sous l'avatar photo, touche Entrée pour valider les étapes.
- Célébration : « Invite ta famille pour qu'elle puisse réserver. » (accord corrigé).
- Dashboard : états « pas encore de ressource » et « demande en attente » enfin visibles — le layer était en `position:absolute` dans une carte de hauteur 0 (sections masquées), il passe en flux normal.

## [v34] 2026-04-21
- Build `famresa-build-20260421-2`
- Planning : « Réserver » uniquement avec début **et** fin choisis sur le calendrier (même jour deux fois = 1 jour, pas 1 nuit) ; plus de date de fin implicite au passage assistant.
- Voiture : conflits par **créneaux horaires** — même journée possible si les plages ne se chevauchent pas (ex. 9h–12h puis 14h–18h) ; jours partiellement libres visibles comme les séjours maison « partiels ».
- Accueil : bandeau trajet / séjour affiché jusqu’à **45 jours** avant le départ (au lieu de 7) ; date « aujourd’hui » en **heure locale** pour éviter les décalages UTC.

## [v33] 2026-04-21
- Build `famresa-build-20260421-1`
- Planning : bandeau d’actions (`#planning-action-bar`) déplacé hors de `<main>` pour que `position: fixed` reste collé au bas de l’écran sur mobile (évite le scroll avec le calendrier quand `main` est le scrollport).

## [v32] 2026-04-16
- Build `famresa-build-20260416-2`
- Migrations architecture en cours : découpe `js/` → `src/modules/`

## [v31] et antérieur
- Historique non documenté. Référence : git log.

---

*Ce fichier est lu par le Service Worker (`sw.js`) via `version.js` — tout changement de cache doit s'accompagner d'une entrée ici.*
