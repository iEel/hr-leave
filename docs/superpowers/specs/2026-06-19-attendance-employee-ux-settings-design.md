# Attendance Employee UX Settings Design

## Goal

Improve the employee `/attendance` page so employees can quickly see late check-ins, incomplete scan days, working Saturday records, and company payroll-period attendance records without introducing shift or per-employee work-schedule logic.

## Scope

This change covers:
- Reusing the existing HR/Admin -> `ตั้งค่าเวลาทำงาน` rules as the attendance schedule source.
- Working Saturday awareness through the existing `WorkingSaturdays` table.
- Employee attendance period defaults using the company calculation cycle.
- UI summary and quick filters on `/attendance`.
- Safer interpretation of one-scan days.

This change does not cover:
- Detecting workdays with no scan at all.
- Per-branch, per-department, per-employee, or shift-based rules.
- Calculating late penalties, payroll deductions, work hours, early leave, or absent status.

## Business Rules

### Calculation Period

The company calculates attendance from the 21st of the previous month through the 20th of the selected month.

Examples:
- Selected period month `2026-06` means `2026-05-21` through `2026-06-20`.
- Selected period month `2026-01` means `2025-12-21` through `2026-01-20`.

The `/attendance` page should default to the current calculation period, not calendar month start/end.

### Work Schedule Source

Use the existing HR/Admin -> `ตั้งค่าเวลาทำงาน` menu as the schedule source for attendance display rules.

Existing sources:
- Normal working day start/end comes from `WORK_START_TIME` and `WORK_END_TIME`.
- Normal break time comes from `BREAK_START_TIME` and `BREAK_END_TIME`.
- Saturday default start/end comes from `SAT_WORK_START_TIME` and `SAT_WORK_END_TIME`, but only as defaults when HR adds a working Saturday.
- Actual working Saturdays come from `WorkingSaturdays`. Each working Saturday may have its own `startTime` and `endTime`.

Add attendance-related fields to `ตั้งค่าเวลาทำงาน`, not to System Admin -> `เครื่องบันทึกเวลา`, so business schedule rules stay in one place:
- `นาทีอนุโลมสายวันทำงานปกติ`: default `15`.
- `รอบคำนวณเวลาเข้า-ออกเริ่มวันที่`: default `21`.

For the current phase, these rules are global and shared by all employees.

System Admin -> `เครื่องบันทึกเวลา` remains focused on device and sync operations such as IP address, port, pass code, sync frequency, manual sync, and backfill.

### Workday Classification

For each date in the attendance period, classify the date before calculating status:
- Monday through Friday: normal workday.
- Saturday with a row in `WorkingSaturdays`: working Saturday.
- Saturday without a row in `WorkingSaturdays`: non-workday.
- Sunday: non-workday.

Non-workday rows may still be displayed if HIP has scans, but they must not count as late or incomplete workday problems.

### Single Scan Interpretation

HIP records currently do not provide a reliable punch type for check-in versus check-out. The system should infer one-scan days using the schedule-aware cutoff.

Rules:
- Multiple scans in a day:
  - First scan is `checkIn`.
  - Last scan is `checkOut`.
- One scan in a day:
  - On normal workdays, use `BREAK_START_TIME` as the cutoff.
  - On working Saturdays, use the midpoint between that Saturday's `startTime` and `endTime` as the cutoff.
  - If scan time is earlier than the cutoff, show it as `checkIn` and leave `checkOut` blank.
  - If scan time is equal to or later than the cutoff, leave `checkIn` blank and show it as `checkOut`.
  - On non-workdays, use the same inference only for display, but do not mark late or incomplete.

Example:
- `2026-06-04` has only one scan at `18:35`.
- Display as `--:-- / 18:35`.
- Status should include `ไม่พบเวลาเข้า` and `ข้อมูลไม่ครบ`.
- It must not count as late because there is no check-in time.

### Late Check-In

Late status is only evaluated when `checkIn` exists and the date is a workday.

Normal workdays:
- Scheduled start comes from `WORK_START_TIME`.
- Late threshold is `WORK_START_TIME + นาทีอนุโลมสายวันทำงานปกติ`.
- With default `WORK_START_TIME = 08:30` and grace `15`, `08:45` is not late and `08:46` is late.

Working Saturdays:
- Scheduled start comes from that row's `WorkingSaturdays.startTime`.
- There is no late grace for Saturday.
- If a working Saturday starts at `09:00`, `09:00` is not late and `09:01` is late.

Non-workdays:
- Do not mark late even if HIP has scans.

### Incomplete Data

Incomplete status means a workday with at least one HIP scan where one side is missing:
- `checkIn` exists but `checkOut` is missing -> `ไม่พบเวลาออก`
- `checkOut` exists but `checkIn` is missing -> `ไม่พบเวลาเข้า`

Both should also be counted in the summary as `ข้อมูลไม่ครบ`.

Do not show "ขาดงาน" or "ไม่พบข้อมูลทั้งวัน" yet. Even though the system knows global workdays and working Saturdays, it still does not know per-employee schedule exceptions, leave approvals, or shift assignments.

## UI Design

### `/attendance` Header

Keep the existing page title `เวลาเข้า-ออก`.

Rename the month control label from `เดือน` to `รอบคำนวณ` or `รอบคำนวณเดือน`.

Show helper text near the filters:
- `รอบ 21 พ.ค. 2026 - 20 มิ.ย. 2026`

The helper should update when the selected period month changes.

### Summary Strip

Add a compact summary strip above the table.

Cards/metrics:
- `วันที่มีข้อมูล`: count of returned rows.
- `เข้าเกินเวลา`: count of rows where `isLate` is true.
- `ข้อมูลไม่ครบ`: count of rows where `isIncomplete` is true.

The late metric can show the normal-day threshold as helper text, for example `วันปกติหลัง 08:45`. Saturday rows use their own working Saturday start time and no grace.

### Quick Filters

Add segmented quick filters:
- `ทั้งหมด`
- `เข้าเกินเวลา`
- `ข้อมูลไม่ครบ`

These are client-side filters over the already-loaded period result.

The existing `เวลาเข้า ตั้งแต่` advanced filter may remain, but the quick filter should be the primary way to answer the user's current question.

### Table

Add a `สถานะ` column.

Rows should be visually scannable:
- Late rows use a warning style badge, not a full red/error treatment.
- Incomplete rows use an amber/orange badge.
- Rows with no issue may show `ปกติ` in a neutral/subtle badge or leave status visually quiet.

Suggested badges:
- `เข้าเกินเวลา`
- `ไม่พบเวลาเข้า`
- `ไม่พบเวลาออก`
- `เสาร์ทำงาน`
- `นอกวันทำงาน`
- `ข้อมูลไม่ครบ` may be used as a summary concept, but the row should prefer the specific missing-side label.

### Empty States

If the quick filter produces no rows:
- For late filter: `ไม่พบวันที่เข้าเกินเวลาในรอบนี้`
- For incomplete filter: `ไม่พบวันที่ข้อมูลไม่ครบในรอบนี้`

If there are no HIP rows at all:
- Keep the existing empty state wording, but clarify it is about HIP data in the selected period.

## Data/API Design

The API should return derived fields so UI logic stays simple and consistent:

```ts
interface AttendanceDaySummary {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  scanCount: number;
  dayType: "NORMAL_WORKDAY" | "WORKING_SATURDAY" | "NON_WORKDAY";
  scheduledStartTime: string | null;
  lateAfterTime: string | null;
  isLate: boolean;
  isIncomplete: boolean;
  missingCheckIn: boolean;
  missingCheckOut: boolean;
}
```

The repository should calculate `checkIn/checkOut` using the schedule-aware single-scan cutoff rule.

The repository should also derive `dayType`, `scheduledStartTime`, `lateAfterTime`, `isLate`, and `isIncomplete` on the server so UI logic stays consistent across dashboard and `/attendance`.

The API should also return active settings:

```ts
{
  success: true,
  days: AttendanceDaySummary[],
  settings: {
    workStartTime: "08:30",
    breakStartTime: "12:00",
    weekdayGraceMinutes: 15,
    periodStartDay: 21
  }
}
```

## Settings Storage

Use `SystemSettings` for global settings if possible, following existing settings patterns.

Existing keys to read:
- `WORK_START_TIME`
- `WORK_END_TIME`
- `BREAK_START_TIME`
- `BREAK_END_TIME`
- `SAT_WORK_START_TIME`
- `SAT_WORK_END_TIME`

Suggested new keys:
- `WORKDAY_LATE_GRACE_MINUTES`
- `ATTENDANCE_PERIOD_START_DAY`

Defaults:
- `WORKDAY_LATE_GRACE_MINUTES = 15`
- `ATTENDANCE_PERIOD_START_DAY = 21`

Validation:
- Time values must be `HH:mm`.
- `WORKDAY_LATE_GRACE_MINUTES` must be an integer from `0` to `240`.
- Period start day must be an integer from `1` to `28`.

## Testing

Add regression coverage for:
- Period month `2026-06` produces `2026-05-21` to `2026-06-20`.
- Normal workday `08:45` is not late when `WORK_START_TIME = 08:30` and grace is `15`.
- Normal workday `08:46` is late when `WORK_START_TIME = 08:30` and grace is `15`.
- Working Saturday `09:00` is not late when that Saturday starts at `09:00`.
- Working Saturday `09:01` is late when that Saturday starts at `09:00`.
- Non-working Saturday with scans is displayed but does not count as late or incomplete.
- One scan at `08:30` maps to `checkIn=08:30`, `checkOut=null`.
- One scan at `18:35` maps to `checkIn=null`, `checkOut=18:35`.
- One scan at `18:35` is incomplete but not late.
- Multiple scans map first scan to check-in and last scan to check-out.

## Open Notes

- This design intentionally avoids "absent" detection because the product does not yet know per-employee work schedules, leave context, or shifts.
- If future requirements need branch/department-specific schedules, convert these global settings into scoped settings while keeping the employee page UI shape.