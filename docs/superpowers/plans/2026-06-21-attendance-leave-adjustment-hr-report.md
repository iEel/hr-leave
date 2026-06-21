# Attendance Leave Adjustment HR Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make attendance status account for approved leave requests, expose leave request links/details, and add an HR attendance report with CSV export.

**Architecture:** Keep HIP scan storage immutable and derive final attendance status server-side. Add pure helpers for leave request numbering, leave access, and attendance leave adjustment; then reuse those helpers from employee attendance APIs, HR report APIs, and UI display components so employee and HR screens cannot drift.

**Tech Stack:** Next.js 16 App Router, TypeScript, MS SQL Server via `mssql`, Tailwind CSS v4, plain Node/Jiti tests under `tests/`.

---

## Scope Check

The spec covers one connected attendance feature with three surfaces:
- Shared attendance calculation with approved leave adjustment.
- Employee `/attendance` leave evidence and clickable leave detail.
- HR `/hr/reports` attendance report and CSV export.

These surfaces share the same derived attendance model, so they should be implemented in one plan. No database migration is required for the first implementation because leave request numbers can be derived from `LeaveRequests.createdAt` and `LeaveRequests.id`.

Implementation decisions:
- Do not add a persisted `leaveRequestNo` column in this phase.
- Do not add new leave permission semantics in this phase.
- Reuse the existing owner, HR/Admin/isHRStaff, direct manager, and active delegate access model for leave detail.
- Reuse the existing protected medical attachment route and file permission checks for attachments.

## File Structure

Create:
- `src/lib/leave-request-number.ts` - formats readable leave request numbers such as `LR-2026-000123`.
- `src/lib/leave-access.ts` - pure permission helper for leave detail access.
- `src/lib/attendance/leave-adjustments.ts` - pure helper that applies approved leave intervals to raw attendance summaries.
- `src/lib/attendance/hr-report.ts` - HR attendance report row shaping, filtering, and CSV formatting.
- `src/app/api/leave/detail/[leaveId]/route.ts` - protected leave detail endpoint for drawer/modal use.
- `src/app/api/hr/reports/attendance/route.ts` - HR attendance report JSON/CSV endpoint.
- `tests/leave-request-number.test.mjs`
- `tests/leave-access.test.mjs`
- `tests/attendance-leave-adjustments.test.mjs`
- `tests/attendance-hr-report.test.mjs`
- `tests/leave-detail-route.test.mjs`

Modify:
- `package.json` - add new tests to the `npm test` chain.
- `src/lib/attendance/schedule-rules.ts` - extend `AttendanceDaySummary` with raw/final fields and optional included dates.
- `src/lib/attendance/display.ts` - use `effectiveLateAfterTime` for adjusted late minutes and labels.
- `src/lib/attendance/repository.ts` - load approved leaves, include leave-only dates, and apply adjustments.
- `src/app/(dashboard)/attendance/page.tsx` - show adjusted status badges, leave chips, and leave detail modal.
- `src/app/(dashboard)/hr/reports/page.tsx` - add `การลา` / `เวลาเข้า-ออก` tabs and attendance report table/export controls.
- `DEVELOPER_HANDOFF.md` - document attendance leave-adjustment business rules and HR report/export behavior.

---

### Task 1: Leave Request Number And Access Helpers

**Files:**
- Create: `src/lib/leave-request-number.ts`
- Create: `src/lib/leave-access.ts`
- Create: `tests/leave-request-number.test.mjs`
- Create: `tests/leave-access.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing leave request number tests**

Create `tests/leave-request-number.test.mjs`:

```js
import assert from 'node:assert/strict';

import { formatLeaveRequestNo } from '../src/lib/leave-request-number.ts';

assert.equal(formatLeaveRequestNo({ id: 123, createdAt: '2026-06-21' }), 'LR-2026-000123');
assert.equal(formatLeaveRequestNo({ id: 7, createdAt: new Date('2025-12-30T10:00:00+07:00') }), 'LR-2025-000007');
assert.equal(formatLeaveRequestNo({ id: 42, createdAt: null }), 'LR-0000-000042');

console.log('leave request number tests passed');
```

- [ ] **Step 2: Write failing leave detail access tests**

Create `tests/leave-access.test.mjs`:

```js
import assert from 'node:assert/strict';

import { canViewLeaveDetail } from '../src/lib/leave-access.ts';

const owner = { userId: 10, managerId: 20 };

assert.equal(canViewLeaveDetail({ userId: 10, role: 'EMPLOYEE' }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 30, role: 'HR' }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 31, role: 'ADMIN' }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 32, role: 'EMPLOYEE', isHRStaff: true }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 20, role: 'MANAGER' }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 40, role: 'EMPLOYEE', delegatingManagerIds: [20] }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 50, role: 'MANAGER', delegatingManagerIds: [99] }, owner), false);
assert.equal(canViewLeaveDetail({ userId: 60, role: 'EMPLOYEE' }, owner), false);

console.log('leave access tests passed');
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
jiti tests/leave-request-number.test.mjs
jiti tests/leave-access.test.mjs
```

Expected: both fail with module-not-found errors.

- [ ] **Step 4: Implement helper files**

Create `src/lib/leave-request-number.ts`:

```ts
export interface LeaveRequestNumberInput {
    id: number | string;
    createdAt?: string | Date | null;
}

function getYear(createdAt: string | Date | null | undefined): string {
    if (!createdAt) return '0000';
    if (createdAt instanceof Date && !Number.isNaN(createdAt.getTime())) return String(createdAt.getFullYear());
    const match = String(createdAt).match(/^(\d{4})/);
    return match ? match[1] : '0000';
}

export function formatLeaveRequestNo(input: LeaveRequestNumberInput): string {
    const numericId = Number(input.id);
    const normalizedId = Number.isFinite(numericId) && numericId > 0 ? Math.trunc(numericId) : 0;
    return `LR-${getYear(input.createdAt)}-${String(normalizedId).padStart(6, '0')}`;
}
```

Create `src/lib/leave-access.ts`:

```ts
export interface LeaveDetailViewer {
    userId: number;
    role: string;
    isHRStaff?: boolean;
    delegatingManagerIds?: number[];
}

export interface LeaveDetailOwner {
    userId: number;
    managerId: number | null;
}

export function canViewLeaveDetail(viewer: LeaveDetailViewer, owner: LeaveDetailOwner): boolean {
    if (viewer.userId === owner.userId) return true;
    if (viewer.role === 'HR' || viewer.role === 'ADMIN' || viewer.isHRStaff === true) return true;
    if (owner.managerId && viewer.userId === owner.managerId) return true;
    if (owner.managerId && viewer.delegatingManagerIds?.includes(owner.managerId)) return true;
    return false;
}
```

- [ ] **Step 5: Add tests to package script**

Insert these into the `npm test` script after `tests/attendance-display.test.mjs`:

```bash
jiti tests/leave-request-number.test.mjs && jiti tests/leave-access.test.mjs
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
jiti tests/leave-request-number.test.mjs
jiti tests/leave-access.test.mjs
npm test
git add package.json src/lib/leave-request-number.ts src/lib/leave-access.ts tests/leave-request-number.test.mjs tests/leave-access.test.mjs
git commit -m "Add leave request helpers for attendance adjustments"
```

Expected: focused tests and `npm test` pass before commit.

---

### Task 2: Attendance Summary Base Fields

**Files:**
- Modify: `src/lib/attendance/schedule-rules.ts`
- Modify: `src/lib/attendance/display.ts`
- Modify: `tests/attendance-schedule-rules.test.mjs`
- Modify: `tests/attendance-display.test.mjs`

- [ ] **Step 1: Add failing base-field tests**

In `tests/attendance-schedule-rules.test.mjs`, add assertions for `rawIsLate`, `rawIsIncomplete`, `effectiveLateAfterTime`, `adjustedByApprovedLeave`, `leaveAdjustment`, and `relatedLeaveRequests`. Add this included-date case:

```js
const includedWorkday = summarizeDailyAttendanceRowsWithSchedule([], {
    ...context,
    includedDates: ['2026-06-04'],
})[0];

assert.deepEqual(includedWorkday, {
    date: '2026-06-04',
    checkIn: null,
    checkOut: null,
    scanCount: 0,
    dayType: 'NORMAL_WORKDAY',
    scheduledStartTime: '08:30',
    scheduledEndTime: '17:00',
    lateAfterTime: '08:45',
    effectiveLateAfterTime: '08:45',
    rawIsLate: false,
    isLate: false,
    rawIsIncomplete: true,
    isIncomplete: true,
    missingCheckIn: true,
    missingCheckOut: true,
    adjustedByApprovedLeave: false,
    leaveAdjustment: null,
    relatedLeaveRequests: [],
});
```

In `tests/attendance-display.test.mjs`, add:

```js
assert.deepEqual(
    getAttendanceRowDisplay({
        checkIn: '09:01',
        checkOut: '17:00',
        isLate: true,
        lateAfterTime: '08:45',
        effectiveLateAfterTime: '09:00',
        missingCheckIn: false,
        missingCheckOut: false,
        adjustedByApprovedLeave: false,
    }),
    {
        checkInText: '09:01',
        checkOutText: '17:00',
        checkInTone: 'late',
        checkOutTone: 'normal',
        lateMinutes: 1,
        statusLabel: 'สาย',
    }
);
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
jiti tests/attendance-schedule-rules.test.mjs
jiti tests/attendance-display.test.mjs
```

Expected: failures for missing fields and unsupported `includedDates`.

- [ ] **Step 3: Extend attendance types and summary defaults**

In `src/lib/attendance/schedule-rules.ts`, add `AttendanceLeaveAdjustment` and extend `AttendanceDaySummary`:

```ts
export interface AttendanceLeaveAdjustment {
    leaveRequestId: number;
    leaveRequestNo: string;
    leaveType: string;
    timeSlot: 'FULL_DAY' | 'HALF_MORNING' | 'HALF_AFTERNOON' | 'HOURLY';
    startDate: string;
    endDate: string;
    startTime: string | null;
    endTime: string | null;
    label: string;
    isStatusAdjusting: boolean;
}
```

Add to `AttendanceSummaryContext`:

```ts
includedDates?: string[];
```

Change the summarizer to build from:

```ts
const dates = new Set<string>([
    ...rowsByDate.keys(),
    ...(context.includedDates ?? []),
]);
```

For every returned day, set:

```ts
effectiveLateAfterTime: daySchedule.lateAfterTime,
rawIsLate,
isLate: rawIsLate,
rawIsIncomplete,
isIncomplete: rawIsIncomplete,
adjustedByApprovedLeave: false,
leaveAdjustment: null,
relatedLeaveRequests: [],
```

- [ ] **Step 4: Update display helper**

In `src/lib/attendance/display.ts`, include `effectiveLateAfterTime` and `adjustedByApprovedLeave` in the `Pick`, and compute late minutes from `day.effectiveLateAfterTime ?? day.lateAfterTime`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
jiti tests/attendance-schedule-rules.test.mjs
jiti tests/attendance-display.test.mjs
npm test
git add src/lib/attendance/schedule-rules.ts src/lib/attendance/display.ts tests/attendance-schedule-rules.test.mjs tests/attendance-display.test.mjs
git commit -m "Extend attendance summaries with raw and final status fields"
```

Expected: tests pass before commit.

---

### Task 3: Pure Attendance Leave Adjustment Logic

**Files:**
- Create: `src/lib/attendance/leave-adjustments.ts`
- Create: `tests/attendance-leave-adjustments.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing leave adjustment tests**

Create `tests/attendance-leave-adjustments.test.mjs` with cases for:

```js
assert.equal(applyAttendanceLeaveAdjustments([day('08:46:00')], [])[0].isLate, true);
assert.equal(applyAttendanceLeaveAdjustments([day('08:44:00')], [leave({ endTime: '08:40' })])[0].effectiveLateAfterTime, '08:45');
assert.equal(applyAttendanceLeaveAdjustments([day('08:50:00')], [leave()])[0].isLate, false);
assert.equal(applyAttendanceLeaveAdjustments([day('09:00:00')], [leave()])[0].isLate, false);
assert.equal(applyAttendanceLeaveAdjustments([day('09:01:00')], [leave()])[0].isLate, true);
assert.equal(applyAttendanceLeaveAdjustments([day('08:50:00')], [leave({ startTime: '09:00', endTime: '09:30' })])[0].isLate, true);
assert.equal(applyAttendanceLeaveAdjustments([day('08:50:00')], [leave({ status: 'PENDING' })])[0].relatedLeaveRequests.length, 0);
```

Also assert:
- Full-day leave suppresses late and incomplete.
- Half-morning leave suppresses missing check-in only.
- Half-afternoon leave does not suppress morning late.

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
jiti tests/attendance-leave-adjustments.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement `src/lib/attendance/leave-adjustments.ts`**

Required exports:

```ts
export interface AttendanceLeaveRecord {
    id: number;
    leaveType: string;
    status: string;
    startDate: string;
    endDate: string;
    isHourly: boolean;
    timeSlot: 'FULL_DAY' | 'HALF_MORNING' | 'HALF_AFTERNOON' | 'HOURLY';
    startTime: string | null;
    endTime: string | null;
    createdAt?: string | Date | null;
}

export function applyAttendanceLeaveAdjustments(
    days: AttendanceDaySummary[],
    leaves: AttendanceLeaveRecord[]
): AttendanceDaySummary[];

export function listLeaveDates(leaves: AttendanceLeaveRecord[]): string[];
```

Rules to encode exactly:
- Ignore leaves where `status !== 'APPROVED'`.
- `FULL_DAY`: set `isLate=false`, `isIncomplete=false`, `missingCheckIn=false`, `missingCheckOut=false`.
- `HALF_MORNING`: set `isLate=false`, `missingCheckIn=false`; keep `missingCheckOut` as-is.
- `HALF_AFTERNOON`: set `missingCheckOut=false`; keep morning late as-is.
- `HOURLY` covering scheduled start: set `effectiveLateAfterTime = max(lateAfterTime, endTime)`, then recalculate `isLate` from `checkIn > effectiveLateAfterTime`.
- Never add extra grace after leave end.
- Add all related approved leaves to `relatedLeaveRequests`.
- Set `leaveAdjustment` only for the leave that actually changes final status.

- [ ] **Step 4: Add package script entry, run tests, and commit**

Insert `jiti tests/attendance-leave-adjustments.test.mjs` into `npm test` after `attendance-display.test.mjs`.

Run:

```bash
jiti tests/attendance-leave-adjustments.test.mjs
npm test
git add package.json src/lib/attendance/leave-adjustments.ts tests/attendance-leave-adjustments.test.mjs
git commit -m "Apply approved leave to attendance status"
```

Expected: focused and full tests pass before commit.

---

### Task 4: Employee Attendance Repository Integration

**Files:**
- Modify: `src/lib/attendance/repository.ts`
- Modify: `tests/attendance-summary.test.mjs`

- [ ] **Step 1: Add included-date regression test**

In `tests/attendance-summary.test.mjs`, add a no-scan included-date case and assert `scanCount=0`, `missingCheckIn=true`, and `missingCheckOut=true`.

- [ ] **Step 2: Add approved leave query helper**

In `src/lib/attendance/repository.ts`, import:

```ts
import {
    applyAttendanceLeaveAdjustments,
    listLeaveDates,
    type AttendanceLeaveRecord,
} from './leave-adjustments';
```

Add `mapAttendanceLeaveRecord(row)` and `listApprovedAttendanceLeavesForEmployee(employeeId, fromDate, toDate)` using this SQL condition:

```sql
WHERE u.employeeId = @employeeId
  AND lr.status = 'APPROVED'
  AND CAST(lr.startDatetime AS date) <= CAST(@toDate AS date)
  AND CAST(lr.endDatetime AS date) >= CAST(@fromDate AS date)
```

- [ ] **Step 3: Apply leave adjustments**

Inside `getEmployeeAttendanceSummaryWithContext`, after loading HIP rows:

```ts
const leaves = await listApprovedAttendanceLeavesForEmployee(employeeId, fromDate, toDate);
const includedDates = listLeaveDates(leaves);
const days = applyAttendanceLeaveAdjustments(
    summarizeDailyAttendanceRows(result.recordset, { settings, workingSaturdays, includedDates }),
    leaves
);
```

Keep `checkInFrom` filtering after adjustments.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
jiti tests/attendance-summary.test.mjs
jiti tests/attendance-leave-adjustments.test.mjs
npm test
npm run lint
git add src/lib/attendance/repository.ts tests/attendance-summary.test.mjs
git commit -m "Include approved leave in employee attendance summaries"
```

Expected: tests pass; lint has no new errors.

---

### Task 5: Protected Leave Detail Endpoint

This task intentionally reuses existing permission behavior. Do not create a new database table, persisted leave number column, or separate attachment permission model.

**Files:**
- Create: `src/app/api/leave/detail/[leaveId]/route.ts`
- Create: `tests/leave-detail-route.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write route guard test**

Create `tests/leave-detail-route.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/app/api/leave/detail/[leaveId]/route.ts', 'utf8');

assert.match(source, /auth\(\)/);
assert.match(source, /canViewLeaveDetail/);
assert.match(source, /getDelegatingManagers/);
assert.match(source, /normalizeMedicalCertificateFileRecord/);
assert.match(source, /Permission denied/);

console.log('leave detail route tests passed');
```

- [ ] **Step 2: Implement route**

Create `src/app/api/leave/detail/[leaveId]/route.ts` that:
- Calls `auth()`.
- Validates positive integer `leaveId`.
- Loads leave, employee, manager, approver, medical file, and dates from `LeaveRequests`.
- Calls `getDelegatingManagers(Number(session.user.id))`.
- Calls `canViewLeaveDetail`.
- Returns `403` with `Permission denied` when unauthorized.
- Returns `{ success: true, data }` with `leaveRequestNo: formatLeaveRequestNo({ id, createdAt })`.
- Normalizes attachments with `normalizeMedicalCertificateFileRecord`.

- [ ] **Step 3: Add package script entry, run tests, and commit**

Insert `node tests/leave-detail-route.test.mjs` into `npm test` after `tests/leave-access.test.mjs`.

Run:

```bash
node tests/leave-detail-route.test.mjs
npm test
git add package.json src/app/api/leave/detail/[leaveId]/route.ts tests/leave-detail-route.test.mjs
git commit -m "Add protected leave detail endpoint"
```

Expected: route source guard and full tests pass.

---

### Task 6: Employee Attendance UI Leave Chips

**Files:**
- Modify: `src/app/(dashboard)/attendance/page.tsx`
- Modify: `src/lib/attendance/display.ts`
- Modify: `tests/attendance-display.test.mjs`

- [ ] **Step 1: Add display test for adjusted label**

In `tests/attendance-display.test.mjs`, add an adjusted row test expecting `statusLabel: 'ไม่คิดสายจากใบลา'`.

- [ ] **Step 2: Update display helper**

In `src/lib/attendance/display.ts`, return:

```ts
const statusLabel = day.isLate
    ? 'สาย'
    : day.adjustedByApprovedLeave
        ? 'ไม่คิดสายจากใบลา'
        : null;
```

- [ ] **Step 3: Update employee attendance page**

In `src/app/(dashboard)/attendance/page.tsx`:
- Add `success` tone for `ไม่คิดสายจากใบลา`.
- Add state for `selectedLeaveDetail`, `isLeaveDetailLoading`, and `leaveDetailError`.
- Add `openLeaveDetail(leaveId)` that fetches `/api/leave/detail/${leaveId}`.
- Render leave chips from `day.relatedLeaveRequests`.
- Open a centered modal with leave request number, type, date/time, reason, approver, status, approved time, and attachment link.
- Make only the chip clickable, not the whole attendance row.

Use this chip label rule:

```tsx
{leave.leaveRequestNo}
{leave.isStatusAdjusting ? <span>ใช้ปรับสถานะ</span> : null}
```

- [ ] **Step 4: Run tests/lint and commit**

Run:

```bash
jiti tests/attendance-display.test.mjs
npm test
npm run lint
git add src/lib/attendance/display.ts src/app/(dashboard)/attendance/page.tsx tests/attendance-display.test.mjs
git commit -m "Show approved leave links on employee attendance"
```

Expected: tests pass and lint has no new errors.

---

### Task 7: HR Attendance Report API And CSV

**Files:**
- Create: `src/lib/attendance/hr-report.ts`
- Create: `src/app/api/hr/reports/attendance/route.ts`
- Create: `tests/attendance-hr-report.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing helper tests**

Create `tests/attendance-hr-report.test.mjs` with:
- `filterHrAttendanceRows(rows, 'ADJUSTED_BY_LEAVE')` returns only adjusted rows.
- `filterHrAttendanceRows(rows, 'LATE')` returns only final `สาย` rows.
- `formatHrAttendanceCsv(rows)` starts with `\uFEFF`.
- CSV contains `leaveRequestNo`, `LR-2026-000123`, and `ไม่คิดสายจากใบลา`.

- [ ] **Step 2: Implement `src/lib/attendance/hr-report.ts`**

Required exports:

```ts
export type HrAttendanceStatusFilter = 'ALL' | 'LATE' | 'ADJUSTED_BY_LEAVE' | 'INCOMPLETE' | 'NO_HIP_DATA';
export interface HrAttendanceReportRow { /* all CSV/report fields from spec */ }
export function filterHrAttendanceRows(rows: HrAttendanceReportRow[], status: HrAttendanceStatusFilter): HrAttendanceReportRow[];
export function formatHrAttendanceCsv(rows: HrAttendanceReportRow[]): string;
export async function getHrAttendanceReport(input: HrAttendanceReportInput): Promise<HrAttendanceReportRow[]>;
```

`getHrAttendanceReport` must:
- Query active users filtered by company, department, and employee search.
- Query `AttendanceLogs` for selected employee IDs in the range.
- Query approved `LeaveRequests` for selected user IDs overlapping the range.
- Build included work dates for the period.
- Summarize attendance per employee, apply leave adjustments, and map rows.

Use final status mapping:

```ts
if (day.adjustedByApprovedLeave && !day.isLate && !day.isIncomplete) return 'ไม่คิดสายจากใบลา';
if (day.scanCount === 0 && !day.adjustedByApprovedLeave) return 'ไม่พบข้อมูล HIP';
if (day.isLate) return 'สาย';
if (day.isIncomplete) return 'ข้อมูลไม่ครบ';
return 'ปกติ';
```

- [ ] **Step 3: Implement HR attendance route**

Create `src/app/api/hr/reports/attendance/route.ts` that:
- Allows HR, ADMIN, and `isHRStaff`.
- Accepts `period`, `from`, `to`, `company`, `department`, `employee`, `status`, and `format`.
- Uses `getAttendanceScheduleSettings()` and `getAttendancePeriodRange()`.
- Returns JSON `{ success, period, rows, summary }`.
- Returns CSV with filename `attendance_report_${periodMonth}.csv` when `format=csv`.

- [ ] **Step 4: Add package script entry, run tests, and commit**

Insert `jiti tests/attendance-hr-report.test.mjs` after `tests/attendance-leave-adjustments.test.mjs`.

Run:

```bash
jiti tests/attendance-hr-report.test.mjs
npm test
npm run lint
git add package.json src/lib/attendance/hr-report.ts src/app/api/hr/reports/attendance/route.ts tests/attendance-hr-report.test.mjs
git commit -m "Add HR attendance report export API"
```

Expected: focused tests, full tests, and lint pass.

---

### Task 8: HR Reports UI Attendance Tab

**Files:**
- Modify: `src/app/(dashboard)/hr/reports/page.tsx`

- [ ] **Step 1: Add tab state and attendance types**

Add `ReportTab = 'LEAVE' | 'ATTENDANCE'`, `AttendanceStatusFilter`, `AttendanceReportRow`, and `AttendanceReportSummary` client-side types. Add state for `activeTab`, `attendanceRows`, `attendanceSummary`, `attendanceStatus`, and `attendanceLoading`.

- [ ] **Step 2: Add fetch and export functions**

Add:

```ts
const period = `${year}-${String(month).padStart(2, '0')}`;
const fetchAttendanceReport = async () => { /* fetch /api/hr/reports/attendance */ };
const exportAttendanceCSV = () => { window.location.href = `/api/hr/reports/attendance?period=${period}&status=${attendanceStatus}&format=csv`; };
```

The fetch function must pass `period` and `status`, set rows/summary on `data.success`, and clear loading in `finally`.

- [ ] **Step 3: Add UI**

Add tabs:
- `รายงานการลา`
- `เวลาเข้า-ออก`

For the attendance tab, add:
- Status filter: `ทั้งหมด`, `สาย`, `ไม่คิดสายจากใบลา`, `ข้อมูลไม่ครบ`, `ไม่พบข้อมูล HIP`.
- `โหลดรายงานเวลาเข้า-ออก` button.
- `Export CSV` button.
- Summary metrics for late, adjusted by leave, incomplete, and no HIP data.
- Dense table with date, employee, department, raw check-in/out, threshold, final status, and clickable leave request number.

Clicking a leave number should reuse `/api/leave/detail/${leaveRequestId}` and show the same modal shape as the employee page.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run lint
npm run build
git add src/app/(dashboard)/hr/reports/page.tsx
git commit -m "Add attendance tab to HR reports"
```

Expected: lint/build pass or only pre-existing warnings remain.

---

### Task 9: Documentation And Final Verification

**Files:**
- Modify: `DEVELOPER_HANDOFF.md`

- [ ] **Step 1: Update handoff**

Add under attendance business rules:

```markdown
### Attendance Leave Adjustment

- Attendance status is calculated in two layers: raw HIP/schedule status and final status after approved leave adjustment.
- Only `LeaveRequests.status = APPROVED` can affect attendance status.
- All leave types can affect attendance status when the approved leave date/time range covers the relevant attendance window.
- Hourly leave that covers the scheduled start can extend the effective late threshold to `max(originalLateAfterTime, leaveEndTime)`.
- There is no extra grace after hourly leave ends.
- Full-day approved leave suppresses late and incomplete status for that day.
- Half-morning leave can suppress late/missing check-in. Half-afternoon leave does not suppress morning late status.
- Employee `/attendance` and HR `/hr/reports` show raw scan times and clickable leave request references for audit.
- Leave detail and medical certificate links must use protected APIs and the existing manager/delegate/HR permission model.
```

- [ ] **Step 2: Full verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: tests and build pass; lint has no new errors.

- [ ] **Step 3: Manual smoke test**

Run:

```bash
npm run dev
```

Verify:
- Employee `/attendance` loads.
- Adjusted rows show `ไม่คิดสายจากใบลา` and a leave chip.
- Clicking leave chip opens detail without leaving the page.
- Attachment links only work for permitted viewers.
- HR `/hr/reports` shows `เวลาเข้า-ออก` tab.
- HR attendance export downloads CSV with Thai text and `leaveRequestNo`.

Stop dev server after smoke test.

- [ ] **Step 4: Commit documentation**

Run:

```bash
git add DEVELOPER_HANDOFF.md
git commit -m "Document attendance leave adjustment rules"
```

---

## Self-Review Checklist

Spec coverage:
- Approved leave adjustment is implemented in Tasks 2-4.
- All leave types and no-extra-grace policy are covered in Task 3 tests.
- Raw versus final status is covered in Tasks 2, 3, and 7.
- Clickable leave references and protected detail access are covered in Tasks 5 and 6.
- HR report and CSV export are covered in Tasks 7 and 8.
- Handoff documentation is covered in Task 9.

Placeholder scan:
- Placeholder scan passed; task instructions are concrete and include commands, files, and expected outcomes.
- Each task names files, commands, and expected outcomes.

Type consistency:
- `leaveRequestNo`, `leaveAdjustment`, `relatedLeaveRequests`, `rawIsLate`, `rawIsIncomplete`, and `effectiveLateAfterTime` are introduced in Task 2/3 and reused consistently in later tasks.
- Status filter values are consistent between API and UI: `ALL`, `LATE`, `ADJUSTED_BY_LEAVE`, `INCOMPLETE`, `NO_HIP_DATA`.

