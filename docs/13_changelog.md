# Changelog

## 2026-08-18

- Added optional supporting document upload for personal leave (`PERSONAL`).
- Kept sick-leave attachment wording and required-certificate rules unchanged.
- Added protected attachment links to the employee leave-history list.
- Reused the existing protected attachment storage and access permissions without a database migration.

## 2026-07-02

- Fixed AD sync/JIT behavior for employees rehired with a new employee code.
- Inactive old users now release conflicting AD identity fields before the new user is inserted.
- Leave balances and leave history remain separated by `Users.id` across employment periods.

## 2026-06-23

- Split developer handoff into numbered docs under `docs/`.
- Kept `DEVELOPER_HANDOFF.md` as a short entry point.

## 2026-06-22

- Fixed HR attendance report status filter so changing status reloads data automatically.

## 2026-06-21

- Added attendance adjustment from approved leave.
- Added leave request links/details to employee attendance and HR attendance report.
- Added HR attendance report tab and CSV export.
- Protected legacy medical upload URLs by routing them through the protected API.

## 2026-06-19

- Improved employee attendance UX.
- Added attendance period calculation based on configurable start day.
- Added schedule-aware late/incomplete rules.
- Added working Saturday behavior and no-grace Saturday rule.

## 2026-06-18

- Added HIP CMiF68S attendance device configuration.
- Added incremental sync and full backfill.
- Added no-confirm/read-only sync behavior.
- Added admin device UI and sync run history.
- Added attendance cron endpoint.

## 2026-06-02

- Added vacation eligibility rules based on probation completion and configurable years after probation.
- Added probation extension support.
- Updated login copy to support AD username or employee ID.

## Earlier Milestones

- Project setup with Next.js, SQL Server, Tailwind, and NextAuth.
- Local login and AD/LDAP/Azure integration.
- Core leave request, approval, and history pages.
- HR employee, leave, holiday, settings, analytics, and reports.
- Delegate approver flow.
- Bulk leave import.
- Cross-year leave support.
- Year-end processing.
- Audit logs and rate limiting.
- PWA support.
