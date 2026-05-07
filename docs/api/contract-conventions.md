# API Contract Conventions

## HTTP

- Every Node service exposes:
  - `GET /health/live`
  - `GET /health/ready`
  - `GET /service-info`
  - `/docs` for OpenAPI
- Facility-aware HTTP calls use `x-lemnixpro-facility-id` and `x-lemnixpro-facility-scope`.
- `x-lemnixpro-facility-scope=single` requires exactly one facility id.
- `x-lemnixpro-facility-scope=all` is privileged and should be accepted only for explicit read/reporting contracts.
- User facility/module grants and facility access decisions are identity-owned contracts; downstream services should consume validated gateway headers rather than duplicating identity grant logic.

## Errors

- Error payloads should conform to the shared `ApiErrorResponse` contract
- Public APIs should keep DTOs explicit and narrow

## Messaging

- RabbitMQ exchange and routing key names are defined in `packages/shared-contracts`
- Event payloads should remain versionable and additive

## Cross-Language Alignment

- TypeScript contracts define the transport shape for Node services
- Python keeps local Pydantic models with matching fields and semantics
