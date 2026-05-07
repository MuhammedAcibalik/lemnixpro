# Service Map

This is the active runtime service map for the backend-first microservices monorepo. A folder may exist before its business slice is complete, so implemented scope and reserved ownership are listed separately.

## Entry Points

- `apps/web`
  - Internal Next.js shell for enterprise users
  - Consumes backend APIs through `api-gateway-service`
- `services/api-gateway-service`
  - Browser-facing HTTP boundary
  - Routing, edge policy, and gateway-level API surface
  - Active facility context parsing, identity-backed validation, and downstream
    facility header propagation in compatibility mode
  - No database ownership
- `services/facility-service`
  - Physical factory / production plant catalog boundary
  - Owns facility lifecycle records used by future facility-scoped access and data partitioning

## Active Implemented Backend Slices

- `services/facility-service`
  - Facility catalog boundary
- `services/identity-service`
  - Identity and authentication boundary
  - Owns user facility/module grants and facility context resolution decisions
- `services/master-data-service`
  - Main profile master data boundary
- `services/production-plan-service`
  - Weekly production plan import boundary
- `services/cut-list-service`
  - Cut list snapshot management boundary
- `services/optimization-orchestrator-service`
  - Optimization request orchestration and async queue handoff boundary
- `services/result-service`
  - Optimization completed/failed event ingestion and result retrieval boundary

## Evolving Execution Ownership

- `engines/optimization-engine`
  - Separate Python FastAPI service
  - Consumes optimization requests and emits result events
  - Owns Google OR-Tools-based optimization execution as the model matures

## Shared Node Workspace Packages

- `packages/shared-contracts`
  - Shared HTTP and messaging contracts
- `packages/shared-types`
  - Shared primitives and value types
- `packages/shared-utils`
  - Domain-neutral technical utilities
