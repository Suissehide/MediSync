# Étape 4a — Administration : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un second établissement se crée depuis l'interface, reçoit son premier administrateur par un lien, se dote de services et y rattache des comptes — sans aucun accès à la base.

**Architecture:** Le super-admin emprunte trois chemins distincts et c'est leur séparation qui fait la sûreté. Créer un établissement ou un compte ne demande aucune exception (modèles globaux). Consulter des compteurs et des rattachements passe par un troisième type de contexte, `superadmin`, à **liste déclarée**. Intervenir dans un établissement passe par un octroi temporaire, motivé, expirant — qui ne crée **aucun** passage de faveur : pendant sa durée le super-admin est un membre ordinaire, entièrement soumis au garde-fou.

**Tech Stack:** Node 24, Fastify 5, Awilix, Prisma 7 (`prisma-client`, adaptateur `@prisma/adapter-pg`), Zod v4 via `fastify-type-provider-zod`, Jest 30 + `@swc/jest`, Biome, wireit. Front : React 19, Vite, TanStack Router et Query, Zustand, Radix + Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-25-multi-tenant-etape-4a-administration-design.md`

## Global Constraints

- **`medisync` est la base de développement de Léo.** Les tests passent par `.env.test` et `medisync_test` uniquement. Toute répétition de migration se fait sur une copie jetable, supprimée ensuite. `npm run prisma:migrate:reset` **sans suffixe** vise `medisync` : ne jamais le lancer.
- **Postgres écoute sur 5433** ; un conteneur d'un autre projet occupe 5432. Une commande recopiée telle quelle s'y connecte sans erreur visible.
- **Ne jamais lever `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.** Pour reconstruire `medisync_test` : afficher la liste des bases, puis supprimer et recréer par psql la **seule** base littéralement nommée `medisync_test`, puis `migrate deploy` et seed.
- **Aucune permission nouvelle.** `establishments:manage`, `services:manage`, `members:manage` existent déjà dans `docs/multi-tenant/habilitations.md`, qui fait foi.
- **Le garde-fou se corrige par l'appelant, jamais l'inverse.** S'il refuse une requête, c'est la requête qu'il faut changer. La seule modification autorisée du garde-fou est celle de la tâche 1.
- **Un jeton d'accès est un identifiant de connexion** : il ne passe jamais dans une URL, n'apparaît dans aucun journal, et la base n'en stocke qu'une empreinte.
- Front : le contexte de tenant est **implicite** et vient de l'URL ; les clés de requête **ne portent pas** le tenant. Une garde le tient (`front/src/test/conventions-tenant-api-queries.test.ts`).
- Chaque test nouveau est montré **rouge sans son mécanisme** avant d'être compté.
- Portes : `cd back && rm -rf .wireit && npm run build && npm run lint && npm run test:unit -- --ci && npm run test:e2e -- --ci` ; `cd front && npm run build && npx vitest run`. Départ : back 267 unitaires et 112 e2e, front 143. Le lint front compte 32 erreurs préexistantes et n'est pas une porte de fusion.

## Review Focus

Cinq classes d'entrée que la spécification implique et qu'aucune tâche n'exerce spontanément. Chacune est rattachée à la tâche qui possède le code, dans son style d'étapes.

1. **Un lien consommé deux fois en parallèle.** Deux requêtes simultanées avec le même jeton : une seule doit aboutir, l'autre recevoir un refus — un usage unique qui ne tient qu'en séquence ne tient pas. → tâche 4.
2. **Un octroi qui expire pendant une session ouverte.** La requête suivante doit être refusée sans attendre une reconnexion : l'évaluation est à la lecture, pas à l'ouverture de session. → tâche 3.
3. **Un service désactivé pendant qu'un membre y navigue.** Son contexte devient périmé ; la requête suivante ne doit pas le servir. → tâche 9.
4. **Créer un établissement avec l'adresse d'un compte déjà existant.** Ne doit ni écraser le compte, ni réinitialiser son mot de passe, ni révéler son existence par un message différent. → tâche 6.
5. **Un compte désactivé qui consomme un lien valide.** Le lien est bon, le compte ne l'est pas : refus. → tâche 4.

---

## Task 1 : le troisième contexte du garde-fou

**Files:**
- Modify: `back/src/main/types/utils/tenant-context.ts`, `back/src/main/utils/tenant-context.ts`
- Modify: `back/src/main/infra/orm/tenant-guard.ts`
- Modify: `back/src/test/unit/infra/tenant-guard.test.ts`, `back/src/test/unit/infra/tenant-guard-schema.test.ts`

**Interfaces:**
- Produces: `TenantStore` gagne `| { kind: 'superadmin' }` ; `tenantContext.runAsSuperAdmin<T>(fn: () => Promise<T>): Promise<T>` ; `SUPERADMIN_OPERATIONS: Readonly<Record<string, readonly string[]>>` exportée depuis `tenant-guard.ts`.

C'est la pièce la plus sensible du dépôt. Elle a été prouvée à l'étape 3 sur 6 649 chemins énumérés, avec zéro fuite et zéro refus à tort, et le resserrement y était **strictement monotone** : zéro refus perdu. Ce que tu ajoutes doit l'être aussi.

- [ ] **Step 1 : lire avant d'écrire**

Lis `back/src/main/infra/orm/tenant-guard.ts` **en entier**, et en particulier `assertTenantScope`, `familyOf`, et le commentaire de décision au-dessus de `MODEL_RELATIONS`. Lis aussi `back/src/test/unit/infra/runAsSystem-unicite.test.ts` : il surveille la **capacité** d'entrer en mode système, pas le nom de la méthode. Ton nouveau mode devra être surveillé de la même façon.

- [ ] **Step 2 : écrire le test de la liste déclarée, et le voir rouge**

```ts
// back/src/test/unit/infra/tenant-guard.test.ts
describe('contexte superadmin', () => {
  const store = { kind: 'superadmin' } as const

  it('autorise une operation declaree', () => {
    expect(() =>
      assertTenantScope(
        { model: 'Service', operation: 'count', args: { where: { establishmentId: 'e1' } } },
        store,
      ),
    ).not.toThrow()
  })

  it('refuse une operation non declaree sur le meme modele', () => {
    expect(() =>
      assertTenantScope({ model: 'Service', operation: 'deleteMany', args: {} }, store),
    ).toThrow(TenantScopeMissingError)
  })

  it('refuse un modele absent de la liste, meme en lecture', () => {
    expect(() =>
      assertTenantScope({ model: 'Patient', operation: 'findMany', args: {} }, store),
    ).toThrow(TenantScopeMissingError)
  })

  it('autorise le comptage des patients, qui est declare', () => {
    expect(() =>
      assertTenantScope(
        { model: 'Patient', operation: 'count', args: { where: { establishmentId: 'e1' } } },
        store,
      ),
    ).not.toThrow()
  })
})
```

Run: `cd back && npx jest --selectProjects unit -t "contexte superadmin"`
Expected: FAIL — le type `'superadmin'` n'existe pas.

- [ ] **Step 3 : le type**

```ts
// back/src/main/types/utils/tenant-context.ts
export type TenantStore =
  | { kind: 'tenant'; tenant: Tenant }
  | { kind: 'system' }
  | { kind: 'superadmin' }
```

Ajoute `runAsSuperAdmin<T>(fn: () => Promise<T>): Promise<T>` à l'interface, et dans `back/src/main/utils/tenant-context.ts` :

```ts
  runAsSuperAdmin<T>(fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ kind: 'superadmin' }, fn)
  }
```

**Attention, leçon de l'étape 3 :** une requête Prisma est *paresseuse*. `runAsSuperAdmin(() => prisma.x.count(...))` renvoie la promesse **sans l'attendre**, l'exécution part alors hors de la portée du contexte, et l'extension lit le tenant ambiant. Toujours `await` **à l'intérieur** du rappel.

- [ ] **Step 4 : la liste déclarée**

```ts
// back/src/main/infra/orm/tenant-guard.ts
// Le contexte `superadmin` n'est PAS `system`. `system` retire l'exigence de filtre pour toute
// opération ; il a deux emplois en production et un test garde cette unicité. Ici, la liste
// ci-dessous est exhaustive : tout couple (modèle, opération) absent est refusé comme sans
// contexte. Le super-admin compte, il ne lit pas — d'où l'absence de `findMany` sur `Patient`.
export const SUPERADMIN_OPERATIONS: Readonly<Record<string, readonly string[]>> = {
  Service: ['count', 'findMany'],
  EstablishmentMembership: ['count', 'findMany', 'create'],
  ServiceMembership: ['count', 'findMany'],
  Patient: ['count'],
  ActivityLog: ['findMany', 'count'],
}
```

Dans `assertTenantScope`, juste après la branche `system` :

```ts
  if (store.kind === 'superadmin') {
    const permises = SUPERADMIN_OPERATIONS[model]
    if (!permises?.includes(operation)) {
      throw new TenantScopeMissingError(model, operation, 'superadmin')
    }
    return
  }
```

Run: `cd back && npx jest --selectProjects unit -t "contexte superadmin"` → PASS.

- [ ] **Step 5 : la conformité au schéma, dans les deux directions**

```ts
// back/src/test/unit/infra/tenant-guard-schema.test.ts
describe('SUPERADMIN_OPERATIONS reflete le schema', () => {
  it('ne declare que des modeles qui existent', () => {
    const modeles = modelNames(readFileSync('prisma/schema.prisma', 'utf8'))
    expect(Object.keys(SUPERADMIN_OPERATIONS).sort()).toEqual(
      Object.keys(SUPERADMIN_OPERATIONS).filter((m) => modeles.includes(m)).sort(),
    )
  })

  it('ne declare que des modeles de tenant — un modele global n a pas besoin d y figurer', () => {
    for (const modele of Object.keys(SUPERADMIN_OPERATIONS)) {
      expect([...SERVICE_MODELS, ...ESTABLISHMENT_MODELS]).toContain(modele)
    }
  })
})
```

La seconde direction est la plus utile : elle rougit le jour où quelqu'un ajoute à la liste un modèle **global**, ce qui serait le signe qu'il n'a pas compris que les globaux passent déjà sans exception — et qu'il élargit la liste pour rien.

- [ ] **Step 6 : garder l'unicité de la capacité**

Étends `runAsSystem-unicite.test.ts` pour qu'il surveille **aussi** `{ kind: 'superadmin' }` : sa construction ne doit exister que dans `utils/tenant-context.ts`. Le test surveille la construction du store, pas le nom de la méthode — c'est ce qui a fermé, à l'étape 3, les trois sabotages qui passaient par un alias, une liaison ou une méthode détournée.

**Éprouve-le** : ajoute dans un fichier de production un `storage.run({ kind: 'superadmin' }, fn)` ; le test doit rougir. Retire-le, vérifie l'empreinte du fichier.

- [ ] **Step 7 : prouver la monotonie**

Le resserrement de l'étape 3 n'a perdu **aucun** refus. Le tien ne doit en perdre aucun non plus. Écris un test qui rejoue un échantillon de cas `tenant` et `system` **identiques** avant et après ton changement et vérifie que les verdicts sont inchangés — ou, si tu peux le faire honnêtement, importe les deux versions côte à côte comme l'a fait la revue de l'étape 3. Dis dans ton rapport laquelle des deux tu as faite, et pourquoi.

- [ ] **Step 8 : commit**

```bash
git add back/src/main/types/utils/tenant-context.ts back/src/main/utils/tenant-context.ts \
  back/src/main/infra/orm/tenant-guard.ts back/src/test/unit/infra
git commit -m "feat(garde-fou): un troisieme contexte a liste declaree pour le super-admin"
```

---

## Task 2 : le modèle et sa migration

**Files:**
- Modify: `back/prisma/schema.prisma`
- Create: `back/prisma/migrations/<horodatage>_administration/migration.sql`
- Modify: `back/src/test/unit/infra/tenant-guard-schema.test.ts`

**Interfaces:**
- Produces: modèles `AccessLink` et `SuperAdminAccessGrant`, colonne `User.lastLoginAt`.

- [ ] **Step 1 : le schéma**

Les deux modèles sont dans la spécification §5, à recopier tels quels. `Establishment.createdAt` **existe déjà** : ne pas l'ajouter. Ajoute `lastLoginAt DateTime?` à `User`.

Les deux modèles neufs sont **globaux** au sens du garde-fou : ils traversent les établissements par nature, et c'est `SuperAdminAccessGrant` qui *décide* du contexte plutôt que d'en dépendre. Ne les ajoute donc ni à `SERVICE_MODELS` ni à `ESTABLISHMENT_MODELS`.

- [ ] **Step 2 : vérifier que le test de conformité l'accepte, et pourquoi**

`tenant-guard-schema.test.ts` exige que tout modèle portant `serviceId` **et** `establishmentId` figure dans `SERVICE_MODELS`. `SuperAdminAccessGrant` porte `establishmentId` seul : il n'est donc pas capté. Vérifie-le en lançant la suite unitaire ; si elle rougit, **arrête-toi et dis-le** plutôt que d'ajouter une exception.

- [ ] **Step 3 : générer la migration sans l'appliquer**

```bash
cd back && npm run with:dotenv -- -e .env -- prisma migrate dev --create-only --name administration
```

Relis le SQL produit. Il ne doit contenir que des créations de tables et une colonne ajoutée — **aucun `DROP`**. Si un `DROP` apparaît, c'est une dérive entre le schéma et la base : arrête-toi.

- [ ] **Step 4 : la garde contre la dérive doit rester verte**

`back/src/test/unit/migrations/schema-migrations-drift.test.ts` compare le schéma aux migrations. Lance-le : il doit passer. C'est lui qui a rattrapé, à l'étape 3, deux clés étrangères laissées en base et absentes du schéma.

- [ ] **Step 5 : commit**

```bash
git add back/prisma back/src/test
git commit -m "feat(modele): declarer le lien d acces et l octroi temporaire"
```

---

## Task 3 : les appartenances effectives

**Files:**
- Create: `back/src/main/domain/accessGrant.domain.ts` + son interface dans `types/domain/`
- Create: `back/src/main/infra/orm/repositories/accessGrant.repository.ts` + son interface
- Modify: `back/src/main/utils/me-mapper.ts`, `back/src/main/interfaces/http/fastify/plugins/tenant.plugin.ts`
- Create: `back/src/test/unit/domain/accessGrant.domain.test.ts`
- Modify: `back/src/test/e2e/tenant-resolution.test.ts`

**Interfaces:**
- Consumes: `SuperAdminAccessGrant` (tâche 2).
- Produces: `effectiveMemberships(user: UserWithMemberships, grants: LiveGrant[], now: Date): EffectiveMembership[]` — **une seule fonction**, employée par `/me` **et** par la résolution de tenant. L'horloge est un argument et non `new Date()` pris à l'intérieur : c'est ce qui rend l'expiration éprouvable sans attendre.

C'est le cœur de la tâche 4a et son plus grand risque : deux chemins qui calculent les appartenances de deux façons finiraient par diverger, et la divergence se solderait par un accès qui existe d'un côté et pas de l'autre.

- [ ] **Step 1 : le test de l'octroi vivant, rouge**

```ts
// back/src/test/unit/domain/accessGrant.domain.test.ts
const maintenant = new Date('2026-09-25T12:00:00Z')

it('ajoute une appartenance virtuelle tant que l octroi est vivant', () => {
  const effectives = effectiveMemberships(utilisateurSansRattachement, [
    { establishmentId: 'e1', expiresAt: new Date('2026-09-25T13:00:00Z'), revokedAt: null },
  ], maintenant)
  expect(effectives.map((m) => m.establishmentId)).toEqual(['e1'])
  expect(effectives[0]?.origine).toBe('octroi')
})

it('n ajoute rien quand l octroi est expire', () => {
  expect(
    effectiveMemberships(utilisateurSansRattachement, [
      { establishmentId: 'e1', expiresAt: new Date('2026-09-25T11:59:59Z'), revokedAt: null },
    ], maintenant),
  ).toEqual([])
})

it('n ajoute rien quand l octroi est revoque avant son terme', () => {
  expect(
    effectiveMemberships(utilisateurSansRattachement, [
      {
        establishmentId: 'e1',
        expiresAt: new Date('2026-09-25T13:00:00Z'),
        revokedAt: new Date('2026-09-25T11:00:00Z'),
      },
    ], maintenant),
  ).toEqual([])
})

it('ne double pas une appartenance reelle', () => {
  const effectives = effectiveMemberships(utilisateurMembreDeE1, [
    { establishmentId: 'e1', expiresAt: new Date('2026-09-25T13:00:00Z'), revokedAt: null },
  ], maintenant)
  expect(effectives).toHaveLength(1)
  expect(effectives[0]?.origine).toBe('reelle')
})
```

Le dernier cas compte plus qu'il n'en a l'air : un super-admin qui est **aussi** membre d'un établissement ne doit pas y apparaître deux fois, et son rôle réel doit primer sur celui de l'octroi.

- [ ] **Step 2 : l'implémentation, et le rôle qu'un octroi confère**

L'octroi confère `EstablishmentRole.ADMIN` et `ServiceRole.COORDINATEUR` sur **tous les services actifs** de l'établissement. Motif à écrire sur place : le but est le diagnostic, et un accès qui ne voit pas la liste des membres ne diagnostique pas un problème d'appartenance — qui est le cas le plus fréquent. La spécification dit « coordinateur » ; c'est le rôle de service, et le rôle d'établissement qui l'accompagne n'y est pas tranché.

- [ ] **Step 3 : un seul appelant de vérité**

`me-mapper.ts` et `tenant.plugin.ts` appellent **la même** fonction. Écris un test de dépôt — à la manière de `front/src/test/lecture-directe-du-cache.test.ts` — qui rougit si un troisième endroit calcule des appartenances sans passer par elle.

- [ ] **Step 4 : le cas du Review Focus n° 2 — l'expiration en séance**

```ts
// back/src/test/e2e/tenant-resolution.test.ts
it('refuse des que l octroi expire, sans attendre une reconnexion', async () => {
  // octroi de 1 seconde, cookie de session obtenu avant
  const avant = await get(`/e/${etablissementB}/s/${serviceB}/patient`)
  expect(avant.statusCode).toBe(200)
  await avancerHorloge(2000)
  const apres = await get(`/e/${etablissementB}/s/${serviceB}/patient`)
  expect(apres.statusCode).toBe(404)
})
```

**404 et non 403** : la forme que le plugin de tenant emploie déjà pour un tenant inconnu — ne pas révéler l'existence d'un établissement auquel on n'a plus accès.

- [ ] **Step 5 : commit**

---

## Task 4 : le lien d'accès

**Files:**
- Create: `back/src/main/domain/accessLink.domain.ts`, `back/src/main/infra/orm/repositories/accessLink.repository.ts`, leurs interfaces
- Create: `back/src/main/interfaces/http/fastify/routes/auth/access-link.router.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/auth/index.ts` (ou l'endroit où les routes d'authentification sont enregistrées)
- Create: `back/src/test/e2e/access-link.test.ts`

**Interfaces:**
- Produces: `accessLinkDomain.issue(userId: string, issuedBy: string): Promise<{ token: string }>` — le jeton en clair n'est rendu **qu'ici** ; `accessLinkDomain.consume(token: string, password: string): Promise<void>`.

- [ ] **Step 1 : le test de l'usage unique, rouge**

Émettre, consommer, reconsommer : la seconde doit échouer. Puis un lien expiré : échec. Puis une réémission : le lien précédent du même compte doit être invalidé.

- [ ] **Step 2 : l'implémentation**

Jeton aléatoire de 32 octets, encodé en base64url. La base ne stocke qu'une **empreinte** (`sha256`) : la table ne doit pas suffire à fabriquer un accès. `usedAt` non nul vaut consommé. Sept jours de validité.

- [ ] **Step 3 : le Review Focus n° 1 — deux consommations en parallèle**

```ts
it('n aboutit qu une fois sur deux consommations simultanees', async () => {
  const { token } = await emettre(compte)
  const [a, b] = await Promise.all([consommer(token, 'mdp'), consommer(token, 'mdp')])
  const codes = [a.statusCode, b.statusCode].sort()
  expect(codes).toEqual([200, 410])
})
```

Un usage unique qui ne tient qu'en séquence ne tient pas. Fais-le tenir par la base — un `updateMany` conditionné sur `usedAt: null` dont on vérifie qu'il a touché une ligne — et non par une lecture suivie d'une écriture.

- [ ] **Step 4 : le Review Focus n° 5 — un compte désactivé**

Un lien valide sur un compte désactivé doit être refusé, et le lien **ne doit pas être consommé** au passage : refuser ne doit pas brûler le jeton.

- [ ] **Step 5 : le jeton ne doit apparaître dans aucun journal**

Le jeton passe dans le **corps** d'un `POST`, jamais dans l'URL. Écris le test qui l'exige, sur le modèle de `back/src/test/unit/interfaces/error-response-leak.test.ts` : un journal capturé sur **tous** ses canaux — pas seulement `error` — et une recherche de sous-chaîne sur la sortie brute. À l'étape 3, six tests ne surveillaient que le canal `error` et cinq sabotages passaient.

Éprouve-le : fais passer le jeton en paramètre d'URL, montre le rouge, rétablis.

- [ ] **Step 6 : commit**

---

## Task 5 : le plugin `/super-admin`

**Files:**
- Create: `back/src/main/interfaces/http/fastify/routes/super-admin.routes.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/index.ts`
- Create: `back/src/test/e2e/super-admin-acces.test.ts`

**Interfaces:**
- Produces: le préfixe `/super-admin`, le crochet `requireSuperAdmin`.

- [ ] **Step 1 : le test du 404, sur toutes les routes**

Pour **chaque** route enregistrée sous `/super-admin`, un compte sans le drapeau reçoit **404**. Énumère les routes par `fastify.printRoutes()` plutôt que d'en lister quelques-unes à la main : c'est ce qui a permis, à l'étape 3, de balayer les soixante routes de lecture sans en oublier.

- [ ] **Step 2 : le plugin**

Suis la forme de `establishment-admin.routes.ts` : `fastify.addHook('onRoute', assertRoutePermission)` — qui **fait échouer le démarrage** si une route oublie sa permission — puis un `onRequest` qui lève `Boom.notFound()` si `request.user?.isSuperAdmin !== true`.

- [ ] **Step 3 : vérifier que l'oubli de permission casse le démarrage**

Retire `config.permission` d'une route, lance le serveur de test, constate l'échec au démarrage, rétablis. C'est un garde-fou existant : vérifie qu'il te couvre, ne le réécris pas.

- [ ] **Step 4 : commit**

---

## Task 6 : créer un établissement et son premier administrateur

**Files:**
- Modify: `back/src/main/domain/establishment.domain.ts` (ou création si absent), `back/src/main/infra/orm/repositories/establishment.repository.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/super-admin/establishments.ts`
- Create: `back/src/test/e2e/super-admin-establishments.test.ts`

**Interfaces:**
- Consumes: `accessLinkDomain.issue` (tâche 4), `SUPERADMIN_OPERATIONS` (tâche 1).
- Produces: `POST /super-admin/establishments` → `{ establishment, firstAdmin, accessLink }`.

- [ ] **Step 1 : le test du chemin complet, rouge**

Créer un établissement avec le nom et l'adresse d'un premier administrateur crée : l'établissement, le compte, son rattachement en `ADMIN`, et rend un lien. Le lien consommé permet de se connecter et `/me` montre l'établissement.

- [ ] **Step 2 : le Review Focus n° 4 — une adresse déjà connue**

Trois exigences, chacune son assertion : le compte existant **n'est pas** écrasé (ni nom, ni mot de passe) ; il est **rattaché** au nouvel établissement ; et la réponse ne distingue pas un compte créé d'un compte réutilisé — sans quoi la route devient un oracle d'existence de comptes.

- [ ] **Step 3 : l'écriture du rattachement passe par le contexte superadmin**

`EstablishmentMembership.create` figure dans la liste déclarée de la tâche 1. Encadre l'appel par `runAsSuperAdmin`, en **attendant à l'intérieur du rappel** — la paresse de Prisma, encore.

- [ ] **Step 4 : commit**

---

## Task 7 : la liste des établissements et la recherche d'un compte

**Files:**
- Modify: `back/src/main/infra/orm/repositories/establishment.repository.ts`, `user.repository.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/super-admin/users.ts`
- Create: `back/src/test/e2e/super-admin-consultation.test.ts`

**Interfaces:**
- Produces: `GET /super-admin/establishments`, `GET /super-admin/establishments/:id`, `GET /super-admin/users?email=`.

- [ ] **Step 1 : le test du contenu exact de la liste**

Comme pour la recherche d'identité de l'étape 3, affirme les **clés exactes** de la réponse, pas seulement l'absence de quelques champs :

```ts
expect(Object.keys(ligne).sort()).toEqual([
  'accountCount', 'createdAt', 'deactivatedAt', 'firstAdmin', 'id',
  'lastAccessAt', 'name', 'patientCount', 'serviceCount',
])
```

Et vérifie par recherche de sous-chaîne sur le corps brut qu'aucun nom de patient n'y figure. À l'étape 3, c'est cette double vérification qui a établi qu'une réponse était propre.

- [ ] **Step 2 : les compteurs passent par le contexte superadmin**

`Service.count`, `EstablishmentMembership.count`, `Patient.count` sont déclarés. **`Patient.findMany` ne l'est pas** : si tu en as besoin, tu t'es trompé de chemin.

- [ ] **Step 3 : la recherche d'un compte**

Rend ses rattachements, ses rôles, ses désactivations et son dernier accès. **Aucune donnée de patient.** Même double vérification qu'au step 1.

- [ ] **Step 4 : `lastLoginAt` est alimenté**

La connexion pose la date. Un test l'exige, sinon la colonne restera vide et la liste mentira en affichant « jamais ».

- [ ] **Step 5 : commit**

---

## Task 8 : les octrois temporaires

**Files:**
- Create: `back/src/main/interfaces/http/fastify/routes/super-admin/grants.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/establishment-admin.routes.ts`
- Create: `back/src/test/e2e/super-admin-grants.test.ts`
- Modify: `back/src/test/e2e/isolation.test.ts`

**Interfaces:**
- Consumes: `effectiveMemberships` (tâche 3).
- Produces: `POST /super-admin/grants`, `DELETE /super-admin/grants/:id`, `GET /e/:establishmentId/grants`.

- [ ] **Step 1 : le motif est obligatoire**

Un octroi sans motif est refusé — une chaîne vide aussi. Sans cette contrainte, la moitié comptable du mécanisme ne vaut rien.

- [ ] **Step 2 : la durée est bornée**

Quatre heures par défaut, **vingt-quatre au maximum**. Une demande de quarante-huit heures est refusée, pas silencieusement ramenée à vingt-quatre : un plafond qui tronque sans le dire fait croire à ce qu'on a demandé.

- [ ] **Step 3 : l'isolation**

Ajoute un cas à `isolation.test.ts` : un octroi sur l'établissement A ne donne **rien** sur B. C'est le fichier qu'un relecteur consulte.

- [ ] **Step 4 : l'administrateur de l'établissement les voit**

`GET /e/:establishmentId/grants` rend les octrois en cours et passés de **son** établissement, avec leur motif et leur auteur. Un administrateur d'un autre établissement n'y voit rien.

- [ ] **Step 5 : commit**

---

## Task 9 : les services

**Files:**
- Create: `back/src/main/interfaces/http/fastify/routes/services.ts`
- Modify: `back/src/main/domain/` et `infra/orm/repositories/` pour `Service`
- Create: `back/src/test/e2e/services.test.ts`

**Interfaces:**
- Produces: `GET`/`POST /e/:establishmentId/services`, `PATCH /e/:establishmentId/services/:id`.

- [ ] **Step 1 : créer un service rattache son créateur**

Le test exige qu'après création, `/me` montre le service **et** que son créateur y soit `COORDINATEUR`.

- [ ] **Step 2 : les compteurs de la désactivation**

Avant de désactiver, la route rend combien de patients le service suit et **combien ne sont suivis
nulle part ailleurs**. Le second compte est celui qui importe : ce sont les dossiers qui
deviendront invisibles.

```ts
// back/src/test/e2e/services.test.ts
it('compte les dossiers qui deviendraient invisibles, pas seulement les dossiers', async () => {
  // Trois patients dans A : deux suivis aussi dans B, un seulement dans A.
  const res = await get(`/e/${etablissement}/services/${serviceA}/impact-desactivation`)
  expect(res.json()).toEqual({ suivisIci: 3, suivisNullePartAilleurs: 1 })
})
```

Le second compte se calcule en miroir du signal de suivi ailleurs : un patient de ce service
n'ayant **aucun** autre sous-dossier dans le même établissement. Attention, il porte sur d'autres
services du même établissement — pas sur d'autres établissements, que la clé étrangère composite
rend de toute façon impossibles.

- [ ] **Step 3 : le Review Focus n° 3 — désactiver sous les pieds d'un membre**

Un membre navigue dans le service ; le service est désactivé ; sa requête suivante ne doit plus être servie. Vérifie le code rendu et qu'il ne révèle rien de plus qu'un tenant inconnu.

- [ ] **Step 4 : réactiver rend tout**

Le test le prouve : après réactivation, les dossiers et les membres sont de retour. C'est ce qui rend la décision 3.6 acceptable ; sans cette preuve, elle ne l'est pas.

- [ ] **Step 5 : commit**

---

## Task 10 : créer un compte de membre, et désactiver

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/routes/members.ts`, `back/src/main/domain/membership.domain.ts`
- Modify: `back/src/test/e2e/members.test.ts`

- [ ] **Step 1** : `POST /e/:establishmentId/members/account` crée un compte et rend son lien, à côté du rattachement par adresse qui existe déjà. Même précaution qu'à la tâche 6 sur une adresse déjà connue.
- [ ] **Step 2** : la désactivation d'un membre depuis l'écran. Le mécanisme existe (`deactivatedAt`) ; il s'agit de l'exposer, pas de le réécrire.
- [ ] **Step 3** : réémettre un lien pour un membre existant — c'est la réinitialisation d'un accès oublié, qui n'existe aujourd'hui par aucun moyen.
- [ ] **Step 4 : commit**

---

## Task 11 : le script d'amorçage

**Files:**
- Create: `back/scripts/bootstrap-super-admin.ts`, entrée `bootstrap:super-admin` dans `back/package.json`

- [ ] **Step 1** : `npm run bootstrap:super-admin -- <email>` pose le drapeau sur une identité **existante** et écrit une ligne dans le journal d'activité. Il refuse si l'adresse est inconnue, plutôt que de créer un compte : créer un super-admin sans mot de passe choisi serait un compte privilégié dormant.
- [ ] **Step 2** : un test unitaire sur la fonction, pas sur le script — le script n'est qu'un appelant.
- [ ] **Step 3 : commit**

---

## Task 12 : les écrans du super-admin

**Files:**
- Create: `front/src/routes/_authenticated/super-admin.tsx`, `super-admin/index.tsx`, `super-admin/$establishmentId.tsx`, `super-admin/users.tsx`
- Create: `front/src/api/superAdmin.api.ts`, `front/src/queries/useSuperAdmin.ts`, `front/src/types/superAdmin.ts`

- [ ] **Step 1** : la liste, avec les colonnes de la décision 3.3 et les identifiants copiables.
- [ ] **Step 2** : le détail d'un établissement — services, membres, journal, bouton d'octroi avec motif obligatoire et durée.
- [ ] **Step 3** : la recherche d'un compte, qui répond à « untel ne voit plus ses patients », avec réémission de lien.
- [ ] **Step 4** : un test vérifie qu'un compte sans le drapeau ne voit **aucune** entrée de navigation vers ces écrans — la route rend 404, l'écran ne doit pas non plus l'annoncer.
- [ ] **Step 5** : les conventions du front s'appliquent : le tenant n'est pas un argument, les clés de requête ne le portent pas. La garde `conventions-tenant-api-queries.test.ts` couvre `src/api` et `src/queries` : ne l'enfreins pas.
- [ ] **Step 6 : commit**

---

## Task 13 : les écrans d'administration d'établissement et la page publique

**Files:**
- Modify: `front/src/routes/_authenticated/e/$establishmentId/admin.tsx`
- Create: `front/src/routes/_authenticated/e/$establishmentId/admin/services.tsx`, `admin/grants.tsx`
- Create: `front/src/routes/auth/access-link.tsx`

- [ ] **Step 1** : l'onglet des services — créer, renommer, désactiver, réactiver. La désactivation affiche **les deux compteurs** avant de demander confirmation, et nomme la conséquence : « leurs dossiers resteront en base mais ne seront plus accessibles ».
- [ ] **Step 2** : l'onglet des accès temporaires, en cours et passés, avec motif et auteur.
- [ ] **Step 3** : l'onglet des membres gagne la création de compte et la désactivation. Le lien s'affiche **une seule fois**, avec un bouton de copie et une mention disant qu'il ne sera plus affiché.
- [ ] **Step 4** : la page publique de consommation : demande un mot de passe, le pose, connecte. Le jeton vient de l'URL côté navigateur mais part dans le **corps** de la requête — jamais dans l'URL de l'appel API.
- [ ] **Step 5 : commit**

---

## Task 14 : documentation, décisions, déploiement, vérification

**Files:**
- Create: `docs/multi-tenant/decisions-etape-4a.md`, `deploiement-etape-4a.md`
- Modify: `docs/multi-tenant/verification-etape-3.md`, `back/CLAUDE.md`, `front/CLAUDE.md`, `docs/multi-tenant/habilitations.md`

- [ ] **Step 1** : les décisions, sur le modèle des trois documents existants — chacune avec son motif et **ce qu'elle coûte si elle est fausse**. Les six de la spécification §3, plus celles tranchées en chemin.
- [ ] **Step 2** : le déploiement. Il est **beaucoup plus simple** que celui de l'étape 3 : la migration ne déplace aucune donnée, elle crée deux tables et une colonne. Dis-le, et dis pourquoi le retour arrière redevient ordinaire ici — c'est justement ce qui distingue cette étape de la précédente.
- [ ] **Step 3** : **les deux vérifications manuelles en attente deviennent exécutables.** Reprends `verification-etape-2.md` et `verification-etape-3.md` et dis, point par point, lesquels sont désormais jouables — c'est le vrai critère de sortie de 4a.
- [ ] **Step 4** : les guides. Le contexte `superadmin` et sa liste déclarée ; l'octroi temporaire et le fait qu'il ne contourne rien ; le lien d'accès et l'interdiction de le journaliser.
- [ ] **Step 5** : les six portes, le décompte de lint du front comparé à `main`. Commit.

---

## Task 15 : le pont par un modèle global, sur le chemin ordinaire

**Ajoutée en cours d'exécution.** La revue de la tâche 1 a établi, par balayage, que le garde-fou
laisse passer une chaîne qui franchit un modèle global et redescend vers un **autre établissement
que celui du contexte** — sous un contexte de **tenant ordinaire**, pas seulement sous super-admin.

**Files:**
- Modify: `back/src/main/infra/orm/tenant-guard.ts` (`MODEL_RELATIONS` gagne la cardinalité)
- Modify: `back/src/test/unit/infra/tenant-guard.test.ts`, `tenant-guard-schema.test.ts`

**Interfaces:**
- Produces: `MODEL_RELATIONS` porte, pour chaque relation, si elle mène à **un** enregistrement ou
  à **plusieurs** ; le test de conformité au schéma la tient dans les deux directions.

Le défaut, prouvé sous contexte de tenant :

```ts
establishmentMembership.findMany({ where: { establishmentId: 'e1' },
  include: { user: { include: { establishmentMemberships: {
    include: { establishment: { include: { patients: true } } } } } } } })
```

1 964 chaînes sur 8 680 franchissent un global, dont 112 par l'arête `User → EstablishmentMembership`.
Condition d'exploitation : qu'un compte soit membre des deux établissements.

**Pourquoi il a échappé à tout :** la protection du chemin ordinaire repose sur le `where` de la
racine, qui épingle l'établissement. Les relations **vers** un modèle global sont toutes à-un, donc
inoffensives. Mais une relation **depuis** un global peut être à-plusieurs et traverser les
établissements — et c'est cette asymétrie que ni la descente de l'étape 3 ni la liste de la tâche 1
ne voyaient.

**Ce défaut préexiste au chantier** : le verdict est identique à `a13046b`. Aucune lecture du dépôt
ne l'emprunte aujourd'hui. Il n'avait aucun effet tant qu'il n'existait qu'un seul établissement ;
**c'est l'étape 4a qui le rend atteignable**, en permettant d'en créer un second.

- [ ] **Step 1** : reproduire le défaut par un test, sous contexte de tenant, et le montrer **rouge**.
- [ ] **Step 2** : porter la cardinalité dans `MODEL_RELATIONS`, tenue par le test de conformité au schéma dans les deux directions — une relation qui change de cardinalité dans le schéma doit faire rougir.
- [ ] **Step 3** : refuser la descente **depuis** un modèle global par une relation à-plusieurs, sous contexte de tenant comme sous super-admin.
- [ ] **Step 4** : la question symétrique, qui prime. Ce resserrement va faire tomber des lectures existantes : **corriger l'appel, jamais le garde-fou**. Énumérer ce qui tombe, et traiter chacune. Si le garde-fou paraît refuser à tort, **s'arrêter et le décrire**.
- [ ] **Step 5** : la monotonie, mesurée comme aux quatre tours de la tâche 1 : zéro refus perdu sur le chemin de tenant, et dire combien de cas ont été comparés.
- [ ] **Step 6** : commit.

---

## Auto-relecture du plan

**Couverture de la spécification.** §3.1 → tâches 4, 6, 10. §3.2 → tâche 9. §3.3 → tâche 7. §3.4 → tâches 1, 7. §3.5 → tâches 3, 8. §3.6 → tâche 9. §4.1 → tâche 6. §4.2 → tâche 1. §4.3 → tâche 3. §5 → tâche 2. §6.1 → tâche 4. §6.2 → tâches 5 à 10. §6.3 → tâche 11. §7 → tâches 12, 13. §8 → réparti, chaque tâche portant ses gardes. §9 → tâche 14.

**Conflits entre tâches.**

| Paire | Ce qui se partage | Constat |
|---|---|---|
| 1 → 6, 7 | la liste déclarée | Toute route du super-admin qui a besoin d'une opération absente de la liste doit **la déclarer en tâche 1**, pas la contourner. Si une tâche se retrouve à vouloir `Patient.findMany`, c'est le chemin qui est faux. |
| 2 → 3, 4 | les deux tables | Ordre impératif : la migration avant tout code qui les lit. |
| 3 ↔ 8 | les appartenances effectives | La tâche 3 écrit la fonction, la 8 la rend atteignable. Le test de dépôt de la tâche 3 doit rester vert après la 8. |
| 3 ↔ 9 | la désactivation d'un service | Un service désactivé disparaît des appartenances effectives. Les deux tâches touchent le même filtre ; celle des services ne doit pas le dupliquer. |
| 4 → 6, 10 | l'émission d'un lien | Deux appelants, un seul mécanisme. Le jeton en clair n'est rendu qu'au point d'émission. |
| 9 ↔ étape 3 | la garde de la migration | Créer un second service rend enfin possible l'état que la migration de l'étape 3 refuse. Cette migration est déjà appliquée partout : sans conséquence ici, **mais tout déploiement futur sur une base neuve la rencontrera**. Le document de déploiement de l'étape 3 le dit déjà ; la tâche 14 doit y renvoyer. |

**Cohérence interne.** Les noms employés d'une tâche à l'autre sont les mêmes : `effectiveMemberships`, `SUPERADMIN_OPERATIONS`, `runAsSuperAdmin`, `accessLinkDomain.issue`/`consume`. Les cinq classes du *Review Focus* sont rattachées aux tâches 3, 4, 6 et 9, chacune dans le style d'étapes de sa tâche.

**Ce que ce plan ne tranche pas, et qui devra l'être en chemin.** Le rôle d'établissement que confère un octroi — le plan dit `ADMIN`, la spécification ne dit que « coordinateur », qui est un rôle de service. Et ce que montre la liste des patients à un membre d'un établissement qui n'a **aucun** service : une liste vide ou un message. Les deux sont des décisions d'interface, à prendre quand l'écran existe.
