# Service Map

This is the active runtime service map for the backend-first microservices monorepo. A folder may exist before its business slice is complete, so implemented scope and reserved ownership are listed separately.

## Entry Points

- `apps/web`
  - Internal Next.js shell for enterprise users
  - Consumes backend APIs through `api-gateway-service`
- `services/api-gateway-service`
  - Browser-facing HTTP boundary
  - Routing, edge policy, and gateway-level API surface
  - No database ownership

## Active Implemented Backend Slices

- `services/identity-service`
  - Identity and authentication boundary
- `services/master-data-service`
  - Main profile master data boundary
- `services/production-plan-service`
  - Weekly production plan import boundary

## Planned or Reserved Service Ownership

- `services/cut-list-service`
  - Cut list management boundary
- `services/optimization-orchestrator-service`
  - Optimization request orchestration and async workflow boundary
- `services/result-service`
  - Optimization output persistence and retrieval boundary
- `engines/optimization-engine`
  - Separate Python FastAPI service
  - Owns Google OR-Tools-based optimization execution

## Shared Node Workspace Packages

- `packages/shared-contracts`
  - Shared HTTP and messaging contracts
- `packages/shared-types`
  - Shared primitives and value types
- `packages/shared-utils`
  - Domain-neutral technical utilities
