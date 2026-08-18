# Database

## Database Engine

- Microsoft SQL Server
- Application access through `mssql`
- No ORM
- Local/default DB name: `HRLeave`

## Migration Location

```text
database/
  schema.sql
  migrations/
```

Run migrations in order for existing environments. Always back up production before migration.

## Core Tables

| Table | Purpose |
| --- | --- |
| `Users` | Employee identity, role, company, department, AD metadata |
| `LeaveRequests` | Leave applications and approval state |
| `LeaveRequestYearSplit` | Cross-year leave allocation by fiscal year |
| `LeaveBalances` | Entitlement, used, remaining, carry-over |
| `PublicHolidays` | Holidays and special non-working days |
| `WorkingSaturdays` | Saturday work schedule overrides |
| `Notifications` | User notifications |
| `AuditLogs` | Security and operational audit events |
| `SystemSettings` | Configurable system settings |
| `Companies` | Company metadata |
| `DelegateApprovers` | Manager delegate approvals |
| `UsersArchive` | Archived users from AD lifecycle flow |
| `LeaveBalancesArchive` | Archived balances |
| `LeaveRequestsArchive` | Archived leave requests |
| `AttendanceDevices` | HIP device configuration and sync status |
| `AttendanceLogs` | Raw attendance records from HIP devices |
| `AttendanceSyncRuns` | Sync/backfill run history |

## Important User Columns

| Column | Purpose |
| --- | --- |
| `employeeId` | Employee code; also maps to HIP `user_key` in current implementation |
| `role` | `EMPLOYEE`, `MANAGER`, `HR`, `ADMIN` |
| `isHRStaff` | Grants HR/Admin access behavior for HR staff users |
| `isADUser` | Marks AD-managed users |
| `adUsername` | AD username |
| `authProvider` | `LOCAL`, `AD`, or `AZURE` |
| `adStatus` | AD lifecycle status |
| `probationDays` | Standard probation duration |
| `probationExtensionDays` | Additional probation days |
| `probationOverrideDate` | Manual probation completion override |

## Leave Request Columns

| Column | Purpose |
| --- | --- |
| `leaveType` | `VACATION`, `SICK`, `PERSONAL`, `OTHER`, etc. |
| `startDatetime`, `endDatetime` | Leave range |
| `timeSlot` | `FULL_DAY`, `HALF_MORNING`, `HALF_AFTERNOON`, `HOURLY` |
| `isHourly` | Hourly leave flag |
| `startTime`, `endTime` | Hourly leave time range |
| `usageAmount` | Net leave days |
| `status` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `medicalCertificateFile` | Protected leave attachment reference; retained for compatibility and used for medical certificates or optional personal-leave documents |

## Attendance Tables

### `AttendanceDevices`

Stores branch/device config and sync state:

- `protocol`
- `ipAddress`
- `port`
- `passCode`
- `syncEnabled`
- `syncFrequencyMinutes`
- `timeoutMs`
- `retryCount`
- `lastSyncAt`
- `lastSuccessfulSyncAt`
- `nextSyncAt`
- `lastSyncStatus`
- `lastError`
- `syncLockOwner`
- `syncLockUntil`

### `AttendanceLogs`

Stores decoded HIP records:

- `deviceId`
- `userKey`
- `employeeId`
- `recordTime`
- `rawRecordTime`
- `yearCode`
- `verifyCode`
- `verifyType`
- `recordHex`
- `sourceCommand`

Unique dedupe key:

```sql
deviceId, userKey, recordTime, verifyType, recordHex
```

### `AttendanceSyncRuns`

Stores incremental/backfill run history:

- `mode`
- `status`
- `triggerType`
- `startedAt`
- `finishedAt`
- `newCount`
- `receivedCount`
- `insertedCount`
- `duplicateCount`
- `confirmedCount`
- `errorMessage`

## System Settings

Important keys include:

- `AUTH_MODE`
- `WORK_START_TIME`
- `WORK_END_TIME`
- `BREAK_START_TIME`
- `BREAK_END_TIME`
- `SAT_WORK_START_TIME`
- `SAT_WORK_END_TIME`
- `WORKDAY_LATE_GRACE_MINUTES`
- `ATTENDANCE_PERIOD_START_DAY`
- `LEAVE_YEAR_START`
- `LEAVE_CARRYOVER_LIMIT`
- `LEAVE_QUOTA_VACATION`
- `VACATION_AFTER_PROBATION_YEARS`
- `PROBATION_STANDARD_DAYS`

## Migration Practice

- Add new migrations under `database/migrations/`.
- Make migrations idempotent with `IF NOT EXISTS` checks.
- For production, back up first and record migration date/operator.
- Document production-impacting migrations in [Production Readiness](11_production-readiness.md) and [Changelog](13_changelog.md).
