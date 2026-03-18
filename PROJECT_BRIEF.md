# Project Brief



## 1. Project identity

- Project name: LemnixPRO

- One-line description: Internal enterprise web platform for 1D aluminum cutting optimization.

- Internal codename (optional): Not used.



## 2. Business goal

- What problem does this software solve?: It centralizes the production inputs, reference data, and optimization workflow needed to prepare accurate 1D aluminum cutting plans.

- Why should it exist?: Planning data, profile master data, and optimization execution need one internal system of record instead of fragmented manual coordination.

- What is the expected business value?: Better planning consistency, lower operational friction, clearer ownership, and a controlled path to optimization-driven cutting efficiency.



## 3. Target users

- Primary user type: Production planners and operations coordinators.

- Secondary user type: Master data administrators, plant managers, and process engineers.

- Who will use it daily?: Planners and data administrators preparing weekly cutting inputs.

- Who will manage it?: Internal engineering and enterprise IT.



## 4. Platform scope

- Target platform:

- [x] Web

- [ ] Desktop

- [ ] Mobile

- [ ] API only

- [x] Internal tool

- [ ] External SaaS

- First release platform: Internal web platform backed by service APIs.

- Future platform plans: Keep the product web-first and expand backend capabilities before considering any additional clients.



## 5. Core capabilities for V1

List only the must-have features for the first usable version.



1. Internal identity and authentication for enterprise users.

2. Main profile master data management.

3. Weekly production plan import.

4. Optimization request orchestration toward a separate Python engine built on Google OR-Tools.

5. Optimization result retrieval and review inside the platform.



## 6. Explicit non-goals

What will NOT be included in V1?



1. Public-facing customer portal or multi-tenant SaaS distribution.

2. Replacement of ERP, CAD/CAM, MES, or direct machine-control systems.

3. Mobile-first or offline-first clients.

4. Shared-database shortcuts between services or a modular monolith fallback.



## 7. Data and state

- Will the system store data?: Yes.

- Will users create records?: Yes, especially master data and imported planning records.

- Is authentication needed?: Yes.

- Is role/permission logic needed?: Yes, for internal enterprise access control.

- Is audit/history needed?: Yes, especially for imports, optimization flow, and administrative actions.

- Any file upload/import/export needs?: Yes, weekly production plan import is part of the active scope.



## 8. Operating model

- Local only / company network / internet-facing?: Company-operated internal platform, expected to run on company network or VPN-connected infrastructure.

- Single user or multi-user?: Multi-user.

- Single tenant or multi-tenant?: Single tenant.

- Need offline support?: No.

- Need real-time updates?: Not as a bootstrap requirement; async job status matters more than live collaboration.



## 9. Technical preferences

- Preferred frontend stack: Next.js web shell in TypeScript.

- Preferred backend stack: NestJS microservices for Node services plus a separate Python FastAPI optimization engine.

- Preferred language: TypeScript for the web and Node services, Python for the optimization engine.

- Preferred database: PostgreSQL with service-owned schemas.

- Package manager preference: pnpm.

- Any tools you definitely want: RabbitMQ, Docker Compose, Drizzle in DB-owning services, and Google OR-Tools in the optimization engine.

- Any tools you definitely do NOT want: Shared-database integration patterns and a modular monolith baseline.



## 10. Quality expectations

- Priority order: maintainability -> security -> scalability -> correctness -> performance -> speed of development -> UI/UX quality

- speed of development: important, but not ahead of maintainable service boundaries

- maintainability: highest priority

- scalability: important because optimization workflows and service count will grow

- UI/UX quality: secondary to correctness and operational clarity

- performance: important for imports and optimization orchestration

- security: enterprise baseline requirement

- Coding style expectation: Explicit, typed, modular, and easy to review.

- Architecture expectation: Backend-first microservices monorepo with service-owned persistence and a separate Python optimization engine.



## 11. Delivery expectation

- What should the first milestone produce?: A stable backend-first monorepo baseline with root standards, active architecture docs, CI, and the current implemented slices clearly documented.

- What does "usable V1" mean for you?: Internal users can authenticate, manage main profile master data, import weekly production plans, trigger optimization flows, and review results inside one platform.

- What should be demoable first?: Identity/auth, master data management, and weekly production plan import as the currently implemented platform baseline.



## 12. Constraints

- Hard constraints: Internal enterprise product, backend-first microservices monorepo, separate Python optimization engine, and no cross-service database access.

- Time constraints: Bootstrap should stay minimal and reviewable; avoid overengineering before more slices are implemented.

- Team size: Not specified, so the repository should optimize for a small internal engineering team with clear boundaries.

- Budget/tooling constraints: Prefer justified tooling only; avoid unnecessary dependencies or platform sprawl.

- Any enterprise/security constraints: Internal access control, auditable workflows, explicit service ownership, and controlled environment configuration.



## 13. Final directive

Build LemnixPRO as a backend-first microservices monorepo for an internal enterprise web platform, with the web app kept thin, domain behavior owned by NestJS services, optimization isolated in a separate Python and OR-Tools service, and all sharing limited to explicit contracts and domain-neutral utilities. Keep bootstrap decisions minimal, explicit, and production-minded, and treat any older modular-monolith guidance as historical only.


