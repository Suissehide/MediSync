# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This directory (`back/`) is the Node/Fastify API. It is one of several apps under `MediSync/`: `front/` (React frontend), `deploy/` (Docker compose for Postgres + app), `docs/`. The root README (`MediSync/README.md`) is in French and contains the host-machine setup.

Before `npm start`, the Postgres container and the external `proxy` Docker network must exist:

```sh
docker network create proxy            # one-time
cd ../deploy && docker compose --profile db up -d
```

Node/npm versions are pinned by Volta in `package.json` (Node 24, npm 11).

## Commands

NPM scripts are orchestrated by [wireit](https://github.com/google/wireit) (see the `wireit` block in `package.json`); wireit handles caching and dependency between scripts, so you usually don't need to chain things manually.

- `npm run dev` — start with watch (`@swc-node/register`, no transpile step).
- `npm run start:development` / `npm run start:production` — `npm start` picks one via `per-env` from `NODE_ENV`.
- `npm run build` — `prisma generate` → `tsc --noemit` typecheck → SWC transpile `src` → `lib`. **The typecheck is
  scoped to `src/main/tsconfig.json` (plus `prisma/tsconfig.json`) — it does not check `src/test`.** A deliberate
  type error in a test file leaves this gate green (confirmed twice, by mistake, during the étape 3 multi-tenant
  work). Tests are transpiled by SWC without type checking, so this has no runtime effect, but a report that claims
  "no type errors" without saying "in src/main" is claiming more than this gate proves. A closely related and
  narrower gap: TypeScript does **not** flag excess properties on an object built by spreading (`{ ...p }`) and then
  assigned to a variable before being passed to Prisma or Zod — only a literal passed directly as an argument gets
  that check. Three real occurrences were found this way during étape 3 (the worst left the demo seed silently
  broken for a full correction round, with `tsc` reporting zero errors on it throughout).
- `npm run lint` — Biome on `src/main` (`npm run lint:ci` for CI).
- `npm test` / `npm run test:unit` / `npm run test:e2e` — Jest via `src/test/jest.config.ts` (`src/test/` is checked into git like any other source directory; see `runAsSystem-unicite.test.ts` cited below for one example path).
- Run a single test: `npx jest -c src/test/jest.config.ts -t "<name regex>"` or `npx jest <path/to/file.test.ts>`.
- `npm run cover` / `cover:unit` / `cover:e2e` — same as test variants with coverage.
- `npm run validate` — `deps:check` + `build` + `lint` + `cover` (used by CI).
- `npm run check:unused-methods` — **declared but not runnable**: `scripts/detect-unused-methods.ts`
  does not exist (`scripts/` holds only `bootstrap-super-admin.ts` and its `tsconfig.json`).
  Pre-existing; left as-is rather than silently removed.
- `npm run bootstrap:super-admin -- <email>` — **the only way to set `User.isSuperAdmin`.** No
  route writes that flag and the seed creates no super-admin, deliberately: an account of that
  power should not be one click away. It **promotes an existing account** (unknown address is
  refused), is idempotent, and also **reactivates** a deactivated identity it promotes — saying so
  in its output, because promoting a deactivated account would otherwise create a dormant
  privileged account. It is also the **only** way back for a deactivated super-admin:
  `assertNotSuperAdmin` refuses (de)activation from establishment administration in both
  directions, on purpose. It calls the locally installed `tsx` rather than `with:tsx`, which fails
  under Node 26 (`Cannot find module './plugins'`) — that breakage is **still open for
  `npm run seed`**, which shares `with:tsx`.
- Neither `lint` nor `build:check-typedefs` covers `back/scripts/`; that directory has its own
  `tsconfig.json`, added with the bootstrap script.

Prisma:

- `npm run prisma:migrate:dev` (auto-apply against `.env`/`.env.local`).
- `npm run prisma:migrate:create` — create a pending migration without applying.
- `npm run prisma:migrate:reset` — wipe + re-seed (uses `prisma db seed` → `prisma/seed.ts`).
- `npm run prisma:generate` — regenerate the client into `src/generated/` (not `node_modules`; this is wired through `prisma.config.ts` and the `output` in `schema.prisma`). Any schema change requires this.
- `npm run prisma:studio`.
- `*:test` variants of the migrate/seed commands point at `.env.test` (used by e2e/CI).

## Architecture

Layered architecture under `src/main/`, with each layer keeping its own subdir of interfaces in `src/main/types/` (so `domain/foo.domain.ts` implements `types/domain/foo.domain.interface.ts`, etc.). The layers compose via constructor injection from a single Awilix container.

```
src/main/
├── index.ts                         # bootstrap → application/starter
├── application/
│   ├── config.ts                    # Zod-validated env config
│   ├── starter.ts                   # builds IoC, configures + starts HTTP server
│   └── ioc/awilix/awilix-ioc-container.ts   # SINGLE registration site for everything
├── domain/                          # business logic classes (FooDomain)
├── infra/
│   ├── orm/postgres-client.ts       # Prisma client w/ normalizer extension
│   ├── orm/repositories/            # Prisma-backed repos per entity
│   ├── http/http-client.ts
│   └── logger/pino/pino-logger.ts
├── interfaces/http/fastify/
│   ├── fastify-http-server.ts       # Fastify instance w/ Zod type provider, error handler
│   ├── plugins/                     # cors, cookie, jwt, awilix, orm, …
│   ├── routes/{index.ts, <entity>.ts, auth/*}
│   ├── schemas/<entity>.schema.ts   # Zod request/response schemas
│   └── errors/                      # Boom + Prisma + Fastify error normalizers
├── services/activity-log.subscriber.ts  # cross-cutting event listener
├── types/                           # interface contracts mirroring each layer
└── utils/                           # app-event-bus, error-handler, auth-helper, …
```

Key cross-cutting concerns:

- **IoC container (`awilix-ioc-container.ts`)** is the *only* place classes get wired. Every domain, repo, plugin, etc. is registered there and typed into `IocContainer` (`types/application/ioc.ts`). Classes resolve their deps by destructuring the container in their constructor (`constructor({ slotRepository }: IocContainer)`). The container is attached to the Fastify instance as `fastify.iocContainer`, so routes read it via `const { iocContainer } = fastify`.
- **HTTP validation = Zod**, registered with `fastify-type-provider-zod`. Route schemas live next to routes in `interfaces/http/fastify/schemas/`; `schemas/index.ts` is a deliberately shared barrel of mutually-recursive schemas (note: Biome's `noBarrelFile` is on globally, so this is the exception, not the rule for new code).
- **Prisma client output** goes to `src/generated/` (see `generator client` in `schema.prisma`). Import models from there, not `@prisma/client`. A `normalizerExtension` in `postgres-client.ts` lowercases `email` and normalizes `phoneNumber` on every read/write — don't duplicate this in domains.
- **Auth** uses JWT inside an HTTP-only cookie. The guard is global and closed by default: an `onRequest` hook in `interfaces/http/fastify/routes/index.ts` runs `fastify.verifySessionCookie` (the cookie plugin's decorator) on **every** route, except the public ones (`/`, `/health`) and the `/auth/*` prefix. A new route is therefore protected even if its author forgets to say so; there is no per-route opt-in to add. That same hook first calls `tenantContext.clear()`, so every request starts with no tenant. The JWT plugin also exposes `verifyJWT` for header-based auth. Sign-in is in `routes/auth/sign-in.router.ts`.
- **AppEventBus (`utils/app-event-bus.ts`)** is a typed EventEmitter for cross-domain side effects. Domains call `appEventBus.emit('patient.created', …)`; `ActivityLogSubscriber` listens and writes to the activity log table. The subscriber is force-instantiated at container build time so its subscriptions are wired before the server starts.
- **Errors**: throw `@hapi/boom` errors from domains/routes. The Fastify error handler runs them through three normalizers in order (Prisma → Fastify → Boom). `ErrorHandler` (`utils/error-handler.ts`) maps known Prisma error codes (e.g. unique-constraint → 409) — repositories use it via `errorHandler.boomErrorFromPrismaError`.

## Multi-tenant

- **Tenant context (`utils/tenant-context.ts`)**: `resolveTenant` (plugin `tenant.plugin.ts`) reads
  `:establishmentId`/`:serviceId` from the URL, checks the user's memberships and stores the tenant in an
  `AsyncLocalStorage`. Repositories read it per call (`tenantContext.scope()` → `{ serviceId, establishmentId }`,
  `establishmentScope()`), never in constructors. Background jobs run under `tenantContext.runAsSystem()`.
- **Tenant guard (`infra/orm/tenant-guard.ts`)**: a Prisma extension that throws `TenantScopeMissingError` when a
  query on a service model lacks `serviceId` (or `establishmentId` for establishment models) in `where`/`data`.
  Model families are listed there (`SERVICE_MODELS`, `ESTABLISHMENT_MODELS`). It **fails closed**: an operation it
  doesn't recognize, a nested write on a relation absent from `NESTED_RELATIONS`, or an `include`/`select` on a
  relation absent from `MODEL_RELATIONS` — checked recursively, at any include depth, from any model's root
  (service, establishment or global) — is refused rather than let through unchecked — the error message names the
  entry to add. Add every new tenant model to the right list, every new nested write to `NESTED_RELATIONS`, and
  every relation of every model (not just establishment ones) to `MODEL_RELATIONS` (relation names come from
  `prisma/schema.prisma`). A relation whose carrying model is of family establishment and whose target is a
  service model requires its own `where: { serviceId }` on the include/select: reading from an establishment row otherwise
  returns the children of *every* service.
- **The `superadmin` context is a THIRD kind of context, with a declared capability list, and it
  fails closed (étape 4a).** The super-admin has no tenant, so `tenantContext.runAsSuperAdmin()`
  gives him a context of his own — not a bypass. What he may do is enumerated pair by pair in
  **two** tables in `tenant-guard.ts`, and an absent pair is refused exactly like a missing
  context:
    - `SUPERADMIN_OPERATIONS` — tenant models. Today: `Service` (`count`, `findMany`),
      `EstablishmentMembership` (`count`, `findMany`, `create`), `ServiceMembership` (`count`,
      `findMany`), `Patient` (**`count` only** — never a row), `ActivityLog` (`findMany`, `count`).
    - `SUPERADMIN_GLOBAL_OPERATIONS` — global models, its exact mirror. A global model **absent
      from this table is refused in full under `superadmin`, reads included**. Writes are named
      one by one: `User.create` (not `upsert`, which would overwrite an existing account),
      `Establishment.create`, `AccessLink.create`/`updateMany`,
      `SuperAdminAccessGrant.create`/`update` (**not `delete`** — revoking sets `revokedAt`; the
      row is the accounting trail the whole grant mechanism rests on, and the HTTP `DELETE` verb
      is not a row deletion).
  Two further checks apply under this context and are not replaced by either table: an
  `include`/`select` crossing the global↔tenant boundary is refused
  (`assertNoGlobalBridgeUnderSuperAdmin`), and nested writes under a declared `data` still go
  through `assertNestedRelations`. Adding a global model to the schema without an entry does not
  open it — the refusal names the missing pair. Four correction rounds went into this; the last
  independent sweep was 48 roots × 8 shapes, 157 095 648 cases at depth 11, zero leak, with
  monotonicity (no previously-refused case becomes allowed) measured on 7 031 232 cases.
  **That monotonicity sweep is now a versioned, re-runnable test** rather than a number in a
  report: `src/test/unit/infra/tenant-guard-monotonie.test.ts` pulls the comparison version out
  of git (`MONOTONIE_REF`, default `HEAD` — so it answers "does what I am writing lose a
  refusal?" while you edit) and carries no second copy of the guard. Depth 4 by default (~1 s,
  runs in the unit suite); `MONOTONIE_REF=f022ef9 PROFONDEUR=9 …` reproduces task 15's 61 923 360
  cases. Against `main` it reports ~1 800 "lost refusals" for the whole of étape 4a, all
  explained: the `AccessLink`/`SuperAdminAccessGrant` tables that task 2 created (undeclared
  relations used to be refused outright) plus task 1's deliberate `SUPERADMIN_GLOBAL_OPERATIONS`
  reopening.
- **A relation that REPARTS from a global model towards MANY rows is refused — under an ordinary
  tenant context too, in reads and in writes (étape 4a, task 15).** The ordinary path's safety
  comes from the ROOT's `where`, which pins the establishment. Relations *towards* a global model
  are all to-one (`EstablishmentMembership.user`, `Patient.establishment`, `AccessLink.user`) and
  stay allowed — one pinned row leads to one global row. A relation *from* a global model can be
  to-many, and that one is bounded by nothing: `User.establishmentMemberships` returns the
  account's memberships in **every** establishment, `Establishment.patients` the patients of
  whichever establishment the (uncomparable) global `where` picked. Measured before the fix, on
  the real database: under establishment A's tenant, the chain
  `establishmentMembership.findMany({ where: { establishmentId: A }, include: { user: { include:
  { establishmentMemberships: { include: { establishment: { include: { patients: true } } } } } } } })`
  returned **B's patient**, and `establishment.update({ where: { id: B }, data: { patients:
  { create } } })` **wrote** a patient into B. `MODEL_RELATIONS` therefore carries the
  CARDINALITY (`one('X')` / `many('X')`), held against `prisma/schema.prisma` in both directions
  by `tenant-guard-schema.test.ts` — a relation that becomes `Type[]` and stays declared `one`
  reopens the bridge silently, so that test names cardinality on its own. Two consequences when
  adding a model: declare each relation with its cardinality, and expect the guard to refuse a
  nested write from a global root outright (no global model has a `NESTED_RELATIONS` entry —
  use the scalar FK, `userId: u`, not `user: { connect: { id: u } }`).
  **What this rule does NOT cover — read this before assuming the boundary is closed.**
    - **It does not apply without a context, and "without a context" means every non-tenant
      route, not just login.** `routes/index.ts` calls `tenantContext.clear()` on every request
      and `tenant.plugin.ts` is the only caller of `enter()`, so **no route outside
      `/e/:establishmentId/...` ever enters a context**: `/auth`, `/me` and the whole
      `/super-admin` prefix run with no store, their repositories entering `runAsSuperAdmin`
      only case by case. Concrete consequence: a future read added under `/super-admin` and left
      outside a `runAsSuperAdmin` could reach patients through
      `Establishment.findUnique({ include: { patients: true } })`, **bypassing
      `SUPERADMIN_OPERATIONS` entirely** — whose lack of `Patient.findMany` is precisely
      motivated by "the super-admin counts, he does not read". Pre-existing, not a regression
      (measured), deliberately left open at task 15 and carried to the head of étape 4b.
    - **On the write side it closes the nested `data` only.** A FLAT write on the global row
      itself is still wide open under a tenant context — `Establishment.update({ where: { id:
      someOther }, data: { name } })`, `Establishment.deleteMany({})`,
      `User.updateMany({ data: { isSuperAdmin: true } })` — because a global model has no tenant
      column to compare. Pre-existing and out of task 15's scope (whose defect was relation
      crossing). The super-admin context has a counterpart for this
      (`SUPERADMIN_GLOBAL_OPERATIONS`); the tenant context has none.
    - **A read that only needs a few columns of `User` must use `findIdentity`, never
      `findByID`.** `findByID` carries the whole membership tree, so it is now refused under a
      tenant context — and `ActivityLogSubscriber` swallowed that refusal behind a
      `.catch(() => null)`, silently writing every activity-log row of every tenant route with a
      null author. `src/test/e2e/activity-log-auteur.test.ts` asserts the author's **name**;
      asserting that the row exists proves nothing, because it always did.
- **A temporary grant does NOT bypass the guard — it confers memberships.** A super-admin holding
  a live `SuperAdminAccessGrant` does not enter the `superadmin` context to reach an
  establishment's screens: he goes down the **ordinary tenant path**, with the memberships the
  grant yields (`domain/accessGrant.domain.ts`, `effectiveMemberships`) — establishment `ADMIN`
  plus `COORDINATEUR` on each **active** service. Proven by comparing 26 routes between a real
  member and a granted super-admin, status and body byte for byte, no divergence either way
  (`src/test/e2e/super-admin-acces.test.ts`); without a grant, 404 everywhere. Three things follow
  and are easy to get wrong: the grant is re-evaluated **at read time** against the
  `isSuperAdmin` flag (dropping the flag drops the access immediately, no re-login), the
  repository **re-reads the flag itself** from a bare id (no caller-supplied user object — a
  forged literal used to reopen it), and a grant **never materialises a real membership**, so no
  code may assume "the creator is a member of this establishment" (that assumption was true when
  written and false two tasks later; it produced a misleading 404 on service creation).
  `src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts` keeps `effectiveMemberships`
  the single caller — but it does NOT catch a local re-implementation, and it says so.
- **An access link resets the password of the `User`, which is GLOBAL — this is the invariant that
  governs every route returning a token.** A link does not grant access "to this establishment",
  it grants access **to the account**, hence to everything that account reaches. Three privilege
  escalations came out of ignoring it (an establishment admin taking over an account of another
  establishment, taking over the super-admin account, and — through the twin global column
  `User.deactivatedAt` — deactivating the super-admin platform-wide). They are closed by **one
  shared guard**, `MembershipDomain.assertIssuableToken`, called before every establishment-level
  `issue()` — not a copy per route. What keeps it honest:
  `src/test/unit/infra/access-link-issue-sites.test.ts`, which enumerates the `.issue(` call sites
  in `src/main` and requires the domain to call the guard at least as often as it issues. **Put
  the guard on the token, never on the route**: the previous round put it on reissue only, and
  `POST /account` walked straight past it. The escape hatch that makes the refusal tenable is
  `UserDomain.reissueAccessLink`, under `/super-admin` — do not remove it without reopening the
  question (there is no forgotten-password route and `PATCH /me` does not change a password).
- **Never log an access-link token, and never put one in a URL.** The token travels only in the
  **body** of `POST /auth/access-link/consume`; the DB holds only its SHA-256
  (`AccessLink.tokenHash`), never the token. `pathWithoutQuery` (`utils/url-helper.ts`) strips
  only the query string, so a token in a *path segment* would survive into the request log intact
  — which is exactly how the leak reopened at étape 4a, through the **404 path** of a route that
  did not exist. `src/test/unit/interfaces/access-link-token-leak.test.ts` watches the log
  channels and was proven by sabotage to exercise the real domain and repository. **Known gaps in
  that net, do not read it as universal**: a response *header* carrying the token passes, and a
  direct write to stdout passes. Both verified on the wire.
- **Clinical field filtering (`utils/clinical-fields.ts`, wired into `tenant.plugin.ts`)**: `notes`, `details`,
  `medicalDiagnosis` (now on `PatientServiceFile`, the per-service sub-record — see below, moved off `Patient` in
  étape 3) and `transmissionNotes` (patient enrolled in an appointment) are **not** filtered in response schemas.
  Two Fastify hooks strip them, in both directions: `stripClinicalFields` (`preSerialization`, gated on
  `clinical:read`, recurses into nested payloads) and `stripClinicalInput` (`preValidation`, gated on
  `clinical:write`, strips the same keys from request bodies — a stripped key leaves the DB column unchanged, it
  doesn't blank it). Both are attached to the route plugins, not to individual routes, so a new route is covered
  by default; don't reintroduce clinical fields in a route-local schema tweak, they'd bypass nothing but the hooks
  still run on the handler's return value. The sub-record's routes (`interfaces/http/fastify/routes/patientServiceFile.ts`)
  needed no change to be covered — this was verified by a test rather than assumed, per the multi-tenant étape 3 spec §5.2.
- **The patient sub-record (`PatientServiceFile`) is a service model; the sixteen clinical/pathway columns are no
  longer on `Patient`.** `Patient` now carries only identity and contact info (`firstName`, `lastName`, `birthDate`,
  `phone1`/`phone2`, `email`) plus socio-demographic context — fields that don't change from one service to
  another — and stays establishment-scoped (`ESTABLISHMENT_MODELS`); `GET /patient` (`findAll`) therefore still
  returns full patient rows with no service filter, a known gap, not something this note fixes. The sixteen columns
  that do vary by service (care pathway, medical diagnosis, notes, discharge summary…) live on
  `PatientServiceFile`, one row per `(patientId, serviceId)`, a **service model** like any other (`SERVICE_MODELS`,
  cascade-deleted from `Patient`). `DiagnosticEducatif` and `EnrollmentIssue` point at the sub-record via
  `(patientId, serviceId)` rather than at `Patient` directly. The sub-record is created lazily — on first write to
  it (`upsert`) or through `PatientServiceFileDomain.ensureExists`, called from every domain path that attaches a
  patient to a service (pathway enrollment, `DiagnosticEducatif` creation, direct patient creation via
  `PatientDomain.create`) — and **no route deletes one**; only deleting the patient (cascade) does. An empty
  sub-record created by mistake is therefore permanent, and will make the "followed elsewhere" signal (below) true
  for every other service that actually follows that patient.
- **The deliberate cross-service reads, and the two different tests that keep them honest — not one test, not a
  call count.** A patient in one service is sometimes already followed in another; the front needs to know that (a
  plain boolean, nothing else) without seeing anything about it. `PatientServiceFileRepository.estSuiviAilleurs`
  (in `infra/orm/repositories/patientServiceFile.repository.ts`) reads another service's sub-records for that
  purpose, under `tenantContext.runAsSystem()` (the same escape hatch used by the activity-log purge job). A
  second read, added at étape 4a task 9, is `PatientServiceFileRepository.impactDesactivation` — called from
  establishment administration (`GET /e/:establishmentId/admin/services/:id/impact-desactivation`, no service in
  scope at that level) to warn how many patients a service's deactivation would make invisible everywhere. **This
  is not the same computation as `estSuiviAilleurs`, on purpose**: `estSuiviAilleurs` answers "does a sub-record
  exist elsewhere", true even if that other service is deactivated today (the sub-record still exists, and that
  service can be reactivated); `impactDesactivation` answers "will this patient become invisible everywhere", and
  an elsewhere that's already deactivated protects no one — so it counts active elsewhere-services only. Aligning
  the two would break one of them; see the comment on `impactDesactivation` for the detail. Both return only
  aggregates or booleans, never an id, a service name, a date or any column content, and nothing else in
  `src/main` does this.
  **Two different tests keep two different properties here (task 9's second review round found a prior version of
  this very paragraph collapsing both into one false claim: it said the bounds-checking lived in
  `runAsSystem-unicite.test.ts`, and proved that false by putting an empty `where` on both queries above — that
  test stayed 3-for-3 green, because it never reads a query's contents):**
    - `back/src/test/unit/infra/runAsSystem-unicite.test.ts` keeps the CAPACITY: that every place in `src/main`
      able to enter a non-tenant mode is a declared, named call site with a reason — it does this by grepping for
      the method name, and separately re-deriving the "system mode" capability itself (constructing the
      system-scoped store some other way — e.g. a hypothetical `TenantContext.runAsSystem.bind(...)` or a sibling
      method — defeats the guard exactly like calling `runAsSystem` directly would). It never looks at what a
      query's `where` contains.
    - `back/src/test/unit/infra/repository-scope.test.ts` (the `PatientServiceFileRepository.estSuiviAilleurs`,
      `.impactDesactivation` and `MembershipRepository.estRattacheAilleurs` describes) keeps the BOUNDS: it captures the actual arguments each method sends to
      Prisma and asserts they carry explicit, self-contained filters, then separately proves that exact shape would
      be refused by the guard outside the framed mode.
  A fifth declared site joined them at étape 4a task 15: `MembershipRepository.estRattacheAilleurs`, which
  answers "is this account attached to an establishment other than the current one?" with a **boolean and nothing
  else**. It exists because that question is, by nature, about the other establishments (`User.deactivatedAt` and
  an access link are GLOBAL, so acting on them from one establishment would reach the others — which is exactly
  what the calling guards refuse), so no tenant-bounded query can answer it. It **replaces a strictly wider read**:
  `MembershipDomain` used to load the account's entire membership tree through `UserRepository.findByID` just to
  take a `length` — an `include` leaving the global `User` by a to-many relation, now refused under a tenant
  context. What crosses the boundary went from the whole tree to one bit.
  Adding an undeclared `runAsSystem` call to `src/main` is a guard violation, not a passing test. Known gap: the
  allow-list only covers `src/main` — several legitimate `src/test` callers construct the same
  "system" store to exercise the tenant guard itself, so that directory isn't covered (same class of gap as the
  typecheck one above). **A narrower, separate gap, worth stating rather than assuming away** (found at the étape
  4a final review): the named allow-list above (`AUTORISES` in `runAsSystem-unicite.test.ts`) exists only for
  `runAsSystem`. `runAsSuperAdmin`'s own call sites (twelve in `src/main` today) are not enumerated by name
  anywhere — a thirteenth call added anywhere in `src/main` leaves every check in that file green. Only its
  *construction* is unique (one `run` call, one literal `{ kind: "superadmin" }`, both confined to
  `tenant-context.ts`), which closes a second way *in* but not "who may invoke it once inside". This is defensible
  as-is: once inside the mode, every operation still passes through the declared, exhaustive
  `SUPERADMIN_OPERATIONS`/`SUPERADMIN_GLOBAL_OPERATIONS` tables, so a thirteenth call site cannot by itself widen
  what it's allowed to do — but that is a different guarantee from "every site is named and justified", and the
  surrounding vocabulary should not be read as promising the latter. Because `GET /patient/:id` carries `followedElsewhere`, and the identity-search route
  (used before creating a patient, to avoid duplicates) returns bare identifiers, the signal is only computed and
  returned **when the current service already has a sub-record for that patient** — otherwise finding someone by
  name would itself leak "followed elsewhere" to a service that has never actually seen them. See
  `docs/multi-tenant/decisions-etape-3.md` (D3) for the incident this closes.
- **Permissions**: routes under `/e/:establishmentId/s/:serviceId` and `/e/:establishmentId/admin` MUST declare
  `config: { permission }` (matrix in `utils/permissions.ts`, mirrored in `front/src/utils/permissions.ts`; a unit
  test checks both copies are identical). Server startup fails otherwise. Two `onRoute` fail-safes enforce this:
  `assertRoutePermission` on each of the two route plugins, and `assertTenantShapedRoute` at the root of
  `routes/index.ts`, which judges on the URL shape — so a route carrying `:establishmentId` registered *outside*
  those plugins, and therefore outside the resolution, permission and clinical-filtering hooks, also fails the boot.
  **Routes under `/super-admin` have the same pair** (étape 4a): `superAdminRoutes` adds
  `assertRoutePermission` plus an `onRequest` `requireSuperAdmin` that answers **404, never 403**,
  to an account without the flag — same stance as tenant resolution, don't reveal a zone you may
  not see. And `assertSuperAdminShapedRoute`, posted at the root, fails the boot for any route
  whose URL starts with that prefix but was registered elsewhere. **Known limit, same as its
  tenant sibling**: Fastify exposes no way, inside `onRoute`, to inspect the hook chain a route
  will actually inherit, so this guard forces a permission to be *declared* — it does **not**
  prove `requireSuperAdmin` was wired onto that route. The declared capability lists of the
  tenant guard are the last net there.
- **`request.tenant` is optional on purpose.** It only exists once `resolveTenant` has run. On the failure path it is
  never set, and later hooks still execute on the error payload — the three tenant hooks therefore check it and fail
  closed (clinical filters strip, permission returns the same 404 as resolution). In a handler, use `requireTenant`
  rather than a non-null assertion: an assertion would silence the next route that forgets the hook.
- **Composite keys**: lookups by id use `where: { id_serviceId: { id, serviceId } }`. Nullable references
  (`locationID`, `thematicId`, `templateID`…) have no composite FK: domains verify the target via its repository.
- **E2E tests** (`src/test/e2e/`): shared fixtures and app/db harness live in `src/test/e2e/setup/` (`buildTestApp`,
  `testDb`, `truncateAll`, membership/user factories). `setup/db.ts` refuses to run against any database whose name
  isn't exactly `medisync_test`, so a misconfigured `.env.test` can't truncate the wrong database. Run against
  `medisync_test` (`.env.test`, `.env.test.local` for a machine-specific override) via `npm run test:e2e`; the
  pre-commit hook runs unit tests only.

## Adding a new entity

1. Add the Prisma model in `prisma/schema.prisma`. For a service-scoped model add `establishmentId` and
   `serviceId` (`@@unique([id, serviceId])`); for an establishment-scoped model add `establishmentId` only
   (`@@unique([id, establishmentId])`). Then `npm run prisma:migrate:create` (or `:dev` to apply).
2. `domain/<name>.domain.ts` + `types/domain/<name>.domain.interface.ts`.
3. `infra/orm/repositories/<name>.repository.ts` + `types/infra/orm/repositories/<name>.repository.interface.ts`.
   The repository's constructor receives `tenantContext` and calls `.scope()`/`.establishmentScope()` per method,
   never at construction; its entity-creation input type omits the tenant columns (the repository sets them, not
   the caller).
4. `interfaces/http/fastify/schemas/<name>.schema.ts` (Zod) + `interfaces/http/fastify/routes/<name>.ts`. Every
   route declares `config: { permission }` — the server refuses to start otherwise.
5. Register the domain + repo in `awilix-ioc-container.ts` AND add their fields to `IocContainer` in
   `types/application/ioc.ts`.
6. Register the new router in `interfaces/http/fastify/routes/index.ts`.
7. Add the model to `SERVICE_MODELS` or `ESTABLISHMENT_MODELS` in `infra/orm/tenant-guard.ts` (and to
   `NESTED_RELATIONS` if another model writes it through a nested relation) — without this the guard rejects every
   query on it. Every model — not just establishment ones, all 28 of them — also gets an entry in
   `MODEL_RELATIONS` listing *all* its relations **with their cardinality** (`one('X')` / `many('X')`, copied from
   `prisma/schema.prisma`: `X[]` is `many`, `X` and `X?` are `one`), and any model gaining a relation towards it
   must have that relation added there too — an undeclared `include`/`select` is refused, and a wrong cardinality
   on a relation leaving a GLOBAL model reopens the cross-establishment bridge (see the task-15 bullet above).
   `tenant-guard-schema.test.ts` holds both the targets and the cardinalities against the schema, in both
   directions.
8. Add a case to `src/test/e2e/isolation.test.ts` proving a caller from one tenant can't reach another tenant's
   rows through the new entity (directly, and through any parent that embeds it).

The existing `LocationDomain`/`LocationRepository`/`location.*` files (added recently) are a complete reference for steps 2–6.

## Code style

Biome enforces 2-space indent, single quotes, no semicolons, and an import grouping convention (`:NODE: / :PACKAGE: / :ALIAS: / :PATH:`). Several non-default rules are errors and worth knowing about because they shape the codebase:

- `performance/noBarrelFile` and `noReExportAll` — don't create new `index.ts` re-export hubs.
- `correctness/noUnusedImports`/`noUnusedVariables` — these break lint, not just warn.
- `suspicious/useAwait` — `async` functions must `await` something.
- `complexity/noExcessiveCognitiveComplexity` — split large route handlers.

A husky `pre-commit` hook runs `npm test`.

## Testing & API exploration

- HTTP requests for manual exploration live in `bruno/` (open with the Bruno API client). **The whole collection's
  `BASE_URL` environment variable has no tenant prefix** (`{{BASE_URL}}/patient/...` instead of
  `{{BASE_URL}}/e/:establishmentId/s/:serviceId/patient/...`), so every request under a tenant-scoped router 404s
  as-is — confirmed on all seven Patient requests. Pre-existing, not specific to the patient collection; fix the
  environment variable rather than individual requests if this gets addressed.
- The CI test environment uses `deploy/.env.test`; the `*:ci` wireit targets bring up a separate test DB via that env file before running tests.
