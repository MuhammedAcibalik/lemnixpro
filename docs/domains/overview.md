# Domain Overview

## Planned Domains

- Identity and access control
- Facility catalog and facility-aware access control
- Profile and master data management
- Weekly production plan import from Excel
- Weekly cut list management
- Optimization orchestration
- Optimization result management

## Current Scope

Facility catalog, identity facility/module grants, gateway facility context,
main profile master data, and weekly production plan imports are active
implemented backend slices. Master data and production plan records are now
facility-scoped by their owning services.

Cut-list snapshots, optimization orchestration, optimization results, RabbitMQ
optimization envelopes, and the Python optimization engine are not yet
facility-partitioned.
