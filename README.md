# LemnixPRO

LemnixPRO is an internal enterprise web platform for 1D aluminum cutting optimization. It supports authenticated planning workflows, aluminum profile master data, weekly production plan imports, and a separate optimization engine path built around Google OR-Tools.

## Active Architecture

This repository follows a backend-first microservices monorepo architecture.

- `apps/web` is the internal Next.js web shell.
- `services/*` contains NestJS domain services with explicit ownership boundaries.
- `packages/*` contains shared contracts, shared types, and domain-neutral utilities only.
- `engines/optimization-engine` is the separate Python optimization service.
- `infra/*` contains local infrastructure bootstrap assets.
- `docs/*` contains active architecture guidance and historical records.

Earlier monolith-oriented recommendations are superseded and kept only as historical context in `STACK_DECISION.md`.

## Top-Level Ownership

- `apps`: user-facing applications and shell experiences; no service-owned persistence.
- `services`: deployable backend services that own APIs, workflows, and persistence.
- `packages`: reusable contracts, primitives, and domain-neutral technical utilities.
- `engines`: non-Node execution services, currently the Python optimization engine.
- `infra`: Dockerfiles, compose manifests, and local infrastructure bootstrap.
- `docs`: architecture, contracts, domain notes, and superseded decisions.

## Current Implemented Slices

The currently implemented backend slices are:

- `identity/auth`
- `main profile master data`
- `weekly production plan import`
- `cut list snapshot management`
- `optimization request orchestration`
- `optimization result ingestion`

The Python optimization engine currently consumes optimization requests and emits scaffolded completed/failed result events. The OR-Tools model itself remains an evolving product slice.

## Local Prerequisites

- Node.js `22.x` or `24.x`
- `pnpm` `10.6.2`
- Python `3.12`
- Docker with Compose v2

## Bootstrap

1. Review `.env.example` for root-level local infrastructure defaults.
2. Run `pnpm install`.
3. Run `python -m pip install -e engines/optimization-engine`.
4. Run `pnpm infra:up`.
5. Run `pnpm dev`.

## Workspace Commands

- `pnpm dev`: run available app and service development scripts in parallel.
- `pnpm build`: build all Node workspace packages.
- `pnpm typecheck`: typecheck all Node workspace packages.
- `pnpm lint`: lint all workspace packages that expose a lint script.
- `pnpm test`: run workspace tests.
- `pnpm infra:up`: start local PostgreSQL and RabbitMQ.
- `pnpm infra:down`: stop local infrastructure.
- `pnpm infra:logs`: follow local infrastructure logs.
- `pnpm infra:config`: render the effective Compose configuration.

## Infra Expectations

- Local infrastructure is defined in `infra/compose/docker-compose.backend.yml`.
- The shared local stack provides PostgreSQL 16 and RabbitMQ for service development.
- Each DB-owning service manages its own PostgreSQL schema and migrations.
- Browser-facing backend traffic should terminate at `api-gateway-service`.
- Internal synchronous communication uses explicit HTTP APIs, and long-running optimization workflows use RabbitMQ.
- The Python optimization engine is a separate runtime and is not part of the `pnpm` workspace.

