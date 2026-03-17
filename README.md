# LemnixPRO

Backend-first enterprise platform for 1D aluminum cutting optimization.

## Repository Layout

- `apps/web`: Next.js shell for the internal web interface
- `services/*`: NestJS microservices with explicit domain ownership
- `packages/*`: shared workspace types, contracts, and utilities
- `engines/optimization-engine`: Python FastAPI + OR-Tools engine scaffold
- `infra/*`: local infrastructure manifests and Docker assets
- `docs/*`: architecture, domain, and API documentation

## Current Status

Foundation migration in progress. The repository is structured as a `pnpm` workspace monorepo with backend-first service scaffolding, local infra definitions, and a minimal web shell.

## Core Boundaries

- External traffic enters through `api-gateway-service`
- Service-to-service data ownership stays isolated by schema
- Async optimization workflows flow through RabbitMQ
- Shared code is limited to `packages/shared-*`
- Python keeps its own local schemas and does not import TypeScript packages

## Quick Start

1. `pnpm install`
2. `python -m pip install -e engines/optimization-engine`
3. `pnpm infra:up`
4. `pnpm typecheck`
5. `pnpm build`

`production-plan-service` requires `DATABASE_URL` explicitly. When using `infra/compose/docker-compose.backend.yml`, point it at the host port published by the `postgres` service. The compose file defaults `POSTGRES_PORT` to `5432`, but some local repo setups override it to `5433`, for example `postgresql://postgres:postgres@localhost:5433/lemnixpro`.

## Architecture Notes

- `BACKEND_ARCHITECTURE.md`
- `docs/architecture/service-map.md`
- `docs/architecture/communication.md`
- `docs/architecture/database-ownership.md`

