# Étape 4b — traçabilité des consultations : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe `- [ ]`.

**But :** rendre l'application capable de répondre à « qui a ouvert le dossier de cette
personne, et quand », et fermer le dernier trou d'isolation du garde-fou d'ORM.

**Architecture :** une table `PatientAccessLog` de famille *service*, écrite par un crochet
Fastify posé sur le greffon de routes — pas sur les routes — avec un garde-fou de démarrage qui
refuse de démarrer si une route de lecture de dossier échappe au dispositif. Trois routes de
lecture (service, établissement, plateforme) et une purge paramétrable commune aux deux journaux.

**Pile :** Node 24, Fastify 5, Awilix, Prisma 7 (`prisma-client`, `@prisma/adapter-pg`), Zod v4
via `fastify-type-provider-zod`, Jest 30 + `@swc/jest`, Biome, wireit. Front : React 19, Vite,
TanStack Router/Query, Zustand, Radix + Tailwind, Vitest + Testing Library.

**Spec :** `docs/superpowers/specs/2026-09-27-multi-tenant-etape-4b-tracabilite-design.md`

## Contraintes globales

- **Postgres est sur le port 5433.** Un conteneur d'un autre projet occupe 5432.
- **Ne jamais lancer `npm run prisma:migrate:reset` sans suffixe** : il vise la base de
  développement `medisync` et la détruit.
- **Ne jamais élever `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`** : cette variable existe pour
  exiger le consentement d'un humain.
- **Jamais de `git stash`** : la pile est partagée avec d'autres worktrees et d'autres sessions.
- **Le serveur de développement du front tourne sur le port 4270 et n'appartient à personne
  d'autre que Léo** : ne pas le tuer, ne pas en lancer un second.
- **Aucun jeton, secret ni adresse réelle dans un rapport ou un document.**
- **Le journal ne porte aucun contenu clinique, jamais.** Les quatre clés cliniques sont `notes`,
  `details`, `medicalDiagnosis`, `transmissionNotes`.
- **`npm run build` ne typecheck que `src/main`** (plus `prisma/` et `back/scripts/`), pas
  `src/test`. Ne jamais écrire « aucune erreur de type » sans le préciser.
- **La porte de lint du front est rouge avant ce chantier** : 32 erreurs sur 11 fichiers, aucune
  dans les fichiers de l'étape 4a. Ne pas la réparer ; ne pas en ajouter.
- **Chiffres de départ** : back **449 unitaires / 210 e2e** ; front **47 fichiers / 224 tests**.
- **Prisma est paresseux** : `runAsX(() => prisma.x.op())` sans `await` **à l'intérieur** du
  rappel s'exécute hors du contexte `AsyncLocalStorage`, et le garde-fou lit le tenant ambiant.
  Ce piège a coûté plusieurs tours de correction à l'étape 4a.
- **Tout `.catch` qui avale une erreur** est un endroit où un resserrement du garde-fou se
  convertit en dégradation silencieuse. Un `catch` journalise **la classe** de l'erreur, jamais
  son message brut, qui recopierait le `data` de l'écriture ratée.
- **Un test doit rougir pour SA raison.** Le sabotage étroit prime : un sabotage large rougit
  souvent pour une autre raison et ne prouve rien.

## Structure des fichiers

**Back — créés**

| Fichier | Responsabilité |
|---|---|
| `prisma/migrations/<horodatage>_patient_access_log/migration.sql` | la table, ses index, ses clés étrangères |
| `src/main/domain/patientAccessLog.domain.ts` | écrire une ligne, lire les trois périmètres |
| `src/main/types/domain/patientAccessLog.domain.interface.ts` | son contrat |
| `src/main/infra/orm/repositories/patientAccessLog.repository.ts` | l'accès Prisma, scopé par le tenant |
| `src/main/types/infra/orm/repositories/patientAccessLog.repository.interface.ts` | son contrat |
| `src/main/interfaces/http/fastify/schemas/patientAccessLog.schema.ts` | les schémas Zod |
| `src/main/interfaces/http/fastify/routes/patientAccessLog.ts` | la route de service |
| `src/main/interfaces/http/fastify/routes/super-admin/access-log.ts` | la route plateforme |
| `src/main/utils/access-log-routes.ts` | la liste déclarée des routes journalisées et exemptées |

**Back — modifiés**

`prisma/schema.prisma` · `src/main/infra/orm/tenant-guard.ts` ·
`src/main/interfaces/http/fastify/plugins/tenant.plugin.ts` ·
`src/main/interfaces/http/fastify/routes/tenant.routes.ts` ·
`src/main/interfaces/http/fastify/routes/establishment-admin.routes.ts` ·
`src/main/interfaces/http/fastify/routes/super-admin.routes.ts` ·
`src/main/interfaces/http/fastify/routes/index.ts` · `src/main/utils/permissions.ts` ·
`src/main/utils/app-event-bus.ts` · `src/main/services/activity-log.subscriber.ts` ·
`src/main/domain/activityLog.domain.ts` · `src/main/domain/user.domain.ts` ·
`src/main/application/config.ts` · `src/main/application/starter.ts` ·
`src/main/application/ioc/awilix/awilix-ioc-container.ts` · `src/main/types/application/ioc.ts`

**Front — créés**

`src/api/accessLog.api.ts` · `src/queries/useAccessLog.ts` · `src/types/accessLog.ts` ·
`src/columns/accessLog.column.tsx` ·
`src/routes/_authenticated/e/$establishmentId/s/$serviceId/patient/$patientID/acces.tsx` ·
`src/routes/_authenticated/super-admin/access-log.tsx`

**Front — modifiés**

`src/utils/permissions.ts` · `src/components/custom/superAdmin/superAdminNav.tsx`

---

## Review Focus

Les cinq classes d'entrée que la spécification implique, qu'aucune tâche n'exercerait
spontanément, et qui mordraient une vraie personne. Chacune reçoit son test dans la tâche qui
porte le code.

1. **Une réponse en erreur (404, 403) ne doit jamais écrire de ligne d'accès** — sinon un
   attaquant qui énumère des identifiants remplit le journal de consultations qui n'ont pas eu
   lieu, et un dossier inexistant paraît consulté. *Tâche 3.*
2. **Un export sans résultat, ou filtré à zéro dossier, doit quand même écrire sa ligne** —
   « quelqu'un a tenté d'exporter » est l'information, pas « des dossiers sont sortis ». *Tâche 4.*
3. **Une purge configurée à une valeur absurde** (zéro, négative, non numérique) doit faire
   échouer le démarrage, pas effacer le journal au premier passage. *Tâche 8.*
4. **Un patient supprimé** : ses lignes d'accès suivent-elles ? La cascade efface l'historique de
   consultation au moment précis où il devient intéressant. *Tâche 1 — le choix doit être écrit.*
5. **Le crochet s'exécute sur une route de service dont le contexte n'a pas été résolu**
   (chemin d'erreur) : `request.tenant` est optionnel par construction et vaut `undefined`. Écrire
   sans tenant lèverait, et remplacerait le corps de la réponse par une erreur interne. *Tâche 3.*

---

## Tâche 1 : la table et sa déclaration au garde-fou

**Fichiers**
- Créer : `prisma/migrations/<horodatage>_patient_access_log/migration.sql`
- Modifier : `prisma/schema.prisma`, `src/main/infra/orm/tenant-guard.ts`
- Test : `src/test/unit/infra/tenant-guard-schema.test.ts`,
  `src/test/unit/migrations/schema-migrations-drift.test.ts`

**Interfaces**
- Produit : le modèle `PatientAccessLog` (famille service), l'entrée `Patient.accessLogs` dans
  `MODEL_RELATIONS` avec sa cardinalité, et l'entrée `PatientAccessLog` avec ses relations.

- [ ] **Étape 1 : écrire le modèle Prisma**

Dans `prisma/schema.prisma`, sur le modèle exact de `PatientServiceFile` (clés composites,
`@@unique([id, serviceId])`) :

```prisma
model PatientAccessLog {
  id              String @id @default(cuid())
  establishmentId String
  serviceId       String
  patientId       String

  userID        String
  userFirstName String?
  userLastName  String?

  action        String
  exportCount   Int?
  exportFilters String?

  createdAt DateTime @default(now())

  patient Patient @relation(fields: [patientId, establishmentId], references: [id, establishmentId], onDelete: Cascade)
  service Service @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])

  @@unique([id, serviceId])
  @@index([patientId])
  @@index([createdAt])
  @@index([establishmentId, serviceId])
}
```

Ajouter `accessLogs PatientAccessLog[]` au modèle `Patient` et `accessLogs PatientAccessLog[]` au
modèle `Service`.

**La cascade est une décision, pas un défaut.** `onDelete: Cascade` depuis `Patient` efface
l'historique de consultation quand le dossier est supprimé. Écrire dans le schéma, en commentaire,
le motif retenu et son coût : conserver les lignes après suppression du patient laisserait un
journal qui désigne un dossier qui n'existe plus, et `patientId` deviendrait une clé morte ;
les effacer perd la trace de qui l'avait consulté avant sa suppression — mais cette suppression
est elle-même journalisée dans `ActivityLog` (`patient.deleted`), avec son auteur. **Si
l'implémenteur juge l'autre choix meilleur, qu'il le dise au lieu de suivre celui-ci.**

- [ ] **Étape 2 : créer la migration sans l'appliquer**

```bash
cd back && npm run prisma:migrate:create
```

Relire le SQL produit : il doit être **purement additif** — un `CREATE TABLE`, trois `CREATE
INDEX`, un `CREATE UNIQUE INDEX`, deux `ALTER TABLE ... ADD CONSTRAINT`. Aucun `DROP`, aucun
`DELETE` réel (les `ON DELETE` des clés étrangères n'en sont pas), aucune colonne `NOT NULL`
ajoutée à une table existante.

- [ ] **Étape 3 : écrire le test de dérive, le montrer rouge**

Le test `schema-migrations-drift.test.ts` existe déjà et compare le schéma aux migrations. Le
lancer avant de déclarer le modèle au garde-fou :

```bash
cd back && npx jest -c src/test/jest.config.ts src/test/unit/migrations/schema-migrations-drift.test.ts
```

Attendu : **vert** (le schéma et la migration sont cohérents). Puis lancer le test du garde-fou :

```bash
cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/tenant-guard-schema.test.ts
```

Attendu : **ROUGE**, sur le modèle `PatientAccessLog` absent de `MODEL_RELATIONS` et absent des
familles. Noter le message exact.

- [ ] **Étape 4 : déclarer au garde-fou**

Dans `src/main/infra/orm/tenant-guard.ts` :
- ajouter `'PatientAccessLog'` à `SERVICE_MODELS` ;
- ajouter dans `MODEL_RELATIONS` l'entrée du nouveau modèle, `{ patient: one('Patient'), service:
  one('Service') }` ;
- ajouter `accessLogs: many('PatientAccessLog')` aux entrées `Patient` et `Service`.

Ne rien ajouter à `NESTED_RELATIONS` : aucune écriture imbriquée ne vise ce modèle.

- [ ] **Étape 5 : les deux tests au vert**

```bash
cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/
```

Attendu : PASS. Puis saborder la cardinalité (`one('Patient')` → `many('Patient')`) et vérifier
que le test **nommé** de cardinalité rougit — pas seulement un test voisin.

- [ ] **Étape 6 : commit**

```bash
git add back/prisma back/src/main/infra/orm/tenant-guard.ts
git commit -m "Ajouter la table du journal des consultations et la declarer au garde-fou"
```

---

## Tâche 2 : le dépôt et le domaine d'écriture

**Fichiers**
- Créer : `src/main/infra/orm/repositories/patientAccessLog.repository.ts`,
  `src/main/types/infra/orm/repositories/patientAccessLog.repository.interface.ts`,
  `src/main/domain/patientAccessLog.domain.ts`,
  `src/main/types/domain/patientAccessLog.domain.interface.ts`
- Modifier : `src/main/application/ioc/awilix/awilix-ioc-container.ts`,
  `src/main/types/application/ioc.ts`
- Test : `src/test/unit/domain/patientAccessLog.domain.test.ts`

**Interfaces**
- Consomme : `PatientAccessLog` (tâche 1), `tenantContext.scope()`.
- Produit :
  - `PatientAccessLogDomain.record(input: RecordAccessInput): Promise<void>`
  - `type RecordAccessInput = { patientId: string; userID: string; userFirstName: string | null;
    userLastName: string | null; action: AccessAction; exportCount?: number; exportFilters?: string }`
  - `type AccessAction = 'dossier.ouvert' | 'sousDossier.ouvert' | 'export'`

- [ ] **Étape 1 : écrire le test qui interdit tout contenu clinique**

```ts
describe('PatientAccessLogDomain.record', () => {
  it("refuse d'ecrire une ligne dont les filtres portent une cle clinique", async () => {
    const repository = { create: jest.fn() }
    const domain = new PatientAccessLogDomain({ patientAccessLogRepository: repository } as never)

    await expect(
      domain.record({
        patientId: 'p1',
        userID: 'u1',
        userFirstName: null,
        userLastName: null,
        action: 'export',
        exportFilters: JSON.stringify({ search: 'dupont', notes: 'texte clinique' }),
      }),
    ).rejects.toThrow(/clinique/i)

    expect(repository.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Étape 2 : le montrer rouge**

```bash
cd back && npx jest -c src/test/jest.config.ts src/test/unit/domain/patientAccessLog.domain.test.ts
```

Attendu : ROUGE, `Cannot find module '.../patientAccessLog.domain'`.

- [ ] **Étape 3 : écrire le dépôt**

Sur le modèle de `service.repository.ts` : le constructeur reçoit `tenantContext`, **aucune
lecture de scope au constructeur**, `scope()` appelé par méthode. Le type d'entrée **omet
`establishmentId` et `serviceId`** — c'est le dépôt qui les pose, jamais l'appelant.

- [ ] **Étape 4 : écrire le domaine**

`record` vérifie `exportFilters` contre les quatre clés cliniques (`notes`, `details`,
`medicalDiagnosis`, `transmissionNotes`), lève si l'une y figure, puis appelle le dépôt.
L'enregistrement au conteneur Awilix va dans `awilix-ioc-container.ts` **et** dans le type
`IocContainer` — les deux, sinon la résolution échoue au démarrage.

- [ ] **Étape 5 : au vert, puis sabotage étroit**

```bash
cd back && npx jest -c src/test/jest.config.ts src/test/unit/domain/patientAccessLog.domain.test.ts
```

Attendu : PASS. Puis retirer **la seule clé `notes`** de la liste vérifiée (pas la vérification
entière) et confirmer que le test rougit : c'est le sabotage étroit.

- [ ] **Étape 6 : commit**

```bash
git add back/src/main back/src/test
git commit -m "Ecrire le journal des consultations, sans jamais son contenu clinique"
```

---

## Tâche 3 : le crochet, son attache et le garde-fou de démarrage

**C'est la tâche qui porte la propriété centrale du chantier.** Une route neuve est couverte par
défaut, ou le serveur refuse de démarrer.

**Fichiers**
- Créer : `src/main/utils/access-log-routes.ts`
- Modifier : `src/main/interfaces/http/fastify/plugins/tenant.plugin.ts`,
  `src/main/interfaces/http/fastify/routes/tenant.routes.ts`
- Test : `src/test/unit/interfaces/access-log-hook.test.ts`,
  `src/test/e2e/patient-access-log.test.ts`

**Interfaces**
- Consomme : `PatientAccessLogDomain.record` (tâche 2).
- Produit : `recordPatientAccess` (décorateur `onResponse`), `assertPatientReadLogged`
  (`onRoute`), `LOGGED_PATIENT_ROUTES` et `EXEMPTED_PATIENT_ROUTES` (`access-log-routes.ts`).

- [ ] **Étape 1 : écrire la liste déclarée**

Dans `src/main/utils/access-log-routes.ts`, **chaque exemption porte sa raison en clair** :

```ts
// Les routes de lecture qui designent un dossier identifie. Toute route de service dont l'URL
// porte `:patientID` doit figurer dans l'une des deux listes, ou le serveur refuse de demarrer
// (voir assertPatientReadLogged). Les deux listes sont comparees aux routes REELLES, dans les
// deux sens : une entree morte echoue aussi.
export const LOGGED_PATIENT_ROUTES: Record<string, AccessAction> = {
  '/e/:establishmentId/s/:serviceId/patient/:patientID': 'dossier.ouvert',
  '/e/:establishmentId/s/:serviceId/patient/:patientID/service-file': 'sousDossier.ouvert',
}

export const EXEMPTED_PATIENT_ROUTES: Record<string, string> = {
  '/e/:establishmentId/s/:serviceId/patient/:patientID/pathways':
    "appelee par l'ecran du dossier en meme temps que l'ouverture : la journaliser doublerait chaque ligne sans rien apprendre",
  '/e/:establishmentId/s/:serviceId/patient/:patientID/pathway/:pathwayID/appointments-count':
    'rend un nombre, aucune identite, aucun contenu',
}
```

**Ces deux listes sont un point de départ, pas la vérité.** Les reconstruire depuis les routes
réelles avec `fastify.printRoutes()` au moment d'écrire le garde-fou, et **signaler tout écart**
au lieu de recopier.

- [ ] **Étape 2 : écrire le test du garde-fou de démarrage, le montrer rouge**

```ts
it('refuse de demarrer si une route de service portant :patientID n est ni journalisee ni exemptee', async () => {
  const app = await buildTestApp({
    extraRoutes: (fastify) => {
      fastify.get('/e/:establishmentId/s/:serviceId/patient/:patientID/inedite', {
        config: { permission: 'patient:read' },
      }, () => ({}))
    },
  })
  await expect(app.ready()).rejects.toThrow(/inedite/)
})
```

Attendu : ROUGE — aujourd'hui le serveur démarre sans broncher.

- [ ] **Étape 3 : écrire le test des trois cas de la Review Focus, les montrer rouges**

```ts
it("n ecrit aucune ligne quand la reponse est une erreur", async () => {
  const avant = await testDb.patientAccessLog.count()
  const res = await testApp.app.inject({
    method: 'GET',
    url: `/e/${etab.id}/s/${service.id}/patient/cinconnu000000000000000000`,
    cookies,
  })
  expect(res.statusCode).toBe(404)
  expect(await testDb.patientAccessLog.count()).toBe(avant)
})

it("n ecrit aucune ligne, et ne casse pas la reponse, quand le tenant n a pas ete resolu", async () => {
  // Route de service appelee sans appartenance : la resolution repond 404 AVANT le handler,
  // donc `request.tenant` vaut undefined quand le crochet s execute.
  const res = await testApp.app.inject({
    method: 'GET',
    url: `/e/${autreEtab.id}/s/${autreService.id}/patient/${patient.id}`,
    cookies,
  })
  expect(res.statusCode).toBe(404)
  expect(res.json()).not.toHaveProperty('stack')
})
```

- [ ] **Étape 4 : écrire le crochet**

Un décorateur `recordPatientAccess` posé en `onResponse` dans `tenant.plugin.ts`, attaché par
`fastify.addHook('onResponse', fastify.recordPatientAccess)` dans `tenant.routes.ts`, à côté des
deux crochets cliniques existants.

Le crochet : sort si `reply.statusCode >= 400` ; sort si `request.tenant` est absent ; lit
l'action dans `LOGGED_PATIENT_ROUTES` par `request.routeOptions.url`, sort si absente ; lit
`request.params.patientID` ; appelle `record`. Le `catch` journalise **la classe** de l'erreur,
jamais son message.

Et `assertPatientReadLogged` en `onRoute`, sur le greffon de tenant : toute route `GET` dont
l'URL porte `:patientID` et qui n'est dans aucune des deux listes fait échouer le démarrage, avec
un message qui **nomme la route et les deux listes**.

- [ ] **Étape 5 : au vert, puis trois sabotages étroits**

```bash
cd back && rm -rf .wireit && npm run test:unit -- --ci && npm run test:e2e -- --ci
```

Puis, un par un, en restaurant à chaque fois : retirer le test `statusCode >= 400` → le test
d'erreur rougit seul ; retirer le test `request.tenant` → le test du tenant non résolu rougit
seul ; vider `EXEMPTED_PATIENT_ROUTES` → le garde-fou de démarrage rougit en nommant `/pathways`.

- [ ] **Étape 6 : commit**

```bash
git add back/src/main back/src/test
git commit -m "Journaliser l ouverture d un dossier par crochet, et refuser de demarrer sans couverture"
```

---

## Tâche 4 : l'export, tracé en une ligne

**Fichiers**
- Modifier : `src/main/utils/access-log-routes.ts`,
  `src/main/interfaces/http/fastify/plugins/tenant.plugin.ts`
- Test : `src/test/e2e/patient-access-log.test.ts`

**Interfaces**
- Consomme : `RecordAccessInput` (tâche 2), le crochet (tâche 3).

- [ ] **Étape 1 : écrire les deux tests, les montrer rouges**

```ts
it('trace un export en UNE ligne, avec le nombre de dossiers et les criteres', async () => {
  await testApp.app.inject({
    method: 'GET',
    url: `/e/${etab.id}/s/${service.id}/patient/export?search=dup`,
    cookies,
  })
  const lignes = await testDb.patientAccessLog.findMany({ where: { action: 'export' } })
  expect(lignes).toHaveLength(1)
  expect({ count: lignes[0]?.exportCount, filtres: lignes[0]?.exportFilters }).toEqual({
    count: 2,
    filtres: JSON.stringify({ search: 'dup' }),
  })
})

// Review Focus n°2.
it('trace un export qui ne rend aucun dossier', async () => {
  await testApp.app.inject({
    method: 'GET',
    url: `/e/${etab.id}/s/${service.id}/patient/export?search=personne-de-ce-nom`,
    cookies,
  })
  const lignes = await testDb.patientAccessLog.findMany({ where: { action: 'export' } })
  expect(lignes).toHaveLength(1)
  expect(lignes[0]?.exportCount).toBe(0)
})
```

**La fixture doit porter au moins deux patients dont un seul correspond au filtre**, sinon le
`count: 2` est vrai par vacuité.

- [ ] **Étape 2 : implémenter**

`/export` n'a pas de `:patientID` : le crochet le reconnaît par son URL et écrit une ligne dont
`patientId`… **n'existe pas**. C'est le point à trancher, et l'implémenteur doit le nommer : soit
`patientId` devient nullable (et la clé étrangère avec), soit l'export va dans `ActivityLog`
plutôt que dans `PatientAccessLog`. **La spécification n'a pas vu ce conflit.** Choisir, écrire le
motif et le coût, et le signaler dans le rapport plutôt que de le résoudre en silence.

- [ ] **Étape 3 : au vert, sabotage étroit**

Forcer `exportCount` à la longueur du filtre plutôt qu'au nombre de dossiers : le premier test
doit rougir sur le nombre, pas sur la forme.

- [ ] **Étape 4 : commit**

```bash
git add back/src/main back/src/test
git commit -m "Tracer l export en une ligne, avec son nombre de dossiers et ses criteres"
```

---

## Tâche 5 : les deux routes de lecture du tenant

**Fichiers**
- Créer : `src/main/interfaces/http/fastify/routes/patientAccessLog.ts`,
  `src/main/interfaces/http/fastify/schemas/patientAccessLog.schema.ts`
- Modifier : `src/main/utils/permissions.ts`, `front/src/utils/permissions.ts`,
  `src/main/interfaces/http/fastify/routes/tenant.routes.ts`,
  `src/main/interfaces/http/fastify/routes/establishment-admin.routes.ts`
- Test : `src/test/e2e/patient-access-log.test.ts`,
  `src/test/unit/utils/permissions.test.ts`

**Interfaces**
- Produit : `GET /e/:establishmentId/s/:serviceId/patient/:patientID/acces` et
  `GET /e/:establishmentId/admin/patients/:patientID/acces` ; la permission `accessLog:read`.

- [ ] **Étape 1 : la permission dans les deux matrices**

Un test existant exige que `back/src/main/utils/permissions.ts` et
`front/src/utils/permissions.ts` soient identiques. Ajouter `accessLog:read` à `COORDINATEUR` et à
`ADMIN`, **dans les deux fichiers**. Lancer d'abord avec un seul des deux modifié, et vérifier que
le test de miroir rougit — c'est la preuve qu'il tient.

- [ ] **Étape 2 : écrire le test de périmètre, le montrer rouge**

```ts
it('un coordinateur ne voit que les acces de SON service', async () => {
  const res = await testApp.app.inject({
    method: 'GET',
    url: `/e/${etab.id}/s/${serviceA.id}/patient/${patient.id}/acces`,
    cookies: cookiesCoordinateurA,
  })
  expect(res.statusCode).toBe(200)
  expect(res.json().map((l: { serviceId: string }) => l.serviceId)).toEqual([serviceA.id])
})

it("un admin d etablissement voit les acces de TOUS les services de son etablissement", async () => {
  const res = await testApp.app.inject({
    method: 'GET',
    url: `/e/${etab.id}/admin/patients/${patient.id}/acces`,
    cookies: cookiesAdmin,
  })
  expect(new Set(res.json().map((l: { serviceId: string }) => l.serviceId)))
    .toEqual(new Set([serviceA.id, serviceB.id]))
})
```

**Fixture obligatoire** : deux services réellement peuplés, chacun avec au moins un accès au même
patient. Avec un seul service, le second test est vrai par vacuité.

- [ ] **Étape 3 : implémenter**

La route de service passe par le dépôt scopé — le cloisonnement vient du `scope()`, pas d'un
filtre écrit à la main. La route d'administration lit à l'échelle de l'établissement
(`establishmentScope()`). **Aucune des deux ne rend de contenu clinique** : le schéma Zod de
réponse ne porte que l'auteur, l'action, la date, le service.

- [ ] **Étape 4 : au vert, sabotage étroit**

Remplacer `scope()` par `establishmentScope()` dans le dépôt de la route de service : le premier
test doit rougir en montrant les deux services.

- [ ] **Étape 5 : commit**

```bash
git add back front/src/utils/permissions.ts
git commit -m "Lire le journal des acces a un dossier, par service et par etablissement"
```

---

## Tâche 6 : la route plateforme du super-admin

**Elle ferme deux trous de l'étape 4a** : les lignes du script d'amorçage
(`establishmentId: null`) n'étaient lisibles par aucune route, et aucune route ne lisait le
journal à l'échelle de la plateforme.

**Fichiers**
- Créer : `src/main/interfaces/http/fastify/routes/super-admin/access-log.ts`
- Modifier : `src/main/infra/orm/tenant-guard.ts`,
  `src/main/interfaces/http/fastify/routes/super-admin.routes.ts`
- Test : `src/test/e2e/super-admin-access-log.test.ts`

**Interfaces**
- Produit : `GET /super-admin/access-log`, filtrable par établissement, par compte et par action.

- [ ] **Étape 1 : écrire le test, le montrer rouge**

```ts
it('rend les lignes du script d amorcage, que nulle autre route ne peut lire', async () => {
  await testDb.activityLog.create({
    data: { userID: 'cli:bootstrap-super-admin', action: 'superAdmin.granted',
            entityType: 'user', entityID: compte.id },
  })
  const res = await testApp.app.inject({
    method: 'GET', url: '/super-admin/access-log?source=activite', cookies: cookiesSuperAdmin,
  })
  expect(res.statusCode).toBe(200)
  expect(res.json().some((l: { userID: string }) => l.userID === 'cli:bootstrap-super-admin')).toBe(true)
})

it('repond 404 a un compte sans le drapeau, jamais 403', async () => {
  const res = await testApp.app.inject({
    method: 'GET', url: '/super-admin/access-log', cookies: cookiesAdminOrdinaire,
  })
  expect(res.statusCode).toBe(404)
})
```

- [ ] **Étape 2 : déclarer l'opération au garde-fou**

Ajouter `PatientAccessLog: ['findMany', 'count']` à `SUPERADMIN_OPERATIONS`. `ActivityLog` y
figure déjà. **Une opération absente de cette table est refusée** : cette route ne contourne pas
la règle, elle la déclare.

- [ ] **Étape 3 : implémenter**

Sous `runAsSuperAdmin`, avec **un `await` à l'intérieur du rappel** — la paresse de Prisma est le
piège récurrent du dépôt. **Aucune identité de patient** dans la réponse : seulement des
identifiants. L'étape 4a a établi que le super-admin compte les patients, il ne les lit pas ;
cette route ne rouvre pas ce choix.

- [ ] **Étape 4 : au vert, sabotage étroit**

Retirer l'entrée `PatientAccessLog` de `SUPERADMIN_OPERATIONS` : la route doit rendre une erreur
de garde-fou, pas une liste vide.

- [ ] **Étape 5 : commit**

```bash
git add back
git commit -m "Lire les deux journaux a l echelle de la plateforme, et rendre lisibles les lignes d amorcage"
```

---

## Tâche 7 : l'événement manquant sur la réémission par le super-admin

**Fichiers**
- Modifier : `src/main/utils/app-event-bus.ts`, `src/main/domain/user.domain.ts`,
  `src/main/services/activity-log.subscriber.ts`
- Test : `src/test/e2e/super-admin-access-link.test.ts`

- [ ] **Étape 1 : écrire le test, le montrer rouge**

```ts
it('journalise la reemission de lien par le super-admin, avec son auteur', async () => {
  await testApp.app.inject({
    method: 'POST', url: `/super-admin/users/${cible.id}/access-link`, cookies: cookiesSuperAdmin,
  })
  const lignes = await testDb.activityLog.findMany({ where: { action: 'user.accessLinkReissued' } })
  expect(lignes).toHaveLength(1)
  expect({ auteur: lignes[0]?.userID, cible: lignes[0]?.entityID })
    .toEqual({ auteur: superAdmin.id, cible: cible.id })
})
```

Attendu : ROUGE, `expected [] to have length 1` — la route la plus puissante du système n'émet
rien aujourd'hui.

- [ ] **Étape 2 : implémenter**

Ajouter `'user.accessLinkReissued'` au bus typé, l'émettre depuis `UserDomain.reissueAccessLink`,
l'abonner dans le souscripteur. **Le souscripteur utilise `findIdentity`, pas `findByID`** — c'est
la correction du tour 1 de la tâche 15, et `findByID` ferait retomber la colonne « auteur » à
`null` en silence.

- [ ] **Étape 3 : au vert, sabotage étroit**

Retirer le seul `emit` : le test rougit sur la longueur, pas sur le contenu.

- [ ] **Étape 4 : commit**

```bash
git add back
git commit -m "Journaliser la reemission de lien par le super-admin"
```

---

## Tâche 8 : la purge paramétrable, pour les deux journaux

**Fichiers**
- Modifier : `src/main/application/config.ts`, `src/main/domain/activityLog.domain.ts`,
  `src/main/domain/patientAccessLog.domain.ts`, `src/main/application/starter.ts`
- Test : `src/test/unit/domain/activityLog.domain.test.ts`,
  `src/test/unit/domain/patientAccessLog.domain.test.ts`,
  `src/test/unit/application/config.test.ts`

- [ ] **Étape 1 : écrire le test de la Review Focus n°3, le montrer rouge**

```ts
it.each([['0'], ['-3'], ['douze']])(
  'refuse de demarrer avec une retention absurde (%s)',
  (valeur) => {
    expect(() => loadConfig({ ...envValide, LOG_RETENTION_MONTHS: valeur }))
      .toThrow()
  },
)
```

Attendu : ROUGE — la variable n'existe pas encore.

- [ ] **Étape 2 : écrire le test de la durée appliquée**

```ts
it('purge a la duree configuree, pas a douze mois en dur', async () => {
  const repository = { deleteOlderThan: jest.fn().mockResolvedValue(0) }
  const domain = new ActivityLogDomain({
    activityLogRepository: repository, config: { logRetentionMonths: 3 },
  } as never)
  jest.setSystemTime(new Date('2026-09-27T00:00:00Z'))
  await domain.cleanup()
  expect(repository.deleteOlderThan).toHaveBeenCalledWith(new Date('2026-06-27T00:00:00Z'))
})
```

- [ ] **Étape 3 : implémenter**

`LOG_RETENTION_MONTHS`, entier strictement positif, défaut **12**, validé par Zod comme le reste
de `config.ts`. Appliqué aux **deux** domaines. `starter.ts` planifie la purge du nouveau journal
à côté de l'existante, sous `runAsSystem` — **avec un `await` à l'intérieur du rappel**, et le
`catch` ne journalise que la classe de l'erreur.

**Cette purge est un sixième emploi du mode système** : elle doit être **déclarée** dans
`src/test/unit/infra/runAsSystem-unicite.test.ts`, avec sa raison, sinon ce test rougit — et c'est
voulu.

- [ ] **Étape 4 : au vert, sabotage étroit**

Remettre `12` en dur dans un seul des deux domaines : le test de durée de ce domaine rougit seul.

- [ ] **Étape 5 : commit**

```bash
git add back
git commit -m "Rendre la retention des deux journaux parametrable, douze mois par defaut"
```

---

## Tâche 9 : le quatrième contexte déclaré

**La tâche la plus délicate du plan.** Elle resserre le garde-fou d'ORM, la pièce dont dépend tout
le cloisonnement.

**Fichiers**
- Modifier : `src/main/infra/orm/tenant-guard.ts`
- Test : `src/test/unit/infra/tenant-guard.test.ts`,
  `src/test/unit/infra/tenant-guard-monotonie.test.ts`

**Interfaces**
- Produit : `NO_CONTEXT_GLOBAL_OPERATIONS`, sur le modèle exact de `SUPERADMIN_GLOBAL_OPERATIONS`.

- [ ] **Étape 1 : reproduire le défaut, le montrer rouge**

```ts
it.each([
  ['Establishment', 'findUnique', { where: { id: 'e2' }, include: { patients: true } }],
  ['Establishment', 'deleteMany', { where: {} }],
  ['User', 'updateMany', { where: {}, data: { isSuperAdmin: true } }],
])('sans aucun contexte, refuse %s.%s', (model, operation, args) => {
  expect(() => assertTenantScope({ model, operation, args }, undefined)).toThrow()
})
```

Attendu : ROUGE sur les trois — aujourd'hui ils passent.

- [ ] **Étape 2 : découvrir les opérations réellement nécessaires**

**Ne pas deviner.** Énumérer les appels réels des routes non tenant — connexion, `/me`,
consommation d'un lien d'accès, tout le préfixe `/super-admin` hors `runAsSuperAdmin` — en lançant
la suite e2e complète avec un garde-fou qui **journalise** chaque couple (modèle, opération) vu
sans contexte, plutôt qu'en lisant le code. La liste obtenue est la liste à déclarer.

- [ ] **Étape 3 : déclarer, avec une raison par entrée**

`NO_CONTEXT_GLOBAL_OPERATIONS`, chaque entrée portant en commentaire la route qui la justifie.
Toute opération absente est refusée, exactement comme pour `superadmin`.

- [ ] **Étape 4 : la règle qui prime**

Ce resserrement **fera tomber des lectures existantes**. **Corriger l'appel, jamais le
garde-fou.** Énumérer tout ce qui tombe et traiter chaque cas. **Si le garde-fou paraît refuser à
tort, s'arrêter et le décrire** plutôt que de l'élargir sous la pression d'un test rouge : un
garde-fou qu'on élargit ainsi est un garde-fou mort.

- [ ] **Étape 5 : la monotonie, mesurée et rejouable**

```bash
cd back && MONOTONIE_REF=<sha-avant> PROFONDEUR=9 npx jest -c src/test/jest.config.ts \
  src/test/unit/infra/tenant-guard-monotonie.test.ts
```

Attendu : **zéro refus perdu**, et le nombre de cas comparés **donné, pas estimé**. Un
resserrement qui ouvrirait ailleurs ce qu'il ferme ici serait un échec, même toutes portes vertes.

- [ ] **Étape 6 : commit**

```bash
git add back
git commit -m "Faire du contexte absent un quatrieme contexte declare, plutot qu un laissez-passer"
```

---

## Tâche 10 : les écrans de journal du tenant

**Fichiers**
- Créer : `front/src/api/accessLog.api.ts`, `front/src/queries/useAccessLog.ts`,
  `front/src/types/accessLog.ts`, `front/src/columns/accessLog.column.tsx`,
  `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/patient/$patientID/acces.tsx`
- Test : les tests voisins de chaque fichier

- [ ] **Étape 1 : écrire le test des trois états, le montrer rouge**

Chargement, erreur, vide, **distincts**. L'étape 4a a livré deux fois un tableau vide
indiscernable d'une panne et une fois un « Chargement… » perpétuel.

- [ ] **Étape 2 : implémenter**

**Les conventions du tenant s'appliquent pleinement** : le contexte est implicite et vient de
l'URL, les clés de requête ne le portent pas. `front/src/test/conventions-tenant-api-queries.test.ts`
garde les deux sur `src/api` et `src/queries` — **aucune exception ne devrait être nécessaire**.
Si l'implémenteur se surprend à vouloir en déclarer une, ou à renommer une variable pour passer
sous le motif, qu'il s'arrête et le dise.

- [ ] **Étape 3 : le tableau, et l'angle mort du virtualiseur**

Sous jsdom, `@tanstack/react-virtual` rend **zéro ligne** : tout test de contenu d'un tableau qui
ne le simule pas est vrai **par vacuité**. Deux fichiers le simulent déjà
(`admin/services.test.tsx`, `admin/members.render.test.tsx`) : reprendre leur façon de faire.

- [ ] **Étape 4 : commit**

```bash
git add front
git commit -m "Afficher le journal des acces a un dossier, par service"
```

---

## Tâche 11 : l'écran plateforme du super-admin

**Fichiers**
- Créer : `front/src/routes/_authenticated/super-admin/access-log.tsx`
- Modifier : `front/src/components/custom/superAdmin/superAdminNav.tsx`
- Test : le test voisin

- [ ] **Étape 1 : écrire le test de discrétion, le montrer rouge**

Un compte sans le drapeau ne doit voir **aucune entrée de navigation** vers cet écran, et l'URL
doit lever `notFound()` — indiscernable d'une URL inconnue. Le back répond 404 et non 403
précisément pour ne pas révéler l'existence de la zone ; un menu grisé défait ce choix.

**Fixture obligatoire** : un compte réellement dépourvu du drapeau **et** un compte qui le porte.
Avec un seul, le test ne compare rien.

- [ ] **Étape 2 : implémenter**

Sur le modèle exact des écrans super-admin existants, avec les trois états distincts.

- [ ] **Étape 3 : commit**

```bash
git add front
git commit -m "Afficher les deux journaux a l echelle de la plateforme"
```

---

## Tâche 12 : documentation, décisions, déploiement, vérification

**Fichiers**
- Créer : `docs/multi-tenant/decisions-etape-4b.md`, `deploiement-etape-4b.md`,
  `verification-etape-4b.md`
- Modifier : `back/CLAUDE.md`, `front/CLAUDE.md`, `docs/multi-tenant/habilitations.md`

- [ ] **Étape 1 : les décisions, avec motif et coût si faux**

Sur le modèle des quatre documents existants. Chaque décision porte **son motif et ce qu'elle
coûte si elle est fausse** — c'est ce qui distingue ces documents d'un compte rendu.

Celles qui comptent : ce qui déclenche une ligne et ce qui n'en déclenche pas ; l'export tracé en
une ligne ; la lecture servie même si le journal échoue ; le sort des lignes quand un patient est
supprimé ; le quatrième contexte déclaré.

- [ ] **Étape 2 : le déploiement**

La migration est **purement additive** — une table, ses index, ses clés étrangères — donc le
retour arrière est ordinaire. **Vérifier cette affirmation dans le SQL avant de l'écrire.** Ne pas
oublier la variable `LOG_RETENTION_MONTHS`, et dire que **sa valeur est provisoire et attend un
conseil**.

- [ ] **Étape 3 : la vérification manuelle**

Point par point, sur le chemin réel de l'interface. **Ne jamais envoyer l'opérateur faire un
`POST` à la main pour une action qui a un bouton** — c'est le défaut exact que la revue finale de
l'étape 4a a trouvé dans les documents de clôture.

- [ ] **Étape 4 : les guides**

`back/CLAUDE.md` : le journal des consultations, son crochet, son garde-fou de démarrage, la liste
déclarée, le quatrième contexte. `front/CLAUDE.md` : les écrans de journal.
`habilitations.md` : la permission `accessLog:read`.

- [ ] **Étape 5 : les six portes, lignes brutes, et commit**

```bash
cd back && rm -rf .wireit && npm run test:unit -- --ci && npm run test:e2e -- --ci \
  && npm run build && npm run lint
cd ../front && npx vitest run && npx tsc -b && npm run lint
```

Donner les chiffres **tels que la sortie les imprime**, et le décompte de lint du front comparé à
`main`.

```bash
git add docs back/CLAUDE.md front/CLAUDE.md
git commit -m "Documenter l etape 4b : decisions, deploiement, verification"
```

---

## Auto-relecture du plan

**Couverture de la spécification.** §3 le modèle → tâche 1. §4 les déclencheurs → tâches 3 et 4.
§5 l'accroche et le garde-fou de démarrage → tâche 3. §6 les trois lecteurs → tâches 5, 6, 10, 11.
§7 la purge → tâche 8. §8 les trois angles morts → tâches 6 (deux d'entre eux) et 7. §9 le
quatrième contexte → tâche 9. §10 hors périmètre → rien, par construction. §11 le critère de
sortie → tâche 12, étape 3.

**Conflits entre tâches.**

| Paire | Ce qui se partage | Constat |
|---|---|---|
| 1 → 2, 3 | le modèle et ses familles | Ordre impératif : la migration et la déclaration avant tout code qui écrit. |
| 2 ↔ 8 | `PatientAccessLogDomain` | La tâche 2 écrit `record`, la 8 ajoute `cleanup` au même domaine. Les tests de la 2 doivent rester verts après la 8. |
| 3 ↔ 4 | le crochet et les deux listes | **Conflit réel** : `/export` n'a pas de `:patientID`, alors que la table l'exige non nul. La tâche 4 doit trancher et le dire ; la tâche 1 peut avoir à rendre `patientId` nullable. **Arbitrage rendu par avance** : si le conflit se confirme, rendre `patientId` nullable plutôt que déplacer l'export dans `ActivityLog` — les deux lectures doivent se répondre dans une seule table. |
| 3 ↔ 5 | `tenant.routes.ts` | La route `/acces` porte `:patientID` : elle devra figurer dans `EXEMPTED_PATIENT_ROUTES` (lire le journal n'est pas consulter le dossier), sinon le garde-fou de la tâche 3 fera échouer le démarrage. **À ne pas découvrir en exécution.** |
| 8 ↔ 9 | `runAsSystem` | La purge neuve est un emploi de plus, à déclarer dans le test d'énumération. |
| 9 → toutes | le garde-fou | La tâche 9 peut faire tomber des appels des tâches 5, 6 et 7. Elle passe **après** elles pour que ce qui tombe soit visible, pas masqué par du code non encore écrit. |

**Cohérence des noms.** `PatientAccessLogDomain.record`, `RecordAccessInput`, `AccessAction`,
`LOGGED_PATIENT_ROUTES`, `EXEMPTED_PATIENT_ROUTES`, `assertPatientReadLogged`,
`recordPatientAccess`, `NO_CONTEXT_GLOBAL_OPERATIONS`, `accessLog:read`, `LOG_RETENTION_MONTHS` —
employés à l'identique d'une tâche à l'autre.

**Review Focus.** Les cinq classes sont rattachées : n°1 et n°5 à la tâche 3, n°2 à la tâche 4,
n°3 à la tâche 8, n°4 à la tâche 1.

**Ce que ce plan ne tranche pas, et qui devra l'être en chemin.** Si un accès obtenu par **octroi
temporaire** doit être signalé comme tel : un super-admin sous octroi emprunte le chemin de tenant
ordinaire et sera journalisé comme un membre. Le distinguer supposerait de lire l'origine de
l'appartenance au moment de l'écriture. Sans cette distinction, **un accès de dépannage est
indiscernable d'un accès de soin** — à trancher à la tâche 2, en écrivant le coût.
