# Navigation par échelle : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE : utiliser superpowers:subagent-driven-development
> pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe `- [ ]`.

**But :** une seule grammaire de navigation (les onglets de l'échelle courante dans la barre du
haut), un sélecteur qui liste toutes les destinations du compte, et trois écrans
(Soignants, Salles, Journal d'activité) rangés à l'échelle de l'établissement, là où leurs
données et leurs permissions les placent déjà.

**Architecture :** une table déclarative `navigation.ts` décrit les onglets par échelle et par
groupe. La barre la lit en déduisant l'échelle de la **route**. `accessibleDestinations(user)`
alimente à la fois le sélecteur d'échelle et `/choose-context`. Le back gagne deux choses : une
lecture de liste des salles sous le préfixe d'administration, et le journal d'activité à l'échelle
de l'établissement. Aucune permission ne change.

**Pile :** Front : React 19, Vite, TanStack Router/Query, Zustand, Radix + Tailwind, Vitest +
Testing Library. Back : Fastify 5, Prisma 7, Zod v4, Jest 30, wireit.

**Spec :** `docs/superpowers/specs/2026-09-28-navigation-par-echelle-design.md`

## Contraintes globales

- **Branche dédiée** `feat/navigation-par-echelle`, créée depuis `main`. Commits en français, à
  l'infinitif, comme l'historique.
- **Jamais de `git stash`.**
- **Le serveur de développement du front (port 4270) appartient à Léo** : ne pas le tuer, ne pas
  en lancer un second.
- **Postgres est sur 5433.** Ne jamais lancer `npm run prisma:migrate:reset` sans suffixe. Ce
  chantier n'a d'ailleurs **aucune migration**.
- **Porte de lint du front :** relever le nombre d'erreurs sur `main` à la tâche 0 ; la branche
  n'en ajoute aucune.
- **`routeTree.gen.ts` est généré** : ne jamais l'éditer à la main.
- **Invariant multi-tenant** (`root.layout.tsx`) : tout ce qui décide d'afficher un élément lié
  à un tenant se fonde sur la **correspondance de route**, jamais sur `useAuthStore().context`.

## Structure des fichiers

| Action | Fichier |
|---|---|
| Créer | `front/src/navigation/navigation.ts`, `navigation.test.ts` |
| Créer | `front/src/components/custom/scaleSelector.tsx`, `.test.tsx` (remplace `tenantSelector.tsx`) |
| Créer | `front/src/routes/_authenticated/e/$establishmentId/admin/{soignants,locations,activity-log}.tsx` (+ tests de garde) |
| Modifier | `front/src/components/navbar.tsx`, `navbar.test.tsx` |
| Modifier | `front/src/components/custom/sidebar/sidebar.tsx`, `sidebar.test.tsx` |
| Modifier | `front/src/utils/tenant-context.ts`, `tenant-context.test.ts`, `utils/legacy-redirect.ts` |
| Modifier | `front/src/routes/_authenticated/choose-context.tsx`, `choose-context.test.ts` |
| Modifier | `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings.tsx` |
| Remplacer par une redirection | `…/s/$serviceId/_settings/{soignant,location,activity-log}.tsx`, `routes/_authenticated/settings/{soignant,location,activity-log}.tsx` |
| Modifier | `front/src/api/location.api.ts`, `api/activityLog.api.ts`, `queries/` correspondantes |
| Supprimer | `establishmentAdminNav.tsx`, `superAdminNav.tsx`, `tenantSelector.tsx` (+ test), `popup/editSoignantThematicsForm.tsx` |
| Modifier | `front/src/columns/soignant.column.tsx` (colonne Thématiques retirée) |
| Modifier | `back/src/main/interfaces/http/fastify/routes/{location,tenant.routes,establishment-admin.routes}.ts` |
| Modifier | `back/src/main/interfaces/http/fastify/schemas/activityLog.schema.ts` |
| Modifier | `back/src/main/infra/orm/repositories/activityLog.repository.ts` |
| Modifier | `back/src/test/e2e/members.test.ts` (URL du journal) ; créer `back/src/test/e2e/activity-log-etablissement.test.ts`, `location-admin.test.ts` |
| Modifier | `front/CLAUDE.md` (arbre des routes), `docs/multi-tenant/habilitations.md` (libellés) |
| Créer | `docs/multi-tenant/decisions-navigation.md` |

## Review Focus

- La barre choisit l'échelle d'après la route. Aucun `context?.serviceId` ne doit rester dans
  une condition d'affichage de `navbar.tsx`.
- Le test de couverture de `navigation.test.ts` doit échouer quand on ajoute une route de
  section sans onglet. Le vérifier en en ajoutant une temporairement.
- Journal d'activité : la purge (`deleteOlderThan`) suit le nouveau périmètre de lecture. Avec
  le paramètre `serviceId`, elle ne purge que ce service ; sans, tout l'établissement.
- L'entrée Plateforme est **absente**, et non grisée, pour qui n'a pas `isSuperAdmin`.

---

## Task 0 : relevé de départ

- [ ] Créer la branche `feat/navigation-par-echelle`.
- [ ] Front : `npm test`, puis noter le nombre de fichiers et de tests ; `npm run lint`, puis
      noter le nombre d'erreurs ; `npm run build`.
- [ ] Back : `npm run test:unit`, puis `npm run test:e2e` ; noter les chiffres.
- [ ] Reporter les chiffres en tête de `docs/multi-tenant/decisions-navigation.md` (fichier à
      créer).

## Task 1 : back, lecture de la liste des salles sous l'administration

**Fichiers :** `back/src/main/interfaces/http/fastify/routes/location.ts`, nouveau
`back/src/test/e2e/location-admin.test.ts`.

- [ ] Écrire d'abord le test e2e. `GET /e/:e/admin/location` doit renvoyer 200 et la liste des
      salles de l'établissement à un ADMIN **sans affectation de service**, 403 à un
      COORDINATEUR, et ne jamais renvoyer les salles d'un autre établissement.
- [ ] Ajouter la route dans `locationAdminRouter`, avec `permission: 'locations:manage'` et le
      même schéma de réponse que la lecture de service. Suivre le patron de la route
      `GET '/'` de `soignantAdminRouter` (`soignant.ts:79`).
- [ ] `npm run test:e2e -- location-admin`, puis commit : « Exposer la liste des salles à
      l'administration d'établissement ».

## Task 2 : back, le journal d'activité à l'échelle de l'établissement

**Fichiers :** `activityLog.repository.ts`, `activityLog.schema.ts`, `tenant.routes.ts`,
`establishment-admin.routes.ts`, `members.test.ts`, nouveau
`activity-log-etablissement.test.ts`.

- [ ] Écrire d'abord le test e2e, avec deux services A et B dans un même établissement E et une
      ligne d'activité dans chacun, plus une ligne sans service :
  - un ADMIN sans service, sur `GET /e/E/admin/activity-log`, voit les trois lignes ;
  - avec `?serviceId=A`, il ne voit que la ligne de A ;
  - avec `?serviceId=<service d'un autre établissement>`, il reçoit une liste vide et jamais les
    lignes de l'autre établissement ;
  - `GET /e/E/s/A/activity-log` renvoie 404 : la route a quitté le préfixe de service ;
  - un COORDINATEUR reçoit 403 ;
  - `POST /e/E/admin/activity-log/cleanup` sans `serviceId` purge l'établissement E seulement.
- [ ] Dans le schéma, ajouter `serviceId: z.string().optional()` à `getActivityLogsQuerySchema`,
      et un schéma de requête facultatif `{ serviceId? }` pour `cleanup`.
- [ ] Dans le dépôt, remplacer le getter `serviceFilter` par une méthode
      `scopeFilter(serviceId?: string)` :
  - sous un contexte de service (`serviceId` du tenant non nul), garder l'ancien comportement
    (`OR: [{ serviceId }, { serviceId: null }]`) ; aucune route ne l'appelle plus, mais
    `deleteOlderThan` sous tenant reste cohérent ;
  - sous le contexte d'établissement, renvoyer `{}` sans paramètre, et `{ serviceId }` avec ;
  - réécrire le commentaire au-dessus : la raison « un écran monté sous un préfixe de service »
    ne s'applique plus, et l'intention vient de `habilitations.md`.
- [ ] `findMany` et `deleteOlderThan` reçoivent `serviceId` en paramètre.
- [ ] Déplacer `activityLogRouter` : le retirer de `tenant.routes.ts:180` et l'enregistrer dans
      `establishment-admin.routes.ts` sous `prefix: '/activity-log'`. Mettre à jour le commentaire
      de tête de `activityLog.ts`.
- [ ] Remplacer les deux URL `/e/${establishmentId}/s/${serviceId}/activity-log` de
      `members.test.ts` (lignes 142 et 664) par `/e/${establishmentId}/admin/activity-log`.
- [ ] Lancer `npm run test:unit`, `npm run test:e2e` et `npm run build`. Faire tourner aussi
      `permissions.test.ts` et `access-log-vocabulaire.test.ts`, qui citent `activity-log`.
- [ ] Commit : « Lire le journal d'activité à l'échelle de l'établissement ».

## Task 3 : front, la table de navigation

**Fichiers :** `front/src/navigation/navigation.ts`, `navigation.test.ts`.

- [ ] Écrire la table :

```ts
export type Scale = 'service' | 'establishment' | 'platform'
export type NavItem = {
  label: string
  to: string                       // chemin TanStack, ex. '/e/$establishmentId/admin/soignants'
  permission?: Permission          // absente = visible pour tout membre de l'échelle
  group: string                    // 'Quotidien' | 'Organisation' | 'Accès' | 'Ressources' | 'Traçabilité' | ''
}
export const NAVIGATION: Record<Scale, NavItem[]> = { … } // contenu : tableau de la spec
// Écrans d'objet, volontairement hors onglets — chacun avec sa raison.
export const HORS_ONGLETS: Record<string, string> = {
  '/e/$establishmentId/s/$serviceId/patient/$patientID': "écran d'objet (depuis la liste)",
  '/e/$establishmentId/s/$serviceId/patient/$patientID/acces': 'bouton dans la fiche patient',
  '/super-admin/$establishmentId': 'depuis la liste des établissements',
  …
}
export const scaleOfPath = (matchRoute): Scale | null => …
```

- [ ] Écrire les tests :
  - **Couverture** : chaque route feuille de `routeTree.gen.ts` sous
    `/e/$establishmentId/s/$serviceId`, `/e/$establishmentId/admin` et `/super-admin` figure dans
    `NAVIGATION` ou dans `HORS_ONGLETS`. Les fichiers de redirection sont exclus parce qu'ils
    n'ont pas de `component`. Pour vérifier que le test mord, ajouter temporairement une route
    factice : il doit échouer.
  - Chaque `permission` citée existe dans `permissions.ts`.
  - Aucune entrée d'échelle `service` ne porte une permission d'établissement, et inversement.
    Ce test est le verrou du défaut n° 3.
- [ ] Commit : « Décrire la navigation par échelle dans une table unique ».

## Task 4 : front, les destinations et le sélecteur d'échelle

**Fichiers :** `utils/tenant-context.ts` (+ test), `components/custom/scaleSelector.tsx` (+ test),
`choose-context.tsx` (+ test).

- [ ] Dans `tenant-context.ts`, ajouter `accessibleDestinations(user)`. Elle renvoie une liste
      ordonnée : pour chaque établissement, ses services accessibles, puis `{ kind: 'admin' }` si
      l'utilisateur l'administre ; à la fin, `{ kind: 'platform' }` si `isSuperAdmin`. Elle
      s'appuie sur `accessibleCouples` et `administeredEstablishments`, qui existent déjà.
- [ ] Tester les cas : membre d'un seul service (1 destination), ADMIN sans service (1),
      ADMIN + COORD d'un service (2), super-admin sans appartenance (1), multi-établissements.
- [ ] Écrire `ScaleSelector` à partir de `TenantSelector`, avec le même rendu de popover :
  - le libellé suit l'**échelle de la route** (`scaleOfPath`) : `Établ. › Service`,
    `Établ. › Administration` ou `Plateforme` ;
  - le composant n'est rendu que s'il y a au moins deux destinations ;
  - navigation : service vers `…/dashboard`, admin vers `…/admin/members`, plateforme vers
    `/super-admin` ;
  - dernière entrée, « Tous les accès… », vers `/choose-context`, pour que la page devienne
    atteignable par un geste volontaire.
- [ ] `choose-context.tsx` affiche `accessibleDestinations`, entrée Plateforme comprise.
      `beforeLoad` redirige vers `/pending` si la liste est vide, ce qui ajoute la plateforme au
      calcul actuel.
- [ ] Porter les cas de `tenantSelector.test.tsx` dans `scaleSelector.test.tsx`, puis supprimer
      les deux anciens fichiers.
- [ ] Commit : « Remplacer le sélecteur de service par un sélecteur d'échelle ».

## Task 5 : front, la barre du haut

**Fichiers :** `components/navbar.tsx`, `navbar.test.tsx`, `sidebar/sidebar.tsx`,
`sidebar.test.tsx`.

- [ ] Réécrire `Navbar` :
  - l'échelle vient de `scaleOfPath(useMatchRoute())` ;
  - rendre `NAVIGATION[scale]`, filtré par `useCan` (et par `isSuperAdmin` pour la plateforme),
    avec un séparateur vertical entre groupes ;
  - les paramètres de lien viennent de la route correspondante (`establishmentId`, `serviceId`),
    pas du store ;
  - garder un seul style d'onglet, sorti des quatre copies actuelles dans une constante ;
  - supprimer `SettingsMenu` et son interface exportée ;
  - `TodoSheet` reste gardé par `sousLayoutDeService`, tel quel, commentaire compris.
- [ ] Dans `sidebar.tsx`, retirer l'entrée « Super-administration » du menu du compte, puisqu'elle
      est désormais dans le sélecteur. Déplacer le commentaire d'absence avec elle.
- [ ] Réécrire `navbar.test.tsx`. Les cas qui visaient `SettingsMenu` deviennent :
  - un ADMIN sans service sur `admin/members` voit les 6 onglets d'établissement et aucun
    onglet de service (c'est le défaut n° 3, fermé) ;
  - un COORDINATEUR voit Planning, Thématiques et Diagnostics, mais ni Soignants, ni Salles, ni
    Journal ;
  - un INTERVENANT voit les 4 onglets quotidiens seulement ;
  - sur `/user/settings`, aucun onglet, même si le store porte un service (invariant) ;
  - `TodoSheet` : conserver les cas existants.
- [ ] Mettre à jour `sidebar.test.tsx` : l'entrée super-admin n'est plus dans le menu du compte.
- [ ] Commit : « Une seule barre d'onglets, celle de l'échelle courante ».

## Task 6 : front, Soignants à l'échelle de l'établissement

**Fichiers :** nouveau `admin/soignants.tsx` (+ test de garde), `columns/soignant.column.tsx`,
`queries/useSoignant.ts`.

- [ ] Créer la route `/_authenticated/e/$establishmentId/admin/soignants` :
  - `beforeLoad` : `resolveEstablishmentContext` puis `can(tenant, 'soignants:manage')`, sinon
    redirection vers `admin/members`, sur le patron de `admin/members.tsx` ;
  - données : `SoignantApi.getAllForEstablishment` (exposer une requête dédiée dans
    `useSoignant.ts` si elle n'existe pas).
- [ ] Retirer de `getSoignantColumns` la colonne Thématiques et ses paramètres `thematics` et
      `thematicOptions`. L'action d'édition ne modifie plus que le nom.
- [ ] Supprimer `editSoignantThematicsForm.tsx`. Vérifier par `grep` qu'il n'a plus
      d'importateur.
- [ ] Vérifier que `addSoignantForm.tsx` et `deleteSoignantForm.tsx` passent par
      `establishmentApiUrl` (c'est déjà le cas pour create, update et delete) et fonctionnent sans
      service en contexte.
- [ ] Test de garde : un ADMIN sans service y accède ; un COORDINATEUR est redirigé.
- [ ] Commit : « Ranger Soignants à l'échelle de l'établissement ».

## Task 7 : front, Salles à l'échelle de l'établissement

- [ ] `LocationApi.getAllForEstablishment` : `GET ${establishmentApiUrl()}/location` (tâche 1),
      plus la requête correspondante.
- [ ] Route `admin/locations.tsx` : même patron qu'à la tâche 6, gardée par `locations:manage`.
      Reprendre le contenu de `_settings/location.tsx`.
- [ ] Test de garde, puis commit : « Ranger Salles à l'échelle de l'établissement ».

## Task 8 : front, Journal d'activité à l'échelle de l'établissement

- [ ] `ActivityLogApi.getAll` et `cleanup` passent à `establishmentApiUrl()` et acceptent
      `serviceId`.
- [ ] Route `admin/activity-log.tsx`, gardée par `activity-log:read`. Reprendre
      `_settings/activity-log.tsx` et ajouter un filtre de service : « Tous les services » plus les
      services de l'établissement, lus sur l'API `services` de l'administration, déjà utilisée
      par `admin/services.tsx`.
- [ ] Libellés (défaut n° 5). Aujourd'hui, « Journal des accès » désigne **deux** écrans : le
      bouton et le titre de `patient/$patientID/acces.tsx` (`patientAccessLogButton.tsx`), et le
      titre de `super-admin/access-log.tsx`. Changements :
  - « Journal d'activité » : inchangé ;
  - le bouton et le titre de la fiche patient deviennent « Consultations du dossier ». Mettre à
    jour `patientAccessLogButton.test.tsx` ;
  - l'onglet et le titre de la plateforme deviennent « Journaux ».
- [ ] Test de garde, puis commit : « Ranger le journal d'activité à l'échelle de
      l'établissement ».

## Task 9 : front, redirections et nettoyage

- [ ] Remplacer le contenu de `…/s/$serviceId/_settings/{soignant,location,activity-log}.tsx` par
      une redirection vers `/e/$establishmentId/admin/{soignants,locations,activity-log}`, en
      **transmettant la chaîne de recherche** (voir `decisions-etape-2.md`).
- [ ] Dans `legacy-redirect.ts`, ajouter `redirectToDefaultAdmin(user, to)` : cible le premier
      établissement administré, sinon `/choose-context`. Brancher dessus
      `settings/{soignant,location,activity-log}.tsx`.
- [ ] Dans `_settings.tsx`, retirer `soignants:manage`, `locations:manage` et `activity-log:read`
      de `SETTINGS_PERMISSIONS`, et mettre à jour son commentaire.
- [ ] Supprimer `establishmentAdminNav.tsx` et `superAdminNav.tsx`, et leurs 6 importations dans
      `admin/{members,services,grants}.tsx` et `super-admin/{index,users,access-log}.tsx`.
      Adapter `members.render.test.tsx` et `super-admin-journey.test.tsx`, qui peuvent chercher le
      bandeau.
- [ ] Tests de redirection : chaque ancienne URL arrive sur la nouvelle, avec les paramètres de
      recherche conservés.
- [ ] Commit : « Rediriger les anciennes adresses et retirer les bandeaux d'onglets ».

## Task 10 : documentation

- [ ] `front/CLAUDE.md` : mettre à jour l'arbre des routes (section Routing) et décrire la table
      de navigation et son test de couverture.
- [ ] `docs/multi-tenant/habilitations.md` : libellés des journaux ; préciser que
      `activity-log:read` couvre tous les services de l'établissement, avec filtre.
- [ ] `docs/multi-tenant/decisions-navigation.md` : les six défauts, le choix de l'échelle, l'écart
      par rapport au menu latéral, le découpage de l'écran Soignants, l'élargissement du journal
      d'activité, et les chiffres avant/après.
- [ ] Commit : « Documenter la navigation par échelle ».

## Task 11 : vérification

- [ ] Front : `npm test`, `npm run build`, `npm run lint` (le nombre d'erreurs ne doit pas
      dépasser celui de la tâche 0). Back : `npm run test:unit`, `npm run test:e2e`,
      `npm run build`.
- [ ] Parcours manuel sur le serveur de Léo (4270), un compte par profil :
  - ADMIN sans service : atterrit sur Membres ; voit 6 onglets ; ouvre Soignants, Salles et le
    Journal ; le sélecteur n'apparaît pas (une seule destination).
  - ADMIN + COORDINATEUR d'un service : le sélecteur propose le service et l'administration ; le
    passage de l'un à l'autre remonte bien l'écran (pas de donnée d'un autre contexte).
  - COORDINATEUR : 7 onglets ; aucun accès aux trois écrans déplacés, même par URL tapée.
  - INTERVENANT : 4 onglets.
  - Super-admin : entrée Plateforme dans le sélecteur, 3 onglets ; un compte ordinaire n'en voit
    aucune trace.
  - Largeur : barre lisible à 1280 px pour un COORDINATEUR avec le panneau des tâches.
- [ ] Relecture de la branche par un agent qui ne l'a pas écrite, sur les quatre points du Review
      Focus.
