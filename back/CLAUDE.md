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
- **Auth** uses JWT inside an HTTP-only cookie. Protected routes opt in with `onRequest: [fastify.verifySessionCookie]` (the cookie plugin's decorator). The JWT plugin also exposes `verifyJWT` for header-based auth. Sign-in is in `routes/auth/sign-in.router.ts`.
- **AppEventBus (`utils/app-event-bus.ts`)** is a typed EventEmitter for cross-domain side effects. Domains call `appEventBus.emit('patient.created', …)`; `ActivityLogSubscriber` listens and writes to the activity log table. The subscriber is force-instantiated at container build time so its subscriptions are wired before the server starts.
- **Errors**: throw `@hapi/boom` errors from domains/routes. The Fastify error handler runs them through three normalizers in order (Prisma → Fastify → Boom). `ErrorHandler` (`utils/error-handler.ts`) maps known Prisma error codes (e.g. unique-constraint → 409) — repositories use it via `errorHandler.boomErrorFromPrismaError`.

## Adding a new entity

1. Add the Prisma model in `prisma/schema.prisma` and run `npm run prisma:migrate:create` (or `:dev` to apply).
2. `domain/<name>.domain.ts` + `types/domain/<name>.domain.interface.ts`.
3. `infra/orm/repositories/<name>.repository.ts` + `types/infra/orm/repositories/<name>.repository.interface.ts`.
4. `interfaces/http/fastify/schemas/<name>.schema.ts` (Zod) + `interfaces/http/fastify/routes/<name>.ts`.
5. Register the domain + repo in `awilix-ioc-container.ts` AND add their fields to `IocContainer` in `types/application/ioc.ts`.
6. Register the new router in `interfaces/http/fastify/routes/index.ts`.

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
