# Design : fiche patient configurable par service

Date : 2026-10-10

## 1. Intention

Chaque service doit avoir sa propre fiche patient, configurée par son chef de service (rôle
`COORDINATEUR`) sans déploiement. Aujourd'hui, les champs du sous-dossier de service
(`PatientServiceFile`) sont des colonnes Prisma propres au parcours ETP, avec leurs listes de
choix codées en dur dans `front/src/constants/patient.constant.ts` : tous les services ont la
même fiche.

Le chantier complet se découpe en deux, le second dépendant du premier :

1. **Fiche configurable** (cette spec) : le coordinateur définit les champs de son service, qui
   alimentent le formulaire patient, les colonnes et filtres de la liste, et l'export.
2. **Indicateurs configurables** (spec séparée, à écrire ensuite) : voir §9 pour les décisions
   déjà prises.

Critère de fin : un coordinateur crée un champ « Comorbidités » (choix multiple) dans les
réglages de son service, le remplit sur un patient, l'affiche en colonne dans la liste des
patients et filtre dessus — sans déploiement. Sur les services existants, la fiche ETP, la grille
ARS et le rapport d'activité donnent exactement les mêmes résultats qu'avant la migration.

## 2. Décisions prises avec Léo

1. **Socle fixe** : les onglets *Informations générales* et *Profil & Contexte* ne sont pas
   configurables. Cela inclut les quatre champs du sous-dossier affichés dans *Profil & Contexte*
   (`referringCaregiver`, `followUpToDo`, `notes`, `details`), qui restent des colonnes.
2. **Dates fixes** : `entryDate` et `exitDate` restent des colonnes dans tous les services. Elles
   délimitent la période de suivi, utile à tout indicateur.
3. **Configurables** : les onglets *Parcours & Inclusion* et *Sortie & Bilan*. Les dix autres
   champs ETP y deviennent des champs configurables, avec leurs données migrées.
4. **Stockage** : une colonne JSON `data` sur `PatientServiceFile`, valeurs rangées sous la clé
   figée du champ.
5. **Types** : texte court, texte long, nombre, date, choix unique, choix multiple, oui/non. Un
   type nouveau doit tenir dans un registre front et un registre back.
6. **Nouveau service** : fiche vide (dates seules), pas de modèle à copier.

## 3. Modèle de données

```prisma
model ServiceFieldDefinition {
  id              String    @id @default(cuid())
  establishmentId String
  serviceId       String
  key             String    // slug figé à la création : clé dans PatientServiceFile.data
  label           String
  type            String    // text | longtext | number | date | choice | multichoice | boolean
  section         String    // pathway (Parcours & Inclusion) | outcome (Sortie & Bilan)
  order           Int
  clinical        Boolean   @default(false)
  unit            String?   // type number uniquement
  createdAt       DateTime  @default(now())
  archivedAt      DateTime?

  service Service              @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])
  choices ServiceFieldChoice[]

  @@unique([serviceId, key])
  @@unique([id, serviceId])
  @@index([serviceId])
}

model ServiceFieldChoice {
  id              String    @id @default(cuid())
  fieldId         String
  serviceId       String
  establishmentId String
  key             String    // figée : c'est elle que stocke data
  label           String
  order           Int
  archivedAt      DateTime?

  field   ServiceFieldDefinition @relation(fields: [fieldId], references: [id])
  service Service                @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])

  @@unique([fieldId, key])
  @@index([fieldId])
}
```

- `ServiceFieldDefinition` suit le patron des modèles de service (`establishmentId`,
  `@@unique([id, serviceId])`, relation composite vers `Service`) et se déclare au garde-fou
  multi-tenant comme les autres.
- **Écart** : `ServiceFieldChoice` porte aussi `serviceId` et `establishmentId` : le garde-fou
  d'ORM classe tout modèle comme modèle de service ou modèle global, et un choix n'est pas global.
- `PatientServiceFile` gagne `data Json @default("{}")` et perd les dix colonnes migrées.
- **Écart** : une seconde colonne `clinicalData Json @default("{}")` reçoit les valeurs des
  champs cliniques, pour que le filtrage clinique retire une clé par son nom, à toute profondeur,
  sans requête.
- **Archivage, jamais de suppression**, pour les champs comme pour les choix, comme les
  référentiels. Une valeur archivée reste lisible sur les anciens dossiers et ne peut plus être
  choisie.
- Les choix ont leur propre table plutôt qu'un JSON : filtres et futurs indicateurs les
  référencent, et l'archivage se fait choix par choix.
- `key` et `type` sont figés après création : changer de type invaliderait les valeurs saisies.
  On crée un nouveau champ et on archive l'ancien.
- **Écart** : `clinical` est figé après création comme `key` et `type` : changer ce drapeau
  obligerait à déplacer les valeurs d'une colonne à l'autre.

Forme de `data` :

```json
{ "orientation": "ORIENTATION_PRO_SANTE_EXT", "hba1c": 7.2, "comorbidites": ["HTA", "DIABETE"], "suiviTabac": true }
```

| Type | Valeur JSON |
|---|---|
| `text`, `longtext` | chaîne |
| `number` | nombre fini |
| `date` | chaîne `YYYY-MM-DD` |
| `choice` | clé de choix |
| `multichoice` | tableau de clés, sans doublon |
| `boolean` | booléen |

Une valeur absente et une valeur `null` sont équivalentes : `data` ne stocke jamais `null`.

## 4. Migration de l'existant

Les dix champs migrés gardent leur nom de colonne comme clé :

| Section | Clé | Type | Clinique |
|---|---|---|---|
| pathway | `medicalDiagnosis` | choice | oui |
| pathway | `careMode` | choice | |
| pathway | `orientation` | choice | |
| pathway | `etpDecision` | choice | |
| pathway | `programType` | choice | |
| pathway | `nonInclusionDetails` | choice | |
| pathway | `customContentDetails` | longtext | |
| pathway | `goal` | longtext | |
| outcome | `stopReason` | choice | |
| outcome | `etpFinalOutcome` | choice | |

L'ordre suit celui du formulaire actuel. Les libellés reprennent ceux du formulaire actuel.

Une seule migration Prisma, pour tous les services existants :

1. Crée les deux tables et `data`.
2. Pour chaque service, insère les dix définitions et leurs choix, clés et libellés repris
   exactement de `patient.constant.ts`.
3. Recopie les valeurs non nulles dans `data`.
4. Pour chaque valeur stockée absente des constantes, crée un choix **archivé** dont le libellé
   est la clé : rien n'est perdu, la valeur reste affichée et filtrable.
5. **Garde** : pour chacun des dix champs, compte les valeurs non nulles en colonne et les clés
   présentes dans `data` ; toute divergence lève une exception et annule la migration
   (patron de la garde de l'étape 3 du multi-tenant).
6. Supprime les dix colonnes.

Code existant adapté dans ce chantier :

- `arsIndicator.repository.ts` et le rapport d'activité lisent `data.orientation` et
  `data.stopReason`. Leur logique ne change pas avant le chantier 2.
- Les dix constantes et leurs `*_OPTIONS` quittent `patient.constant.ts`. `ARS_ORIENTATIONS` et
  `FIN_DE_PARCOURS` restent jusqu'au chantier 2.

## 5. API back

### Définitions (réglages du service)

- Routes de service, comme `thematic.ts` : `GET /service-fields`, `POST /service-fields`,
  `PATCH /service-fields/:id`, `POST /service-fields/:id/choices`,
  `PATCH /service-fields/:id/choices/:choiceId`, et une route de réordonnancement par section
  et par liste de choix.
- Lecture `referentials:read`, écriture `referentials:write` (réservée au `COORDINATEUR`).
- Pas de `DELETE` : `PATCH { archivedAt }` archive ou restaure.
- La clé est générée depuis le libellé à la création (`HbA1c` → `hba1c`, suffixe numérique en
  cas de collision avec une clé existante, archivée comprise) ; le coordinateur ne la voit pas.
  Même règle pour la clé d'un choix.
- `PATCH` refuse toute modification de `key` ou `type` (400). **Écart** : `PATCH` refuse aussi
  toute modification de `clinical`.
- `GET` renvoie les champs actifs **et** archivés avec tous leurs choix : la liste et l'export
  ont besoin des libellés archivés pour afficher les anciennes valeurs.

### Écriture d'une fiche (`PATCH /patient-service-file`, existant)

- Le corps gagne `data`, objet **partiel** : clé présente = remplacée, `null` = effacée, clé
  absente = inchangée. Même raison que la sémantique PATCH actuelle : un secrétariat ne doit pas
  effacer ce qu'il ne voit pas.
- Validation par un **registre de types** back (une fonction par type). Pour `choice` et chaque
  élément de `multichoice`, la clé doit appartenir aux choix non archivés du champ, **sauf** si
  c'est déjà la valeur en base (réenregistrer un vieux dossier ne doit pas échouer). Clé de champ
  inconnue ou archivée : 400.
- Écriture en une instruction atomique : `data = jsonb_strip_nulls(data || $patch)`. Deux
  soignants modifiant deux champs différents ne s'écrasent pas.

### Droits cliniques

- Sans `clinical:read` : les clés des champs `clinical` sont retirées de toute réponse (fiche,
  liste des patients, export).
- Sans `clinical:write` : ces clés sont retirées du corps avant écriture, comme
  `stripClinicalInput` le fait aujourd'hui.
- `CLINICAL_FIELDS` perd `medicalDiagnosis` (qui n'est plus une colonne). **Écart** :
  `CLINICAL_FIELDS` gagne `clinicalData` à la place, et le filtrage ne s'appuie plus sur les
  définitions du service.

## 6. Front

### Registre de types (`front/src/constants/serviceFieldTypes.tsx`)

Par type : libellé d'administration, composant de formulaire, rendu de cellule, colonne
possible ou non, filtre, format d'export.

| Type | Formulaire | Colonne / filtre |
|---|---|---|
| `text` | `field.Input` | colonne, pas de filtre |
| `longtext` | `field.TextArea` | ni colonne ni filtre |
| `number` | `field.Number` + unité | colonne triable, pas de filtre |
| `date` | `field.DatePicker` | colonne, pas de filtre |
| `choice` | `field.Select` | étiquettes colorées, filtre par valeurs |
| `multichoice` | `field.MultiSelect` | étiquettes, filtre « contient l'une des valeurs » |
| `boolean` | `field.Select` Oui/Non effaçable | Oui/Non, filtre Oui/Non |

- **Écart** : `boolean` se saisit par une liste Oui / Non effaçable, pas par un interrupteur, qui
  ne sait pas dire « non renseigné » et confondrait « non » avec « non renseigné ».
- **Écart** : pas de filtre par plage de dates dans ce chantier, comme la colonne « Date de
  sortie » existante n'en a pas non plus.
- **Écart** : `STOP_REASON` reste dans `patient.constant.ts` jusqu'au chantier 2, l'écran
  d'activité s'en servant pour libeller les motifs d'abandon.

### Fiche patient (`edit.patient.tsx`)

- *Parcours & Inclusion* et *Sortie & Bilan* rendent, sous la date fixe de l'onglet, les champs
  actifs de leur section dans l'ordre configuré. `pathway-inclusion.patient.tsx` et
  `outcome-review.patient.tsx` deviennent une boucle sur les définitions.
- Champs cliniques masqués sans `clinical:read`.
- Une valeur dont le choix est archivé s'affiche suffixée « (archivé) » ; elle reste
  sélectionnée mais n'est pas proposée.

### Liste des patients (`patient.column.tsx`)

- Les colonnes optionnelles codées à la main sont remplacées par des colonnes générées depuis les
  définitions, via `optional` / `choices` de `CustomMeta` existants.
- Identifiant de colonne = clé du champ (la mémorisation localStorage par service et par
  utilisateur reste valable). Un champ archivé sort du sélecteur de colonnes.
- `findAllWithTags` renvoie `data` sans les clés `longtext` (la réponse reste aussi légère
  qu'aujourd'hui) ni les clés cliniques pour qui n'a pas `clinical:read`.

### Export Excel (`patient.domain.ts`)

Colonnes fixes de `EXPORT_COLUMNS`, puis une colonne par champ actif du service, avec le
**libellé** des choix (l'export écrit aujourd'hui la clé brute).

### Écran d'administration (`_settings/fiche-patient.tsx`)

- Deux listes, *Parcours & Inclusion* et *Sortie & Bilan*, réordonnables par flèches haut/bas (aucune
  bibliothèque de glisser-déposer installée, on n'en ajoute pas).
- Popup d'édition : libellé, type (figé après création), unité (nombre), case « Clinique »,
  liste de choix éditable, réordonnable, archivable.
- Champs archivés grisés avec « Restaurer ».
- Accessible au seul `COORDINATEUR`, comme les autres réglages qui exigent
  `referentials:write`.

## 7. Performance

Volumes visés : quelques milliers de dossiers par service. La liste est déjà chargée entière
et filtrée côté front, la grille ARS déjà calculée en mémoire : la colonne JSON ne change pas
l'ordre de grandeur. L'écriture ajoute une lecture des définitions du service (quelques dizaines
de lignes, indexées). Aucun index JSONB n'est créé : il ne servira que le jour où tri, filtre ou
pagination passeront côté base, et s'ajoutera alors sans changer le stockage
(`(data->>'cle')` ou GIN).

## 8. Tests et déploiement

### Back

- Migration : sur une base de test remplie, les dix colonnes se retrouvent à l'identique dans
  `data` ; les valeurs inconnues deviennent des choix archivés ; la garde échoue sur un comptage
  divergent ; clés et libellés concordent avec une copie figée des anciennes constantes.
- Validation : un cas valide et un cas refusé par type ; choix archivé déjà présent accepté,
  nouveau refusé ; clé inconnue et champ archivé refusés.
- Écriture partielle : deux mises à jour concurrentes sur deux clés distinctes ; `null` efface.
- Droits cliniques : clés absentes de la fiche, de la liste et de l'export sans
  `clinical:read` ; ignorées à l'écriture sans `clinical:write`, valeur en base intacte.
- Grille ARS et rapport d'activité : les tests existants passent sans changer leurs valeurs
  attendues.
- Permissions : 403 pour un `INTERVENANT` sur l'écriture des définitions.

### Front

- Registre : composant, cellule et format d'export de chaque type.
- Fiche : ordre configuré, champs cliniques masqués, valeur archivée « (archivé) ».
- Liste : colonnes générées, filtre `multichoice`.
- Administration : créer un champ à choix, réordonner, archiver, restaurer.
- Navigateur sur le serveur de dev 4270 : le critère de fin du §1.

### Déploiement (`docs/fiche-configurable/deploiement.md`)

1. Dump de la base.
2. Relever les comptages de valeurs non nulles des dix colonnes.
3. Générer la grille ARS d'une période connue.
4. Appliquer la migration (sa garde refait le contrôle 2).
5. Comparer comptages et grille ARS.

Retour arrière : restauration du dump. Les colonnes étant supprimées dans la même migration, il
n'y a pas de retour arrière progressif ; la garde arrête tout avant la suppression si les données
ne concordent pas.

## 9. Hors périmètre, et décisions déjà prises pour le chantier 2

Hors périmètre de ce chantier :

- Les indicateurs configurables.
- Un modèle de fiche copiable d'un service à l'autre.
- Des champs configurables dans *Informations générales* et *Profil & Contexte*.
- Le filtre sur les nombres dans la liste.
- L'historique des modifications des définitions (le journal d'activité ne couvre pas les
  réglages aujourd'hui).

Décisions prises pour le chantier 2, à reprendre dans sa spec :

- **Mesures codées, filtres configurables** : l'application fournit une liste fermée de mesures
  (patients entrés, sortis, suivis sur la période ; séances individuelles, collectives ; patients
  par séance ; programme complet ; accompagnants…). Le coordinateur compose un indicateur : code,
  libellé, groupe, une mesure, des filtres sur les champs de la fiche et sur les rendez-vous
  (type, rôle de thématique).
- **Deux formes de résultat** : un nombre, ou une répartition par valeur d'un champ à choix.
- **La grille ARS devient un jeu d'indicateurs configurables** comme les autres, pré-rempli et
  modifiable par le coordinateur. Risque accepté : une grille réglementaire repose sur une
  configuration modifiable par erreur.
- **Rapport d'activité** : reste fixe (absences, heures, séances, patients actifs, entrés et
  sortis) ; le bloc « programme complet / abandons par motif » en sort pour devenir un indicateur
  configurable de type répartition.
