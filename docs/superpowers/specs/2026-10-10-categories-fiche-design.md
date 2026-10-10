# Design : catégories de la fiche patient

Date : 2026-10-10

Suite du chantier « fiche patient configurable »
(`docs/superpowers/specs/2026-10-10-fiche-patient-configurable-design.md`).

## 1. Intention

Le coordinateur organise les champs configurables de son service en catégories qu'il crée, renomme,
réordonne et supprime, au lieu des deux onglets figés *Parcours & Inclusion* et *Sortie & Bilan*.

Critère de fin : un coordinateur ajoute la catégorie « Suivi diététique », y déplace un champ, la
place avant « Sortie & Bilan » ; la fiche patient affiche un onglet « Suivi diététique » à cette
place avec ce champ ; la liste des patients range sa colonne sous ce libellé ; les dates d'entrée et
de sortie restent dans leurs catégories.

## 2. Décisions prises avec Léo

1. Les deux catégories existantes portent les dates fixes (entrée, sortie) : renommables et
   réordonnables, **jamais supprimables**. Les catégories ajoutées sont entièrement libres.
2. Dans les écrans de configuration de la fiche, l'action s'appelle **« Supprimer »** (et le filtre
   « Supprimés »), même si l'effet reste un archivage restaurable. Vaut pour les champs, les choix
   et les catégories.
3. Les onglets *Informations générales* et *Profil & Contexte* restent fixes.

## 3. Données

```prisma
model ServiceFieldCategory {
  id              String    @id @default(cuid())
  establishmentId String
  serviceId       String
  label           String
  order           Int
  dateField       String?   // entryDate | exitDate : porte une date fixe, non supprimable
  createdAt       DateTime  @default(now())
  archivedAt      DateTime?

  service Service                  @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])
  fields  ServiceFieldDefinition[]

  @@unique([id, serviceId])
  @@unique([serviceId, dateField])
  @@index([serviceId])
}
```

- `ServiceFieldDefinition.section` est remplacé par `categoryId` (relation `[categoryId, serviceId]`).
- Modèle de service, déclaré au garde-fou comme les champs.
- `@@unique([serviceId, dateField])` : une seule catégorie par date et par service (Postgres
  autorise plusieurs `NULL`).

### Migration

En transaction : création de la table ; pour chaque service, « Parcours & Inclusion »
(`entryDate`, ordre 0) et « Sortie & Bilan » (`exitDate`, ordre 1) ; `categoryId` renseigné depuis
`section` (`pathway` → entrée, `outcome` → sortie) ; **garde** : pour chaque service, le nombre de
champs par ancienne section égale le nombre de champs par catégorie correspondante, et aucun champ
sans catégorie ; puis `categoryId` devient obligatoire et `section` disparaît.

### Services nouveaux

Les deux catégories à date sont créées **à la première lecture** des catégories du service
(`ensureDefaults`, idempotent grâce à l'unicité `(serviceId, dateField)`). Aucun chemin de création
de service n'a à les connaître. Le seed et `ETP_FIELD_PRESET` rangent leurs champs dans ces deux
catégories selon leur ancienne section.

## 4. API

Permission `referentials:read` / `referentials:write`, comme les champs.

- `GET /service-field-categories` → `{ id, label, order, dateField, archived }[]`, triées par
  `order` (actives et supprimées).
- `POST /service-field-categories { label }` → en fin d'ordre.
- `PATCH /service-field-categories/:id { label?, archived? }` ; `archived: true` refusé (400) pour
  une catégorie à date, et pour une catégorie qui contient encore des champs actifs (« Déplacez ou
  supprimez d'abord ses champs »).
- `PUT /service-field-categories/order { ids }` (jeu complet, supprimées comprises).
- Champs : `categoryId` remplace `section` dans les réponses et à la création ;
  `PATCH /service-fields/:id { categoryId }` déplace le champ en fin de la catégorie cible (active,
  du même service, sinon 400) ; `PUT /service-fields/order { categoryId, ids }`.
- L'ordre des champs rendu par `GET /service-fields` (et donc l'export Excel) suit l'ordre des
  catégories puis l'ordre dans chacune.

## 5. Front

- **Fiche patient** : après les deux onglets fixes, un onglet par catégorie active, dans l'ordre ;
  la date fixe d'une catégorie (`dateField`) s'affiche en tête de son onglet. Icône générique pour
  les catégories sans date ; les deux catégories à date gardent leurs icônes.
- **Liste des patients** : groupe d'une colonne optionnelle = libellé de sa catégorie (identifiants
  de colonnes inchangés). Ordre des colonnes générées : ordre des catégories puis des champs.
- **Écran Fiche patient** : un bloc par catégorie (supprimées visibles avec le filtre
  « Supprimés »), titre modifiable en place, flèches, « Supprimer » (absent pour une catégorie à
  date, désactivé avec infobulle si elle contient des champs actifs), « Restaurer » ;
  « Ajouter une catégorie » ; la popup d'un champ gagne une liste « Catégorie » ; partout
  « Archiver / Archivés » devient « Supprimer / Supprimés ».

## 6. Tests

- Migration (base jetable) : deux catégories par service, chaque champ rattaché selon son ancienne
  section, garde qui échoue sur un écart, `section` supprimée.
- API : `ensureDefaults` idempotent (deux lectures concurrentes → deux catégories, pas quatre) ;
  catégorie à date non supprimable ; catégorie non vide non supprimable ; déplacement d'un champ ;
  réordonnancement ; isolation entre services ; 403 pour un intervenant en écriture.
- Front : onglets dynamiques avec la date dans la bonne catégorie ; groupes de colonnes ; écran de
  configuration (ajouter, renommer, réordonner, supprimer, restaurer, déplacer un champ) ; libellés
  « Supprimer ».

## 7. Hors périmètre

- Onglets fixes configurables ; icônes choisies par catégorie ; déplacer les dates d'une catégorie
  à l'autre.
