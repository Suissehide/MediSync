# Design : colonnes optionnelles, triables et filtrables dans ReactTable

Date : 2026-10-09

## 1. Intention

Chaque utilisateur doit pouvoir, sur la liste des patients d'abord et sur d'autres tables plus
tard, ajouter ou retirer des colonnes en cochant dans une liste, trier sur ces colonnes et filtrer
dessus. Exemple de référence : ajouter « Diagnostic médical » affiche une colonne d'étiquettes
colorées (AOMI, AVC, CORONAROPATHIE, PREVENTION) et un filtre où l'on coche une ou plusieurs de
ces valeurs.

Seuls les champs exploitables en tri/filtre sont proposés : les textes libres (« Objectif »,
« Précision contenu personnalisé », notes…) sont exclus.

Critère de fin : sur la liste des patients, un utilisateur ajoute « Diagnostic médical », trie
dessus, coche « AVC » et ne voit que les patients AVC ; il recharge la page, son choix est intact ;
un collègue sur un autre poste, ou lui-même dans un autre service, ne voit pas ce choix.

## 2. Décisions prises avec Léo

1. **Mécanique générique dans `ReactTable`** (approche A), réutilisable par toute table en
   déclarant ses colonnes ; pas de logique propre à la page Patients.
2. **Filtres dans la barre d'outils**, un `DropdownFilter` par colonne à choix visible, à côté du
   filtre « Parcours » existant — pas dans l'en-tête de colonne.
3. **Mémorisation par navigateur** (localStorage), par service et par utilisateur. Rien côté back.
4. **Couleurs : palette fixe automatique**, selon la position de la valeur dans sa liste de choix.
5. **Champs proposés** : groupes Inclusion et Bilan du dossier de service. Pas l'identité
   sociale ni le contact.

Hors périmètre :
- Le filtre « Parcours » reste tel quel (filtrage dans la page, sur un tableau de tags).
- L'export Excel n'applique pas les nouveaux filtres de colonnes ; il garde recherche + parcours.
- Aucune autre table n'adopte la mécanique dans ce chantier.

## 3. Données

### Champs ajoutés

Tous vivent sur `PatientServiceFile` (service courant), stockés en `String?` dont la valeur est
la **clé** des constantes de `front/src/constants/patient.constant.ts` (vérifié en base : jamais
le libellé). Les valeurs vides (`null`) existent pour chacun.

| Groupe | Champ | Libellé | Choix (constante) |
|---|---|---|---|
| Inclusion | `medicalDiagnosis` | Diagnostic médical | 4 |
| Inclusion | `careMode` | Mode de prise en charge | 4 |
| Inclusion | `orientation` | Orientation | 5 |
| Inclusion | `etpDecision` | ETP décision | 2 |
| Inclusion | `programType` | Type de programme | 2 |
| Inclusion | `nonInclusionDetails` | Précision non inclusion | 14 |
| Bilan | `stopReason` | Motif d'arrêt de programme | 19 |
| Bilan | `etpFinalOutcome` | Point final parcours ETP | 11 |
| Bilan | `exitDate` | Date de sortie | date (déjà renvoyée) |

### Back

`GET /patient/with-tags` (`patient.repository.ts#findAllWithTags`) lit déjà le sous-dossier du
service courant pour `entryDate`/`exitDate`. Le `select` de `serviceFiles` est étendu aux huit
champs ci-dessus, aplatis sur la ligne comme `entryDate`. Types mis à jour :
`PatientWithTagsEntityRepo`, `patientWithTagsResponseSchema` (huit `z.string().nullable().optional()`),
`PatientWithTags` côté front.

Volume : la liste est déjà chargée entière (pas de pagination serveur) ; huit chaînes courtes par
patient ne changent pas l'ordre de grandeur.

## 4. Composants front

### `CustomMeta` (`components/table/reactTable.tsx`)

Deux ajouts :

```ts
optional?: { label: string; group?: string }   // masquée par défaut, listée dans « Colonnes »
choices?: { value: string; label: string }[]   // colonne à choix : étiquettes + filtre
```

### Fabrique `choiceColumn` (`components/table/choiceColumn.tsx`)

```ts
choiceColumn(columnHelper, accessor, { id, label, group, choices })
```

Produit une colonne complète :
- **accessor** : la valeur brute, `null` ramené à `undefined` ;
- **cellule** : `Etiquette` avec le libellé et `choiceColor(index de la valeur dans choices)` ;
  valeur hors liste → libellé = valeur brute, ton neutre ; vide → rien ;
- **tri** : `sortingFn` sur le libellé (`localeCompare('fr')`), `sortUndefined: 'last'` ;
- **filtre** : `filterFn` en OU sur un tableau de valeurs, où `EMPTY_CHOICE = '__empty__'`
  correspond aux vides ;
- **meta** : `{ optional: { label, group }, choices }`.

`choiceColor(index)` vient d'une palette commune (`libs/choicePalette.ts`, ~10 couleurs
lisibles avec le texte foncé d'`Etiquette`, réparties modulo).

Une colonne optionnelle qui n'est pas à choix (Date de sortie) se déclare à la main avec
`meta.optional` ; elle est triable, sans filtre.

### Barre d'outils de `ReactTable`

Nouvelle prop `toolbar?: ReactNode`. Si la table reçoit `toolbar` **ou** a au moins une colonne
`optional`, `ReactTable` rend au-dessus du tableau :

```
[toolbar de la page] [DropdownFilter par colonne à choix visible] [Colonnes ▾]
```

Sinon, rendu inchangé : les usages actuels ne bougent pas.

- **Filtres** : un `DropdownFilter` par colonne visible ayant `meta.choices`, libellé = libellé de
  la colonne. Items = les choix (couleur de la palette) + « Non renseigné », chacun avec son
  compteur tiré de `column.getFacetedUniqueValues()` (déjà branché dans la table), ce qui compte
  sur les lignes filtrées par les autres filtres. Cocher/décocher met à jour
  `column.setFilterValue` (tableau vide → `undefined`).
- **`ColumnPicker`** (`components/table/columnPicker.tsx`, remplace `columnVisibilityMenu.tsx`,
  entièrement commenté) : `DropdownMenu` Radix listant les colonnes `optional`, groupées par
  `group`, une case à cocher chacune. Décocher une colonne efface aussi son filtre.

### Visibilité, mémorisation, remise à zéro

- Visibilité initiale : les colonnes `optional` valent `false` quand rien n'est mémorisé ; ce qui
  est mémorisé l'emporte.
- La clé reste `filterId` (`column-visibility/`, `filters/`, `sorting/` existants). La page
  Patients passe `filterId={`patient/${serviceId}/${userId}`}`.
- Nouvelle prop `resetSignal?: number` : à chaque changement de valeur, la table vide ses filtres
  de colonnes (la visibilité et le tri restent). La page l'incrémente sur « Réinitialiser ».

### Page Patients

- `columns/patient.column.tsx` : ajoute les huit colonnes à choix via `choiceColumn` et la
  colonne Date de sortie, toutes optionnelles, après « Parcours » et avant les actions.
- `patient/index.tsx` : la recherche, le bascule de statut, le filtre Parcours, « Réinitialiser »
  et l'export passent dans `toolbar` ; « Réinitialiser » incrémente aussi `resetSignal`.

## 5. Erreurs et cas limites

- localStorage illisible ou corrompu : `safeParse` existant retombe sur les défauts.
- Filtre mémorisé sur une colonne qui n'existe plus ou est masquée : effacé au chargement
  (on ne garde que les filtres des colonnes visibles).
- Valeur en base absente des constantes : affichée telle quelle en étiquette neutre, et proposée
  dans le filtre après les choix connus (sans couleur, avec son compteur), pour qu'aucun patient
  ne devienne infiltrable. Aucune n'existe en base aujourd'hui.

## 6. Tests

- **Vitest** :
  - `choiceColumn` : tri par libellé avec vides en dernier ; filtre OU avec `__empty__` ; couleur
    stable pour une même valeur.
  - `ReactTable` + `ColumnPicker` : une colonne optionnelle est masquée par défaut ; la cocher
    l'affiche ainsi que son filtre ; cocher « AVC » ne garde que les lignes AVC ; la décocher
    masque la colonne et efface le filtre ; `resetSignal` vide les filtres.
  - Les tests existants des usages de `ReactTable` passent sans changement.
- **E2E back** : `GET /patient/with-tags` renvoie les huit champs du sous-dossier du service
  courant, et ceux d'un autre service ne fuitent pas (cas ajouté au test de cloisonnement de
  `patient.test.ts`).
