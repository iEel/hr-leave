# HR Leave Management System - Developer Handoff

> Created: 21 January 2026
> Last updated: 18 August 2026
> Project path: `D:\Antigravity\hr-leave`

This file is the short entry point for developers and operators. The detailed handoff has been split into numbered documents under [`docs/`](docs/00_index.md).

## Start Here

| Need | Read |
| --- | --- |
| Full documentation map | [`docs/00_index.md`](docs/00_index.md) |
| Product and feature overview | [`docs/01_overview.md`](docs/01_overview.md) |
| Application architecture | [`docs/02_architecture.md`](docs/02_architecture.md) |
| Database and migrations | [`docs/03_database.md`](docs/03_database.md) |
| Authentication and RBAC | [`docs/04_auth-rbac.md`](docs/04_auth-rbac.md) |
| Business workflows | [`docs/05_workflows.md`](docs/05_workflows.md) |
| API route map | [`docs/06_api-routes.md`](docs/06_api-routes.md) |
| HIP attendance devices | [`docs/07_attendance-hip.md`](docs/07_attendance-hip.md) |
| HR reports and CSV export | [`docs/08_reports.md`](docs/08_reports.md) |
| Deployment summary | [`docs/09_deployment.md`](docs/09_deployment.md) |
| Detailed deployment runbook | [`DEPLOYMENT.md`](DEPLOYMENT.md) |
| UAT scenarios | [`docs/10_uat.md`](docs/10_uat.md) |
| Production readiness | [`docs/11_production-readiness.md`](docs/11_production-readiness.md) |
| Decision history | [`docs/12_decision-log.md`](docs/12_decision-log.md) |
| Changelog | [`docs/13_changelog.md`](docs/13_changelog.md) |
| Implementation plans | [`docs/14_implementation-plan.md`](docs/14_implementation-plan.md) |

## Current System Summary

HR Leave Management System is a Next.js 16 application for leave management, manager approvals, HR operations, AD-backed authentication, and HIP CMiF68S attendance sync.

Core capabilities:

- Employee leave request, leave history, and attendance view
- Manager approval and delegate approval
- HR employee/leave/holiday/settings/year-end/report tools
- Admin auth settings, rate limits, audit logs, AD lifecycle, and attendance device management
- HIP CMiF68S incremental sync/backfill through a custom TCP protocol
- Attendance final status adjustment from approved leave

## Important Operational Notes

- Production app port is `3002`.
- SQL Server access uses `mssql` directly; no ORM.
- Timezone is `Asia/Bangkok`.
- HIP CMiF68S must use the custom TCP protocol. Do not use `node-zklib`.
- Attendance sync currently uses no-confirm/read-only behavior and does not send `A2`.
- Leave attachment files, including medical certificates and optional personal-leave documents, must be served through `/api/files/medical/[filename]`; do not expose direct static file URLs.
- Cron routes must use `x-cron-secret` with the production `CRON_SECRET`.

## Latest Major Changes

- 2026-08-18: Added optional personal-leave attachments and employee leave-history attachment links while retaining protected file access and existing DB columns.
- 2026-07-02: Fixed AD sync/JIT provisioning for rehired employees with new employee codes while keeping leave history and quotas separate.
- 2026-06-23: Split the long developer handoff into numbered docs under `docs/`.
- 2026-06-22: HR attendance report status filter now refreshes automatically.
- 2026-06-21: Added attendance adjustment by approved leave, leave detail links, HR attendance report, and protected medical upload rewrite.
- 2026-06-18: Added HIP CMiF68S attendance sync, admin device UI, backfill, and cron.

See [`docs/13_changelog.md`](docs/13_changelog.md) for the longer timeline.

## Documentation Maintenance

When adding or changing features:

1. Update the narrowest relevant doc under `docs/`.
2. Add durable architecture/product decisions to [`docs/12_decision-log.md`](docs/12_decision-log.md).
3. Add release-level changes to [`docs/13_changelog.md`](docs/13_changelog.md).
4. Put new design specs under `docs/superpowers/specs/`.
5. Put implementation plans under `docs/superpowers/plans/`.
6. Keep deployment commands centralized in [`DEPLOYMENT.md`](DEPLOYMENT.md) unless the deployment runbook is formally migrated.

Avoid appending large new sections to this file. This file should stay short and navigational.
