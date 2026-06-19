# Attendance Employee UX Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build schedule-aware employee attendance summaries that highlight late and incomplete days using the existing work schedule and working Saturday configuration.

**Architecture:** Add a pure attendance schedule helper for period ranges, workday classification, single-scan inference, late checks, and incomplete flags. Keep database access in `src/lib/attendance/repository.ts`, return derived fields from `/api/attendance/me`, and render summary/filter/status UI in `src/app/(dashboard)/attendance/page.tsx`. Extend the existing HR work schedule setting page and route instead of adding business rules to the attendance device screen.

**Tech Stack:** Next.js App Router, React client components, TypeScript, MSSQL through `mssql`, Node assertion tests with `node --experimental-strip-types` and `jiti`.

---

## File Structure

- Create: `src/lib/attendance/schedule-rules.ts` - pure period/time/classification/summary rules.
- Modify: `src/lib/attendance/repository.ts` - load settings and working Saturdays, call the pure helper.
- Modify: `src/app/api/attendance/me/route.ts` - support `period=YYYY-MM`, return `days`, `settings`, and `period`.
- Modify: `src/app/(dashboard)/attendance/page.tsx` - summary strip, quick filters, status badges, period helper text.
- Modify: `src/app/api/hr/work-schedule/route.ts` - read/write grace minutes and attendance period start day.
- Modify: `src/app/(dashboard)/hr/work-schedule/page.tsx` - controls for normal grace minutes and period start day.
- Modify: `tests/attendance-summary.test.mjs`, create `tests/attendance-schedule-rules.test.mjs`, modify `package.json`.
- Modify: `DEVELOPER_HANDOFF.md`.

---

### Task 1: Pure Attendance Schedule Rules

**Files:**
- Create: `src/lib/attendance/schedule-rules.ts`
- Modify: `src/lib/attendance/repository.ts`
- Modify: `tests/attendance-summary.test.mjs`
- Create: `tests/attendance-schedule-rules.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Replace `tests/attendance-summary.test.mjs` with an expanded-shape regression**

```js
import assert from 'node:assert/strict';
import { summarizeDailyAttendanceRows } from '../src/lib/attendance/repository.ts';

const context = {
  settings: {
    workStartTime: '08:30', workEndTime: '17:00', breakStartTime: '12:00', breakEndTime: '13:00',
    satWorkStartTime: '09:00', satWorkEndTime: '12:00', weekdayGraceMinutes: 15, periodStartDay: 21,
  },
  workingSaturdays: [],
};

assert.deepEqual(
  summarizeDailyAttendanceRows([
    { attendanceDate: '2026-06-18', recordTime: '15:53:54' },
    { attendanceDate: '2026-06-18', recordTime: '08:31:12' },
  ], context),
  [{ date: '2026-06-18', checkIn: '08:31', checkOut: '15:53', scanCount: 2, dayType: 'NORMAL_WORKDAY', scheduledStartTime: '08:30', lateAfterTime: '08:45', isLate: false, isIncomplete: false, missingCheckIn: false, missingCheckOut: false }]
);

assert.deepEqual(
  summarizeDailyAttendanceRows([{ attendanceDate: '2026-06-19', recordTime: '08:46:01' }], context),
  [{ date: '2026-06-19', checkIn: '08:46', checkOut: null, scanCount: 1, dayType: 'NORMAL_WORKDAY', scheduledStartTime: '08:30', lateAfterTime: '08:45', isLate: true, isIncomplete: true, missingCheckIn: false, missingCheckOut: true }]
);

assert.deepEqual(summarizeDailyAttendanceRows([], context), []);
console.log('attendance summary tests passed');
```

- [ ] **Step 2: Create `tests/attendance-schedule-rules.test.mjs`**

```js
import assert from 'node:assert/strict';
import { getAttendancePeriodRange, summarizeDailyAttendanceRowsWithSchedule } from '../src/lib/attendance/schedule-rules.ts';

const settings = {
  workStartTime: '08:30', workEndTime: '17:00', breakStartTime: '12:00', breakEndTime: '13:00',
  satWorkStartTime: '09:00', satWorkEndTime: '12:00', weekdayGraceMinutes: 15, periodStartDay: 21,
};

assert.deepEqual(getAttendancePeriodRange('2026-06', 21), { from: '2026-05-21', to: '2026-06-20' });
assert.deepEqual(getAttendancePeriodRange('2026-01', 21), { from: '2025-12-21', to: '2026-01-20' });
assert.equal(summarizeDailyAttendanceRowsWithSchedule([{ attendanceDate: '2026-06-18', recordTime: '08:45:00' }], { settings, workingSaturdays: [] })[0].isLate, false);
assert.equal(summarizeDailyAttendanceRowsWithSchedule([{ attendanceDate: '2026-06-18', recordTime: '08:46:00' }], { settings, workingSaturdays: [] })[0].isLate, true);

const saturdayContext = { settings, workingSaturdays: [{ date: '2026-06-20', startTime: '09:00', endTime: '12:00', workHours: 3 }] };
assert.equal(summarizeDailyAttendanceRowsWithSchedule([{ attendanceDate: '2026-06-20', recordTime: '09:00:00' }], saturdayContext)[0].isLate, false);
assert.equal(summarizeDailyAttendanceRowsWithSchedule([{ attendanceDate: '2026-06-20', recordTime: '09:01:00' }], saturdayContext)[0].isLate, true);
assert.equal(summarizeDailyAttendanceRowsWithSchedule([{ attendanceDate: '2026-06-27', recordTime: '09:30:00' }], { settings, workingSaturdays: [] })[0].dayType, 'NON_WORKDAY');
assert.equal(summarizeDailyAttendanceRowsWithSchedule([{ attendanceDate: '2026-06-27', recordTime: '09:30:00' }], { settings, workingSaturdays: [] })[0].isIncomplete, false);
assert.equal(summarizeDailyAttendanceRowsWithSchedule([{ attendanceDate: '2026-06-04', recordTime: '18:35:00' }], { settings, workingSaturdays: [] })[0].checkOut, '18:35');
console.log('attendance schedule rule tests passed');
```

- [ ] **Step 3: Add the new test to `package.json`**

Add `node --experimental-strip-types tests/attendance-schedule-rules.test.mjs` immediately after `tests/attendance-summary.test.mjs` in the existing `test` script.

- [ ] **Step 4: Run the failing tests**

```powershell
node --experimental-strip-types tests/attendance-summary.test.mjs
node --experimental-strip-types tests/attendance-schedule-rules.test.mjs
```

Expected: first command fails because expanded fields are missing; second command fails because `schedule-rules.ts` does not exist.

- [ ] **Step 5: Create `src/lib/attendance/schedule-rules.ts`**

Implement these exported APIs exactly:

```ts
export type AttendanceDayType = 'NORMAL_WORKDAY' | 'WORKING_SATURDAY' | 'NON_WORKDAY';

export interface AttendanceScheduleSettings {
  workStartTime: string;
  workEndTime: string;
  breakStartTime: string;
  breakEndTime: string;
  satWorkStartTime: string;
  satWorkEndTime: string;
  weekdayGraceMinutes: number;
  periodStartDay: number;
}

export interface WorkingSaturdaySchedule { date: string; startTime: string; endTime: string; workHours: number; }
export interface DailyAttendanceRow { attendanceDate: string; recordTime: string; }
export interface AttendanceDaySummary {
  date: string; checkIn: string | null; checkOut: string | null; scanCount: number;
  dayType: AttendanceDayType; scheduledStartTime: string | null; lateAfterTime: string | null;
  isLate: boolean; isIncomplete: boolean; missingCheckIn: boolean; missingCheckOut: boolean;
}
export interface AttendanceSummaryContext { settings: AttendanceScheduleSettings; workingSaturdays: WorkingSaturdaySchedule[]; }

export const DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS: AttendanceScheduleSettings = {
  workStartTime: '08:30', workEndTime: '17:00', breakStartTime: '12:00', breakEndTime: '13:00',
  satWorkStartTime: '09:00', satWorkEndTime: '12:00', weekdayGraceMinutes: 15, periodStartDay: 21,
};
```

Implementation requirements:
- `getAttendancePeriodRange('2026-06', 21)` returns `{ from: '2026-05-21', to: '2026-06-20' }`.
- If `periodStartDay` is `1`, the range is calendar month start through calendar month end.
- `summarizeDailyAttendanceRowsWithSchedule(rows, context)` groups rows by date, sorts times ascending, and returns `AttendanceDaySummary[]`.
- Monday-Friday is `NORMAL_WORKDAY`.
- Saturday with `WorkingSaturdaySchedule` row is `WORKING_SATURDAY`.
- Saturday without a row and Sunday are `NON_WORKDAY`.
- Multiple scans use first as `checkIn` and last as `checkOut`.
- One normal-workday scan uses `breakStartTime` as cutoff.
- One working-Saturday scan uses midpoint between that Saturday `startTime` and `endTime` as cutoff.
- One non-workday scan uses `breakStartTime` for display inference only.
- Normal late threshold is `workStartTime + weekdayGraceMinutes`.
- Saturday late threshold is the working Saturday `startTime`, with no grace.
- Non-workday rows never set `isLate` or `isIncomplete`.

- [ ] **Step 6: Re-export helper types in `repository.ts`**

At the top of `src/lib/attendance/repository.ts`, add:

```ts
import {
  DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS,
  summarizeDailyAttendanceRowsWithSchedule,
  type AttendanceDaySummary,
  type AttendanceScheduleSettings,
  type AttendanceSummaryContext,
  type DailyAttendanceRow,
  type WorkingSaturdaySchedule,
} from './schedule-rules';
```

Remove the old local `AttendanceDaySummary` and `DailyAttendanceRow` interfaces, then add:

```ts
export type { AttendanceDaySummary, AttendanceScheduleSettings, AttendanceSummaryContext, DailyAttendanceRow, WorkingSaturdaySchedule } from './schedule-rules';
```

Replace `summarizeDailyAttendanceRows` with:

```ts
export function summarizeDailyAttendanceRows(
  rows: DailyAttendanceRow[],
  context: AttendanceSummaryContext = { settings: DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS, workingSaturdays: [] }
): AttendanceDaySummary[] {
  return summarizeDailyAttendanceRowsWithSchedule(rows, context);
}
```

- [ ] **Step 7: Run focused tests and commit Task 1**

```powershell
node --experimental-strip-types tests/attendance-summary.test.mjs
node --experimental-strip-types tests/attendance-schedule-rules.test.mjs
git add src/lib/attendance/schedule-rules.ts src/lib/attendance/repository.ts tests/attendance-summary.test.mjs tests/attendance-schedule-rules.test.mjs package.json
git commit -m "Add schedule-aware attendance summary rules"
```

Expected: both tests pass before the commit.

---

### Task 2: Repository and Attendance API Context

**Files:**
- Modify: `src/lib/attendance/repository.ts`
- Modify: `src/app/api/attendance/me/route.ts`

- [ ] **Step 1: Add SQL loaders in `repository.ts`**

Add these exports near `getEmployeeAttendanceSummary`:

```ts
const ATTENDANCE_SETTING_KEYS = [
  'WORK_START_TIME', 'WORK_END_TIME', 'BREAK_START_TIME', 'BREAK_END_TIME',
  'SAT_WORK_START_TIME', 'SAT_WORK_END_TIME', 'WORKDAY_LATE_GRACE_MINUTES', 'ATTENDANCE_PERIOD_START_DAY',
];

export async function getAttendanceScheduleSettings(): Promise<AttendanceScheduleSettings> {
  const { getPool } = await loadDb();
  const pool = await getPool();
  const result = await pool.request().query<{ settingKey: string; settingValue: string }>(`
    SELECT settingKey, settingValue FROM SystemSettings
    WHERE settingKey IN (${ATTENDANCE_SETTING_KEYS.map((key) => `'${key}'`).join(', ')})
  `);
  const settings = new Map(result.recordset.map((row) => [row.settingKey, row.settingValue]));
  return {
    workStartTime: normalizeTimeSetting(settings.get('WORK_START_TIME'), DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS.workStartTime),
    workEndTime: normalizeTimeSetting(settings.get('WORK_END_TIME'), DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS.workEndTime),
    breakStartTime: normalizeTimeSetting(settings.get('BREAK_START_TIME'), DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS.breakStartTime),
    breakEndTime: normalizeTimeSetting(settings.get('BREAK_END_TIME'), DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS.breakEndTime),
    satWorkStartTime: normalizeTimeSetting(settings.get('SAT_WORK_START_TIME'), DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS.satWorkStartTime),
    satWorkEndTime: normalizeTimeSetting(settings.get('SAT_WORK_END_TIME'), DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS.satWorkEndTime),
    weekdayGraceMinutes: normalizeIntegerSetting(settings.get('WORKDAY_LATE_GRACE_MINUTES'), 0, 240, DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS.weekdayGraceMinutes),
    periodStartDay: normalizeIntegerSetting(settings.get('ATTENDANCE_PERIOD_START_DAY'), 1, 28, DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS.periodStartDay),
  };
}

export async function listWorkingSaturdaysForRange(fromDate: string, toDate: string): Promise<WorkingSaturdaySchedule[]> {
  const { getPool } = await loadDb();
  const pool = await getPool();
  const result = await pool.request()
    .input('fromDate', fromDate)
    .input('toDate', toDate)
    .query<WorkingSaturdaySchedule>(`
      SELECT CONVERT(char(10), CAST(date AS date), 23) AS date,
             CONVERT(char(5), CAST(startTime AS time), 108) AS startTime,
             CONVERT(char(5), CAST(endTime AS time), 108) AS endTime,
             workHours
      FROM WorkingSaturdays
      WHERE date >= CAST(@fromDate AS date) AND date <= CAST(@toDate AS date)
      ORDER BY date ASC
    `);
  return result.recordset;
}
```

Also add:

```ts
function normalizeTimeSetting(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value.slice(0, 5)) ? value.slice(0, 5) : fallback;
}

function normalizeIntegerSetting(value: string | null | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
```

- [ ] **Step 2: Extract context-aware summary query**

Create an internal helper:

```ts
interface EmployeeAttendanceSummaryWithContextInput extends EmployeeAttendanceSummaryInput {
  settings: AttendanceScheduleSettings;
  workingSaturdays: WorkingSaturdaySchedule[];
}

async function getEmployeeAttendanceSummaryWithContext(input: EmployeeAttendanceSummaryWithContextInput): Promise<AttendanceDaySummary[]> {
  const { employeeId, fromDate, toDate, checkInFrom, settings, workingSaturdays } = input;
  const { getPool } = await loadDb();
  const pool = await getPool();
  const result = await pool.request()
    .input('employeeId', employeeId)
    .input('fromDate', fromDate)
    .input('toDate', toDate)
    .query<DailyAttendanceRow>(`
      SELECT CONVERT(char(10), CAST(recordTime AS date), 23) AS attendanceDate,
             CONVERT(char(8), CAST(recordTime AS time), 108) AS recordTime
      FROM AttendanceLogs
      WHERE employeeId = @employeeId
        AND recordTime >= CAST(@fromDate AS date)
        AND recordTime < DATEADD(day, 1, CAST(@toDate AS date))
      ORDER BY attendanceDate ASC, recordTime ASC
    `);
  const days = summarizeDailyAttendanceRows(result.recordset, { settings, workingSaturdays });
  return checkInFrom ? days.filter((day) => day.checkIn != null && day.checkIn >= checkInFrom) : days;
}
```

Replace public `getEmployeeAttendanceSummary` with a wrapper that loads settings and Saturdays, then calls this helper.

- [ ] **Step 3: Add `getEmployeeAttendanceReport`**

```ts
export interface EmployeeAttendanceReportInput extends EmployeeAttendanceSummaryInput { periodMonth?: string; }
export interface EmployeeAttendanceReport {
  days: AttendanceDaySummary[];
  settings: AttendanceScheduleSettings;
  period: { month: string; from: string; to: string };
}

export async function getEmployeeAttendanceReport(input: EmployeeAttendanceReportInput): Promise<EmployeeAttendanceReport> {
  const [settings, workingSaturdays] = await Promise.all([
    getAttendanceScheduleSettings(),
    listWorkingSaturdaysForRange(input.fromDate, input.toDate),
  ]);
  const days = await getEmployeeAttendanceSummaryWithContext({ ...input, settings, workingSaturdays });
  return { days, settings, period: { month: input.periodMonth ?? input.fromDate.slice(0, 7), from: input.fromDate, to: input.toDate } };
}
```

- [ ] **Step 4: Update `/api/attendance/me`**

Use these imports:

```ts
import { getAttendancePeriodRange } from '@/lib/attendance/schedule-rules';
import { getAttendanceScheduleSettings, getEmployeeAttendanceReport } from '@/lib/attendance/repository';
```

Add `const PERIOD_PATTERN = /^\d{4}-\d{2}$/;` and helper functions:

```ts
function getCurrentPeriodMonth(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function isValidPeriod(value: string): boolean {
  if (!PERIOD_PATTERN.test(value)) return false;
  const [year, month] = value.split('-').map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}
```

Inside `GET`, load settings before defaults:

```ts
const searchParams = request.nextUrl.searchParams;
const settings = await getAttendanceScheduleSettings();
const periodMonth = searchParams.get('period') || getCurrentPeriodMonth();
if (!isValidPeriod(periodMonth)) return NextResponse.json({ error: 'Invalid period format' }, { status: 400 });
const periodRange = getAttendancePeriodRange(periodMonth, settings.periodStartDay);
const from = searchParams.get('from') || periodRange.from;
const to = searchParams.get('to') || periodRange.to;
const checkInFrom = searchParams.get('checkInFrom') || undefined;
```

After validation, return:

```ts
const report = await getEmployeeAttendanceReport({ employeeId, fromDate: from, toDate: to, checkInFrom, periodMonth });
return NextResponse.json({ success: true, ...report });
```

- [ ] **Step 5: Verify and commit Task 2**

```powershell
node --experimental-strip-types tests/attendance-summary.test.mjs
node --experimental-strip-types tests/attendance-schedule-rules.test.mjs
npx tsc --noEmit --pretty false
git add src/lib/attendance/repository.ts src/app/api/attendance/me/route.ts
git commit -m "Use work schedule context for attendance API"
```

Expected: tests pass and TypeScript exits with code 0.

---

### Task 3: HR Work Schedule Settings

**Files:**
- Modify: `src/app/api/hr/work-schedule/route.ts`
- Modify: `src/app/(dashboard)/hr/work-schedule/page.tsx`

- [ ] **Step 1: Extend the work-schedule API GET**

Add these keys to the SQL `IN` list:

```sql
'WORKDAY_LATE_GRACE_MINUTES', 'ATTENDANCE_PERIOD_START_DAY'
```

Add returned settings:

```ts
weekdayGraceMinutes: parseInt(settings['WORKDAY_LATE_GRACE_MINUTES'] || '15', 10),
attendancePeriodStartDay: parseInt(settings['ATTENDANCE_PERIOD_START_DAY'] || '21', 10),
```

- [ ] **Step 2: Extend the work-schedule API PUT**

Add `weekdayGraceMinutes` and `attendancePeriodStartDay` to the request body destructuring. After hour calculation, add:

```ts
const normalizedWeekdayGraceMinutes = Number.parseInt(String(weekdayGraceMinutes ?? '15'), 10);
const normalizedAttendancePeriodStartDay = Number.parseInt(String(attendancePeriodStartDay ?? '21'), 10);

if (!Number.isInteger(normalizedWeekdayGraceMinutes) || normalizedWeekdayGraceMinutes < 0 || normalizedWeekdayGraceMinutes > 240) {
  return NextResponse.json({ error: 'นาทีอนุโลมสายต้องอยู่ระหว่าง 0-240 นาที' }, { status: 400 });
}
if (!Number.isInteger(normalizedAttendancePeriodStartDay) || normalizedAttendancePeriodStartDay < 1 || normalizedAttendancePeriodStartDay > 28) {
  return NextResponse.json({ error: 'วันที่เริ่มรอบคำนวณต้องอยู่ระหว่าง 1-28' }, { status: 400 });
}
```

Add these entries to the `settings` array:

```ts
{ key: 'WORKDAY_LATE_GRACE_MINUTES', value: normalizedWeekdayGraceMinutes.toString() },
{ key: 'ATTENDANCE_PERIOD_START_DAY', value: normalizedAttendancePeriodStartDay.toString() },
```

- [ ] **Step 3: Extend the work-schedule page state and controls**

Add to `interface WorkSchedule` and the initial state:

```ts
weekdayGraceMinutes: number;
attendancePeriodStartDay: number;
```

Defaults:

```ts
weekdayGraceMinutes: 15,
attendancePeriodStartDay: 21,
```

Inside the normal work schedule card after the work-hours info, add:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div>
    <label className="block text-sm font-medium text-gray-600 mb-1">นาทีอนุโลมสายวันทำงานปกติ</label>
    <input type="number" min="0" max="240" value={schedule.weekdayGraceMinutes}
      onChange={(event) => setSchedule(prev => ({ ...prev, weekdayGraceMinutes: Number.parseInt(event.target.value || '0', 10) }))}
      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
  </div>
  <div>
    <label className="block text-sm font-medium text-gray-600 mb-1">วันที่เริ่มรอบคำนวณเวลาเข้า-ออก</label>
    <input type="number" min="1" max="28" value={schedule.attendancePeriodStartDay}
      onChange={(event) => setSchedule(prev => ({ ...prev, attendancePeriodStartDay: Number.parseInt(event.target.value || '21', 10) }))}
      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
  </div>
</div>
<p className="text-xs text-gray-500">วันเสาร์ทำงานไม่มีนาทีอนุโลมสาย ระบบใช้เวลาเริ่มงานของวันเสาร์นั้นโดยตรง</p>
```

- [ ] **Step 4: Verify and commit Task 3**

```powershell
npx eslint "src/app/api/hr/work-schedule/route.ts" "src/app/(dashboard)/hr/work-schedule/page.tsx"
npx tsc --noEmit --pretty false
git add src/app/api/hr/work-schedule/route.ts src/app/\(dashboard\)/hr/work-schedule/page.tsx
git commit -m "Add attendance timing settings to work schedule"
```

Expected: eslint reports no errors and TypeScript exits with code 0.

---

### Task 4: Employee Attendance UI

**Files:**
- Modify: `src/app/(dashboard)/attendance/page.tsx`

- [ ] **Step 1: Add page types and helpers**

Add:

```ts
type QuickFilter = 'ALL' | 'LATE' | 'INCOMPLETE';
interface AttendanceApiSettings { workStartTime: string; breakStartTime: string; weekdayGraceMinutes: number; periodStartDay: number; }
interface AttendanceApiPeriod { month: string; from: string; to: string; }

function formatThaiDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function addMinutes(value: string, minutes: number): string {
  const [hours, mins] = value.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  const normalized = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Replace calendar-month state with period state**

Use:

```ts
const [periodMonth, setPeriodMonth] = useState(initialMonth);
const [checkInFrom, setCheckInFrom] = useState('');
const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
const [days, setDays] = useState<AttendanceDaySummary[]>([]);
const [settings, setSettings] = useState<AttendanceApiSettings | null>(null);
const [period, setPeriod] = useState<AttendanceApiPeriod | null>(null);
```

Fetch with `period`:

```ts
const params = new URLSearchParams();
if (periodMonth) params.set('period', periodMonth);
if (checkInFrom) params.set('checkInFrom', checkInFrom);
const response = await fetch(`/api/attendance/me?${params.toString()}`);
```

Set response state:

```ts
setDays(data.days ?? []);
setSettings(data.settings ?? null);
setPeriod(data.period ?? null);
```

- [ ] **Step 3: Add derived summary/filter state**

```ts
const summary = useMemo(() => ({
  total: days.length,
  late: days.filter((day) => day.isLate).length,
  incomplete: days.filter((day) => day.isIncomplete).length,
}), [days]);

const filteredDays = useMemo(() => {
  if (quickFilter === 'LATE') return days.filter((day) => day.isLate);
  if (quickFilter === 'INCOMPLETE') return days.filter((day) => day.isIncomplete);
  return days;
}, [days, quickFilter]);

const normalLateAfterTime = settings ? addMinutes(settings.workStartTime, settings.weekdayGraceMinutes) : null;
const emptyMessage = quickFilter === 'LATE' ? 'ไม่พบวันที่เข้าเกินเวลาในรอบนี้' : quickFilter === 'INCOMPLETE' ? 'ไม่พบวันที่ข้อมูลไม่ครบในรอบนี้' : 'ยังไม่พบข้อมูลเวลาเข้า-ออกจาก HIP ในรอบนี้';
```

- [ ] **Step 4: Add status badge helper**

```tsx
function getStatusBadges(day: AttendanceDaySummary): Array<{ label: string; className: string }> {
  const badges: Array<{ label: string; className: string }> = [];
  if (day.isLate) badges.push({ label: 'เข้าเกินเวลา', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' });
  if (day.missingCheckIn) badges.push({ label: 'ไม่พบเวลาเข้า', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' });
  if (day.missingCheckOut) badges.push({ label: 'ไม่พบเวลาออก', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' });
  if (day.dayType === 'WORKING_SATURDAY') badges.push({ label: 'เสาร์ทำงาน', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' });
  if (day.dayType === 'NON_WORKDAY') badges.push({ label: 'นอกวันทำงาน', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' });
  if (badges.length === 0) badges.push({ label: 'ปกติ', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' });
  return badges;
}
```

- [ ] **Step 5: Replace filters, add summary strip, quick filters, and status column**

Required UI changes:
- Label the month input `รอบคำนวณเดือน` and bind it to `periodMonth`.
- Show helper text `รอบ {formatThaiDate(period.from)} - {formatThaiDate(period.to)}` when API returns `period`.
- Keep `เวลาเข้า ตั้งแต่` as an advanced filter.
- Add three compact summary cards: `วันที่มีข้อมูล`, `เข้าเกินเวลา`, `ข้อมูลไม่ครบ`.
- Under `เข้าเกินเวลา`, show `วันปกติหลัง {normalLateAfterTime}` when settings are loaded.
- Add segmented quick filters: `ทั้งหมด`, `เข้าเกินเวลา`, `ข้อมูลไม่ครบ`.
- Use `filteredDays` for table rows and empty state.
- Add a `สถานะ` table column that maps `getStatusBadges(day)` into small badges.

Use this status cell:

```tsx
<td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
  <div className="flex flex-wrap gap-2">
    {getStatusBadges(day).map((badge) => (
      <span key={badge.label} className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${badge.className}`}>
        {badge.label}
      </span>
    ))}
  </div>
</td>
```

- [ ] **Step 6: Verify and commit Task 4**

```powershell
npx eslint "src/app/(dashboard)/attendance/page.tsx"
npx tsc --noEmit --pretty false
git add src/app/\(dashboard\)/attendance/page.tsx
git commit -m "Improve employee attendance status UI"
```

Expected: eslint reports no errors and TypeScript exits with code 0.

---

### Task 5: Documentation and Final Verification

**Files:**
- Modify: `DEVELOPER_HANDOFF.md`

- [ ] **Step 1: Update handoff notes**

Add this note near the HIP attendance section in `DEVELOPER_HANDOFF.md`:

```md
### Attendance UI Schedule Rules

- Employee `/attendance` reads workday timing from HR/Admin -> `ตั้งค่าเวลาทำงาน`.
- Normal workdays use `WORK_START_TIME + WORKDAY_LATE_GRACE_MINUTES` for late highlighting.
- Working Saturdays come from `WorkingSaturdays`; Saturday has no late grace and uses that row's `startTime` directly.
- Non-working Saturdays and Sundays can display HIP scans but are not counted as late or incomplete workday problems.
- Attendance calculation periods use `ATTENDANCE_PERIOD_START_DAY`, default `21`, so the normal monthly period is previous-month day 21 through selected-month day 20.
```

- [ ] **Step 2: Run full verification**

```powershell
npm test
npx tsc --noEmit --pretty false
npx eslint "src/lib/attendance/schedule-rules.ts" "src/lib/attendance/repository.ts" "src/app/api/attendance/me/route.ts" "src/app/api/hr/work-schedule/route.ts" "src/app/(dashboard)/attendance/page.tsx" "src/app/(dashboard)/hr/work-schedule/page.tsx"
git diff --check
```

Expected:
- `npm test` exits with code 0.
- `npx tsc --noEmit --pretty false` exits with code 0.
- `npx eslint ...` exits with code 0.
- `git diff --check` exits with code 0. LF/CRLF warnings from Git on Windows are acceptable when the command still exits with code 0.

- [ ] **Step 3: Commit Task 5**

```powershell
git add DEVELOPER_HANDOFF.md
git commit -m "Document attendance schedule rules"
```

- [ ] **Step 4: Final response**

Report in Thai:
- Summary of changed behavior.
- Verification commands and pass/fail result.
- Remaining limitation: no absent detection until the product has per-employee schedules, leave context, or shift rules.
