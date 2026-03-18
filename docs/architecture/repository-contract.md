# Repository Contract

This document defines where new code belongs in the LemnixPRO backend-first microservices monorepo and what may be shared across boundaries.

## `apps/`

Code belongs in `apps` when it is a user-facing application or shell.

Allowed:

- page and layout composition
- UI state and presentation logic
- gateway API clients
- app-specific auth and session wiring

Not allowed:

- service-owned business workflows
- direct database access
- imports from `services/*` source folders

## `services/`

Code belongs in `services` when it represents a deployable backend boundary with owned APIs, workflows, and persistence.

Allowed:

- controllers, modules, domain services, repositories, and migrations
- service-owned workers and integration adapters
- service-local validation and mapping logic

Not allowed:

- imports from another service's source tree
- direct reads or writes to another service's schema
- generic shared code that should live in `packages`

## `packages/`

Code belongs in `packages` only when it is intentionally shared across multiple Node apps or services and can stay domain-neutral.

Allowed:

- transport contracts and event payload definitions
- shared primitives and value types
- config helpers and pure technical utilities

Not allowed:

- service-specific business rules
- ORM models, migrations, repositories, or database clients for a service
- convenience re-exports of service internals

## `engines/`

Code belongs in `engines` when it runs in a separate runtime or language and provides an execution capability outside the Node service fleet.

Allowed:

- Python optimization engine code
- engine-local schemas and queue consumers
- engine-specific tooling and tests

Not allowed:

- TypeScript source imports from `services` or `packages` at runtime
- direct access to service-owned PostgreSQL schemas

## Sharing Rules

- Share only stable contracts, domain-neutral types, and pure utilities.
- No cross-service relative imports.
- No `../../other-service/...` imports, even for DTOs or helpers.
- If code cannot be shared without dragging along business assumptions, keep it in the owning service.

## Service-Owned Persistence

- One service owns one persistence boundary.
- The owning service alone defines migrations and query access for its schema.
- Other services consume that data through HTTP APIs, asynchronous events, or owned read models.
- A shared PostgreSQL container in local development does not create shared-table permission.
