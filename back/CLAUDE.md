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
- `npm run build` — `prisma generate` → `tsc --noemit` typecheck → SWC transpile `src` → `lib`.
- `npm run lint` — Biome on `src/main` (`npm run lint:ci` for CI).
- `npm test` / `npm run test:unit` / `npm run test:e2e` — Jest via `src/test/jest.config.ts` (note: a `src/test/` directory is not currently checked in; the scripts assume it exists when tests are added).
- Run a single test: `npx jest -c src/test/jest.config.ts -t "<name regex>"` or `npx jest <path/to/file.test.ts>`.
- `npm run cover` / `cover:unit` / `cover:e2e` — same as test variants with coverage.
- `npm run validate` — `deps:check` + `build` + `lint` + `cover` (used by CI).
- `npm run check:unused-methods` — custom static analysis (`scripts/detect-unused-methods.ts`).

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
  doesn't recognize, or a nested write on a relation absent from `NESTED_RELATIONS`, is refused rather than let
  through unchecked — the error message names the entry to add. Add every new tenant model to the right list, and
  every new nested write to `NESTED_RELATIONS`.
- **Clinical field filtering (`utils/clinical-fields.ts`, wired into `tenant.plugin.ts`)**: `notes`, `details`,
  `medicalDiagnosis` (patient) and `transmissionNotes` (patient enrolled in an appointment) are **not** filtered in
  response schemas. Two Fastify hooks strip them, in both directions: `stripClinicalFields` (`preSerialization`,
  gated on `clinical:read`, recurses into nested payloads) and `stripClinicalInput` (`preValidation`, gated on
  `clinical:write`, strips the same keys from request bodies — a stripped key leaves the DB column unchanged, it
  doesn't blank it). Both are attached to the route plugins, not to individual routes, so a new route is covered
  by default; don't reintroduce clinical fields in a route-local schema tweak, they'd bypass nothing but the hooks
  still run on the handler's return value.
- **Permissions**: routes under `/e/:establishmentId/s/:serviceId` and `/e/:establishmentId/admin` MUST declare
  `config: { permission }` (matrix in `utils/permissions.ts`, mirrored in `front/src/utils/permissions.ts`; a unit
  test checks both copies are identical). Server startup fails otherwise.
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
   query on it.
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

- HTTP requests for manual exploration live in `bruno/` (open with the Bruno API client).
- The CI test environment uses `deploy/.env.test`; the `*:ci` wireit targets bring up a separate test DB via that env file before running tests.
