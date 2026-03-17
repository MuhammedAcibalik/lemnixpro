# API Contract Conventions

## HTTP

- Every Node service exposes:
  - `GET /health/live`
  - `GET /health/ready`
  - `GET /service-info`
  - `/docs` for OpenAPI

## Errors

- Error payloads should conform to the shared `ApiErrorResponse` contract
- Public APIs should keep DTOs explicit and narrow

## Messaging

- RabbitMQ exchange and routing key names are defined in `packages/shared-contracts`
- Event payloads should remain versionable and additive

## Cross-Language Alignment

- TypeScript contracts define the transport shape for Node services
- Python keeps local Pydantic models with matching fields and semantics
