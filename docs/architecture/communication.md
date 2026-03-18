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

## Asynchronous Communication

- RabbitMQ carries long-running optimization workflow messages.
- Initial event families are:
  - optimization requested
  - optimization completed
  - optimization failed
- Async messaging is the default path for workflows that involve the Python optimization engine.

## Contract and Sharing Rules

- Shared transport contracts, event names, and domain-neutral helpers live in `packages/*`.
- No cross-service relative imports are allowed.
- No service may read or write another service's database tables.
- The Python optimization engine keeps local Pydantic schemas aligned with shared transport contracts rather than importing TypeScript packages directly.
