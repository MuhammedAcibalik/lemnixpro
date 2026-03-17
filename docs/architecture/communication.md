# Communication

## External Access

- Browsers call `api-gateway-service`
- The gateway owns web-facing HTTP contracts and upstream routing configuration

## Internal Sync Communication

- Service-to-service synchronous calls use explicit HTTP APIs
- Service URLs are configured through environment variables

## Internal Async Communication

- RabbitMQ carries optimization job requests and result status events
- Initial messaging focus:
  - optimization requested
  - optimization completed
  - optimization failed

## Shared Code Rules

- Shared DTOs, constants, and utility helpers live only in `packages/shared-*`
- No cross-service relative imports are allowed
- Python schemas stay local to the engine and are manually aligned with shared contracts
