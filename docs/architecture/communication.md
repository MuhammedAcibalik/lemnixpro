# Communication

## Active Direction

LemnixPRO uses explicit service-to-service integration. Domain services do not communicate through shared database access or direct source imports.

## User-Facing Traffic

- Browsers load `apps/web`.
- `apps/web` calls `api-gateway-service` for backend APIs.
- Domain services are not exposed directly to the browser.

## Synchronous Service Communication

- `api-gateway-service` calls downstream services through explicit HTTP contracts.
- Direct service-to-service HTTP calls are allowed only when one service needs another service's owned capability or read model.
- Service URLs and credentials are configured through environment variables owned by the caller.
- HTTP callers propagate `x-request-id` and `x-correlation-id` so logs can be joined across web, gateway, and domain services.
- Internal service calls include `x-lemnixpro-internal-token`; production services reject non-health traffic without it.
- Facility-aware calls propagate `x-lemnixpro-facility-id` and `x-lemnixpro-facility-scope` after the gateway validates the active facility context through `identity-service`.
- During compatibility mode, existing routes that do not send facility headers continue through the gateway unchanged; downstream hard enforcement is introduced service by service.
- `x-lemnixpro-facility-scope=all` is reserved for privileged read/reporting flows; write/import operations must resolve to one concrete facility.

## Asynchronous Communication

- RabbitMQ carries long-running optimization workflow messages.
- Initial event families are:
  - optimization requested
  - optimization completed
  - optimization failed
- `optimization-orchestrator-service` publishes requested events.
- `engines/optimization-engine` consumes requested events and publishes completed or failed events.
- `result-service` consumes completed and failed events and persists result records.
- Async messaging is the default path for workflows that involve the Python optimization engine.
- Queue messages include `metadata.messageId`, `metadata.correlationId`, `metadata.causationId`, `metadata.attempt`, and `metadata.occurredAt`.
- Invalid or poison messages are dead-lettered instead of being requeued forever.

## Contract and Sharing Rules

- Shared transport contracts, event names, and domain-neutral helpers live in `packages/*`.
- No cross-service relative imports are allowed.
- No service may read or write another service's database tables.
- The Python optimization engine keeps local Pydantic schemas aligned with shared transport contracts rather than importing TypeScript packages directly.
