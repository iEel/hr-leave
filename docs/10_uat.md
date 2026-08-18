# UAT

Use these scenarios before major release or production deployment.

## Employee

- Login with local employee ID.
- Login with AD username where configured.
- View dashboard leave balances.
- Request full-day leave.
- Request half-day leave.
- Request hourly leave.
- Attach medical certificate for sick leave when required.
- Submit personal leave without an attachment.
- Submit personal leave with an optional PDF/JPG/PNG attachment up to 5 MB.
- View leave history.
- Open own sick-leave and personal-leave attachments from leave history and verify type-specific wording.
- Cancel pending leave.
- View own attendance period.
- Filter attendance by month/date range.
- Verify leave-adjusted attendance status appears correctly.

## Manager

- View pending approvals.
- Approve leave.
- Reject leave with reason.
- Open team page.
- View team calendar.
- Configure delegate.
- Verify delegate can approve within scope.
- Verify manager can open protected sick-leave and personal-leave attachments for team requests.
- Verify unrelated manager cannot access protected leave detail.

## HR

- Create/edit employee.
- Import leave records.
- Manage holidays.
- Manage work schedule and working Saturdays.
- Run year-end preview.
- Execute year-end in a test environment.
- View leave reports.
- View attendance reports.
- Export leave CSV.
- Export attendance CSV.
- Open leave detail from attendance report.
- Filter leave records with attachments and open protected sick-leave or personal-leave files.

## Admin

- View audit logs.
- Change auth mode in test environment.
- Configure rate limits.
- Configure attendance device.
- Test HIP device connection.
- Run manual sync.
- Run backfill.
- Verify sync run history.
- Verify AD lifecycle tools in a non-production environment.

## Attendance HIP

- Confirm app server can reach HIP device TCP port.
- Confirm `user_key` matches `Users.employeeId`.
- Run `test connection`.
- Run backfill in test environment.
- Verify duplicate sync does not create duplicate DB rows.
- Verify `AttendanceSyncRuns` records success/failure counts.
- Verify employee attendance page shows expected scans.
- Verify HR attendance report filters status immediately after changing the filter.

## Security

- Unauthorized users cannot access `/hr` or `/admin`.
- Employee cannot access another employee's leave detail.
- Unrelated manager cannot access protected leave detail.
- Leave attachment direct legacy URL `/uploads/medical/...` routes through protected API.
- Cron endpoints reject missing/wrong `x-cron-secret`.

## Production Smoke Test

After deployment:

- Login as Admin.
- Login as Employee.
- Load dashboard.
- Load `/attendance`.
- Load `/hr/reports`.
- Load `/admin/attendance-devices`.
- Run a safe connection test on the HIP device.
- Check latest cron run status.
