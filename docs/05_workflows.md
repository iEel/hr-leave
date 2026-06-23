# Workflows

## Employee Leave Request

1. Employee opens `/leave/request`.
2. System checks leave type rules and balance.
3. Employee submits leave request.
4. Request is stored as `PENDING`.
5. Manager approves or rejects.
6. Approved leave affects leave balance and attendance adjustment where applicable.

## Leave Approval

1. Manager opens `/approvals` or follows email magic link.
2. System verifies ownership, direct manager, or delegate access.
3. Manager approves or rejects.
4. Rejected requests require a reason.
5. Notifications are sent according to existing notification/email logic.

## Delegate Approval

1. Manager configures delegate under `/manager/delegates`.
2. Delegate receives approval access for the configured manager scope.
3. Delegate permissions are checked server-side in APIs.

## Leave History And Cancellation

- Employees can view their own leave history under `/leave/history`.
- Employees can cancel requests only while they are still `PENDING`.
- Rejected and cancelled requests do not affect attendance adjustment.

## Cross-Year Leave

Cross-year leave is split into fiscal-year portions through `LeaveRequestYearSplit`.

Rules:

- Split by working days in each fiscal year.
- Auto-create next-year balance when required.
- Preserve used amounts when year-end processing later runs.
- Cancel/reject returns usage to the correct year split.

## Year-End Processing

Year-end workflow lives under `/hr/year-end`.

It handles:

- Carry-over calculation
- New year leave balance setup
- Auto-created balance reconciliation
- Vacation eligibility/carry-over rules

## Attendance Sync

1. System Admin configures device under `/admin/attendance-devices`.
2. Cron or admin action starts sync.
3. Device lock is acquired in `AttendanceDevices`.
4. Server connects to HIP CMiF68S through TCP custom protocol.
5. Records are decoded and inserted with DB dedupe.
6. Sync run and device status are updated.
7. Device lock is released.

## Employee Attendance View

1. Employee opens `/attendance`.
2. API reads `AttendanceLogs` for current employee.
3. Work schedule and working Saturdays are applied.
4. Approved leave adjustments are applied.
5. UI shows raw scan times and final status.

## HR Attendance Report

1. HR/Admin opens `/hr/reports`.
2. User selects the `เวลาเข้า-ออก` tab.
3. System loads attendance report for the selected period and status filter.
4. HR can click leave request references for details.
5. HR can export CSV.

## Bulk Leave Import

1. HR opens `/hr/leave-import`.
2. HR uploads template data.
3. System validates employee, leave type, dates, and balances.
4. Valid rows are inserted; invalid rows are reported.

## AD Lifecycle

Admin tools support AD-related account lifecycle operations:

- Sync AD/Azure users
- Mark inactive/deleted users
- Archive/purge according to policy

Production behavior depends on configured AD/Azure environment variables.
