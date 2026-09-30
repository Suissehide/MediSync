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
- **The Prisma laziness trap, stated CORRECTLY — it took three rewrites to get here, so read this
  one and not the older phrasings.** A Prisma query is lazy: `runAsSuperAdmin(() => prisma.x.count(…))`
  returns the promise without awaiting it, the real work then starts outside the `AsyncLocalStorage`
  scope, and the guard reads the ambient tenant instead. The old adage — *"always `await` INSIDE the
  callback"* — was imprecise, and so was its first correction (*"what holds the property is the
  `async` wrapper"*), which described a symptom. The exact rule:
  > **What matters is that the context is READ BEFORE THE FIRST SUSPENSION POINT.**

  A plain **synchronous** callback is fine if it reads straight away: `deleteOlderThan` (both journal
  repositories) calls `tenantContext.peek()` **synchronously at the top of its body**, before any
  `await`, and the property holds. An `async` callback protects nothing if it reads *after* a wait.
  The `async` wrapper works because the value it returns goes through a promise resolution Node ties
  to the scope active at call time — which amounts to not suspending before reading. **The repo's
  convention remains an `async` callback with an inner `await`, but for a different reason than the
  one long written here**: Biome's `suspicious/useAwait` rejects an `async` callback with no `await`
  (verified: `npm run lint` fails on exactly that shape), and a callback that never suspends reads
  badly next to neighbours that do. Measured at étape 4b task 6 on a real caller
  (`PatientAccessLogRepository.findAllPlatformWide`): a bare synchronous callback reddens
  `repository-scope.test.ts` → "findAllPlatformWide conserve le contexte superadmin jusqu au dispatch
  reel de Prisma", **alone**. Before that task, the property was held only by accident — no assertion
  aimed at it.
- **An event that is declared must ACTUALLY write a line, and that is proved by execution (étape 4b,
  task 7).** A *static* guard ("does every `AppEvents` entry have a subscription?") would not have
  caught the real defect: `user.accessLinkReissued` **was** subscribed — the line died, swallowed by
  `#log`'s `catch` after the tenant guard refused it (`/super-admin` runs with no store at all, and
  `ActivityLog` is an establishment model). Nothing failed, nothing was visibly missing; only the
  trace vanished. `src/test/e2e/activity-log-emissions-declarees.test.ts` now emits **every declared
  event under the context its real call site uses** (read from the *source* of `AppEvents`, never
  copied by hand) and requires a line to appear, with a **named** exemption list (empty today).
  **That source reading itself failed open until the final branch review, which is the one way this
  guard must never fail.** Its pattern was line-based and required the closing brace on the *same
  line*, so an event declared over four lines — what the formatter produces as soon as the payload
  exceeds the line width, and one existing event is already 87 characters — was **not seen at all**:
  neither classified, nor exempted, nor reported. Proved by execution: a three-field event added
  over four lines left the file **18/18 green**. The reader now **balances braces**, lives in
  `src/test/shared/app-events-source.ts` (shared with the vocabulary contract below, so both ask the
  same source the same question), and `EXEMPLE_MULTILIGNE` holds it by a test that **is** the
  counter-example. A low bound on the number of events read catches the other failure mode (the
  reader breaking entirely and returning nothing).
  It lives in e2e, never unit: a stubbed repository cannot reproduce the real Prisma refusal, so a
  unit test would catch a caricature of the defect. **The trap stays armed for what is not yet
  written**: any future event emitted from a non-tenant route will be refused and swallowed the
  same way.
- **The action vocabulary is a CONTRACT between the two repos, like the permission matrix
  (étape 4b, final branch review).** `ActivityLog.action` can carry **19** values (the 17 `AppEvents`
  keys plus `ACTIVITY_LOG_SCRIPT_ACTIONS`, `utils/activity-log-actions.ts` — the two lines the
  bootstrap script writes outside the bus); `PatientAccessLog.action` carries the four of
  `AccessAction`. The front's platform screen reused the dictionary written for the *service*
  activity screen — true of its provenance, false of its coverage — and named only **8** of the 19,
  missing every `member.*`, both script actions, `patient.removedFromPathway` and
  `user.accessLinkReissued`, i.e. the very line task 7 exists to create.
  `src/test/unit/utils/access-log-vocabulaire.test.ts` now binds both dictionaries to their source,
  **in both directions** — an unnamed action reddens, and so does a label matching nothing.
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
      `findMany`), `Patient` (**`count` only** — never a row), `ActivityLog` (`findMany`, `count`),
      `PatientAccessLog` (`findMany`, `count` — the audit journal behind
      `GET /super-admin/access-log?source=acces`, never a `Patient` row). **`count` has been in and
      out of this table, and the round trip is the lesson**: it was first declared "for symmetry"
      with `ActivityLog` and removed at the final branch review because **no call site exercised
      it** (the discipline written above `NO_CONTEXT_GLOBAL_OPERATIONS` — "an entry with no route is
      an entry to delete" — applies here too), then **re-declared on 2026-10-01** when the
      pagination of that route gave it one: `findAllPlatformWide` now counts the same `where`
      outside the page, without which the last page is unreachable. Removing the entry does **not**
      yield a total of zero — the table fails closed, so the route answers **500**.
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
  runs in the unit suite); `PROFONDEUR=9 …` is the deep sweep, run by hand. **Its case count is
  not a constant** — it is derived from `MODEL_RELATIONS` *and* from the shapes the file itself
  enumerates, so it grows whenever the schema gains a relation **and whenever the sweep is
  widened**: 61 923 360 when task 15 measured it against `f022ef9`, 80 198 400 at the start of
  étape 4b task 9, **100 249 450 after that task widened it** — depth 0 (bare shapes, no
  `include`) and four verbs (`delete`, `deleteMany`, `updateMany`, `upsert`) were missing
  entirely, so **the instrument was seeing a fifth less than its own header claimed**, an
  under-coverage of twenty million cases. Zero lost refusals before and after. Quote the count
  your own run printed, not this one.
  **Against `main` it reports 349 lost refusals, not the ~1 800 this file used to say** — that
  figure was inherited from étape 4a and was wrong on three counts at once. Re-measured at étape
  4b task 9 and again when writing `docs/multi-tenant/decisions-etape-4b.md` (`MONOTONIE_REF=main`,
  depth 4, 4 016 chains, 202 250 cases): **349**, split `{tenant: 315, superadmin: 34}`, **zero
  under "no context"** (task 9 closed that whole family), and **349 out of 349** caused by
  `PatientAccessLog` — a model of étape **4b**, not by the two tables of étape 4a. Verified by
  filtering the full list, not a sample. Adding a model necessarily relaxes verdicts; the only
  question worth asking is *which ones*. Note that `MONOTONIE_REF=main` therefore **fails** by
  design — it is an on-demand comparison, not part of the default suite, which compares against
  `HEAD`.
- **"No context" is a FOURTH declared context, not a free pass (étape 4b, task 9).** Tenant
  models were already refused without a store (`assertTenantScope` throws on `!store` before
  anything else); **global models were not** — they leave through `assertGlobalScope` and used
  to meet no permission gate at all, so `Establishment.deleteMany({})` and
  `User.updateMany({ data: { isSuperAdmin: true } })` passed on `/auth`, `/me` and the whole
  `/super-admin` prefix. `NO_CONTEXT_GLOBAL_OPERATIONS` is the exact mirror of
  `SUPERADMIN_GLOBAL_OPERATIONS` for that case: `User` (`findUnique`, `findUniqueOrThrow`,
  `update`, `create`), `Establishment` (`findMany`, `findUniqueOrThrow`), `AccessLink`
  (`findUnique`, `create`, `updateMany`); `SuperAdminAccessGrant` is **absent on purpose** — its
  six call sites all have a context, though **not all for the same reason**: five are framed by
  `runAsSuperAdmin`, and the sixth (`findForEstablishment`, `GET /e/:establishmentId/admin/grants`)
  runs under a real *tenant* context, its `establishmentId` coming from `establishmentScope()`.
  It is therefore refused in full without a context. **The list was measured, not guessed**: the
  guard was instrumented to journal every (model, operation) seen with `peek() === undefined`
  and the whole e2e suite run — 1 243 calls, 8 distinct pairs, zero of them on a tenant model.
  The ninth entry, `User.create`, was **missing from that measurement** because no e2e test
  exercised `POST /auth/register`; `src/test/e2e/auth-register.test.ts` now covers it, and the
  instrumentation re-run confirms it: **1 244 calls, 9 pairs**. **Three named limits**, all in
  the table's comment: a declared single-row read may still `include` a tenant relation (that is
  `UserRepository.findByID`, the authority read on every authenticated request); a nested `data`
  under a declared write is not checked without a context; and **a declared write is bounded
  neither by row nor by column** — `User.update({ where: { id }, data: { isSuperAdmin: true } })`
  passes, while its mass twin `User.updateMany` is refused. That third one is not exploitable
  today, but only because of the *callers* (Zod strips unknown keys on register, `PATCH /me`
  destructures two fields) — never read "only scalar columns" as a guarantee, `isSuperAdmin` is
  a scalar column.
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
    - **This rule (cardinality) still does not apply without a context, and "without a context"
      means every non-tenant route, not just login.** `routes/index.ts` calls
      `tenantContext.clear()` on every request and `tenant.plugin.ts` is the only caller of
      `enter()`, so **no route outside `/e/:establishmentId/...` ever enters a context**:
      `/auth`, `/me` and the whole `/super-admin` prefix run with no store, their repositories
      entering `runAsSuperAdmin` only case by case. It cannot be extended there: `cookie.plugin`
      reads `UserRepository.findByID` — `user.findUniqueOrThrow` with
      `include: { establishmentMemberships: … }`, a to-many relation leaving a global model — on
      **every authenticated request**, to establish which establishments the account belongs to.
      Refusing that would refuse every request. **What WAS closed instead, at étape 4b task 9, is
      the permission gate** — see the "FOURTH declared context" bullet above.
    - **On the write side it closes the nested `data` only.** A FLAT write on the global row
      itself is still wide open under a tenant context — `Establishment.update({ where: { id:
      someOther }, data: { name } })`, `Establishment.deleteMany({})`,
      `User.updateMany({ data: { isSuperAdmin: true } })` — because a global model has no tenant
      column to compare. Pre-existing and out of task 15's scope (whose defect was relation
      crossing). The super-admin context has a counterpart for this
      (`SUPERADMIN_GLOBAL_OPERATIONS`), and **since étape 4b task 9 so does "no context"
      (`NO_CONTEXT_GLOBAL_OPERATIONS`)**; the tenant context still has none — under a tenant
      context those three flat writes remain permitted.
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
  `runAsSystem`. Its own numbered **prose** list of `runAsSystem` sites was wrong until the final
  branch review, in a way worth knowing because it is the failure mode of every hand-kept list: the
  assertions were right, the prose had drifted — it mixed two units of count (six declared
  *entries*, eight *calls*) and had never taken in task 7's site, which `AUTORISES` had carried
  since its commit.
  `runAsSuperAdmin`'s own call sites (twelve before étape 4b task 6, **fourteen today** — that
  task added two, in `activityLog.repository.ts` and `patientAccessLog.repository.ts`, both for
  `findAllPlatformWide`, the read behind `GET /super-admin/access-log` — and said so rather than letting the
  count drift silently) are not enumerated by name anywhere — a fifteenth call added anywhere in `src/main`
  leaves every check in that file green. Only its
  *construction* is unique (one `run` call, one literal `{ kind: "superadmin" }`, both confined to
  `tenant-context.ts`), which closes a second way *in* but not "who may invoke it once inside". This is defensible
  as-is: once inside the mode, every operation still passes through the declared, exhaustive
  `SUPERADMIN_OPERATIONS`/`SUPERADMIN_GLOBAL_OPERATIONS` tables, so a fifteenth call site cannot by itself widen
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
- **Patient access log — a GET route that names a patient is journalled BY DEFAULT, or the boot
  fails (étape 4b).** Writes have been traced since étape 2 (`ActivityLog`); *reads* left no trace
  at all, and in a care application it is the read that looks exactly like its own abuse. The
  model is `PatientAccessLog` (a **service** model, same pattern as `PatientServiceFile`), and the
  single source of truth for what is journalled is `utils/access-log-routes.ts`. Four moving parts,
  don't wire a fifth:
    - **`patientIdParamOf` — detection is STRUCTURAL, never by parameter name.** A `/patient/`
      segment followed by a parameter, *whatever it is called*, plus a secondary net for a
      `patientId`/`patientID` parameter outside such a segment. The first version matched the
      *name*, and a real route `GET /patient/:patient_id/sonde-revue` added to the real router
      **booted fine, served an identified record, wrote nothing, and nothing anywhere said so**.
      This repo has already proved the spelling drifts (`:patientID` vs `:patientId` on the
      diagnostic routes). **Residue, stated rather than hidden**: a record under *both* an unheard-of
      segment and an unheard-of parameter name (`/dossier/:id`) escapes both nets. No syntactic rule
      can guess that a new segment means "patient".
    - **Two declared lists**, both compared against the REAL routes, in both directions.
      `LOGGED_PATIENT_ROUTES` (URL → action) and `EXEMPTED_PATIENT_ROUTES` (URL → reason in plain
      words — an exemption is justified *positively*, the default is to journal).
      `assertPatientReadLogged` (`onRoute`) fails the boot on an undeclared route;
      `assertNoDeadPatientAccessEntry` (`onReady`, with the routes actually seen) fails it on an
      entry that no longer matches anything. Only GETs: writes are already in `ActivityLog`.
    - **A root sibling, like the other two guards.** `assertPatientRouteUnderTenant`
      (`routes/tenant.routes.ts`, posted at the root by `routes/index.ts`) refuses **flatly** any
      patient-shaped GET registered outside the tenant prefix — it consults no journalling list,
      because outside `tenantRoutes` the write hook does not exist and an entry there would promise
      a coverage nothing could keep. A route that legitimately needs to live outside goes in
      `EXEMPTED_ADMIN_PATIENT_ROUTES`, **with its reason**, guarded in turn by
      `assertNoDeadAdminPatientExemption`. **Never rename a parameter to slip under the net** — it
      was tried (`:patientID` → `:patientRef`) and a probe then served a full record, 200, no log
      line, all 21 e2e suites green. A rename declares nothing; it blinds the net for every future
      route that picks that name.
    - **`recordPatientAccess` — an `onResponse` hook**, so the response has already left: a 4xx/5xx
      leaves no line, a slow write never slows a record read. It refuses `HEAD` (no body was sent,
      nobody read anything), and it checks `tenantContext.peek()` returns **the very same object**
      as `request.tenant`, by identity — losing a line is visible, a line attributed to the wrong
      establishment is not. **A failed write never blocks the read** (refusing care because the log
      is down is the wrong trade) **but is never silent either**: `request.log.error` with the
      `reqId` and **only the error's CLASS** — an uncaught Prisma error copies the whole failed
      `data`, i.e. the patient id and the agent's name.
  Four actions today (`dossier.ouvert`, `sousDossier.ouvert`, `echecsInscription.consultes`,
  `export`); `action` is a text column, so a fifth costs no migration. **The export is a dedicated
  device**: `GET /patient/export` has no route parameter, so it is journalled in **one line** with
  its record count and criteria (`plannedPatientExportAccess`), the count coming from the handler
  via `request.patientExportCount` — never recomputed, which would replay the query and could
  diverge. `patientId` is nullable **for that reason alone**. `exportFilters` is the only free-text
  column of the table and `PatientAccessLogDomain.record` refuses any clinical key in it,
  recursively, refusing rather than accepting anything it cannot parse.
  **All three journal reads are paginated since 2026-10-01, and the pagination is one shape, not
  three.** Every journal response is `{ data, total, page, pageSize }`, `page`/`pageSize` default to
  1 and 50, and `pageSize` is capped at **100** by the Zod query schema. Before that date only the
  establishment-administration journal was paginated (2026-09-29): `GET /super-admin/access-log` was
  truncated to a hard **200 rows** with nothing to reach past it (the §8 limit of
  `docs/multi-tenant/decisions-etape-4b.md`, now closed), the establishment detail carried its
  journal inline capped at **100**, and the two per-record reads of `PatientAccessLog` had **no
  bound at all**. Two consequences to keep: the `total` must be counted on **exactly** the page's
  `where` and without `take` (a wider `where` advertises pages that render nothing; a `take` on the
  count caps the total at the page size, which is the old hard bound wearing a total's clothes), and
  the journal of an establishment now lives on its **own** route
  (`GET /super-admin/establishments/:id/activity-log`) rather than inside
  `GET /super-admin/establishments/:id` — serving it in both places would give one on-screen table
  two sources. `EstablishmentDomain.getById` still derives `lastActivityAt` from that same read, with
  `pageSize: 1`.
  **Retention is configurable**: `LOG_RETENTION_MONTHS`, twelve months by default, applied to
  **both** journals by two separate scheduled purges in `application/starter.ts` (the month
  arithmetic is **duplicated** between the two domains on purpose — a sabotage that hardcodes twelve
  in one must only redden that one's test). An absurd value (`0`, `-3`, `douze`) **fails the boot**,
  not the purge: measured on the test database, a retention of zero wipes both journals on the first
  pass, including a line one minute old. The value twelve is **provisional and awaiting advice**; see
  `docs/multi-tenant/deploiement-etape-4b.md` §5, which also records that the variable is **not yet
  passed to the container** by either compose file.
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
