# Database Ownership

## Active Rule

LemnixPRO uses service-owned persistence. Local development provisions a shared PostgreSQL instance, but ownership is separated by schema and by the service that manages it.

## Ownership Map

- `api-gateway-service`
  - No schema and no database ownership
- `facility-service`
  - Owns the `facility` schema
- `identity-service`
  - Owns the `identity` schema
  - Owns `identity.users` and `identity.user_facility_grants`
  - Stores facility IDs in grants as opaque cross-service references without
    foreign keys to `facility-service`
- `master-data-service`
  - Owns the `master_data` schema
- `production-plan-service`
  - Owns the `production_plan` schema
- `cut-list-service`
  - Owns the `cut_list` schema
- `optimization-orchestrator-service`
  - Owns the `optimization` schema
- `result-service`
  - Owns the `result` schema

## Rules

- The owning service is the only codebase allowed to define migrations, ORM schema, repositories, and write queries for its schema.
- Cross-service joins and direct table reads are not allowed, even inside the same PostgreSQL cluster.
- Data needed across boundaries moves through HTTP APIs, published events, or read models owned by the consuming service.
- Shared packages must not contain service-specific ORM entities or reusable repositories.
- The Python optimization engine does not read or write Node service schemas directly.
