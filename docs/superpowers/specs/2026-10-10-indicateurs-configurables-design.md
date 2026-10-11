# Design : indicateurs configurables par service

Date : 2026-10-10

Suite du chantier « fiche patient configurable »
(`docs/superpowers/specs/2026-10-10-fiche-patient-configurable-design.md`, §9).
**Prérequis bloquant** : le chantier « Pilotage, partie Indicateurs ARS »
(`docs/superpowers/specs/2026-10-10-pilotage-ars-design.md`, branche `worktree-pilotage-ars`) est
fusionné sur `main`. Ce chantier généralise son modèle (natures, saisies manuelles, écran
d'enquête, `stats:write`) au lieu de le refaire.

## 1. Intention

Le coordinateur d'un service compose lui-même des jeux d'indicateurs calculés sur les champs de sa
fiche et sur l'agenda, et les consulte dans l'onglet Pilotage comme la grille ARS aujourd'hui. La
grille ARS devient un de ces jeux, créé d'avance et modifiable.

Critère de fin :
- sur les services existants, le jeu « Grille ARS » donne, pour 2025 et 2026, exactement les
  valeurs et les réponses saisies de la grille codée qu'il remplace ;
- un coordinateur crée un jeu « Suivi diabète » avec l'indicateur « Patients entrés dont
  Comorbidités contient HTA, répartis par Orientation », voit l'aperçu se calculer, puis le
  consulte et l'exporte depuis Pilotage — sans déploiement.

## 2. Décisions prises avec Léo

1. **La grille ARS devient un jeu d'indicateurs configurables** (décision §9 du chantier 1,
   confirmée), construit sur le modèle de `pilotage-ars` une fois celui-ci fusionné. Risque
   accepté : une grille réglementaire repose sur une configuration modifiable par le coordinateur.
2. **Mesures codées, options et filtres configurables** : un catalogue fermé de mesures, chacune
   avec ses options en listes fermées ; les mesures qui comptent des patients acceptent des filtres
   sur les champs configurables du service. Pas d'éditeur de formules.
3. **Plusieurs jeux par service**, chacun avec un nom, des groupes, des indicateurs ordonnés,
   consultable sur une période, exportable, avec ses saisies manuelles.
4. **Écran Activité inchangé** (refonte v3 livrée) ; son bloc « motifs d'arrêt » lit le champ et
   la valeur « fin de parcours » désignés dans les réglages du service, au lieu de `stopReason`,
   `PLUS_BESOIN_FIN_PARCOURS` et `STOP_REASON` codés en dur. Cette décision remplace celle du §9
   du chantier 1, qui sortait ce bloc de l'Activité.
5. **Trois natures d'indicateur**, reprises de `pilotage-ars` : calculé, à saisir, non disponible.
6. **Résultat** d'un indicateur calculé : un nombre, ou une répartition selon un champ à choix.

## 3. Données

```prisma
model IndicatorSet {
  id              String    @id @default(cuid())
  establishmentId String
  serviceId       String
  name            String
  order           Int
  createdAt       DateTime  @default(now())
  archivedAt      DateTime?

  indicators Indicator[]

  @@unique([id, serviceId])
  @@index([serviceId])
}

model Indicator {
  id              String    @id @default(cuid())
  establishmentId String
  serviceId       String
  setId           String
  code            String
  label           String
  group           String
  order           Int
  nature          String    // computed | manual | unavailable
  measure         String?   // computed : clé de MEASURES
  options         Json?     // computed : options de la mesure
  filters         Json?     // computed : [{ field, op, value }]
  breakdownField  String?   // computed : clé d'un champ choice/multichoice
  input           String?   // manual : number+text | yesno
  note            String?   // manual, unavailable
  parentId        String?
  createdAt       DateTime  @default(now())
  archivedAt      DateTime?

  answers IndicatorAnswer[]

  @@unique([setId, code])
  @@unique([id, serviceId])
  @@index([setId])
}

model IndicatorAnswer {
  id              String   @id @default(cuid())
  establishmentId String
  serviceId       String
  indicatorId     String
  year            Int
  numberValue     Int?
  textValue       String?
  boolValue       Boolean?
  updatedById     String
  updatedAt       DateTime @updatedAt

  @@unique([indicatorId, year])
}
```

- Modèles de service : relations composites `(…, serviceId)` comme les champs configurables,
  déclarés dans `SERVICE_MODELS`, `MODEL_RELATIONS` et `NESTED_RELATIONS` du garde-fou.
- Archivage, jamais de suppression, pour les jeux et les indicateurs.
- Ordre des groupes d'un jeu = ordre de leur premier indicateur.
- `parentId` : indicateur du même jeu ; l'écran affiche « x % du {parent} » quand les deux sont des
  nombres et que le parent est > 0. Remplace la convention de nommage « bis ».
- `Service` gagne `stopReasonFieldKey String?` et `completedChoiceKey String?` (réglages de
  l'Activité).

### Filtres

`filters` est une liste de conditions combinées par ET :

| Type du champ | Opérateurs | Valeur |
|---|---|---|
| `choice` | `in` | liste de clés de choix |
| `multichoice` | `containsAny` | liste de clés de choix |
| `boolean` | `eq` | booléen |
| `number` | `eq`, `lt`, `lte`, `gt`, `gte` | nombre |
| `date` | `before`, `after` | `YYYY-MM-DD` |

`text` et `longtext` ne sont pas filtrables. Un patient sans valeur ne satisfait aucune condition.
Une condition qui vise un champ archivé reste appliquée ; le résultat porte un avertissement.

### Migration

Une migration, en transaction :
1. crée les tables et les deux colonnes de `Service` ;
2. pour chaque service qui a les champs ETP `orientation` et `stopReason` : crée le jeu
   « Grille ARS » (ordre 0) avec les 30 indicateurs d'`ARS_INDICATORS` — codes, groupes, libellés
   et notes mot pour mot, natures, mesures et options équivalentes (§4), `parentId` des « bis » ;
   pose `stopReasonFieldKey = 'stopReason'` et `completedChoiceKey = 'PLUS_BESOIN_FIN_PARCOURS'` ;
3. recopie `ArsManualAnswer` dans `IndicatorAnswer`, en retrouvant l'indicateur par son code dans
   le jeu ARS du service ;
4. **garde** : autant de réponses après qu'avant, valeur par valeur ; sinon annulation ;
5. supprime `ArsManualAnswer`.

Le seed pose le même jeu sur ses services ETP. Le catalogue du jeu ARS (code, mesure, options,
filtres) est un module TS partagé par le seed et le test de migration, comme `ETP_FIELD_PRESET`.

## 4. Calcul

### Catalogue `MEASURES` (`back/src/main/utils/indicators/`)

Chaque mesure : `{ label, description, unit: 'patients' | 'seances' | 'moyenne', options: schéma Zod, compute(cohort, options) }`.
Les fonctions viennent d'`ars-indicators.ts` (déplacées et paramétrées, pas réécrites).

| Clé | Options | Indicateurs ARS |
|---|---|---|
| `patientsEntres` | `diagnosticADistance: boolean` | 1.1, 1.1bis ; 1.2-1.4 avec filtre `orientation` |
| `patientsParModalite` | `modalite: hospitalisation \| externes \| mixte` | 2.1, 2.2, 2.4 |
| `seancesIndividuelles` | `aDistance: boolean` | 2.6, 2.6bis |
| `seancesCollectives` | `aDistance: boolean` | 2.7, 2.7bis |
| `moyennePatientsParSeanceCollective` | — | 2.8 |
| `patientsAccompagnes` | — | 2.9 |
| `seancesAvecProche` | — | 2.10 |
| `patientsProgrammeComplet` | `modalite: toutes \| hospitalisation \| externes \| mixte` | 3.1-3.4 |
| `patientsEvalues` | — | 3.6 |
| `patientsProgrammePersonnalise` | `variante: initial \| initialTermineParReactu \| suiviCommenceParReactu \| suiviReactuDebutEtFin` | 4.1, 4.1bis, 4.3, 4.3bis |
| `patientsSortis` | — | — |
| `patientsSuivis` | — | — |

Les 2.3, 2.5, 2.11, 3.5, 4.2, 4.4 restent non disponibles ou à saisir, comme dans `pilotage-ars`.

### Cohorte, filtres, répartition

- Cohorte : celle d'aujourd'hui (`findCohort`), chaque dossier portant en plus ses valeurs
  (`data` et `clinicalData` fusionnés).
- Les filtres restreignent la cohorte aux patients qui les satisfont : leurs dossiers et leurs
  présences. Sans filtre, résultat identique à aujourd'hui.
- Répartition : mesures `unit: 'patients'` seulement. Une ligne par choix du champ (ordre des
  choix, archivés seulement s'ils ont un effectif), plus « Non renseigné ». En choix multiple, un
  patient compte dans chacune de ses valeurs. La valeur de l'indicateur reste le total.
- Champs cliniques autorisés dans filtres et répartitions : le résultat est un comptage agrégé,
  consulté avec `stats:read`.

### Validation (enregistrement et aperçu)

- `computed` : `measure` connue, `options` conformes à son schéma, chaque filtre sur un champ
  existant du service, opérateur permis pour son type, valeurs du bon type (clés de choix
  existantes) ; `breakdownField` de type `choice`/`multichoice` et mesure `unit: 'patients'`.
- `manual` : `input` présent ; `unavailable` : `note` présente.
- `parentId` dans le même jeu, sans cycle ; `code` unique dans le jeu.
- Violation → 400 avec un message en français.

## 5. API

Sous le préfixe de service.

| Route | Permission |
|---|---|
| `GET /indicator-sets` (actifs et archivés) | `stats:read` |
| `POST /indicator-sets`, `PATCH /indicator-sets/:id`, `PUT /indicator-sets/order` | `stats:write` |
| `GET /indicator-sets/:id/indicators` | `stats:read` |
| `POST /indicator-sets/:id/indicators`, `PATCH …/:indicatorId`, `PUT …/order` | `stats:write` |
| `POST /indicator-sets/:id/preview` (indicateur non enregistré, `from`, `to`) | `stats:write` |
| `GET /indicator-sets/:id/results?from&to` | `stats:read` |
| `PUT /indicator-sets/:id/answers/:year/:indicatorId` | `stats:write` |
| `GET /indicator-sets/:id/export.xlsx` et CSV côté front | `stats:read` |
| `GET /indicator-catalog` | `stats:read` |
| `PATCH /activity-settings` (`stopReasonFieldKey`, `completedChoiceKey`) | `stats:write` |

Résultat d'un indicateur :
`{ id, code, group, label, nature, value, breakdown: [{ key, label, value }] | null, note, input, answer, parentId, warnings: string[] }`,
et `manualYear` au niveau du jeu (règles de `pilotage-ars` : saisie seulement sur une année civile).
Les routes ARS de `pilotage-ars` (`/indicateurs-ars`, saisies) disparaissent au profit de
celles-ci.

## 6. Front

### Consultation (Pilotage)

- La bascule « Activité | Indicateurs ARS » devient « Activité | jeu 1 | jeu 2 … » (jeux actifs,
  dans l'ordre, avec `stats:read`).
- Route `/indicateurs/$setId`. `/indicateurs-ars` redirige vers le jeu « Grille ARS » du service
  (ou vers l'Activité s'il n'existe pas).
- Écran de `pilotage-ars` généralisé : bandeau d'avancement, cartes par groupe, natures, % du
  parent, saisie au blur sur année civile, exports. Ajout : la répartition, en sous-lignes
  (libellé, effectif, %, barre fine aux couleurs de `choicePalette`), et une icône
  d'avertissement avec infobulle pour `warnings`.

### Configuration (Administration → « Indicateurs », `stats:write`)

- Liste des jeux : créer, renommer, réordonner, archiver / restaurer.
- Un jeu : indicateurs par groupe, flèches haut/bas, ligne « code · libellé · nature · résumé »
  (« Patients entrés · Orientation parmi Hors hôpital »).
- Popup d'un indicateur : code, libellé, groupe (existant ou nouveau), parent facultatif, nature ;
  calculé → mesure (avec sa description), options, filtres (ligne « Champ · Opérateur ·
  Valeur(s) », contrôle selon le type), répartition ; à saisir → type de réponse ; non disponible
  → note. **Aperçu** « Valeur sur {année en cours} : N » recalculé (avec délai) à chaque
  modification via `preview`.
- Bloc « Réglages de l'Activité » : champ motif d'arrêt (parmi les champs à choix), puis valeur
  « fin de parcours » (parmi ses choix).

### Activité

Le bloc « motifs d'arrêt » lit les réglages : libellés pris dans les choix du champ ; sans
réglage, bloc masqué. `STOP_REASON` quitte `patient.constant.ts`.

## 7. Tests

Back :
- **équivalence ARS** : `computeArsIndicators` figée dans le test comme oracle ; sur une cohorte
  riche (DE sans date d'entrée, modalités hospit/externes/mixte, réactualisations au début et à la
  fin, collectives à distance, accompagnants), le jeu ARS calculé par le moteur égale l'oracle
  code par code ; le test rougit si une option du catalogue ARS change ;
- moteur : chaque mesure × options, chaque opérateur par type, répartition choix / choix multiple
  avec « Non renseigné » et choix archivé, filtre vide = sans filtre ;
- validation : un refus par règle ;
- migration (base jetable) : jeu ARS posé sur chaque service ETP, réponses reprises, garde ;
- permissions et isolation : 403 sans `stats:write` / `stats:read`, 404 pour le jeu d'un autre
  service ;
- Activité : sans réglage, pas de motifs ; avec un autre champ, ses libellés ; tests existants
  d'`activite.test.ts` verts sans changer leurs valeurs attendues.

Front : bascule (un segment par jeu, `LECTURE` voit seulement l'Activité), redirection
`/indicateurs-ars`, répartition, contrôle de filtre selon le type, aperçu recalculé.

## 8. Déploiement

`docs/indicateurs-configurables/deploiement.md` : sauvegarde ; export de la grille ARS 2025 et
2026 et des réponses saisies avant ; déploiement ; même export depuis le jeu « Grille ARS » ;
comparaison à l'identique ; retour arrière par restauration.

## 9. Hors périmètre

- Copier un jeu entre services, jeux partagés au niveau de l'établissement.
- Comparaison de périodes et graphiques dans les jeux (les graphiques restent dans l'Activité).
- Mesures au-delà du catalogue (une nouvelle mesure = une entrée de `MEASURES`).
- Rendre calculables 2.3, 2.11, 3.5, 4.4.
