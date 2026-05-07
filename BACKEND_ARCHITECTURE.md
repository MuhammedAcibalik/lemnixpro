# Backend Architecture

## Status

This is the active architecture direction for LemnixPRO. Earlier modular-monolith recommendations are historical only and must not be used for new bootstrap or implementation decisions.

## System Shape

- Backend-first microservices monorepo
- `apps/web` is a thin internal web shell
- `services/*` are deployable NestJS services with explicit domain ownership
- `packages/*` are limited to shared contracts, shared types, and domain-neutral technical utilities
- `engines/optimization-engine` is a separate Python FastAPI service using Google OR-Tools

## Active Implemented Backend Slices

- `identity-service`: identity and authentication boundary
- `master-data-service`: main profile master data boundary
- `production-plan-service`: weekly production plan import boundary
- `cut-list-service`: cut list snapshot boundary
- `optimization-orchestrator-service`: optimization request orchestration and queue handoff boundary
- `result-service`: optimization result event ingestion and retrieval boundary

## Supporting Platform Boundaries

- `apps/web`: internal user interface shell
- `api-gateway-service`: browser-facing HTTP and routing boundary

## Planned or Evolving Slices

- `engines/optimization-engine`: Python execution boundary for OR-Tools optimization jobs; the queue worker and result event path are present, while the optimization model remains evolving.

## Architecture Rules

- External users interact with `apps/web`, and backend API access from the web shell goes through `api-gateway-service`.
- Service-to-service synchronous communication uses explicit HTTP APIs.
- Long-running optimization workflows use RabbitMQ.
- Every DB-owning service manages its own PostgreSQL schema, migration history, and data access layer.
- No cross-service relative imports, no shared tables, and no hidden domain sharing inside `packages`.
- The Python engine keeps local Pydantic models aligned with transport contracts and does not import TypeScript source code.
