# Design : designs de PDF patient, composables à la toile libre

Date : 2026-10-14

## Problème

Le PDF du programme patient est entièrement codé en dur. `pages/cover-page.pdf.tsx` fixe le
titre (`SMCV`), le logo (`logo_chx-bdx.png`), les couleurs du titre et du sous-titre, la
géométrie du décor (rond en bas à gauche, deux jeux de lignes en diagonale) et la position du
nom du patient. `pages/tips-page.pdf.tsx` fixe le titre de la page, les quatre conseils et le
numéro de téléphone du service. Les seules valeurs dynamiques sont la couleur du rond
(`pathway.templateColor`), le nom du parcours et les dates du programme.

Dans une application multi-tenant, ces valeurs sont celles d'**un** service. Un second service
ne peut pas sortir son propre programme sans un déploiement.

## Ce qu'on construit

Une bibliothèque de **designs** de PDF patient. Un design est une suite ordonnée de pages, dont
chaque page composable est une **toile libre** : l'utilisateur pose ses éléments en x/y au point,
les redimensionne, les fait tourner, les superpose.

Des designs **presets** sont livrés en lecture seule et visibles par tous les services. Un
service les **duplique** pour obtenir une copie modifiable qui lui appartient. Au moment de
générer le PDF d'un patient, on **choisit** parmi les presets et les designs du service.

Les presets vivent en base et sont gérés par le super-admin : en ajouter un ou retoucher sa mise
en page ne demande pas de déploiement.

### Portée des pages

Les pages **calendrier** ne sont pas composables : elles rendent les créneaux du patient, semaine
par semaine, et restent produites par `pages/calendar-pages.pdf.tsx`. C'est de la donnée, pas de
la mise en page.

Un design est donc une liste de pages dont chacune est soit une toile libre, soit la page
calendrier. Ce choix ne coûte rien de plus que de câbler couverture–calendrier–conseils en dur —
`ProgrammePDF` boucle sur les pages et branche sur `page.kind` — et il donne gratuitement : deux
pages de couverture, aucune page de fin, les conseils avant le calendrier, des annexes.

## Contraintes vérifiées dans le dépôt

Quatre faits ont été vérifiés avant d'arrêter ce design. Chacun décide d'un point.

1. **`@react-pdf/renderer` 4.3.2 exporte `Svg`, `Ellipse`, `Rect`, `Line`.** Les formes ont donc
   un rendu exact disponible, sans contorsion de `borderRadius`.
2. **Aucun `Font.register` dans le dépôt.** On ne dispose que des polices intégrées au format
   PDF ; en pratique l'application n'utilise qu'Helvetica. Le sélecteur de police de l'éditeur
   ne proposera que celles-là.
3. **Zod n'est pas installé côté front**, et front/back ne partagent aucun fichier source
   (`permissions.ts` est dupliqué à l'identique, avec un test d'égalité).
4. **L'authentification est par cookie httpOnly** (`credentials: 'include'`,
   `@fastify/jwt` + `@fastify/cookie`), et **`@fastify/multipart` n'est pas installé.**

## Anatomie d'un design

Le contenu d'un design est **un seul document JSON**, pas des tables de pages et d'éléments. Un
élément n'est jamais interrogé seul : un design se lit et s'écrit toujours entier. Une colonne
`Json` validée par un schéma Zod suffit, et donne un seul éditeur et un seul moteur de rendu pour
les presets comme pour les designs de service.

```
PdfDesignContent   { version: 1, pages: PdfPage[] }

PdfPage            { kind: 'canvas', id, background, elements: PdfElement[] }
                 | { kind: 'calendar', id }

PdfElement         { id, x, y, w, h, rotation? } + l'un de :

  text     texte         runs: TextRun[], fontSize, fontFamily, bold, italic,
                         color, align, vAlign, lineHeight
  rect     rectangle     fill, radius
  ellipse  ellipse       fill
  image    image         source: { builtin: PdfBuiltinImage } | { assetId: string },
                         fit

TextRun            { text: string,          bold?, italic? }
                 | { field: PdfFieldKey,   bold?, italic? }

PdfFieldKey        'patient.name' | 'pathway.name' | 'program.dates' | 'service.name'

PdfFill            '#rrggbb' | { token: 'pathway.color', fallback: '#rrggbb' }

PdfBuiltinImage    'logo-chu' | 'lines'
```

### Trois corrections apportées par la transcription des pages réelles

En transcrivant `cover-page.pdf.tsx` et `tips-page.pdf.tsx` en données, trois défauts du modèle
ci-dessus sont apparus. Ils sont corrigés ci-dessus et expliqués ici.

**Il n'y a pas d'élément `field` : une donnée est un `TextRun`.** L'encadré de fin de la page
conseils enchaîne, dans un seul paragraphe, une phrase en gras puis une phrase normale — le code
actuel le fait par des `<Text>` imbriqués. Un style unique par boîte ne peut pas le reproduire
sans couper le paragraphe en deux boîtes, ce qui briserait l'enchaînement des lignes. Le texte
porte donc une suite de `runs`, et un run est soit du texte, soit une donnée. Un texte simple est
un run unique : une seule forme à rendre, pas une union.

Ce n'est pas un retour aux jetons `{{ }}` dans une chaîne, écartés pendant la conception : un run
de donnée est un objet typé, et l'inspecteur de l'éditeur propose « insérer une donnée » plutôt
que de laisser saisir un jeton. Le gain est que la donnée peut vivre **au milieu** d'une phrase,
ce dont l'encadré de fin a besoin pour le numéro de téléphone.

**`service.phone` n'existe pas et sort du jeu de données.** `Service` ne porte que `name`,
`stopReasonFieldKey` et `completedChoiceKey` : aucune colonne de téléphone. Plutôt que d'ajouter
une colonne, le numéro est du **texte** dans le design — il appartient à la copie que le service
édite de toute façon. Les quatre données restantes se résolvent toutes à partir de ce que la
modale a déjà en main.

**Les textes portent un `vAlign`.** Le nom du patient est aujourd'hui ancré en bas
(`bottom: 48`) et peut passer sur deux lignes ; sur une toile libre, une boîte de hauteur fixe
grandit vers le bas. Sans alignement vertical, un nom sur deux lignes descendrait sous la position
d'aujourd'hui. `vAlign` se rend par le `justifyContent` d'un `View` englobant, des deux côtés.

### Ce que le preset de référence n'utilise pas

« SMCV » reste du **texte littéral** dans le preset de référence, en couverture comme dans
l'encadré de fin, alors que `service.name` existe. C'est délibéré : la non-régression de l'étape 1
est l'objectif, et le nom exact du service en production n'est pas vérifiable d'ici. Un service
qui duplique le preset remplace le texte par la donnée s'il le souhaite.

`fill` accepte une couleur fixe ou `{ token: 'pathway.color', fallback: '#e6aff6' }` — le repli
reproduit `DEFAULT_CIRCLE_COLOR`, la couleur du rond quand le patient n'a pas de parcours.

### Décisions de forme

- **Les coordonnées sont en points**, l'unité native du PDF (A4 = 595,28 × 841,89 pt).
  L'éditeur rend à l'échelle `largeurDuCadre / 595,28`. Une conversion, dans un seul sens.
- **L'ordre dans le tableau est l'ordre de peinture.** Pas de champ `z` à garder cohérent avec
  l'ordre du tableau : « mettre au premier plan » déplace l'élément dans le tableau.
- **Un run de donnée rend sa phrase complète.** `program.dates` produit
  « Du 12/05 au 28/06/2026 », `patient.name` produit « NOM Prénom » — comme aujourd'hui. Pas
  trois éléments à aligner à la main pour une plage de dates. `pathway.name` reprend la chaîne de
  replis du code actuel : `templateName`, sinon `templateMainTag`, sinon « Programme ».
- Un seul endroit résout les données : `resolveField(key, ctx)`, une table clé → fonction, avec
  son test. Une donnée nouvelle = une entrée plus son cas de test, la convention de `MEASURES`
  (`utils/indicators/measures.ts`).

## Modèle de données

Trois tables. Le découpage est dicté par le tenant-guard : un modèle est de service,
d'établissement ou global, jamais deux à la fois — `tenant-guard.ts` tranche sur le **nom** du
modèle. Un `serviceId` nullable dans un modèle de `SERVICE_MODELS` rendrait les presets
invisibles, puisque le guard filtre sur le service courant.

```prisma
model PdfDesignPreset {        // GLOBAL — super-admin seul
  id         String    @id @default(cuid())
  name       String
  content    Json
  sortOrder  Int       @default(0)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}

model PdfDesign {              // SERVICE_MODELS — la copie modifiable du service
  id              String    @id @default(cuid())
  establishmentId String
  serviceId       String
  name            String
  content         Json
  sourcePresetId  String?   // mémoire de la copie, aucune synchro
  isDefault       Boolean   @default(false)
  archivedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  service Service @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])

  @@unique([id, serviceId])
  @@index([serviceId])
}

model PdfAsset {               // SERVICE_MODELS — les images déposées par le service (étape 4)
  id              String   @id @default(cuid())
  establishmentId String
  serviceId       String
  fileName        String
  mimeType        String
  bytes           Bytes
  createdAt       DateTime @default(now())

  service Service @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])

  @@unique([id, serviceId])
  @@index([serviceId])
}
```

**Dupliquer un preset** = lire la ligne globale, insérer un `PdfDesign` avec le même `content` et
`sourcePresetId` renseigné. **La copie est figée** : modifier un preset ensuite ne touche aucune
copie déjà faite. C'est ce qui rend « non modifiable pour tous » tenable — sinon chaque édition
de preset casserait les designs de tous les services.

**Pas de table d'assets globale.** Les presets n'utilisent que des images livrées avec
l'application (`source: { builtin }`) ; `logo_chx-bdx.png` et `lines.png` sont déjà dans le
dépôt. Dupliquer un preset n'a donc aucun asset à recopier.

**Archivage, pas suppression**, comme les quatre référentiels : `archivedAt`, et l'UI dit
« Supprimer » / « Supprimés » / « Restaurer ».

**Le nom d'un design n'est pas unique**, et c'est délibéré. `Thematic` et `Location` portent un
`@@unique([serviceId, name])`, mais `IndicatorSet` — le précédent le plus proche, un jeu nommé,
par service, archivable, posé en 2026-10 — ne le porte pas. Un design suit `IndicatorSet` pour
deux raisons : dupliquer deux fois le même preset produirait naturellement deux homonymes, qu'une
contrainte transformerait en 409 à résoudre à la main ; et une contrainte d'unicité couplée à
`archivedAt` fait qu'un design **supprimé continue de réserver son nom**. La duplication suffixe
donc le nom (« Programme SMCV (copie) », puis « (copie 2) ») au lieu d'échouer.

`Service` gagne deux relations, `pdfDesigns` et `pdfAssets`. Elles doivent entrer dans
`MODEL_RELATIONS` **des deux côtés** — sur les nouveaux modèles et sur `Service` — sinon le guard
refuse chaque requête qui les traverse (`tenant-guard-schema.test.ts` tient les deux sens).
`PdfDesignPreset`, global, n'a aucune relation : son entrée dans `MODEL_RELATIONS` est vide, et
il ne va ni dans `SERVICE_MODELS` ni dans `ESTABLISHMENT_MODELS`.

Deux comportements du guard, vérifiés, qui décident de deux étapes :

- **Sous contexte de tenant, un modèle global est lisible sans filtre.** `assertTenantScope`
  sort par `assertGlobalScope` dès que `family === 'global'`, avant la porte de permission. Un
  soignant peut donc lister les presets — c'est ce qui rend l'étape 1 possible.
- **Sous contexte super-admin, un modèle global absent de `SUPERADMIN_GLOBAL_OPERATIONS` est
  refusé en entier, lecture comprise.** L'étape 5 doit donc y déclarer `PdfDesignPreset` couple
  par couple (`findMany`, `findUnique`, `create`, `update`). Oublier cette déclaration rend
  l'écran super-admin inerte, sans que rien d'autre ne rougisse.

**Aucune nouvelle permission.** Un design est un référentiel de service : `referentials:write`
pour éditer (COORDINATEUR), `referentials:read` pour lister (accordée à tous les rôles par
`READ_ALL`, donc quiconque détient `pdf:export` peut choisir un design). Les presets passent par
`requireSuperAdmin`, qui ne consomme aucune permission de la matrice.

## Les deux moteurs de rendu

Un seul JSON, deux lecteurs. C'est le point sensible du choix de la toile libre, donc il est
traité de face.

```
front/src/components/custom/pdf-design/
  render-pdf.tsx        JSON -> react-pdf     (la sortie, la vérité)
  render-canvas.tsx     JSON -> divs HTML     (l'éditeur, une approximation)
  fields.ts             resolveField(key, ctx) -> string
  editor/
    use-drag-resize.ts  l'arithmétique de déplacement / redimensionnement / aimantation
    inspector.tsx       les propriétés de l'élément sélectionné
    layers.tsx          l'ordre de peinture
    toolbar.tsx         la palette et les actions
```

| élément | react-pdf | HTML |
|---|---|---|
| `text` | `<View>` (`justifyContent` = `vAlign`) + `<Text>`, un `<Text>` imbriqué par run | `<div>` en flex + `<span>` par run |
| `rect` | `<View>` + `backgroundColor` + `borderRadius` | idem en CSS |
| `ellipse` | `<Svg><Ellipse/></Svg>` | `border-radius: 50%` |
| `image` | `<Image src>` | `<img src>` |

**Il n'y a pas d'élément « filet ».** Le trait sous le titre de la couverture est, dans le code
actuel, un `View` de 4 pt de haut — c'est-à-dire un `rect` sans rayon. Un quatrième type pour ça
n'achèterait qu'une branche de plus dans chaque moteur et un formulaire de plus dans
l'inspecteur.

`text` et `rect` sont déjà prouvés dans `cover-page.pdf.tsx` : le rond est un `View` à
`borderRadius`, le filet un `View` de 4 pt. Seule l'ellipse non circulaire réclame le `Svg`.

**Pourquoi l'approximation reste honnête.** Les coordonnées sont en points et l'éditeur applique
un seul facteur d'échelle : positions et tailles sont exactes. Le seul écart réel est **les
métriques de texte** — l'Helvetica embarquée par react-pdf et l'Helvetica/Arial de Chrome ne
cassent pas les lignes au même endroit. Deux réponses :

1. Une bascule **« Aperçu PDF »** dans l'éditeur, qui remplace la toile HTML par le vrai
   `PDFViewer`. Gratuite : `PDFViewer` tourne déjà dans `programme-pdf-modal.tsx` et
   `planning-export-modal.tsx`.
2. Le jour où une police de marque est voulue : `Font.register` avec le `.woff2`, **la même
   fabrique** servie à react-pdf et au CSS de l'éditeur. Les métriques se mettent alors à
   coïncider mieux qu'avec les polices intégrées — enregistrer une police résout le problème au
   lieu de l'aggraver.

**Pas de bibliothèque de drag.** `@dnd-kit` est fait pour des listes triables, pas pour du x/y
libre avec poignées ; `react-rnd` fait le bon geste mais se bat contre le facteur d'échelle, qui
doit de toute façon diviser chaque delta de souris. Un hook maison sur les pointer events natifs
(`onPointerDown` + `setPointerCapture` + `onPointerMove`) couvre déplacement, les huit poignées
de redimensionnement et la rotation.

**Ce que l'éditeur sait faire**, et rien de plus : déposer un élément depuis la palette, le
déplacer, le redimensionner, le faire tourner, le dupliquer, le supprimer, le monter ou descendre
dans l'ordre de peinture, le pousser aux flèches (1 pt, 10 pt avec Maj), l'aimanter aux bords de
page, aux axes médians et aux arêtes des voisins, annuler et rétablir. L'annulation est une pile
d'instantanés du JSON : le document est petit, les patches inversibles ne se justifient pas.

**Les runs de donnée affichent un échantillon** dans l'éditeur (`DUPONT Jean`,
« Du 12/05 au 28/06/2026 »), jamais un vrai patient.

## Le contrat front/back

Zod n'étant pas côté front, le schéma Zod du back est l'autorité et valide chaque écriture ; le
front tient un type TypeScript dans `types/pdfDesign.ts`.

Je n'ajoute pas zod au front pour ça, et je ne monte pas de test de comparaison de fichiers : les
deux fichiers n'ont pas la même forme, la comparaison textuelle qui garde `permissions.ts` ne
s'applique pas ici.

> `ponytail:` plafond assumé — si le type front dérive du schéma back, l'éditeur produit un
> contenu que le back refuse en 400 à l'enregistrement. Échec bruyant et immédiat en
> développement, pas de corruption silencieuse. Si ça devient pénible : zod côté front et un
> schéma dupliqué, gardé comme `permissions.ts`.

## Images et upload

**Les images ne passent jamais par une URL dans `<Image src>`.** Ni react-pdf ni `<img>` ne
garantissent d'emporter le cookie d'authentification sur une sous-ressource cross-site — et en
développement le front et le back sont sur deux ports, donc cross-site. Le front récupère l'asset
par `fetchWithAuth`, le back répond `{ mimeType, base64 }`, le front construit la data URI et la
donne **aux deux moteurs**. Identique en développement et en production, mis en cache par
react-query sur `['pdf-asset', id]`, aucune dépendance aux sémantiques SameSite.

C'est aussi la raison pour laquelle le stockage objet (MinIO, déjà en service sur d'autres
projets) n'a pas été retenu pour cette étape : il aurait coûté des URL signées **plus** du CORS
sur le bucket, précisément parce que `<Image src>` ne peut pas porter le jeton. L'indirection
retenue — un élément image référence un `assetId`, jamais des octets — laisse le passage à MinIO
à un seul adaptateur près, sans toucher aux designs.

**L'upload ne passe pas par multipart.** Le front lit le fichier avec `FileReader` et poste du
base64 en JSON. Pas de `@fastify/multipart` à ajouter, et la taille maximale est un `.max()` du
schéma Zod — une borne déclarée plutôt qu'un plugin à configurer.

> `ponytail:` plafond assumé — ajouter une **image** à un preset demande un déploiement (une
> entrée `builtin` de plus), parce qu'il n'y a pas de table d'assets globale. Changer le texte ou
> la mise en page d'un preset, non. Si ça gêne : une table d'assets globale, servie par la même
> route.

## Routes

Routes de service, sous `tenant.routes.ts`, chacune avec son `config: { permission }` — le
serveur refuse de démarrer sinon.

```
GET    /pdf-designs               referentials:read    les designs du service + les presets
POST   /pdf-designs               referentials:write   depuis un preset (sourcePresetId) ou vierge
PUT    /pdf-designs/:id           referentials:write   name, content, isDefault
DELETE /pdf-designs/:id           referentials:write   archive
POST   /pdf-designs/:id/restore   referentials:write
POST   /pdf-assets                referentials:write   { fileName, mimeType, base64 } -> { id }
GET    /pdf-assets/:id            referentials:read    -> { mimeType, base64 }
```

Le `GET /pdf-designs` rend les deux listes d'un coup : l'écran d'administration et la modale de
génération ont tous deux besoin des presets **et** des designs du service. Un appel, pas deux.

Seul ce `GET` est nécessaire à l'étape 1 — le sélecteur de la modale n'y liste que des presets,
puisqu'aucun design de service ne peut encore exister. Les six autres routes arrivent avec
l'étape 2, sauf celles de `/pdf-assets`, qui arrivent avec l'étape 4.

Routes super-admin dans `back/src/main/interfaces/http/fastify/routes/super-admin/`, gardées par
`requireSuperAdmin`, hors de tout tenant : liste, création, modification, archivage des presets.

Côté front, aux conventions du dépôt — le tenant n'est jamais un argument d'un module d'API ou
d'une requête, les `queryKey` ne le portent pas (`conventions-tenant-api-queries.test.ts`) :

```
api/pdfDesign.api.ts      queries/usePdfDesign.ts
api/pdfAsset.api.ts       queries/usePdfAsset.ts
```

## Écrans

1. **`s/$serviceId/_settings/pdf-patient.tsx`** — la liste. Les presets en lecture seule avec un
   bouton **Dupliquer** ; les designs du service avec Renommer, Modifier, Définir par défaut,
   Supprimer ; l'onglet **Supprimés** avec Restaurer. Même forme que `thematic.tsx` et
   `location.tsx`, qui font déjà exactement ça en ~150 lignes.
2. **`s/$serviceId/_settings/pdf-patient.$designId.tsx`** — l'éditeur. Toile au centre, palette à
   gauche, inspecteur à droite, bande des pages en bas, bascule Aperçu PDF. Le seul gros morceau.
3. **L'écran super-admin des presets** — la même liste et le même éditeur, montés sur les routes
   hors tenant.

Dans **`programme-pdf-modal.tsx`**, un sélecteur de design remplace le menu « Pages
additionnelles ». Le design proposé à l'ouverture est le `isDefault` du service, sinon le premier
preset.

## Code supprimé

- `pdf/pages/cover-page.pdf.tsx` et `pdf/pages/tips-page.pdf.tsx` — reproduits par le preset de
  référence, dès l'étape 1.
- `pdf/optional-pages.ts` et `pdf/pages/test-page.pdf.tsx` (66 lignes, plan du 2026-06-16), plus
  la colonne « Pages additionnelles » de la modale. Un design porte ses pages ; un registre de
  pages optionnelles codé en dur n'a plus de sens à côté, et garder les deux mécanismes en
  parallèle est exactement ce que la refonte des jeux d'indicateurs a refusé de faire.

## Tests

Ce que les tests prouvent :

- **`use-drag-resize`** est de l'arithmétique pure — delta divisé par l'échelle,
  redimensionnement depuis chacune des huit poignées, aimantation. C'est là que seront les bugs,
  et c'est testable sans DOM. Le gros des tests front va sur ce réducteur, pas sur des clics
  simulés.
- **`resolveField`** : une table clé → attendu, avec les cas vides qui existent déjà (aucun
  parcours, aucun créneau donc aucune date).
- **Le schéma Zod** : refuse un `kind` inconnu, une coordonnée manquante, un base64 trop gros.
- **Le preset de référence est épinglé par un test** sur ses données — titre à telle position,
  telle taille, telle couleur. Une édition ultérieure ne peut pas le déplacer en silence.
- **E2E back** : un service ne lit pas le design d'un autre. Le tenant-guard le fait déjà ; la
  convention du dépôt est de l'écrire quand même.
- **Invariant `isDefault`** : en définir un décroche l'autre.
- Les trois modèles entrent dans `SERVICE_MODELS` (ou restent hors des deux ensembles pour le
  preset global) et dans `MODEL_RELATIONS` : `tenant-guard-schema.test.ts` rougit seul si on
  l'oublie.

Ce qu'aucun test ne prouvera : que le PDF sorti du moteur est **pixel pour pixel** celui
d'aujourd'hui. Un instantané d'octets de PDF est bruité (identifiants, horodatage), et comparer
deux arbres react-pdf de structures différentes ne dit rien. Cette vérification est visuelle,
côte à côte dans le navigateur, une fois, à l'étape 1.

## Déploiement

Deux migrations, purement additives, **aucune donnée à reprendre** : le PDF actuel est du code,
le preset le reproduit.

`PdfDesignPreset` et `PdfDesign` arrivent à l'étape 1 ; `PdfAsset` à l'étape 4, avec sa propre
migration. Créer une table trois étapes avant son premier usage n'achète rien — une migration
additive coûte le même prix plus tard.

Les presets arrivent par le seed (`prisma/seed/pdfDesignPreset.ts`) depuis une constante du back.
L'insertion doit être **sans écrasement** : un seed qui réécrirait le `content` à chaque
déploiement effacerait les retouches du super-admin, sans bruit. L'idiome du dépôt le fait déjà —
`seed/location.ts` utilise `upsert({ where, update: {}, create })`, dont l'`update` vide ne touche
pas une ligne existante. Le seed des presets reprend cette forme, sur un identifiant stable.

Aucune variable d'environnement, aucun credential, aucun plugin Fastify de plus.

## Découpage, cinq étapes livrables

**Étape 1 — le socle de rendu, sans éditeur.** Schéma Zod, types, `render-pdf.tsx`,
`resolveField`, les deux tables `PdfDesignPreset` et `PdfDesign`, le preset de référence seedé, `ProgrammePDF` qui boucle sur les
pages, le sélecteur de design dans la modale. L'élément `image` existe dès cette étape, en source
`builtin` seulement — le logo et les lignes en ont besoin. `cover-page.pdf.tsx` et
`tips-page.pdf.tsx` sont supprimés : le PDF d'aujourd'hui est produit par le moteur de données.
Rien n'est encore customisable, et c'est le but — le chemin critique passe en production et se
vérifie avant qu'on y greffe un éditeur.

**Étape 2 — l'éditeur, sur une page.** Toile, palette, inspecteur, déplacement,
redimensionnement, rotation, aimantation, ordre de peinture, annuler/rétablir, bascule Aperçu
PDF. Plus les routes de design et l'écran liste : Dupliquer, Renommer, Par défaut, Supprimer,
Restaurer. **L'étape qui livre la valeur** : un service duplique un preset et refait sa
couverture.

**Étape 3 — le multi-pages.** Ajouter, supprimer, réordonner des pages, insérer la page
calendrier, la bande de vignettes.

**Étape 4 — les images du service.** La migration `PdfAsset`, l'upload base64, la source
`assetId`.

**Étape 5 — l'écran super-admin des presets.** Le même éditeur, monté sur les routes hors tenant.

Un worktree, et les étapes mergées sur `main` au fur et à mesure plutôt qu'une branche de deux
mois.

**Un plan d'implémentation par étape**, écrit au moment d'attaquer l'étape. Cette spec couvre le
sous-système entier ; planifier les cinq étapes d'avance produirait un plan dont les trois
derniers quarts seraient réécrits après ce qu'on aura appris aux deux premiers.

## Hors périmètre

- Le PDF du planning (`components/custom/planning/pdf/`) : un autre document, un autre besoin.
- Les pages calendrier : leur mise en page reste du code.
- Le stockage objet (MinIO) pour les assets : l'indirection par `assetId` le laisse accessible,
  ce design ne le fait pas.
- Une table d'assets globale pour les presets.
- Les polices de marque (`Font.register`) : la voie est décrite, elle n'est pas prise ici.
- La synchronisation d'un preset vers les copies déjà faites : délibérément absente.
