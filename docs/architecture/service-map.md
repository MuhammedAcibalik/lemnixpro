# Service Map

## Runtime Components

- `apps/web`
  - Internal Next.js shell
  - Calls `api-gateway-service`
- `services/api-gateway-service`
  - Web-facing HTTP boundary
  - Auth and throttling scaffold
- `services/identity-service`
  - User, role, and token boundary
- `services/master-data-service`
  - Profiles and master data boundary
- `services/production-plan-service`
  - Weekly production plan import boundary
- `services/cut-list-service`
  - Weekly cut list boundary
- `services/optimization-orchestrator-service`
  - Optimization job request and status orchestration
- `services/result-service`
  - Optimization output persistence and retrieval boundary
- `engines/optimization-engine`
  - Python FastAPI service ready for OR-Tools execution
