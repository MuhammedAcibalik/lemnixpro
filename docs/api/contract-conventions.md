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
- Master-data and production-plan write/import endpoints require single
  facility scope. They reject `all` scope and filter service-owned reads by
  `facilityId`.
- Facility-aware response contracts expose `facilityId` additively on master
  profiles, main profile import batches, production plan import batches, and
  production plan rows.
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
