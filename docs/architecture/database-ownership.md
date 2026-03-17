# Database Ownership

Each DB-owning service manages its own schema and local Drizzle migration structure.

## Schemas

- `identity`
- `master_data`
- `production_plan`
- `cut_list`
- `optimization`
- `result`

## Rules

- `api-gateway-service` has no schema and no database layer
- Migrations stay inside each owning service
- Cross-service table access is not allowed
- Integration happens through HTTP and RabbitMQ, not shared tables
