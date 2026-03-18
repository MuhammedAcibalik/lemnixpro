# STACK DECISION

> [!IMPORTANT]
> Superseded on 2026-03-18.
> This document records an earlier recommendation to build LemnixPRO as a TypeScript modular monolith.
> It is historical context only and must not be used as the active implementation direction.
> The active direction is a backend-first microservices monorepo with a thin web shell, NestJS services, shared workspace packages, and a separate Python optimization engine using Google OR-Tools.
> See `PROJECT_BRIEF.md`, `BACKEND_ARCHITECTURE.md`, and `docs/architecture/*` for the current source of truth.

\# STACK DECISION



`PROJECT\_BRIEF.md` is still an unfilled template, so this recommendation is grounded in the repo state plus the clarified intent: internal web, business CRUD, enterprise-ready V1.



\## Option A



\*\*Full-stack TypeScript modular monolith\*\*



\- Frontend/server: `Next.js` + `TypeScript`

\- Data: `PostgreSQL`

\- ORM/migrations: `Drizzle ORM`

\- Auth: `Auth.js`

\- Validation/contracts: `Zod`

\- Testing: `Vitest` + `Playwright`



Why it is realistic:

\- Fastest path to a usable internal web product with one language across UI, server, and validation.

\- Strong fit for structured CRUD workflows, protected areas, admin screens, and audit-ready business logic.

\- Easy to keep as one deployable while still enforcing clean module boundaries.



Trade-offs:

\- Requires discipline so route handlers and UI do not absorb business logic.

\- Next.js is excellent for product delivery, but weaker than .NET for teams that want very explicit backend separation from day one.



\## Option B



\*\*Enterprise-leaning .NET web stack\*\*



\- Backend: `ASP.NET Core`

\- Frontend: `React` + `TypeScript`

\- Data: `PostgreSQL` or `SQL Server`

\- ORM: `EF Core`

\- Testing: `xUnit` + `Playwright`



Why it is realistic:

\- Very strong fit for internal enterprise systems, role-heavy applications, and long-lived business software.

\- Clear backend conventions, solid dependency injection, and mature operational patterns.



Trade-offs:

\- Two-stack development from day one slows initial velocity.

\- More ceremony and a heavier bootstrap than a unified TypeScript stack.



\## Option C



\*\*Python backend with TypeScript frontend\*\*



\- Backend: `FastAPI`

\- Frontend: `React` + `TypeScript`

\- Data: `PostgreSQL`

\- ORM: `SQLAlchemy`

\- Testing: `pytest` + `Playwright`



Why it is realistic:

\- Good if automation, imports, reporting, or data workflows are expected to become central quickly.

\- Strong productivity on backend services and operational scripts.



Trade-offs:

\- Best when backend/data work dominates; less attractive for a UI-first CRUD product.

\- Splits types and validation across languages, which increases coordination overhead early.



\## Recommended choice



Choose \*\*Option A: Next.js + TypeScript + PostgreSQL + Drizzle\*\*, with a \*\*single app repository implemented as a modular monolith\*\*.



Recommended package manager: \*\*`pnpm`\*\*



Why this is the best fit:

\- Best balance of delivery speed, maintainability, and long-term flexibility for a greenfield internal business app.

\- One language across frontend, backend, validation, and tooling keeps the codebase easier to reason about.

\- Strong typing without the heavier setup cost of a split frontend/.NET backend.

\- Clean path to grow later into a separate worker or API boundary if real requirements justify it.



Public interface guidance:

\- Keep V1 mostly server-side inside the same application.

\- Expose REST/JSON endpoints only where an external integration, async worker, or clear UI boundary actually needs them.

\- Define validation and DTO contracts once and reuse them at form and server boundaries.



Key trade-offs:

\- You gain speed and coherence now, but must enforce domain boundaries intentionally.

\- You avoid premature services, but accept that some future extraction work may be needed if the product grows into multiple deployables.



\## Repo structure



Recommended repository strategy: \*\*single app repository + modular monolith\*\*  

Not recommended for V1: \*\*monorepo\*\* and \*\*service-oriented starting point\*\*



Initial top-level folder structure:



\- `src/`

\- `database/`

\- `tests/`

\- `docs/`

\- `scripts/`

\- `infra/`

\- `.github/`



Initial `src/` layout:



\- `src/app/` for routes, layouts, and entrypoints

\- `src/modules/` for domain-aligned business modules

\- `src/components/` for shared UI only

\- `src/server/` for auth, database access, jobs, and integration adapters

\- `src/lib/` for cross-cutting technical utilities



Boundary rules:

\- Business rules live in `src/modules/\*`, not in pages, route handlers, or generic helpers.

\- Shared code must be truly cross-module; otherwise keep it inside the owning module.

\- External integrations and background work stay behind explicit server/module interfaces.



\## First milestone



Deliver one thin but real vertical slice on the chosen architecture:



1\. Finalize `PROJECT\_BRIEF.md` with actual V1 scope, users, and non-goals.

2\. Bootstrap the selected stack, environment config, database connection, and test setup.

3\. Add authentication and basic role scaffolding.

4\. Implement one real business entity end to end: list, detail, create, edit, validation, persistence, and authorization.

5\. Add CI gates for typecheck, lint, tests, and one end-to-end smoke flow.



Acceptance scenarios:

\- A signed-in user can access one protected module.

\- The user can create and update a record successfully.

\- Unauthorized access is blocked.

\- The record stores audit-ready metadata such as creator/updater and timestamps.



\## Risks



\- Starting with services before one business workflow is proven.

\- Starting a workspace monorepo before a second deployable or true shared package exists.

\- Letting framework folders become the architecture instead of domain modules.

\- Overdesigning RBAC, eventing, or integrations before the first usable workflow exists.

\- Choosing `SQL Server` by default without an actual enterprise constraint; `PostgreSQL` is the safer neutral default.

\- Skipping ADR-style architecture notes early; boundary drift becomes expensive quickly.



