# Documentation Index

This folder is the canonical technical documentation set for the HR Leave Management System.

`DEVELOPER_HANDOFF.md` is now the short entry point. Use this index when onboarding, reviewing architecture, preparing deployment, or planning production changes.

## Reading Order

| Order | Document | Purpose |
| --- | --- | --- |
| 01 | [Overview](01_overview.md) | Product scope, roles, core features, and current module map |
| 02 | [Architecture](02_architecture.md) | Application structure, server/client boundaries, and important modules |
| 03 | [Database](03_database.md) | Tables, migrations, important columns, and data rules |
| 04 | [Auth And RBAC](04_auth-rbac.md) | NextAuth, local/AD/Azure authentication, roles, and route protection |
| 05 | [Workflows](05_workflows.md) | Employee, manager, HR/Admin, leave, year-end, and attendance flows |
| 06 | [API Routes](06_api-routes.md) | API route map grouped by domain |
| 07 | [Attendance HIP](07_attendance-hip.md) | HIP CMiF68S protocol, sync/backfill rules, lock behavior, and production notes |
| 08 | [Reports](08_reports.md) | Leave and attendance reporting behavior, CSV export, and UI rules |
| 09 | [Deployment](09_deployment.md) | Deployment overview and links to the full deployment guide |
| 10 | [UAT](10_uat.md) | User acceptance test scenarios by role |
| 11 | [Production Readiness](11_production-readiness.md) | Production checklist, rollback, monitoring, and risk checks |
| 12 | [Decision Log](12_decision-log.md) | Important product and engineering decisions with rationale |
| 13 | [Changelog](13_changelog.md) | Timeline of major project changes |
| 14 | [Implementation Plan](14_implementation-plan.md) | Roadmap and planning references |

## Document Responsibilities

Use this section to decide where new information belongs.

| File | Responsibility |
| --- | --- |
| [01_overview.md](01_overview.md) | System goal, companies in scope, feature map, user roles, and high-level module ownership. |
| [02_architecture.md](02_architecture.md) | Next.js application structure, server/client boundary, important modules, shared libraries, and integration points. |
| [03_database.md](03_database.md) | Database tables, migrations, important columns, system setting keys, data integrity rules, and production database cautions. |
| [04_auth-rbac.md](04_auth-rbac.md) | NextAuth behavior, AD/LDAP login, Azure mode, role checks, `isHRStaff`, session claims, and proxy/middleware rules. |
| [05_workflows.md](05_workflows.md) | Leave request flow, manager approval, delegate approval, year-end carry-forward, attendance sync flow, and HR/Admin workflows. |
| [06_api-routes.md](06_api-routes.md) | API route map grouped by domain, route purpose, auth expectations, and important side effects. |
| [07_attendance-hip.md](07_attendance-hip.md) | HIP CMiF68S custom protocol, incremental sync, full backfill, cron behavior, sync lock, no-`A2` confirm decision, and production notes. |
| [08_reports.md](08_reports.md) | HR reports, attendance report behavior, filters, CSV/export rules, leave request links, and report permission expectations. |
| [09_deployment.md](09_deployment.md) | Deployment summary, environment expectations, and links to the detailed runbook in `DEPLOYMENT.md`. |
| [10_uat.md](10_uat.md) | Test scenarios for HR/Admin, Manager, and Employee roles, including regression paths for leave, attendance, reports, and settings. |
| [11_production-readiness.md](11_production-readiness.md) | Production checklist, backups, migrations, cron setup, environment variables, rollback, monitoring, and go-live risks. |
| [12_decision-log.md](12_decision-log.md) | Durable product and engineering decisions with rationale, such as no-`A2` HIP confirm and attendance adjustment by approved leave. |
| [13_changelog.md](13_changelog.md) | Timeline of release-level changes and notable behavior updates. |
| [14_implementation-plan.md](14_implementation-plan.md) | Major roadmap, active implementation plans, future work, and links to detailed plans under `docs/superpowers/plans/`. |
## Existing Root-Level Docs

| File | Status |
| --- | --- |
| [`DEVELOPER_HANDOFF.md`](../DEVELOPER_HANDOFF.md) | Short handoff entry point and document map |
| [`DEPLOYMENT.md`](../DEPLOYMENT.md) | Detailed deployment/runbook guide; keep as the operational source of truth |
| [`README.md`](../README.md) | User-facing overview |
| [`USER_GUIDE.md`](../USER_GUIDE.md) | End-user guide |
| [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) | Legacy roadmap; summarized in `14_implementation-plan.md` |
| [`PRODUCT.md`](../PRODUCT.md) | Product and design principles |

## Maintenance Rules

- Prefer updating the narrowest relevant document instead of appending everything to `DEVELOPER_HANDOFF.md`.
- Avoid duplicating operational commands. Link to `DEPLOYMENT.md` when deployment details are already there.
- Add new feature design/implementation plans under `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- Record lasting architectural/product choices in [Decision Log](12_decision-log.md).
- Record release-level changes in [Changelog](13_changelog.md).
