# Facility Foundation

## Decision

LemnixPRO is a single-company, multi-facility internal enterprise platform. A
facility is a physical factory or production plant. This is facility
partitioning inside one enterprise, not public multi-tenant SaaS.

The platform must isolate plant data by facility while still allowing privileged
central users to inspect or coordinate across facilities. That means facility is
a business partition and authorization scope, not a tenant abstraction, billing
boundary, customer boundary, or deployment boundary.

## Ownership

- `facility-service` owns the canonical facility catalog and its PostgreSQL
  `facility` schema.
- `identity-service` owns user identity, authentication, and
  user/facility/module grants in the `identity.user_facility_grants` table.
- `api-gateway-service` remains the browser-facing backend boundary. It parses
  and validates active facility context for browser requests that provide
  facility headers, then propagates the validated context to downstream services
  through headers.
- `master-data-service` and `production-plan-service` now receive facility
  context, persist service-owned `facility_id` values, and filter their own
  reads/writes by facility. Other downstream services remain unpartitioned
  until later facility sprints.

No service may read the `facility` schema directly except `facility-service`.
No identity table may add a database foreign key to `facility-service` tables.
Identity grants store `facilityId` as an opaque cross-service reference and do
not declare a database foreign key to `facility-service`.

## Context Propagation

Facility context is propagated with explicit headers:

- `x-lemnixpro-facility-id`
- `x-lemnixpro-facility-scope`

`x-lemnixpro-facility-scope=single` means the request is scoped to exactly one
facility and must carry `x-lemnixpro-facility-id`.

`x-lemnixpro-facility-scope=all` is reserved for privileged read/reporting flows
only. It must not be accepted for ordinary write/import operations.

Write operations must resolve to one concrete active facility. The gateway
rejects `all` scope for write-like HTTP methods when a facility context is
provided. Normal plant users must not be able to write, import, optimize, or
view another facility's data by changing client-side filters. Backend
authorization must enforce the scope.

The current gateway implementation is intentionally in compatibility mode for
routes that have not yet been made facility-aware. When facility headers are
present, the gateway calls `identity-service` to resolve whether the
authenticated user may use that facility context and module, then forwards only
the validated headers downstream. The web shell forwards active facility
headers for master data and production plan calls when a facility context is
available, and write/import server actions require a single selected facility
before calling the gateway.

## Roles And Grants

The shared contracts define facility access concepts without removing or
renaming existing auth contracts:

- `SUPER_ADMIN` has unrestricted facility access and may use cross-facility
  views/actions.
- `CENTRAL_PLANNER` is reserved for explicitly granted broad visibility. Final
  permissions must stay explicit per module/action.
- Facility-level roles and module keys are represented as user facility grants.
- Module keys cover current modules plus the reserved `two-d-nesting` module.

`identity-service` now stores grants with:

- `userId` referencing `identity.users`
- `facilityId` as an opaque facility reference
- `facilityRole`
- explicit `moduleKeys`
- `isDefault`

There is a unique grant per `(userId, facilityId)` and at most one default
facility per user. `SUPER_ADMIN` is modeled as a platform user role and can use
all facilities and modules without materialized grants. `CENTRAL_PLANNER` may
use `all` scope only when it has an explicit `CENTRAL_PLANNER` facility grant
covering the requested module.

The admin assignment endpoints are owned by identity:

- `GET /users/:id/facility-access`
- `PUT /users/:id/facility-grants`
- `GET /auth/me/facility-access`
- `POST /auth/me/facility-access/resolve`

Internal-service authentication is not sufficient for business authorization:
it proves the caller is an internal service, not that the authenticated business
user may administer facility grants. Grant mutation and cross-user grant reads
therefore require an authenticated `SUPER_ADMIN` business user in
`identity-service`, checked against identity's current stored user role rather
than only the role claim carried by the JWT.

The endpoint split is intentional:

- `GET /auth/me/facility-access` is an authenticated self-read.
- `POST /auth/me/facility-access/resolve` is the gateway resolver endpoint. It
  resolves access for the authenticated business user supplied by the gateway
  and is separate from admin grant management.
- `GET /users/:id/facility-access` is an admin read and requires `SUPER_ADMIN`.
- `PUT /users/:id/facility-grants` is an admin mutation and requires
  `SUPER_ADMIN`.

`CENTRAL_PLANNER` can be granted broad read/reporting visibility through
explicit facility/module grants, but it cannot mutate facility grants in this
slice. Richer admin workflows may be added later, after this backend
authorization boundary remains in place.

Facility grant writes must continue to treat `facilityId` as an opaque
cross-service reference. A future gateway/admin composition layer should perform
a lightweight existence/status check against `facility-service` before accepting
grant changes, without adding a database foreign key from identity to facility.

## Facility-Scoped Data Migration Strategy

Existing records are not destructively migrated. The migration strategy remains
expand/contract:

1. Create a default facility record.
2. Add `facility_id` columns to each owning service schema in separate,
   service-owned migrations.
3. Backfill existing records to the default facility before tightening
   nullability.
4. Add read/write paths that require facility context while keeping explicit
   local/test compatibility for routes that still predate the facility switcher.
5. Validate counts and indexes.
6. Tighten nullability and remove default compatibility only after all callers
   are facility aware.

`master-data-service` migration `0004_facility_partition` adds and backfills
`master_data.main_profiles.facility_id` and
`master_data.main_profile_import_batches.facility_id` to `default-facility`,
then enforces per-facility profile uniqueness on
`(facility_id, linked_product_code, code)`.

`production-plan-service` migration `0008_facility_partition` adds and
backfills `production_plan.production_plan_import_batches.facility_id` and
`production_plan.production_plan_rows.facility_id` to `default-facility`, then
scopes active-batch uniqueness to
`(facility_id, plan_year, week_number)` for active batches. Rows duplicate
`facility_id` for service-owned query isolation; this is not a foreign key to
`facility-service`.

Master data should become facility-specific. Later, privileged workflows may
pool same or similar profiles across facilities for cross-facility optimization,
but that must be modeled as an explicit optimization feature rather than hidden
shared master data.

## Affected Current Domains

- Main profile master data is facility-specific. The same profile/product code
  pair may exist independently in different facilities, but duplicates remain
  rejected within one facility.
- Weekly production plan imports resolve facility from the active facility
  context. `SUPER_ADMIN` must explicitly select a facility before write or
  import operations.
- Production plan batch listing, row reads, activation, deletion, and row
  correction are facility-scoped. Different facilities may each have an active
  batch for the same plan year/week.
- Cut-list snapshots must eventually be facility-scoped.
- Optimization requests and results must eventually carry facility identity from
  request creation through RabbitMQ messages and result ingestion.
- Reporting can support `all` scope only for privileged users and must make the
  scope visible in API and UI semantics.

## Remaining Facility Sprint

The next backend slice should add service-owned `facility_id` columns and
authorization checks to cut-list snapshots, optimization requests, and result
records using each owning service's migration path. RabbitMQ optimization
envelopes should receive facility context only when the orchestrator persistence
and result ingestion paths are ready to preserve it end to end.

## 2D Nesting Roadmap Dependency

2D Nesting will be a separate optimization domain, not forced into the 1D cutting
solver. It will use a common 2D geometry core and material rule profiles.

Initial material families:

- `sheet_metal`
- `composite_panel`
- `galvanized_sheet`
- `cardboard`
- `generic_sheet`

Material dimensions use width x height x thickness; thickness is the third
dimension. Rotation, kerf, spacing, edge trim, grain or direction rules,
reusable offcut thresholds, machine capabilities, and sheet stocks are
facility/material/machine dependent. Sheet stocks are facility-based.

2D results must include visual layout coordinates. Solver results should expose
status, gap, and mode, including heuristic and time-limited modes. Supplier
sheet-size family recommendation is a later phase. The first pilot should be
`composite_panel` with existing sheet stock nesting before supplier-size
recommendation.
