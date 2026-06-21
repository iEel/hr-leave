# Attendance Leave Adjustment And HR Report Design

## Goal

Make attendance status reflect approved leave requests, especially hourly leave, so employees are not incorrectly marked late when an approved leave covers the relevant work-start period. Add an HR-facing report and export flow so HR can review raw punches, adjusted attendance status, and the approved leave used for the adjustment.

## Context

Current attendance calculation uses HIP scan data and schedule rules only. A day is late when `checkIn > lateAfterTime`. Leave requests are not considered yet, even though `LeaveRequests` already stores:
- `status`
- `leaveType`
- `isHourly`
- `startTime`
- `endTime`
- `timeSlot`
- `startDatetime`
- `endDatetime`

The employee attendance page already uses the 21st-through-20th calculation period, normal workday grace, and working Saturday rules. The new behavior should extend that calculation rather than create a separate attendance interpretation.

## Scope

This change covers:
- Applying approved leave requests to attendance late and incomplete-status calculation.
- Treating all approved leave types as eligible to affect attendance status when their date/time range covers the relevant attendance window.
- Keeping the no-extra-grace policy after an hourly leave ends.
- Showing adjusted attendance status and leave reason on employee attendance rows where relevant.
- Showing a clickable leave request reference when a leave request affects or explains an attendance row.
- Adding an HR report view under `/hr/reports` for attendance status review.
- Adding CSV export for the HR attendance report.

This change does not cover:
- Creating a shift module.
- Creating per-employee or per-department schedules.
- Payroll deductions or penalty calculation.
- Editing raw HIP scan records.
- Changing leave balance deduction rules.
- Adding a separate attendance-correction approval module.

## Business Rules

### Approved Leave Only

Only leave requests with `status = 'APPROVED'` affect attendance status.

Leave requests with `PENDING`, `REJECTED`, or `CANCELLED` must not change late or incomplete status.

### All Leave Types Can Affect Attendance

All approved leave types can affect attendance status if the leave date/time range covers the relevant attendance window.

Examples:
- `SICK` 08:30-09:00 can prevent late status for a scan at 08:50.
- `PERSONAL` 08:30-09:00 can prevent late status for a scan at 09:00.
- `OTHER` 08:30-09:00 can prevent late status because the company currently uses this unlimited leave type for attendance-related cases.

Do not hardcode only `OTHER`. The source of truth is the approved leave time range, not the leave type name.

### No Extra Grace After Leave

The company policy is no extra grace after an approved hourly leave ends.

Example with normal work start 08:30 and original late threshold 08:45:
- Approved leave 08:30-09:00, scan 08:50 -> not late.
- Approved leave 08:30-09:00, scan 09:00 -> not late.
- Approved leave 08:30-09:00, scan 09:01 -> late.

The effective late threshold becomes the later value between the original late threshold and the approved leave end time when the approved leave covers the work-start period. Do not add the normal 15-minute grace again after leave end.

Example:
- Original late threshold is 08:45.
- Approved leave 08:30-08:40 means the effective late threshold remains 08:45.
- Approved leave 08:30-09:00 means the effective late threshold becomes 09:00.

### Hourly Leave

Hourly leave affects late status when its leave interval covers the work-start period and extends the allowed check-in window beyond the original late threshold.

Rules:
- If hourly leave starts at or before scheduled start and ends after scheduled start, it can adjust the late threshold.
- The effective late threshold is `max(originalLateAfterTime, leaveEndTime)`.
- If the employee checks in at or before the effective late threshold, the final status is not late.
- If the employee checks in after the effective late threshold, the final status is late.
- If the leave starts after the employee is already late, it does not excuse the earlier late status.

Examples with work start 08:30 and original late threshold 08:45:
- Leave 08:30-08:40, scan 08:44 -> not late because the original 08:45 threshold still applies.
- Leave 08:30-09:00, scan 08:50 -> not late.
- Leave 08:30-09:00, scan 09:01 -> late.
- Leave 09:00-09:30, scan 08:50 -> late, because the leave does not cover the late window.

### Full-Day Leave

An approved full-day leave covering a workday means that day should not be counted as late or incomplete due to missing HIP scans.

The row may still show HIP scans if any exist, but the final attendance status should indicate approved leave rather than a workday attendance problem.

### Half-Day Leave

Approved half-day leave affects only the matching half of the day:
- `HALF_MORNING` can prevent late or missing-check-in status for the morning.
- `HALF_AFTERNOON` can prevent missing-check-out or afternoon-related issues, but it must not prevent morning late status.

Because the current system does not calculate early leave yet, the first implementation should focus on morning late and missing check-in.

### Raw Status Versus Final Status

The system should keep two concepts separate:
- Raw status from HIP scans and schedule rules.
- Final status after approved leave adjustment.

The UI and export should make adjustments auditable. Do not hide the raw scan time.

Example row:
- Raw check-in: 08:50.
- Original threshold: 08:45.
- Approved leave: SICK 08:30-09:00.
- Raw status: late.
- Final status: approved leave covers late.

### Incomplete Data

Approved leave can suppress incomplete status only for the side of the day it covers.

Examples:
- Full-day approved leave with no HIP scans -> not incomplete.
- Half-morning leave with missing check-in but normal check-out -> not incomplete for missing check-in.
- Half-afternoon leave with check-in but no check-out -> not incomplete for missing check-out.
- Hourly leave 08:30-09:00 with missing check-in may explain the morning gap, but if there is still no check-out and no afternoon leave, the day can remain incomplete for missing check-out.

The first implementation should keep this conservative: only suppress the missing side when the approved leave clearly covers that side.

## Employee UI Design

The employee `/attendance` page should keep its existing shape but add clear leave-adjustment evidence.

Row-level behavior:
- Show raw check-in and check-out times as before.
- If a late status is adjusted by leave, show a badge such as `มีใบลาอนุมัติ`.
- Show a short reason, for example `ลาป่วย 08:30-09:00`.
- Show a compact clickable leave request chip, for example `ใบลา LR-2026-000123` or `ใบลา #123`.
- If the day remains late after leave adjustment, show `สาย`.
- If the day has both missing data and approved leave, show the specific remaining issue rather than a generic status.

### Leave Request Link And Detail

When an attendance row has related approved leave, show the leave reference as a small chip/link rather than making the whole row clickable. This keeps the table easy to scan and reduces accidental navigation.

Recommended display:
- `ใบลา LR-2026-000123` for a single related leave request.
- `2 ใบลา` when multiple leave requests affect the same date.
- Add `ใช้ปรับสถานะ` to the leave request that actually changed the final attendance status.

Click behavior:
- Open a drawer or modal with leave details in context.
- Do not navigate away from `/attendance` or `/hr/reports` by default.

Detail content:
- Leave request number.
- Leave type.
- Date and time range.
- Reason.
- Approval status.
- Approver.
- Approved date/time.
- Attachment link, when the viewer has permission.

Permissions:
- Employees can view their own related leave request details.
- HR/Admin can view related leave request details for employees they can access.
- Managers and delegated approvers can view related leave request details only for team/approval-scope employees.
- Medical certificate files and other protected attachments must continue to use protected API access, not public static URLs.

Display number:
- Prefer a readable display number such as `LR-2026-000123`.
- The first implementation may derive it from `LeaveRequests.createdAt` year and `LeaveRequests.id`; no large migration is required unless the company later needs immutable sequential document numbers.

Summary behavior:
- `สาย` should count final late rows, not raw late rows.
- Add or preserve a way to distinguish `มีใบลาอนุมัติ` rows, either as a summary metric or a quick filter.

## HR Report UI Design

Add an attendance report tab or section inside existing `/hr/reports`. Do not create a duplicate top-level HR menu unless the report grows beyond the current page.

Filters:
- Calculation period month, using the 21st-through-20th attendance period.
- Company.
- Department.
- Employee search.
- Status: all, late, adjusted by leave, incomplete, no HIP data.

Summary metrics:
- Late after leave adjustment.
- Adjusted by approved leave.
- Incomplete data.
- No HIP data.
- Employees with at least one attendance issue.

Table columns:
- Date.
- Employee ID.
- Employee name.
- Company.
- Department.
- Scheduled start.
- Raw check-in.
- Raw check-out.
- Original late threshold.
- Effective late threshold.
- Raw status.
- Final status.
- Leave request number.
- Leave type.
- Leave time range.
- Leave request ID.

The report should be dense and scannable because HR will use it operationally.

## Export Design

Add CSV export first. Excel export can be a later enhancement if HR needs formatted workbooks.

CSV should include both raw and adjusted fields:
- `date`
- `employeeId`
- `employeeName`
- `company`
- `department`
- `scheduledStartTime`
- `scheduledEndTime`
- `rawCheckIn`
- `rawCheckOut`
- `originalLateAfterTime`
- `effectiveLateAfterTime`
- `rawStatus`
- `finalStatus`
- `adjustedByApprovedLeave`
- `leaveRequestNo`
- `leaveRequestId`
- `leaveType`
- `leaveStartTime`
- `leaveEndTime`
- `leaveTimeSlot`
- `scanCount`

CSV should include UTF-8 BOM like existing exports so Thai text opens correctly in Excel.

## Data/API Design

Extend attendance summary calculation with approved leave context.

Suggested derived fields:

```ts
interface AttendanceLeaveAdjustment {
  leaveRequestId: number;
  leaveRequestNo: string;
  leaveType: string;
  timeSlot: "FULL_DAY" | "HALF_MORNING" | "HALF_AFTERNOON" | "HOURLY";
  startTime: string | null;
  endTime: string | null;
  label: string;
  isStatusAdjusting: boolean;
}

interface AttendanceDaySummary {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  scanCount: number;
  dayType: "NORMAL_WORKDAY" | "WORKING_SATURDAY" | "NON_WORKDAY";
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  lateAfterTime: string | null;
  effectiveLateAfterTime: string | null;
  rawIsLate: boolean;
  isLate: boolean;
  rawIsIncomplete: boolean;
  isIncomplete: boolean;
  missingCheckIn: boolean;
  missingCheckOut: boolean;
  adjustedByApprovedLeave: boolean;
  leaveAdjustment: AttendanceLeaveAdjustment | null;
  relatedLeaveRequests: AttendanceLeaveAdjustment[];
}
```

Repository behavior:
- Load HIP attendance rows for the selected employee and date range.
- Load approved leave requests for the same employee and date range.
- Summarize raw attendance by date.
- Apply leave adjustment to derive final status.
- Return both raw and final status fields.

HR report API:
- Add a new endpoint such as `/api/hr/reports/attendance`.
- Support `format=json` and `format=csv`.
- Reuse the same server-side attendance summary helper used by employee attendance to avoid drift.

Leave detail API:
- Add or reuse a protected leave detail endpoint that returns only fields needed for the drawer/modal.
- Enforce the same viewer permissions as HR leave history and medical-file access.
- Normalize attachment URLs through the protected file route.

## Testing

Add regression tests for:
- No leave: 08:46 is late when normal threshold is 08:45.
- Approved hourly leave 08:30-08:40 and scan 08:44 is not late because the original 08:45 threshold still applies.
- Approved hourly leave 08:30-09:00 and scan 08:50 is not late.
- Approved hourly leave 08:30-09:00 and scan 09:00 is not late.
- Approved hourly leave 08:30-09:00 and scan 09:01 is late.
- Approved hourly leave 09:00-09:30 and scan 08:50 remains late.
- Pending leave does not affect status.
- Rejected leave does not affect status.
- Approved full-day leave suppresses late and incomplete status.
- Approved half-morning leave can suppress missing check-in.
- Approved half-afternoon leave does not suppress morning late status.
- Attendance row exposes a clickable leave request reference when approved leave is related.
- Leave detail access is denied for unrelated users.
- HR attendance CSV contains raw status, final status, and leave adjustment fields.

## Open Notes

- This design intentionally treats all approved leave types equally for attendance adjustment because the user's confirmed policy is that any approved leave can change attendance status if it covers the relevant time.
- If the company later needs to exclude certain leave types from attendance adjustment, add a per-leave-type setting rather than hardcoding exceptions.
- This feature should not mutate HIP logs. Attendance adjustment is derived from leave approvals and should remain auditable.

