# Backend Architecture

## Overview

LemnixPRO is organized as a backend-first microservices platform for internal aluminum cutting planning and optimization workflows. The web application is a thin shell over explicit service APIs. Core business responsibilities are isolated into independently deployable NestJS services, while the optimization engine runs as a separate Python process.

## Service Boundaries

- `api-gateway-service`: external HTTP entry point, request shaping, rate limiting, and auth integration scaffold
- `identity-service`: authentication, users, and roles boundary
- `master-data-service`: profiles and reference data boundary
- `production-plan-service`: weekly Excel production plan boundary
- `cut-list-service`: weekly cut list boundary
- `optimization-orchestrator-service`: optimization job orchestration and messaging boundary
- `result-service`: optimization result boundary
- `optimization-engine`: Python execution boundary for future OR-Tools optimization

## Communication Rules

- External web access goes only through the gateway
- Internal synchronous access is explicit HTTP between services
- Internal async workflows use RabbitMQ
- Shared code moves only through workspace packages, never direct service imports

## Data Ownership

Every DB-owning service manages its own PostgreSQL schema and local Drizzle configuration. No service reads or writes another service's tables directly.
