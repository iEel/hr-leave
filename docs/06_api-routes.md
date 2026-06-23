# API Routes

This document maps important API routes. API route handlers live under `src/app/api/**/route.ts`.

## Auth

| Route | Purpose |
| --- | --- |
| `/api/auth/[...nextauth]` | NextAuth handler |
| `/api/auth/verify` | Credential verification |
| `/api/auth/mode` | Current auth mode |
| `/api/auth/delegate-check` | Delegate status check |
| `/api/auth/log` | Auth-related logging |

## Leave

| Route | Purpose |
| --- | --- |
| `/api/leave/request` | Create leave request |
| `/api/leave/history` | Current user leave history |
| `/api/leave/pending` | Pending approvals |
| `/api/leave/approve` | Approve leave |
| `/api/leave/cancel` | Cancel leave |
| `/api/leave/balance` | Current user balance |
| `/api/leave/detail/[leaveId]` | Protected leave detail for attendance/report links |
| `/api/leave/vacation-eligibility` | Current user vacation eligibility |

## HR

| Route | Purpose |
| --- | --- |
| `/api/hr/employees` | Employee CRUD/listing |
| `/api/hr/employees/export` | Employee export |
| `/api/hr/employees/import` | Employee import |
| `/api/hr/employees/password` | Password management |
| `/api/hr/employees/sync` | AD/Azure employee sync |
| `/api/hr/employees/transfer` | Employee transfer |
| `/api/hr/companies` | Company CRUD |
| `/api/hr/departments` | Department data |
| `/api/hr/holidays` | Holiday CRUD |
| `/api/hr/leaves` | HR leave management |
| `/api/hr/leave-import` | Bulk leave import |
| `/api/hr/overview` | HR dashboard data |
| `/api/hr/analytics` | Analytics data |
| `/api/hr/reports/monthly` | Monthly leave report and CSV |
| `/api/hr/reports/attendance` | Attendance report and CSV |
| `/api/hr/settings` | HR settings |
| `/api/hr/settings/auth` | Auth settings |
| `/api/hr/work-schedule` | Work schedule settings |
| `/api/hr/working-saturdays` | Working Saturday management |
| `/api/hr/year-end/preview` | Year-end preview |
| `/api/hr/year-end/execute` | Year-end execution |

## Manager

| Route | Purpose |
| --- | --- |
| `/api/manager/team` | Team members |
| `/api/manager/calendar` | Team leave calendar |
| `/api/manager/delegates` | Delegate management |
| `/api/manager/delegates/search` | Delegate search |

## Admin

| Route | Purpose |
| --- | --- |
| `/api/admin/audit-logs` | Admin audit logs |
| `/api/admin/rate-limit` | Rate limit settings |
| `/api/admin/archive-users` | Archive users |
| `/api/admin/purge-archived` | Purge archived records |
| `/api/admin/migrate-ad` | AD migration action |
| `/api/admin/attendance/devices` | Attendance device CRUD |
| `/api/admin/attendance/devices/[deviceId]/test` | Test HIP device connection |
| `/api/admin/attendance/devices/[deviceId]/sync` | Manual incremental attendance sync |
| `/api/admin/attendance/devices/[deviceId]/backfill` | Manual full attendance backfill |
| `/api/admin/attendance/sync-runs` | Attendance sync run history |

## Cron

| Route | Purpose |
| --- | --- |
| `/api/cron/ad-sync` | Scheduled AD sync |
| `/api/cron/attendance-sync` | Scheduled HIP attendance sync |
| `/api/cron/audit-cleanup` | Audit log retention cleanup |

Cron routes require the configured cron secret. See [`09_deployment.md`](09_deployment.md) and [`../DEPLOYMENT.md`](../DEPLOYMENT.md).

## Files And Uploads

| Route | Purpose |
| --- | --- |
| `/api/upload/medical` | Upload medical certificate |
| `/api/files/medical/[filename]` | Protected medical certificate serving |

Do not create new direct static medical file links. Use the protected API route.
