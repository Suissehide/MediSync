# Design : tableau de bord d'activité du service (MDS-40)

Date : 2026-10-07
Ticket : MDS-40 — « Tableau de bord d'activité du service » (Notion), P1, estimation M

## 1. Intention

Le coordinateur et la direction (rôle `LECTURE`) veulent piloter l'activité d'un service sans
tableur. Critère de fin du ticket : le coordinateur du pilote répond à « combien de patients cette
année, combien ont terminé, où sont les absences » en un écran.

Contraintes du ticket : requêtes agrégées par service et période, écran avec tuiles et graphiques
simples, export CSV, **agrégats uniquement** (aucune liste nominative), définitions écrites et
partagées avec l'export ARS (MDS-26).

Hors périmètre :
- La page « Dashboard » (calendrier) reste l'accueil de tous les soignants ; elle ne change pas.
- L'alignement visuel de l'écran ARS et son export CSV : chantier suivant, qui réutilise ce qui est
  créé ici.
- Le délai adressage → entrée : aucune liste d'attente ni date d'adressage dans le schéma.

## 2. Décisions prises avec Léo

1. **Un écran à part**, pour les chefs de service et la direction, pas une refonte de l'accueil.
2. **Données absentes du schéma** : approximation honnête quand elle existe, sinon l'indicateur est
   retiré et la raison est écrite dans les définitions. Pas de migration dans ce chantier.
3. **Un seul chargement partagé avec l'ARS** : la cohorte de `arsIndicator.repository.ts` est
   étendue, pas dupliquée ; les fonctions de définition de l'ARS sont exportées et réutilisées.

## 3. Définitions des indicateurs

Toutes les dates s'évaluent sur `[from, fin de journée de to]`, avec la borne de l'ARS
(`finDeJournee`, UTC). « Présence » = un `AppointmentPatient` du service. Statuts : `yes` (présent),
`no` (absent ou refus), `null` (non pointé).

| Indicateur | Définition |
| --- | --- |
| File active | Patients distincts ayant au moins une présence `yes` dans la période (sous-dossier ou non, comme les séances de l'ARS). |
| Nouveaux inclus | Sous-dossiers dont la date de diagnostic éducatif (`deDate` de l'ARS) tombe dans la période. |
| Sortis | Sous-dossiers dont `exitDate` tombe dans la période. |
| Ont terminé | Sortis dont le programme est complet au sens de l'ARS (`completeProgram` : un DE, au moins une séance, au moins une réactualisation). |
| Abandons | Sortis dont `stopReason` est renseigné et différent de `PLUS_BESOIN_FIN_PARCOURS`. Ventilés par motif (clé stockée, libellé du dictionnaire `STOP_REASON` du front). |
| Taux de complétion | Ont terminé ÷ sortis ; `null` s'il n'y a aucune sortie. |
| Absentéisme | Absents ÷ (présents + absents) sur les présences de la période ; les non pointés sont exclus. Ventilé par thématique, par jour de la semaine (lundi → dimanche, UTC) et par parcours. |
| Séances individuelles | Présences `yes` sur un créneau individuel (ARS 2.6). |
| Séances collectives | Créneaux collectifs distincts ayant au moins une présence `yes` (ARS 2.7). |
| Heures soignant par métier | Pour chaque créneau réalisé (au moins une présence `yes`), sa durée (`endDate − startDate`) est comptée une fois pour chaque soignant du modèle de créneau. `Soignant` est un métier dans ce schéma : ce n'est pas une approximation. |
| Diagnostics éducatifs réalisés | Présences `yes` dont la thématique est un diagnostic éducatif (`ARS_THEMATIC_ROLES`). |
| Bilans de fin réalisés | Présences `yes` dont la thématique est une réactualisation. **Approximation** : il n'existe pas de bilan de fin dédié. |

Thématique d'une présence : celle du rendez-vous, à défaut celle du modèle de créneau (règle de
l'ARS). Parcours d'une présence : le `Slot.pathwayID`, libellé « nom du modèle — date de début » ;
une présence hors parcours tombe dans « Hors parcours ».

**Seuil de lecture** : une case de la carte des absences (thématique × jour) avec moins de 5
présences pointées affiche son nombre, sans taux, et n'entre pas dans le choix du « pire » endroit.
Le « pire » est la case au taux le plus élevé parmi celles qui passent le seuil.

## 4. Architecture

### 4.1 Back

- `utils/ars-indicators.ts` : exporte `deDate`, `completeProgram`, `isRole`, `finDeJournee`.
  `ArsPresence` gagne `status`, `pathwayId`, `pathwayLabel`, `slotMinutes`, `soignants` ;
  `ArsFile` gagne `exitDate` et `stopReason`. Les indicateurs ARS ne changent pas.
- `arsIndicator.repository.ts` (`findCohort`) : sélectionne en plus `exitDate`, `stopReason`, le
  statut brut, le parcours du créneau (modèle + date de début), les dates du créneau et les noms
  des soignants du modèle de créneau.
- `utils/activity-indicators.ts` : `computeActivity(cohort) → ActivityReport`, pur, en mémoire.
  Contient aussi `ACTIVITY_DEFINITIONS` (le texte du §3, servi à l'écran et au CSV).
- `domain/activity.domain.ts` : `report(from, to)` et `exportCsv(from, to)`.
- Route `routes/activity.ts`, montée dans `tenant.routes.ts` :
  - `GET /e/:e/s/:s/activite?from&to` → `ActivityReport` en JSON ;
  - `GET .../activite/export?from&to` → `text/csv; charset=utf-8`, BOM, séparateur `;`, colonnes
    `section;libellé;valeur;définition`, fichier `activite-<service>-<from>-<to>.csv`.
  Les deux exigent `activity:read`. Schéma Zod de période : celui de l'ARS, réutilisé.
- `ActivityReport` ne contient que des nombres et des libellés (thématique, motif, parcours,
  métier). Jamais d'identifiant ni de nom de patient.

### 4.2 Front

- Route `.../$serviceId/activite.tsx`, `beforeLoad` : sans `activity:read`, redirection vers le
  Dashboard (comme `indicateurs-ars.tsx`).
- `api/activity.api.ts`, `queries/useActivity.ts`, `types/activity.ts`.
- Période : raccourcis d'année (`ToggleGroup`) + plage libre (`DatePicker`), extraits de l'écran
  ARS dans un composant partagé `PeriodPicker` que l'ARS réutilisera. Défaut : l'année en cours.
- Aucune dépendance de graphique : barres et grille en CSS, sur les tokens Tailwind existants.

## 5. L'écran

```
Activité                                    [2025][2026][Période…]  [Exporter CSV]
 Combien de patients          Combien ont terminé          Où sont les absences
 148  en file active          31 sur 42 sortis  (74 %)     12 % des rdv pointés
 57 nouveaux, 42 sortis       11 abandons                  le plus : Coaching, mardi
 Carte des absences : <table> thématiques × lun…dim + total ; puis barres par parcours
 Motifs d'arrêt (barres)          │ Séances et temps soignant (chiffres + barres par métier)
 Définitions (repliées, <details>)
```

- Les trois réponses du critère de fin ouvrent l'écran, pas une rangée de tuiles génériques.
- La carte des absences est le seul élément en couleur forte : teinte proportionnelle au taux, le
  pourcentage écrit dans chaque case (la couleur n'est jamais seule porteuse de sens). Colonnes
  week-end affichées seulement si elles ont des présences.
- Mobile : les trois réponses s'empilent, la grille défile horizontalement, colonne des thématiques
  épinglée.
- États distincts : chargement, erreur (message et réessai), période sans activité (invite à
  changer de période). Export désactivé pendant le chargement ou en erreur.

## 6. Accès et navigation

- Nouvelle permission de service `activity:read`, accordée à `COORDINATEUR` et `LECTURE` ; le chef
  d'établissement l'a en tant que coordinateur implicite. `stats:read` (ARS) reste au seul
  coordinateur.
- Les deux copies de la matrice (`back/src/main/utils/permissions.ts`,
  `front/src/utils/permissions.ts`) et `docs/multi-tenant/habilitations.md` changent dans le même
  commit.
- Onglet « Activité » dans le groupe Quotidien de `navigation.ts`, après Suivi, avec
  `permission: 'activity:read'` : il n'apparaît que pour ces rôles, dans la barre et le tiroir
  mobile.

## 7. Tests

- Unitaires back `activity-indicators.test.ts` : un `it` par indicateur sur des cohortes faites à
  la main ; bornes de période ; non pointés exclus de l'absentéisme ; aucune sortie (taux `null`) ;
  seuil de 5 ; présence hors parcours ; heures comptées une fois par soignant d'un créneau
  collectif.
- e2e back `activite.test.ts` : isolation entre services, `INTERVENANT` refusé, `LECTURE` admis,
  période invalide en 4xx, aucun nom de patient dans le JSON ni dans le CSV, CSV avec BOM et `;`.
- Permissions : cas ajoutés dans `permissions.test.ts`.
- Front `activite.test.tsx` : chargement, erreur, période vide, redirection sans permission,
  export désactivé.
- Contrôle visuel sur le serveur de dev : clair, sombre, largeur mobile.
