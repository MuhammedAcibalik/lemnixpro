# LemnixPRO Production Readiness Guardrails

This document records the runtime rules that must hold as the platform moves from local development to production.

## Runtime Boundaries

- `apps/web` is a thin orchestration/UI shell. It may import shared contracts and shared types, but it must not import service runtime code or service database schemas.
- `api-gateway-service` is the only browser-facing backend boundary. Any UI aggregation belongs in this gateway/BFF layer.
- Domain services own their schemas and data access. Cross-service reads happen over HTTP clients or RabbitMQ events, never through another service database schema.
- Shared packages remain domain-neutral: contracts, types, and small runtime utilities only.

## Request Flow

- Every HTTP request receives `x-request-id` and `x-correlation-id`.
- The web server sends these headers to the gateway. The gateway propagates them to upstream services.
- Domain services require `x-lemnixpro-internal-token` when `NODE_ENV=production` or when `INTERNAL_SERVICE_AUTH_SECRET` is configured.
- `/health/live` and `/health/ready` stay public so platform probes can run without coupling to application credentials.

## Async Flow

- RabbitMQ messages carry a `metadata` object with `messageId`, `correlationId`, `causationId`, `attempt`, and `occurredAt`.
- Optimization request queues declare a dead-letter topology. Invalid request envelopes are routed to the poison queue instead of being retried forever.
- Result consumers never `nack` with `requeue=true`. Processing failures are dead-lettered so operations can inspect and replay intentionally.

## Production Configuration

- Production must not boot with default JWT secrets, default Postgres credentials, default RabbitMQ credentials, or localhost service URLs.
- Swagger is enabled by default outside production and disabled by default in production. Use `ENABLE_SWAGGER=true` only for controlled non-public environments.
- Service credentials should be unique per environment and rotated as part of normal secret management.

## CI Expectations

- `pnpm arch:check` must run before merge.
- Typecheck, lint, tests, and builds should run through Turbo so package dependencies and affected scopes are respected.
- Integration CI should provide Postgres and RabbitMQ, run migrations, and exercise the full login/import/optimization/result path.
