# Vacation Probation Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vacation eligibility based on actual probation completion date, including probation extensions, early pass/exemption overrides, full-year vacation entitlement when eligibility falls inside the fiscal year, and carry-over behavior that respects the same eligibility rules.

**Architecture:** Introduce one shared eligibility helper and make request validation, balance creation, year-end preview/execute, and UI all consume the same calculation. Store company-wide defaults in `SystemSettings`, store employee-specific probation facts on `Users`, and use existing `AuditLogs` for traceability instead of adding a separate history table in this first pass.

**Tech Stack:** Next.js 16 App Router, TypeScript, MS SQL Server via `mssql`, Tailwind CSS, Lucide React, Node assertion tests with `node --experimental-strip-types`.

---

## Requirements Locked With Product Owner

- Vacation eligibility date is counted from actual probation completion date, not from employment start date.
- Standard probation is configurable and defaults to 90 days.
- HR can extend probation by entering extra days.
- HR can override actual probation completion date for early pass, probation exemption, or historical corrections.
- Vacation usable date is `actualProbationEndDate + vacationDelayYears`; default delay is 1 year.
- If vacation eligibility date falls anywhere inside the target fiscal year, grant the full vacation entitlement for that year, no prorating.
- Vacation request start date must be on or after the vacation eligibility date.
- Vacation carry-over settings remain under `HR/Admin -> ตั้งค่าระบบ -> ปีงบประมาณ`.
- Probation and vacation eligibility settings live under `HR/Admin -> ตั้งค่าระบบ -> กฎการลา`.
- Employee-specific probation data lives under `HR -> จัดการพนักงาน`.

## File Structure

**Create**
- `database/migrations/add_probation_vacation_eligibility.sql`  
  Adds user probation columns and system setting defaults.
- `src/lib/vacation-eligibility.ts`  
  Pure date calculation helpers for probation end, vacation eligible date, fiscal year range, and balance-year eligibility.
- `src/app/api/leave/vacation-eligibility/route.ts`  
  Current-user endpoint for the leave request UI.
- `tests/vacation-eligibility.test.mjs`  
  Unit coverage for extension, override, fiscal-year inclusion, and request-date eligibility.

**Modify**
- `src/app/api/settings/rules/route.ts`  
  Return probation/vacation rule settings with existing leave rules.
- `src/app/api/hr/settings/route.ts`  
  Persist new settings and keep descriptions.
- `src/app/(dashboard)/hr/settings/page.tsx`  
  Add settings inputs in the existing `กฏการลา` group.
- `src/app/api/hr/employees/route.ts`  
  Read/write employee probation fields.
- `src/app/(dashboard)/hr/employees/page.tsx`  
  Add probation section to add/edit employee modals.
- `src/app/api/profile/route.ts`  
  Include probation fields if the profile UI later needs them.
- `src/app/api/leave/request/route.ts`  
  Replace current vacation tenure check with shared eligibility helper.
- `src/app/api/leave/balance/route.ts`  
  Create/show vacation balance only when eligible inside the current fiscal year, and include eligibility metadata for UI.
- `src/app/api/hr/employee-balance/[userId]/route.ts`  
  Include probation/vacation eligibility for HR and manager balance modals.
- `src/app/api/hr/year-end/preview/route.ts`  
  Preview full-year vacation entitlement/carry-over only when eligibility rules allow it.
- `src/app/api/hr/year-end/execute/route.ts`  
  Execute the same logic used in preview.
- `src/app/(dashboard)/leave/request/page.tsx`  
  Show vacation eligibility status when `ลาพักร้อน` is selected and block submit before eligible date.
- `src/app/(dashboard)/hr/year-end/page.tsx`  
  Show when vacation is skipped, granted, or blocked until a future date.
- `DEVELOPER_HANDOFF.md`, `README.md`, `IMPLEMENTATION_PLAN.md`  
  Update vacation business rules after implementation passes verification.

---

### Task 1: Add Pure Vacation Eligibility Helper

**Files:**
- Create: `src/lib/vacation-eligibility.ts`
- Test: `tests/vacation-eligibility.test.mjs`

- [ ] **Step 1: Write the failing helper test**

Create `tests/vacation-eligibility.test.mjs`:

```js
import assert from 'node:assert/strict';
import {
    calculateProbationEndDate,
    calculateVacationEligibleDate,
    getFiscalYearRange,
    isVacationEligibleOnDate,
    isVacationEntitledInFiscalYear,
} from '../src/lib/vacation-eligibility.ts';

const base = {
    startDate: '2026-01-01',
    probationDays: 90,
    probationExtensionDays: 0,
    probationOverrideDate: null,
    vacationDelayYears: 1,
};

assert.equal(
    calculateProbationEndDate(base).toISOString().slice(0, 10),
    '2026-04-01',
    'standard probation end is start date + 90 days'
);

assert.equal(
    calculateProbationEndDate({ ...base, probationExtensionDays: 30 }).toISOString().slice(0, 10),
    '2026-05-01',
    'extension days push actual probation end date'
);

assert.equal(
    calculateProbationEndDate({ ...base, probationExtensionDays: 30, probationOverrideDate: '2026-02-15' }).toISOString().slice(0, 10),
    '2026-02-15',
    'override date wins over calculated standard plus extension'
);

assert.equal(
    calculateVacationEligibleDate({ ...base, probationExtensionDays: 30 }).toISOString().slice(0, 10),
    '2027-05-01',
    'vacation eligible date is actual probation end plus configured years'
);

assert.equal(
    isVacationEligibleOnDate({ ...base, probationExtensionDays: 30 }, '2027-04-30'),
    false,
    'leave before eligible date is blocked'
);

assert.equal(
    isVacationEligibleOnDate({ ...base, probationExtensionDays: 30 }, '2027-05-01'),
    true,
    'leave on eligible date is allowed'
);

assert.deepEqual(
    Object.fromEntries(Object.entries(getFiscalYearRange(2027, '04-01')).map(([key, value]) => [key, value.toISOString().slice(0, 10)])),
    { start: '2027-04-01', end: '2028-03-31' },
    'fiscal year range respects MM-DD start setting'
);

assert.equal(
    isVacationEntitledInFiscalYear({ ...base, probationExtensionDays: 30 }, 2027, '01-01'),
    true,
    'full vacation entitlement is granted when eligibility falls inside the target year'
);

assert.equal(
    isVacationEntitledInFiscalYear({ ...base, probationExtensionDays: 30 }, 2026, '01-01'),
    false,
    'vacation entitlement is not created before the eligible fiscal year'
);

console.log('vacation eligibility tests passed');
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --experimental-strip-types tests\vacation-eligibility.test.mjs
```

Expected: fails because `src/lib/vacation-eligibility.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/vacation-eligibility.ts`:

```ts
interface VacationEligibilityInput {
    startDate: string | Date;
    probationDays?: number | null;
    probationExtensionDays?: number | null;
    probationOverrideDate?: string | Date | null;
    vacationDelayYears?: number | null;
}

function toDateOnly(value: string | Date): Date {
    const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
    date.setHours(0, 0, 0, 0);
    return date;
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    result.setHours(0, 0, 0, 0);
    return result;
}

function addYears(date: Date, years: number): Date {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    result.setHours(0, 0, 0, 0);
    return result;
}

export function calculateProbationEndDate(input: VacationEligibilityInput): Date {
    if (input.probationOverrideDate) {
        return toDateOnly(input.probationOverrideDate);
    }

    const probationDays = Number(input.probationDays ?? 90);
    const extensionDays = Number(input.probationExtensionDays ?? 0);
    return addDays(toDateOnly(input.startDate), probationDays + extensionDays);
}

export function calculateVacationEligibleDate(input: VacationEligibilityInput): Date {
    return addYears(calculateProbationEndDate(input), Number(input.vacationDelayYears ?? 1));
}

export function getFiscalYearRange(year: number, fiscalYearStart: string): { start: Date; end: Date } {
    const [monthText, dayText] = fiscalYearStart.split('-');
    const month = Number(monthText);
    const day = Number(dayText);
    const start = new Date(year, month - 1, day);
    start.setHours(0, 0, 0, 0);

    const end = new Date(year + 1, month - 1, day);
    end.setDate(end.getDate() - 1);
    end.setHours(0, 0, 0, 0);

    return { start, end };
}

export function isVacationEligibleOnDate(input: VacationEligibilityInput, leaveStartDate: string | Date): boolean {
    return toDateOnly(leaveStartDate) >= calculateVacationEligibleDate(input);
}

export function isVacationEntitledInFiscalYear(
    input: VacationEligibilityInput,
    fiscalYear: number,
    fiscalYearStart: string
): boolean {
    const eligibleDate = calculateVacationEligibleDate(input);
    const range = getFiscalYearRange(fiscalYear, fiscalYearStart);
    return eligibleDate <= range.end;
}

export function daysUntilVacationEligible(input: VacationEligibilityInput, asOf: string | Date = new Date()): number {
    const eligibleDate = calculateVacationEligibleDate(input);
    const today = toDateOnly(asOf);
    if (today >= eligibleDate) return 0;
    return Math.ceil((eligibleDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
```

- [ ] **Step 4: Run the helper test**

Run:

```powershell
node --experimental-strip-types tests\vacation-eligibility.test.mjs
```

Expected: `vacation eligibility tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/vacation-eligibility.ts tests/vacation-eligibility.test.mjs
git commit -m "Add vacation eligibility helper"
```

---

### Task 2: Add Database Migration And Settings Defaults

**Files:**
- Create: `database/migrations/add_probation_vacation_eligibility.sql`
- Modify: `database/schema.sql`

- [ ] **Step 1: Create migration**

Create `database/migrations/add_probation_vacation_eligibility.sql`:

```sql
-- Add probation and vacation eligibility support
IF COL_LENGTH('Users', 'probationDays') IS NULL
BEGIN
    ALTER TABLE Users ADD probationDays INT NULL;
END
GO

IF COL_LENGTH('Users', 'probationExtensionDays') IS NULL
BEGIN
    ALTER TABLE Users ADD probationExtensionDays INT NULL;
END
GO

IF COL_LENGTH('Users', 'probationOverrideDate') IS NULL
BEGIN
    ALTER TABLE Users ADD probationOverrideDate DATE NULL;
END
GO

IF COL_LENGTH('Users', 'probationEndDate') IS NULL
BEGIN
    ALTER TABLE Users ADD probationEndDate DATE NULL;
END
GO

IF COL_LENGTH('Users', 'probationNote') IS NULL
BEGIN
    ALTER TABLE Users ADD probationNote NVARCHAR(500) NULL;
END
GO

UPDATE Users
SET
    probationDays = ISNULL(probationDays, 90),
    probationExtensionDays = ISNULL(probationExtensionDays, 0),
    probationEndDate = ISNULL(probationEndDate, DATEADD(day, ISNULL(probationDays, 90) + ISNULL(probationExtensionDays, 0), startDate))
WHERE probationDays IS NULL
   OR probationExtensionDays IS NULL
   OR probationEndDate IS NULL;
GO

ALTER TABLE Users ALTER COLUMN probationDays INT NOT NULL;
GO

ALTER TABLE Users ALTER COLUMN probationExtensionDays INT NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE settingKey = 'PROBATION_STANDARD_DAYS')
BEGIN
    INSERT INTO SystemSettings (settingKey, settingValue, description)
    VALUES ('PROBATION_STANDARD_DAYS', '90', 'ระยะทดลองงานมาตรฐาน (วัน)');
END
GO

IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE settingKey = 'VACATION_AFTER_PROBATION_YEARS')
BEGIN
    INSERT INTO SystemSettings (settingKey, settingValue, description)
    VALUES ('VACATION_AFTER_PROBATION_YEARS', '1', 'ลาพักร้อนเริ่มใช้สิทธิ์หลังผ่านทดลองงาน (ปี)');
END
GO
```

- [ ] **Step 2: Update base schema**

In `database/schema.sql`, add the same user columns to the `Users` table definition:

```sql
probationDays INT NOT NULL DEFAULT 90,
probationExtensionDays INT NOT NULL DEFAULT 0,
probationOverrideDate DATE NULL,
probationEndDate DATE NULL,
probationNote NVARCHAR(500) NULL,
```

Also add defaults in the `SystemSettings` insert block:

```sql
('PROBATION_STANDARD_DAYS', '90', 'ระยะทดลองงานมาตรฐาน (วัน)'),
('VACATION_AFTER_PROBATION_YEARS', '1', 'ลาพักร้อนเริ่มใช้สิทธิ์หลังผ่านทดลองงาน (ปี)'),
```

- [ ] **Step 3: Verify SQL references**

Run:

```powershell
rg -n "PROBATION_STANDARD_DAYS|VACATION_AFTER_PROBATION_YEARS|probationEndDate|probationExtensionDays" database
```

Expected: both setting keys and all new user columns appear in migration and schema.

- [ ] **Step 4: Commit**

```powershell
git add database/schema.sql database/migrations/add_probation_vacation_eligibility.sql
git commit -m "Add probation eligibility migration"
```

---

### Task 3: Surface New Rule Settings

**Files:**
- Modify: `src/app/api/settings/rules/route.ts`
- Modify: `src/app/api/hr/settings/route.ts`
- Modify: `src/app/(dashboard)/hr/settings/page.tsx`

- [ ] **Step 1: Update settings rules API**

In `src/app/api/settings/rules/route.ts`, extend the settings query and response:

```ts
WHERE settingKey IN (
    'LEAVE_ADVANCE_DAYS',
    'LEAVE_SICK_CERT_DAYS',
    'PROBATION_STANDARD_DAYS',
    'VACATION_AFTER_PROBATION_YEARS',
    'LEAVE_YEAR_START'
)
```

Use this response shape:

```ts
const rules = {
    advanceNoticeDays: 3,
    sickCertThreshold: 3,
    probationStandardDays: 90,
    vacationAfterProbationYears: 1,
    fiscalYearStart: '01-01',
};
```

Map rows explicitly:

```ts
if (row.settingKey === 'PROBATION_STANDARD_DAYS') {
    rules.probationStandardDays = parseInt(row.settingValue, 10) || 90;
} else if (row.settingKey === 'VACATION_AFTER_PROBATION_YEARS') {
    rules.vacationAfterProbationYears = parseInt(row.settingValue, 10) || 1;
} else if (row.settingKey === 'LEAVE_YEAR_START') {
    rules.fiscalYearStart = row.settingValue || '01-01';
}
```

- [ ] **Step 2: Update HR settings UI group**

In `src/app/(dashboard)/hr/settings/page.tsx`, modify the `กฏการลา` group:

```ts
{
    title: 'กฏการลา',
    icon: <FileText className="w-5 h-5" />,
    settings: [
        { key: 'PROBATION_STANDARD_DAYS', label: 'ระยะทดลองงานมาตรฐาน (วัน)', type: 'number' },
        { key: 'VACATION_AFTER_PROBATION_YEARS', label: 'ลาพักร้อนเริ่มหลังผ่านทดลองงาน (ปี)', type: 'number' },
        { key: 'LEAVE_ADVANCE_DAYS', label: 'ลาพักร้อนต้องขอล่วงหน้า (วัน)', type: 'number' },
        { key: 'LEAVE_SICK_CERT_DAYS', label: 'ลาป่วยกี่วันต้องมีใบรับรองแพทย์', type: 'number' },
    ]
}
```

Keep `LEAVE_CARRYOVER_LIMIT` in the `ปีงบประมาณ` group.

- [ ] **Step 3: Verify settings UI lint**

Run:

```powershell
npx eslint src\app\api\settings\rules\route.ts src\app\api\hr\settings\route.ts "src\app\(dashboard)\hr\settings\page.tsx"
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```powershell
git add src/app/api/settings/rules/route.ts src/app/api/hr/settings/route.ts "src/app/(dashboard)/hr/settings/page.tsx"
git commit -m "Add probation vacation rule settings"
```

---

### Task 4: Add Employee Probation Fields To HR CRUD

**Files:**
- Modify: `src/app/api/hr/employees/route.ts`
- Modify: `src/app/(dashboard)/hr/employees/page.tsx`
- Modify: `src/app/api/profile/route.ts`

- [ ] **Step 1: Update employees API SELECT**

In `src/app/api/hr/employees/route.ts`, add these columns to the list query:

```sql
u.probationDays,
u.probationExtensionDays,
CONVERT(varchar, u.probationOverrideDate, 23) as probationOverrideDate,
CONVERT(varchar, u.probationEndDate, 23) as probationEndDate,
u.probationNote,
```

- [ ] **Step 2: Update employees API POST body and insert**

Destructure:

```ts
probationDays,
probationExtensionDays,
probationOverrideDate,
probationNote,
```

Compute values before insert:

```ts
const resolvedProbationDays = Number(probationDays || 90);
const resolvedExtensionDays = Number(probationExtensionDays || 0);
const probationEndDate = probationOverrideDate
    ? probationOverrideDate
    : new Date(new Date(startDate).getTime() + (resolvedProbationDays + resolvedExtensionDays) * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
```

Add inputs:

```ts
.input('probationDays', resolvedProbationDays)
.input('probationExtensionDays', resolvedExtensionDays)
.input('probationOverrideDate', probationOverrideDate || null)
.input('probationEndDate', probationEndDate)
.input('probationNote', probationNote || null)
```

Add columns and values:

```sql
probationDays, probationExtensionDays, probationOverrideDate, probationEndDate, probationNote
```

```sql
@probationDays, @probationExtensionDays, @probationOverrideDate, @probationEndDate, @probationNote
```

- [ ] **Step 3: Update employees API PUT**

Destructure and compute the same fields in PUT. Add to update SQL:

```sql
probationDays = @probationDays,
probationExtensionDays = @probationExtensionDays,
probationOverrideDate = @probationOverrideDate,
probationEndDate = @probationEndDate,
probationNote = @probationNote,
```

Include old/new values in audit:

```ts
newValue: {
    firstName,
    lastName,
    role,
    company,
    department,
    isActive,
    gender,
    startDate,
    probationDays: resolvedProbationDays,
    probationExtensionDays: resolvedExtensionDays,
    probationOverrideDate: probationOverrideDate || null,
    probationEndDate,
    probationNote: probationNote || null,
    isHRStaff: newIsHRStaff
}
```

- [ ] **Step 4: Update HR employees form state**

In `src/app/(dashboard)/hr/employees/page.tsx`, extend `Employee` and form state:

```ts
probationDays: number;
probationExtensionDays: number;
probationOverrideDate: string | null;
probationEndDate: string | null;
probationNote: string | null;
```

Default form values:

```ts
probationDays: 90,
probationExtensionDays: 0,
probationOverrideDate: '',
probationEndDate: '',
probationNote: '',
```

When opening edit modal:

```ts
probationDays: employee.probationDays || 90,
probationExtensionDays: employee.probationExtensionDays || 0,
probationOverrideDate: employee.probationOverrideDate || '',
probationEndDate: employee.probationEndDate || '',
probationNote: employee.probationNote || '',
```

- [ ] **Step 5: Add probation section to add/edit modals**

Place this section after `ข้อมูลบริษัท` in both add and edit modal forms:

```tsx
<div className="mb-6">
    <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-4 h-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            ข้อมูลทดลองงานและสิทธิ์พักร้อน
        </h3>
    </div>
    <div className="grid grid-cols-2 gap-4">
        <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">ระยะทดลองงานมาตรฐาน (วัน)</label>
            <input type="number" min="0" value={formData.probationDays} onChange={e => setFormData({ ...formData, probationDays: Number(e.target.value) })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">ต่อทดลองงานเพิ่ม (วัน)</label>
            <input type="number" min="0" value={formData.probationExtensionDays} onChange={e => setFormData({ ...formData, probationExtensionDays: Number(e.target.value) })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">วันที่ผ่านทดลองงานจริง (กรณีผ่านก่อน/ยกเว้น)</label>
            <input type="date" value={formData.probationOverrideDate || ''} onChange={e => setFormData({ ...formData, probationOverrideDate: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">เหตุผลการปรับทดลองงาน</label>
            <input type="text" value={formData.probationNote || ''} onChange={e => setFormData({ ...formData, probationNote: e.target.value })}
                placeholder="เช่น ต่อทดลองงาน 30 วัน / ยกเว้นทดลองงาน"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
        </div>
    </div>
</div>
```

- [ ] **Step 6: Update profile API**

In `src/app/api/profile/route.ts`, select:

```sql
probationDays,
probationExtensionDays,
CONVERT(varchar, probationOverrideDate, 23) as probationOverrideDate,
CONVERT(varchar, probationEndDate, 23) as probationEndDate,
probationNote
```

- [ ] **Step 7: Verify TypeScript and lint**

Run:

```powershell
npx tsc --noEmit
npx eslint src\app\api\hr\employees\route.ts src\app\api\profile\route.ts "src\app\(dashboard)\hr\employees\page.tsx"
```

Expected: both commands exit 0.

- [ ] **Step 8: Commit**

```powershell
git add src/app/api/hr/employees/route.ts src/app/api/profile/route.ts "src/app/(dashboard)/hr/employees/page.tsx"
git commit -m "Add employee probation fields"
```

---

### Task 5: Add Current User Vacation Eligibility API

**Files:**
- Create: `src/app/api/leave/vacation-eligibility/route.ts`

- [ ] **Step 1: Implement endpoint**

Create `src/app/api/leave/vacation-eligibility/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import {
    calculateProbationEndDate,
    calculateVacationEligibleDate,
    daysUntilVacationEligible,
    isVacationEntitledInFiscalYear,
} from '@/lib/vacation-eligibility';

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pool = await getPool();
    const userResult = await pool.request()
        .input('userId', Number(session.user.id))
        .query(`
            SELECT
                startDate,
                probationDays,
                probationExtensionDays,
                probationOverrideDate,
                probationEndDate
            FROM Users
            WHERE id = @userId
        `);

    if (userResult.recordset.length === 0) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const settingsResult = await pool.request().query(`
        SELECT settingKey, settingValue
        FROM SystemSettings
        WHERE settingKey IN ('VACATION_AFTER_PROBATION_YEARS', 'LEAVE_ADVANCE_DAYS', 'LEAVE_YEAR_START')
    `);

    const settings = {
        vacationAfterProbationYears: 1,
        advanceNoticeDays: 3,
        fiscalYearStart: '01-01',
    };

    for (const row of settingsResult.recordset) {
        if (row.settingKey === 'VACATION_AFTER_PROBATION_YEARS') {
            settings.vacationAfterProbationYears = parseInt(row.settingValue, 10) || 1;
        } else if (row.settingKey === 'LEAVE_ADVANCE_DAYS') {
            settings.advanceNoticeDays = parseInt(row.settingValue, 10) || 3;
        } else if (row.settingKey === 'LEAVE_YEAR_START') {
            settings.fiscalYearStart = row.settingValue || '01-01';
        }
    }

    const user = userResult.recordset[0];
    const input = {
        startDate: user.startDate,
        probationDays: user.probationDays,
        probationExtensionDays: user.probationExtensionDays,
        probationOverrideDate: user.probationOverrideDate,
        vacationDelayYears: settings.vacationAfterProbationYears,
    };

    const currentYear = new Date().getFullYear();
    const probationEndDate = calculateProbationEndDate(input);
    const vacationEligibleDate = calculateVacationEligibleDate(input);

    return NextResponse.json({
        success: true,
        data: {
            startDate: new Date(user.startDate).toISOString().slice(0, 10),
            probationEndDate: probationEndDate.toISOString().slice(0, 10),
            vacationEligibleDate: vacationEligibleDate.toISOString().slice(0, 10),
            daysUntilEligible: daysUntilVacationEligible(input),
            entitledInCurrentFiscalYear: isVacationEntitledInFiscalYear(input, currentYear, settings.fiscalYearStart),
            advanceNoticeDays: settings.advanceNoticeDays,
            fiscalYearStart: settings.fiscalYearStart,
        },
    });
}
```

- [ ] **Step 2: Verify lint**

Run:

```powershell
npx eslint src\app\api\leave\vacation-eligibility\route.ts
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```powershell
git add src/app/api/leave/vacation-eligibility/route.ts
git commit -m "Add vacation eligibility API"
```

---

### Task 6: Apply Eligibility To Leave Request And Balance APIs

**Files:**
- Modify: `src/app/api/leave/request/route.ts`
- Modify: `src/app/api/leave/balance/route.ts`
- Modify: `src/app/api/hr/employee-balance/[userId]/route.ts`

- [ ] **Step 1: Replace vacation tenure check in request API**

In `src/app/api/leave/request/route.ts`, import:

```ts
import {
    calculateVacationEligibleDate,
    isVacationEligibleOnDate,
    isVacationEntitledInFiscalYear,
} from '@/lib/vacation-eligibility';
```

Replace the current `VACATION LEAVE SPECIAL RULES` user query with:

```sql
SELECT
    u.startDate,
    u.probationDays,
    u.probationExtensionDays,
    u.probationOverrideDate,
    sDelay.settingValue as vacationAfterProbationYears,
    sFiscal.settingValue as fiscalYearStart
FROM Users u
LEFT JOIN SystemSettings sDelay ON sDelay.settingKey = 'VACATION_AFTER_PROBATION_YEARS'
LEFT JOIN SystemSettings sFiscal ON sFiscal.settingKey = 'LEAVE_YEAR_START'
WHERE u.id = @userId
```

Use this guard:

```ts
const eligibilityInput = {
    startDate: user.startDate,
    probationDays: user.probationDays,
    probationExtensionDays: user.probationExtensionDays,
    probationOverrideDate: user.probationOverrideDate,
    vacationDelayYears: parseInt(user.vacationAfterProbationYears || '1', 10),
};

const vacationEligibleDate = calculateVacationEligibleDate(eligibilityInput);
if (!isVacationEligibleOnDate(eligibilityInput, startDate)) {
    return NextResponse.json(
        { error: `ใช้สิทธิ์ลาพักร้อนได้ตั้งแต่ ${vacationEligibleDate.toISOString().slice(0, 10)}` },
        { status: 400 }
    );
}

const fiscalYearStart = user.fiscalYearStart || '01-01';
for (const [year] of yearSplits) {
    if (!isVacationEntitledInFiscalYear(eligibilityInput, year, fiscalYearStart)) {
        return NextResponse.json(
            { error: `ยังไม่มีสิทธิ์ลาพักร้อนในปีงบประมาณ ${year}` },
            { status: 400 }
        );
    }
}
```

Keep the existing advance notice check after this guard.

- [ ] **Step 2: Update auto-create balance in request API**

When auto-creating a missing `VACATION` balance, use the same entitlement guard before insert. Insert full `defaultDays` when eligible in that balance year. Do not prorate.

- [ ] **Step 3: Update leave balance API**

In `src/app/api/leave/balance/route.ts`, fetch current user probation fields and settings. When creating default balances:

```ts
if (quota.leaveType === 'VACATION' && !isVacationEntitledInFiscalYear(eligibilityInput, currentYear, fiscalYearStart)) {
    continue;
}
```

Return `vacationEligibility` metadata:

```ts
vacationEligibility: {
    probationEndDate: probationEndDate.toISOString().slice(0, 10),
    vacationEligibleDate: vacationEligibleDate.toISOString().slice(0, 10),
    daysUntilEligible,
    entitledInCurrentFiscalYear,
}
```

- [ ] **Step 4: Update employee-balance API**

In `src/app/api/hr/employee-balance/[userId]/route.ts`, include `probationEndDate`, `vacationEligibleDate`, and `daysUntilEligible` in the returned employee object so HR/manager modals can show why vacation is available or blocked.

- [ ] **Step 5: Verify APIs compile**

Run:

```powershell
npx tsc --noEmit
npx eslint src\app\api\leave\request\route.ts src\app\api\leave\balance\route.ts src\app\api\hr\employee-balance\[userId]\route.ts
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add src/app/api/leave/request/route.ts src/app/api/leave/balance/route.ts src/app/api/hr/employee-balance/[userId]/route.ts
git commit -m "Apply vacation probation eligibility to leave APIs"
```

---

### Task 7: Apply Eligibility To Year-End Preview And Execute

**Files:**
- Modify: `src/app/api/hr/year-end/preview/route.ts`
- Modify: `src/app/api/hr/year-end/execute/route.ts`
- Modify: `src/app/(dashboard)/hr/year-end/page.tsx`

- [ ] **Step 1: Update preview query**

In `preview/route.ts`, select probation fields:

```sql
u.startDate,
u.probationDays,
u.probationExtensionDays,
u.probationOverrideDate,
```

Also load `LEAVE_YEAR_START` and `VACATION_AFTER_PROBATION_YEARS` from `SystemSettings`.

- [ ] **Step 2: Use eligibility in preview**

For each balance row where `leaveType === 'VACATION'`:

```ts
const eligibleInFromYear = isVacationEntitledInFiscalYear(eligibilityInput, fromYear, fiscalYearStart);
const eligibleInToYear = isVacationEntitledInFiscalYear(eligibilityInput, toYear, fiscalYearStart);
const carryOver = eligibleInFromYear && quota.allowCarryOver
    ? Math.min(row.remaining, quota.maxCarryOverDays)
    : 0;
const newEntitlement = eligibleInToYear ? quota.defaultDays : 0;
```

Add preview flags:

```ts
vacationEligibleDate: calculateVacationEligibleDate(eligibilityInput).toISOString().slice(0, 10),
vacationEligibleInToYear: eligibleInToYear,
```

- [ ] **Step 3: Update execute query and logic**

In `execute/route.ts`, select probation fields and load the same settings. Replace the existing `yearsOfService < quota.minTenureYears` skip for `VACATION` with:

```ts
if (leaveType === 'VACATION') {
    const eligibleInFromYear = isVacationEntitledInFiscalYear(eligibilityInput, fromYear, fiscalYearStart);
    const eligibleInToYear = isVacationEntitledInFiscalYear(eligibilityInput, toYear, fiscalYearStart);

    if (!eligibleInToYear) {
        continue;
    }

    const currentRemaining = emp.balances[leaveType] || 0;
    const carryOver = eligibleInFromYear && quota.allowCarryOver
        ? Math.min(currentRemaining, quota.maxCarryOverDays)
        : 0;
    const entitlement = quota.defaultDays;
}
```

Keep existing logic for non-vacation leave types.

- [ ] **Step 4: Update year-end page display**

In `src/app/(dashboard)/hr/year-end/page.tsx`, extend `EmployeeBalance`:

```ts
vacationEligibleDate?: string;
vacationEligibleInToYear?: boolean;
```

When rendering `VACATION`, show a compact status:

```tsx
{bal.leaveType === 'VACATION' && bal.vacationEligibleDate && (
    <p className="text-xs text-gray-500 mt-1">
        ใช้สิทธิ์ได้ตั้งแต่ {bal.vacationEligibleDate}
    </p>
)}
```

If `vacationEligibleInToYear === false`, show:

```tsx
<span className="text-xs text-amber-600">ยังไม่เข้าเงื่อนไขในปีงบประมาณนี้</span>
```

- [ ] **Step 5: Verify year-end**

Run:

```powershell
npx tsc --noEmit
npx eslint src\app\api\hr\year-end\preview\route.ts src\app\api\hr\year-end\execute\route.ts "src\app\(dashboard)\hr\year-end\page.tsx"
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add src/app/api/hr/year-end/preview/route.ts src/app/api/hr/year-end/execute/route.ts "src/app/(dashboard)/hr/year-end/page.tsx"
git commit -m "Apply vacation eligibility to year-end processing"
```

---

### Task 8: Add Employee-Facing Vacation Eligibility UI

**Files:**
- Modify: `src/app/(dashboard)/leave/request/page.tsx`

- [ ] **Step 1: Add eligibility state**

Add state:

```ts
const [vacationEligibility, setVacationEligibility] = useState<{
    probationEndDate: string;
    vacationEligibleDate: string;
    daysUntilEligible: number;
    entitledInCurrentFiscalYear: boolean;
    advanceNoticeDays: number;
} | null>(null);
```

- [ ] **Step 2: Fetch eligibility on mount**

Inside the existing rules fetch effect, add:

```ts
const eligibilityRes = await fetch('/api/leave/vacation-eligibility');
if (eligibilityRes.ok) {
    const eligibilityData = await eligibilityRes.json();
    if (eligibilityData.success) {
        setVacationEligibility(eligibilityData.data);
    }
}
```

- [ ] **Step 3: Add selected vacation guard**

Before submit, when `leaveType === 'VACATION'`:

```ts
if (leaveType === 'VACATION' && vacationEligibility) {
    if (startDate < vacationEligibility.vacationEligibleDate) {
        throw new Error(`ใช้สิทธิ์ลาพักร้อนได้ตั้งแต่ ${vacationEligibility.vacationEligibleDate}`);
    }
}
```

- [ ] **Step 4: Add vacation info panel**

After leave type selection, render:

```tsx
{leaveType === 'VACATION' && vacationEligibility && (
    <div className={`mt-4 p-4 rounded-xl border ${
        vacationEligibility.daysUntilEligible > 0
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    }`}>
        <div className="flex items-start gap-3">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
                <p className="font-semibold">
                    กฎลาพักร้อน
                </p>
                <ul className="mt-1 space-y-1">
                    <li>ผ่านทดลองงานวันที่ {vacationEligibility.probationEndDate}</li>
                    <li>ใช้สิทธิ์ลาพักร้อนได้ตั้งแต่ {vacationEligibility.vacationEligibleDate}</li>
                    <li>ต้องขอล่วงหน้าอย่างน้อย {vacationEligibility.advanceNoticeDays} วัน</li>
                    {vacationEligibility.daysUntilEligible > 0 && (
                        <li>เหลืออีก {vacationEligibility.daysUntilEligible} วันจึงจะใช้สิทธิ์ได้</li>
                    )}
                </ul>
            </div>
        </div>
    </div>
)}
```

- [ ] **Step 5: Verify UI compile**

Run:

```powershell
npx tsc --noEmit
npx eslint "src\app\(dashboard)\leave\request\page.tsx"
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add "src/app/(dashboard)/leave/request/page.tsx"
git commit -m "Show vacation eligibility on leave request"
```

---

### Task 9: Update Documentation And Run Full Verification

**Files:**
- Modify: `DEVELOPER_HANDOFF.md`
- Modify: `README.md`
- Modify: `IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Update docs**

Update vacation rules to:

```text
ลาพักร้อน: สิทธิ์/ปีตามการตั้งค่า เริ่มใช้ได้เมื่อผ่านทดลองงานจริง + 1 ปี
กรณีเข้าเงื่อนไขภายในปีงบประมาณ ให้สิทธิ์เต็มปี ไม่ prorate
ยกยอดข้ามปีตามค่าใน HR/Admin -> ตั้งค่าระบบ -> ปีงบประมาณ
```

Add mention of:

```text
HR can manage probation extension days and probation override date in HR -> จัดการพนักงาน.
```

- [ ] **Step 2: Run focused tests**

Run:

```powershell
node --experimental-strip-types tests\vacation-eligibility.test.mjs
node --experimental-strip-types tests\medical-file-access.test.mjs
node --experimental-strip-types tests\medical-file-url.test.mjs
node --experimental-strip-types tests\login-error-message.test.mjs
```

Expected:

```text
vacation eligibility tests passed
medical file access tests passed
medical file URL normalization tests passed
login error message tests passed
```

Node may print `MODULE_TYPELESS_PACKAGE_JSON` warnings; those warnings are acceptable if exit code is 0.

- [ ] **Step 3: Run full static verification**

Run:

```powershell
npx tsc --noEmit
npx eslint
git diff --check
```

Expected: all exit 0. `git diff --check` may print line-ending warnings on Windows; whitespace errors must be fixed.

- [ ] **Step 4: Browser smoke test**

Start dev server:

```powershell
.\node_modules\.bin\next.cmd dev --webpack -p 3002
```

Open:

```text
http://localhost:3002/hr/settings
http://localhost:3002/hr/employees
http://localhost:3002/leave/request
http://localhost:3002/hr/year-end
```

Verify:
- `กฏการลา` shows probation and vacation delay settings.
- employee add/edit modal shows `ข้อมูลทดลองงานและสิทธิ์พักร้อน`.
- selecting `ลาพักร้อน` shows probation/vacation eligibility status.
- year-end preview shows vacation eligibility date/status.

- [ ] **Step 5: Final commit**

```powershell
git add DEVELOPER_HANDOFF.md README.md IMPLEMENTATION_PLAN.md
git commit -m "Document vacation probation eligibility rules"
```

---

## Self-Review

- Spec coverage: Covers configurable probation days, extension days, override date, full-year vacation entitlement, request blocking, balance creation, year-end carry-over, HR settings UI, employee UI, employee request UI, docs, and verification.
- Placeholder scan: The plan contains no unfinished marker text or future undefined placeholder.
- Type consistency: The plan consistently uses `probationDays`, `probationExtensionDays`, `probationOverrideDate`, `probationEndDate`, `probationNote`, `VACATION_AFTER_PROBATION_YEARS`, and `PROBATION_STANDARD_DAYS`.
- Scope note: This first iteration uses existing `AuditLogs` instead of a new `ProbationHistory` table. A separate history table can be added later if HR needs a full timeline of every extension/override event beyond the existing audit log.
