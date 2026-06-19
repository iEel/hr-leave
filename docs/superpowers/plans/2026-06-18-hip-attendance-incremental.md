# HIP Attendance Incremental Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Phase 1 attendance module that pulls check-in/check-out records incrementally from HIP CMiF68S devices over TCP, stores raw and decoded records safely, and lets employees view only their own daily in/out times.

**Architecture:** Keep attendance isolated from leave logic. System Admin owns device configuration and sync operations; a server-side sync service talks to HIP devices with the custom protocol, writes records with database dedupe, and sends HIP `0xA2` acknowledge only after the database transaction commits. Employee UI reads summarized first/last punch per day from SQL and does not calculate late/normal/early/working-hours/shift status.

**Tech Stack:** Next.js 16 App Router, TypeScript, MS SQL Server via `mssql`, Node TCP `net`, Tailwind CSS, Lucide React, Node assertion tests with `node --experimental-strip-types`.

---

## Requirements Locked With Product Owner

- Device model is HIP CMiF68S.
- Device is reached directly from the server via TCP.
- Default device values: IP `192.168.108.201`, port `5005`, pass `0`.
- Do not use `node-zklib`; this device does not use standard ZKTeco protocol.
- Device config belongs under `System Admin -> เครื่องบันทึกเวลา`.
- `Pass` is optional in UI; if blank, use default `0`; API must not return the raw pass value.
- Employee-facing UI must show only `วันที่ | เวลาเข้า | เวลาออก`.
- Employee-facing UI must not show device name, source, or sync timestamp.
- Employee-facing filters: month, custom date range, check-in from time such as `08:45`, clear filters.
- Phase 1 does not calculate late/normal/early status, work hours, shifts, or attendance-vs-leave effects.
- Phase 1 does not touch `/hr/work-schedule`, leave calculation, or existing HR reports.
- Incremental sync uses HIP queue protocol:
  - `0xB4 field4=6 field8=0xFFFF0000 length=0` returns `new_count`.
  - If `new_count = 0`, sync ends without `0xA1` or `0xA2`.
  - If `new_count > 0`, `0xA1 field8=new_count length=new_count*20` reads new records.
  - Decode every 20-byte record and insert/dedupe in DB.
  - Send `0xA2 field4=new_count field8=0xFFFF0000 length=0` only after DB commit succeeds.
- If server crashes after `0xA1` but before `0xA2`, the device should send the same records again on the next run; database dedupe must make that safe.
- Store raw hex and raw decoded time for audit.
- Historical backfill is planned as a separate read-only mode using the older page protocol, but Phase 1 implementation should finish the incremental path first.

## File Structure

**Create**
- `database/migrations/add_attendance_tables.sql`
  Adds `AttendanceDevices`, `AttendanceLogs`, and `AttendanceSyncRuns`.
- `src/lib/attendance/types.ts`
  Shared attendance and sync TypeScript types.
- `src/lib/attendance/hip-protocol.ts`
  Pure HIP frame construction and record decoding helpers.
- `src/lib/attendance/hip-client.ts`
  TCP client for HIP CMiF68S read/ack commands.
- `src/lib/attendance/repository.ts`
  Database operations for devices, sync runs, locks, log inserts, and employee summaries.
- `src/lib/attendance/sync-service.ts`
  Orchestrates lock -> B4 -> A1 -> DB transaction -> A2 -> status updates.
- `src/app/api/admin/attendance/devices/route.ts`
  Admin list/create/update device API.
- `src/app/api/admin/attendance/devices/[deviceId]/test/route.ts`
  Admin test connection API.
- `src/app/api/admin/attendance/devices/[deviceId]/sync/route.ts`
  Admin manual sync API.
- `src/app/api/admin/attendance/sync-runs/route.ts`
  Admin sync history API.
- `src/app/api/cron/attendance-sync/route.ts`
  Scheduled sync API for due active devices.
- `src/app/api/attendance/me/route.ts`
  Employee self attendance summary API.
- `src/app/(dashboard)/admin/attendance-devices/page.tsx`
  System Admin device config and sync status page.
- `src/app/(dashboard)/attendance/page.tsx`
  Employee attendance history page.
- `tests/hip-protocol.test.mjs`
  Unit tests for frame construction, response parsing, and record decode.
- `tests/attendance-summary.test.mjs`
  Unit tests for local daily first/last summarization helpers.

**Modify**
- `database/schema.sql`
  Add attendance tables for fresh installs.
- `src/components/layout/sidebar.tsx`
  Add `System Admin -> เครื่องบันทึกเวลา`; add employee nav item `เวลาเข้า-ออก`.
- `src/app/(dashboard)/dashboard/page.tsx`
  Add employee today in/out card sourced from the attendance self API/repository.
- `src/types/index.ts`
  Add attendance types if shared across UI pages.
- `src/lib/audit.ts`
  Add attendance device audit action/table names.
- `DEVELOPER_HANDOFF.md`
  Document the new Phase 1 attendance module and production sync notes.

---

### Task 1: Add Attendance Database Tables

**Files:**
- Create: `database/migrations/add_attendance_tables.sql`
- Modify: `database/schema.sql`

- [ ] **Step 1: Add migration SQL**

Create `database/migrations/add_attendance_tables.sql`:

```sql
-- ==============================================
-- Attendance tables for HIP CMiF68S incremental sync
-- Safe to run multiple times
-- ==============================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AttendanceDevices' AND xtype='U')
BEGIN
    CREATE TABLE AttendanceDevices (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        branchName NVARCHAR(100) NULL,
        protocol NVARCHAR(30) NOT NULL DEFAULT 'HIP_CMIF68S',
        ipAddress VARCHAR(45) NOT NULL,
        port INT NOT NULL DEFAULT 5005,
        passCode NVARCHAR(100) NULL,
        isActive BIT NOT NULL DEFAULT 1,
        syncEnabled BIT NOT NULL DEFAULT 0,
        syncFrequencyMinutes INT NOT NULL DEFAULT 60,
        timeoutMs INT NOT NULL DEFAULT 10000,
        retryCount INT NOT NULL DEFAULT 2,
        lastSyncAt DATETIME2 NULL,
        lastSuccessfulSyncAt DATETIME2 NULL,
        nextSyncAt DATETIME2 NULL,
        lastSyncStatus NVARCHAR(20) NULL,
        lastError NVARCHAR(MAX) NULL,
        lastNewCount INT NULL,
        lastInsertedCount INT NULL,
        syncLockUntil DATETIME2 NULL,
        syncLockOwner NVARCHAR(100) NULL,
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        updatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    CREATE INDEX IX_AttendanceDevices_DueSync
        ON AttendanceDevices (syncEnabled, isActive, nextSyncAt)
        INCLUDE (ipAddress, port, protocol);
END
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AttendanceLogs' AND xtype='U')
BEGIN
    CREATE TABLE AttendanceLogs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        deviceId INT NOT NULL,
        userKey INT NOT NULL,
        employeeId NVARCHAR(20) NULL,
        recordTime DATETIME2 NOT NULL,
        rawRecordTime DATETIME2 NOT NULL,
        yearCode INT NOT NULL,
        verifyCode INT NOT NULL,
        verifyType NVARCHAR(20) NOT NULL,
        recordHex VARCHAR(40) NOT NULL,
        sourceCommand NVARCHAR(20) NOT NULL DEFAULT 'A1',
        syncedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_AttendanceLogs_Device FOREIGN KEY (deviceId) REFERENCES AttendanceDevices(id)
    );

    CREATE UNIQUE INDEX UX_AttendanceLogs_Dedupe
        ON AttendanceLogs (deviceId, userKey, recordTime, verifyType, recordHex);

    CREATE INDEX IX_AttendanceLogs_EmployeeDate
        ON AttendanceLogs (employeeId, recordTime)
        INCLUDE (userKey, verifyType, deviceId);
END
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AttendanceSyncRuns' AND xtype='U')
BEGIN
    CREATE TABLE AttendanceSyncRuns (
        id INT IDENTITY(1,1) PRIMARY KEY,
        deviceId INT NOT NULL,
        mode NVARCHAR(20) NOT NULL DEFAULT 'INCREMENTAL',
        status NVARCHAR(20) NOT NULL DEFAULT 'RUNNING',
        triggerType NVARCHAR(20) NOT NULL DEFAULT 'MANUAL',
        triggeredByUserId INT NULL,
        startedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        finishedAt DATETIME2 NULL,
        newCount INT NOT NULL DEFAULT 0,
        receivedCount INT NOT NULL DEFAULT 0,
        insertedCount INT NOT NULL DEFAULT 0,
        duplicateCount INT NOT NULL DEFAULT 0,
        confirmedCount INT NOT NULL DEFAULT 0,
        errorMessage NVARCHAR(MAX) NULL,
        CONSTRAINT FK_AttendanceSyncRuns_Device FOREIGN KEY (deviceId) REFERENCES AttendanceDevices(id),
        CONSTRAINT FK_AttendanceSyncRuns_User FOREIGN KEY (triggeredByUserId) REFERENCES Users(id)
    );

    CREATE INDEX IX_AttendanceSyncRuns_DeviceStartedAt
        ON AttendanceSyncRuns (deviceId, startedAt DESC);
END
GO

IF NOT EXISTS (SELECT * FROM AttendanceDevices WHERE ipAddress = '192.168.108.201' AND port = 5005)
BEGIN
    INSERT INTO AttendanceDevices (
        name,
        branchName,
        protocol,
        ipAddress,
        port,
        passCode,
        isActive,
        syncEnabled,
        syncFrequencyMinutes,
        timeoutMs,
        retryCount,
        nextSyncAt
    )
    VALUES (
        N'HIP CMiF68S',
        NULL,
        'HIP_CMIF68S',
        '192.168.108.201',
        5005,
        '0',
        1,
        0,
        60,
        10000,
        2,
        GETDATE()
    );
END
GO
```

- [ ] **Step 2: Mirror the same table definitions in `database/schema.sql`**

Add the three `IF NOT EXISTS` blocks from Step 1 after the existing `SystemSettings` section in `database/schema.sql`, keeping the seed device block at the end. Do not remove existing schema blocks.

- [ ] **Step 3: Run migration in local/dev database**

Run the migration using the project's SQL Server tooling. If using SSMS, open `database/migrations/add_attendance_tables.sql` and execute against the dev `HRLeave` database.

Expected: no errors, and the three tables exist.

- [ ] **Step 4: Commit database schema changes**

```powershell
git add database/migrations/add_attendance_tables.sql database/schema.sql
git commit -m "Add attendance storage tables"
```

---

### Task 2: Add HIP Protocol Parser and Unit Tests

**Files:**
- Create: `src/lib/attendance/types.ts`
- Create: `src/lib/attendance/hip-protocol.ts`
- Test: `tests/hip-protocol.test.mjs`

- [ ] **Step 1: Write failing protocol tests**

Create `tests/hip-protocol.test.mjs`:

```js
import assert from 'node:assert/strict';
import {
    buildHipFrame,
    decodeHipRecord,
    parseNewCountResponse,
    verifyTypeFromCode,
} from '../src/lib/attendance/hip-protocol.ts';

function hex(buffer) {
    return Buffer.from(buffer).toString('hex');
}

assert.equal(
    hex(buildHipFrame({ cmd: 0xb4, field4: 6, field8: 0xffff0000, length: 0, seq: 0x1234 })),
    '55aa01b4060000000000ffff00003412',
    'B4 new-count frame should match HIP little-endian layout'
);

assert.equal(
    hex(buildHipFrame({ cmd: 0xa1, field4: 0, field8: 2, length: 40, seq: 0x0007 })),
    '55aa01a1000000000200000028000700',
    'A1 read-new frame should include new_count and byte length'
);

assert.equal(
    parseNewCountResponse(Buffer.from('aa550101020000003412', 'hex'), 0x1234),
    2,
    'B4 response should expose new_count'
);

assert.throws(
    () => parseNewCountResponse(Buffer.from('aa550101020000003412', 'hex'), 0x9999),
    /sequence/i,
    'B4 response with wrong sequence should fail'
);

assert.equal(verifyTypeFromCode(0x10), 'FP');
assert.equal(verifyTypeFromCode(0x40), 'FACE');
assert.equal(verifyTypeFromCode(0x30), 'UNKNOWN_0x30');
assert.equal(verifyTypeFromCode(0x99), 'UNKNOWN_0x99');

const faceRecord = Buffer.from('ce1f000001000036f961f2d50000000100000040', 'hex');
assert.deepEqual(
    decodeHipRecord(faceRecord, new Date('2026-06-18T10:00:00+07:00')),
    {
        userKey: 8142,
        employeeId: '8142',
        recordTime: '2026-06-18 15:53:54',
        rawRecordTime: '2026-06-18 15:53:54',
        yearCode: 505,
        verifyCode: 0x40,
        verifyType: 'FACE',
        recordHex: 'ce1f000001000036f961f2d50000000100000040',
    },
    'known FACE pcap record should decode to confirmed HIP Time 4.0 timestamp'
);

const fpRecord = Buffer.from('e10b000001000038f961f2d50000000100000010', 'hex');
assert.equal(decodeHipRecord(fpRecord).userKey, 3041, 'known FP pcap record user_key');
assert.equal(decodeHipRecord(fpRecord).verifyType, 'FP', 'known FP pcap record verify type');
assert.equal(decodeHipRecord(fpRecord).recordTime, '2026-06-18 15:53:56', 'known FP pcap timestamp');

console.log('hip protocol tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --experimental-strip-types tests/hip-protocol.test.mjs
```

Expected: FAIL because `src/lib/attendance/hip-protocol.ts` does not exist.

- [ ] **Step 3: Create attendance types**

Create `src/lib/attendance/types.ts`:

```ts
export type AttendanceProtocol = 'HIP_CMIF68S';
export type AttendanceVerifyType = 'FP' | 'FACE' | 'UNKNOWN_0x30' | `UNKNOWN_0x${string}`;
export type AttendanceSyncMode = 'INCREMENTAL' | 'BACKFILL' | 'TEST';
export type AttendanceSyncStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
export type AttendanceTriggerType = 'MANUAL' | 'CRON';

export interface AttendanceDevice {
    id: number;
    name: string;
    branchName: string | null;
    protocol: AttendanceProtocol;
    ipAddress: string;
    port: number;
    isActive: boolean;
    syncEnabled: boolean;
    syncFrequencyMinutes: number;
    timeoutMs: number;
    retryCount: number;
    hasPass: boolean;
    lastSyncAt: string | null;
    lastSuccessfulSyncAt: string | null;
    nextSyncAt: string | null;
    lastSyncStatus: string | null;
    lastError: string | null;
    lastNewCount: number | null;
    lastInsertedCount: number | null;
}

export interface AttendanceDeviceConfig extends AttendanceDevice {
    passCode: string;
}

export interface DecodedHipAttendanceRecord {
    userKey: number;
    employeeId: string;
    recordTime: string;
    rawRecordTime: string;
    yearCode: number;
    verifyCode: number;
    verifyType: AttendanceVerifyType;
    recordHex: string;
}

export interface AttendanceSyncResult {
    runId: number;
    status: AttendanceSyncStatus;
    newCount: number;
    receivedCount: number;
    insertedCount: number;
    duplicateCount: number;
    confirmedCount: number;
    errorMessage: string | null;
}
```

- [ ] **Step 4: Implement pure HIP protocol helpers**

Create `src/lib/attendance/hip-protocol.ts`:

```ts
import type { AttendanceVerifyType, DecodedHipAttendanceRecord } from './types';

const HIP_MAGIC_REQUEST = Buffer.from([0x55, 0xaa]);
const HIP_MAGIC_RESPONSE = Buffer.from([0xaa, 0x55]);
const HIP_VERSION = 0x01;
const HIP_YEAR_OFFSET = 1521;

export interface HipFrameInput {
    cmd: number;
    field4: number;
    field8: number;
    length: number;
    seq: number;
}

function toSqlDateTimeText(date: Date): string {
    const pad = (value: number) => value.toString().padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join('-') + ' ' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join(':');
}

function assertByte(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
        throw new Error(`${name} must be a byte`);
    }
}

function assertUInt16(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        throw new Error(`${name} must be uint16`);
    }
}

function assertUInt32(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new Error(`${name} must be uint32`);
    }
}

export function buildHipFrame(input: HipFrameInput): Buffer {
    assertByte('cmd', input.cmd);
    assertUInt32('field4', input.field4);
    assertUInt32('field8', input.field8);
    assertUInt16('length', input.length);
    assertUInt16('seq', input.seq);

    const frame = Buffer.alloc(16);
    HIP_MAGIC_REQUEST.copy(frame, 0);
    frame.writeUInt8(HIP_VERSION, 2);
    frame.writeUInt8(input.cmd, 3);
    frame.writeUInt32LE(input.field4, 4);
    frame.writeUInt32LE(input.field8, 8);
    frame.writeUInt16LE(input.length, 12);
    frame.writeUInt16LE(input.seq, 14);
    return frame;
}

export function parseNewCountResponse(response: Buffer, expectedSeq: number): number {
    if (response.length < 10) {
        throw new Error('HIP new-count response is shorter than 10 bytes');
    }

    if (!response.subarray(0, 2).equals(HIP_MAGIC_RESPONSE)) {
        throw new Error('HIP new-count response has invalid magic');
    }

    if (response.readUInt8(2) !== HIP_VERSION || response.readUInt8(3) !== 0x01) {
        throw new Error('HIP new-count response has invalid header');
    }

    const seq = response.readUInt16LE(8);
    if (seq !== expectedSeq) {
        throw new Error(`HIP new-count response sequence mismatch: expected ${expectedSeq}, got ${seq}`);
    }

    return response.readUInt32LE(4);
}

export function verifyTypeFromCode(verifyCode: number): AttendanceVerifyType {
    if (verifyCode === 0x10) return 'FP';
    if (verifyCode === 0x40) return 'FACE';
    if (verifyCode === 0x30) return 'UNKNOWN_0x30';
    return `UNKNOWN_0x${verifyCode.toString(16).toUpperCase().padStart(2, '0')}`;
}

export function decodeHipRecord(record: Buffer, now: Date = new Date()): DecodedHipAttendanceRecord {
    if (record.length !== 20) {
        throw new Error(`HIP attendance record must be 20 bytes, got ${record.length}`);
    }

    const userKey = record.readUInt32LE(0);
    const second = record.readUInt8(7);
    const timeBits = record.readUInt32LE(8);
    const yearCode = timeBits & 0x0fff;
    const month = (timeBits >> 12) & 0x0f;
    const day = (timeBits >> 16) & 0x1f;
    const hour = (timeBits >> 21) & 0x1f;
    const minute = (timeBits >> 26) & 0x3f;
    const verifyCode = record.readUInt32BE(16);
    const year = yearCode + HIP_YEAR_OFFSET;

    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
        throw new Error(`HIP attendance record has invalid datetime fields: yearCode=${yearCode}, month=${month}, day=${day}, hour=${hour}, minute=${minute}, second=${second}`);
    }

    const rawDate = new Date(year, month - 1, day, hour, minute, second);
    const rawRecordTime = toSqlDateTimeText(rawDate);

    const cappedDate = year > now.getFullYear()
        ? new Date(now.getFullYear(), month - 1, day, hour, minute, second)
        : rawDate;

    return {
        userKey,
        employeeId: String(userKey),
        recordTime: toSqlDateTimeText(cappedDate),
        rawRecordTime,
        yearCode,
        verifyCode,
        verifyType: verifyTypeFromCode(verifyCode),
        recordHex: record.toString('hex'),
    };
}

export function splitA1Records(response: Buffer, expectedCount: number): Buffer[] {
    if (expectedCount < 1) {
        return [];
    }

    const payloadStart = response.indexOf(HIP_MAGIC_REQUEST, 10);
    if (payloadStart < 0) {
        throw new Error('HIP A1 response does not contain payload magic 55aa');
    }

    const recordsStart = payloadStart + 2;
    const expectedBytes = expectedCount * 20;
    const availableBytes = response.length - recordsStart;
    if (availableBytes < expectedBytes) {
        throw new Error(`HIP A1 response payload is short: expected ${expectedBytes}, got ${availableBytes}`);
    }

    const records: Buffer[] = [];
    for (let offset = 0; offset < expectedBytes; offset += 20) {
        records.push(response.subarray(recordsStart + offset, recordsStart + offset + 20));
    }

    return records;
}
```

- [ ] **Step 5: Run protocol tests**

Run:

```powershell
node --experimental-strip-types tests/hip-protocol.test.mjs
```

Expected: `hip protocol tests passed`.

- [ ] **Step 6: Commit protocol helpers**

```powershell
git add src/lib/attendance/types.ts src/lib/attendance/hip-protocol.ts tests/hip-protocol.test.mjs
git commit -m "Add HIP attendance protocol decoder"
```

---

### Task 3: Add Attendance Repository and Summary Tests

**Files:**
- Create: `src/lib/attendance/repository.ts`
- Test: `tests/attendance-summary.test.mjs`

- [ ] **Step 1: Write failing daily summary test**

Create `tests/attendance-summary.test.mjs`:

```js
import assert from 'node:assert/strict';
import { summarizeDailyAttendanceRows } from '../src/lib/attendance/repository.ts';

const rows = [
    { attendanceDate: '2026-06-18', recordTime: '2026-06-18 15:53:54' },
    { attendanceDate: '2026-06-18', recordTime: '2026-06-18 08:31:12' },
    { attendanceDate: '2026-06-19', recordTime: '2026-06-19 08:44:01' },
];

assert.deepEqual(
    summarizeDailyAttendanceRows(rows),
    [
        { date: '2026-06-18', checkIn: '08:31', checkOut: '15:53' },
        { date: '2026-06-19', checkIn: '08:44', checkOut: null },
    ],
    'summary should group by date, sort records, and use first/last punch'
);

assert.deepEqual(
    summarizeDailyAttendanceRows([]),
    [],
    'summary should handle empty rows'
);

console.log('attendance summary tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --experimental-strip-types tests/attendance-summary.test.mjs
```

Expected: FAIL because `repository.ts` does not exist.

- [ ] **Step 3: Implement repository functions**

Create `src/lib/attendance/repository.ts`. Keep SQL parameterized and never return `passCode` from list APIs:

```ts
import sql from 'mssql';
import { getPool } from '@/lib/db';
import type {
    AttendanceDevice,
    AttendanceDeviceConfig,
    AttendanceSyncResult,
    AttendanceTriggerType,
    DecodedHipAttendanceRecord,
} from './types';

export interface AttendanceDaySummary {
    date: string;
    checkIn: string | null;
    checkOut: string | null;
}

interface AttendanceSummaryRow {
    attendanceDate: string;
    recordTime: string;
}

export function summarizeDailyAttendanceRows(rows: AttendanceSummaryRow[]): AttendanceDaySummary[] {
    const grouped = new Map<string, string[]>();

    for (const row of rows) {
        const list = grouped.get(row.attendanceDate) ?? [];
        list.push(row.recordTime);
        grouped.set(row.attendanceDate, list);
    }

    return [...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, recordTimes]) => {
            const sorted = [...recordTimes].sort();
            const first = sorted[0] ?? null;
            const last = sorted.length > 1 ? sorted[sorted.length - 1] : null;
            return {
                date,
                checkIn: first ? first.slice(11, 16) : null,
                checkOut: last ? last.slice(11, 16) : null,
            };
        });
}

function mapDevice(row: any): AttendanceDevice {
    return {
        id: row.id,
        name: row.name,
        branchName: row.branchName,
        protocol: row.protocol,
        ipAddress: row.ipAddress,
        port: row.port,
        isActive: Boolean(row.isActive),
        syncEnabled: Boolean(row.syncEnabled),
        syncFrequencyMinutes: row.syncFrequencyMinutes,
        timeoutMs: row.timeoutMs,
        retryCount: row.retryCount,
        hasPass: Boolean(row.hasPass),
        lastSyncAt: row.lastSyncAt,
        lastSuccessfulSyncAt: row.lastSuccessfulSyncAt,
        nextSyncAt: row.nextSyncAt,
        lastSyncStatus: row.lastSyncStatus,
        lastError: row.lastError,
        lastNewCount: row.lastNewCount,
        lastInsertedCount: row.lastInsertedCount,
    };
}

export async function listAttendanceDevices(): Promise<AttendanceDevice[]> {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT
            id,
            name,
            branchName,
            protocol,
            ipAddress,
            port,
            isActive,
            syncEnabled,
            syncFrequencyMinutes,
            timeoutMs,
            retryCount,
            CASE WHEN passCode IS NULL OR passCode = '' THEN 0 ELSE 1 END as hasPass,
            FORMAT(lastSyncAt, 'yyyy-MM-dd HH:mm:ss') as lastSyncAt,
            FORMAT(lastSuccessfulSyncAt, 'yyyy-MM-dd HH:mm:ss') as lastSuccessfulSyncAt,
            FORMAT(nextSyncAt, 'yyyy-MM-dd HH:mm:ss') as nextSyncAt,
            lastSyncStatus,
            lastError,
            lastNewCount,
            lastInsertedCount
        FROM AttendanceDevices
        ORDER BY isActive DESC, name ASC
    `);
    return result.recordset.map(mapDevice);
}

export async function getAttendanceDeviceConfig(deviceId: number): Promise<AttendanceDeviceConfig | null> {
    const pool = await getPool();
    const result = await pool.request()
        .input('deviceId', deviceId)
        .query(`
            SELECT
                id,
                name,
                branchName,
                protocol,
                ipAddress,
                port,
                ISNULL(passCode, '0') as passCode,
                isActive,
                syncEnabled,
                syncFrequencyMinutes,
                timeoutMs,
                retryCount,
                CASE WHEN passCode IS NULL OR passCode = '' THEN 0 ELSE 1 END as hasPass,
                FORMAT(lastSyncAt, 'yyyy-MM-dd HH:mm:ss') as lastSyncAt,
                FORMAT(lastSuccessfulSyncAt, 'yyyy-MM-dd HH:mm:ss') as lastSuccessfulSyncAt,
                FORMAT(nextSyncAt, 'yyyy-MM-dd HH:mm:ss') as nextSyncAt,
                lastSyncStatus,
                lastError,
                lastNewCount,
                lastInsertedCount
            FROM AttendanceDevices
            WHERE id = @deviceId
        `);
    return result.recordset[0] ?? null;
}

export async function upsertAttendanceDevice(input: {
    id?: number;
    name: string;
    branchName: string | null;
    ipAddress: string;
    port: number;
    passCode: string | null;
    isActive: boolean;
    syncEnabled: boolean;
    syncFrequencyMinutes: number;
    timeoutMs: number;
    retryCount: number;
}): Promise<number> {
    const pool = await getPool();
    const request = pool.request()
        .input('name', input.name)
        .input('branchName', input.branchName)
        .input('ipAddress', input.ipAddress)
        .input('port', input.port)
        .input('passCode', input.passCode || '0')
        .input('isActive', input.isActive ? 1 : 0)
        .input('syncEnabled', input.syncEnabled ? 1 : 0)
        .input('syncFrequencyMinutes', input.syncFrequencyMinutes)
        .input('timeoutMs', input.timeoutMs)
        .input('retryCount', input.retryCount);

    if (input.id) {
        const result = await request
            .input('id', input.id)
            .query(`
                UPDATE AttendanceDevices
                SET
                    name = @name,
                    branchName = @branchName,
                    ipAddress = @ipAddress,
                    port = @port,
                    passCode = @passCode,
                    isActive = @isActive,
                    syncEnabled = @syncEnabled,
                    syncFrequencyMinutes = @syncFrequencyMinutes,
                    timeoutMs = @timeoutMs,
                    retryCount = @retryCount,
                    nextSyncAt = CASE WHEN @syncEnabled = 1 THEN ISNULL(nextSyncAt, GETDATE()) ELSE nextSyncAt END,
                    updatedAt = GETDATE()
                OUTPUT inserted.id
                WHERE id = @id
            `);
        return result.recordset[0].id;
    }

    const result = await request.query(`
        INSERT INTO AttendanceDevices (
            name, branchName, protocol, ipAddress, port, passCode, isActive, syncEnabled,
            syncFrequencyMinutes, timeoutMs, retryCount, nextSyncAt
        )
        OUTPUT inserted.id
        VALUES (
            @name, @branchName, 'HIP_CMIF68S', @ipAddress, @port, @passCode, @isActive, @syncEnabled,
            @syncFrequencyMinutes, @timeoutMs, @retryCount,
            CASE WHEN @syncEnabled = 1 THEN GETDATE() ELSE NULL END
        )
    `);
    return result.recordset[0].id;
}

export async function createSyncRun(input: {
    deviceId: number;
    triggerType: AttendanceTriggerType;
    triggeredByUserId: number | null;
}): Promise<number> {
    const pool = await getPool();
    const result = await pool.request()
        .input('deviceId', input.deviceId)
        .input('triggerType', input.triggerType)
        .input('triggeredByUserId', input.triggeredByUserId)
        .query(`
            INSERT INTO AttendanceSyncRuns (deviceId, mode, status, triggerType, triggeredByUserId)
            OUTPUT inserted.id
            VALUES (@deviceId, 'INCREMENTAL', 'RUNNING', @triggerType, @triggeredByUserId)
        `);
    return result.recordset[0].id;
}

export async function tryAcquireDeviceSyncLock(deviceId: number, owner: string, lockMinutes = 15): Promise<boolean> {
    const pool = await getPool();
    const result = await pool.request()
        .input('deviceId', deviceId)
        .input('owner', owner)
        .input('lockMinutes', lockMinutes)
        .query(`
            UPDATE AttendanceDevices
            SET syncLockUntil = DATEADD(minute, @lockMinutes, GETDATE()),
                syncLockOwner = @owner,
                updatedAt = GETDATE()
            WHERE id = @deviceId
              AND (syncLockUntil IS NULL OR syncLockUntil < GETDATE())
        `);
    return (result.rowsAffected[0] ?? 0) === 1;
}

export async function releaseDeviceSyncLock(deviceId: number, owner: string): Promise<void> {
    const pool = await getPool();
    await pool.request()
        .input('deviceId', deviceId)
        .input('owner', owner)
        .query(`
            UPDATE AttendanceDevices
            SET syncLockUntil = NULL,
                syncLockOwner = NULL,
                updatedAt = GETDATE()
            WHERE id = @deviceId AND syncLockOwner = @owner
        `);
}

export async function insertAttendanceRecordsInTransaction(
    transaction: sql.Transaction,
    deviceId: number,
    records: DecodedHipAttendanceRecord[]
): Promise<{ insertedCount: number; duplicateCount: number }> {
    let insertedCount = 0;
    let duplicateCount = 0;

    for (const record of records) {
        const result = await new sql.Request(transaction)
            .input('deviceId', deviceId)
            .input('userKey', record.userKey)
            .input('employeeId', record.employeeId)
            .input('recordTime', record.recordTime)
            .input('rawRecordTime', record.rawRecordTime)
            .input('yearCode', record.yearCode)
            .input('verifyCode', record.verifyCode)
            .input('verifyType', record.verifyType)
            .input('recordHex', record.recordHex)
            .query(`
                IF NOT EXISTS (
                    SELECT 1
                    FROM AttendanceLogs WITH (UPDLOCK, HOLDLOCK)
                    WHERE deviceId = @deviceId
                      AND userKey = @userKey
                      AND recordTime = @recordTime
                      AND verifyType = @verifyType
                      AND recordHex = @recordHex
                )
                BEGIN
                    INSERT INTO AttendanceLogs (
                        deviceId, userKey, employeeId, recordTime, rawRecordTime,
                        yearCode, verifyCode, verifyType, recordHex, sourceCommand
                    )
                    VALUES (
                        @deviceId, @userKey, @employeeId, @recordTime, @rawRecordTime,
                        @yearCode, @verifyCode, @verifyType, @recordHex, 'A1'
                    );
                    SELECT CAST(1 AS INT) as inserted;
                END
                ELSE
                BEGIN
                    SELECT CAST(0 AS INT) as inserted;
                END
            `);

        if (result.recordset[0].inserted === 1) {
            insertedCount += 1;
        } else {
            duplicateCount += 1;
        }
    }

    return { insertedCount, duplicateCount };
}

export async function finishSyncRun(input: AttendanceSyncResult): Promise<void> {
    const pool = await getPool();
    await pool.request()
        .input('runId', input.runId)
        .input('status', input.status)
        .input('newCount', input.newCount)
        .input('receivedCount', input.receivedCount)
        .input('insertedCount', input.insertedCount)
        .input('duplicateCount', input.duplicateCount)
        .input('confirmedCount', input.confirmedCount)
        .input('errorMessage', input.errorMessage)
        .query(`
            UPDATE AttendanceSyncRuns
            SET status = @status,
                finishedAt = GETDATE(),
                newCount = @newCount,
                receivedCount = @receivedCount,
                insertedCount = @insertedCount,
                duplicateCount = @duplicateCount,
                confirmedCount = @confirmedCount,
                errorMessage = @errorMessage
            WHERE id = @runId
        `);
}

export async function updateDeviceSyncStatus(deviceId: number, result: AttendanceSyncResult): Promise<void> {
    const pool = await getPool();
    await pool.request()
        .input('deviceId', deviceId)
        .input('status', result.status)
        .input('lastError', result.errorMessage)
        .input('lastNewCount', result.newCount)
        .input('lastInsertedCount', result.insertedCount)
        .query(`
            UPDATE AttendanceDevices
            SET lastSyncAt = GETDATE(),
                lastSuccessfulSyncAt = CASE WHEN @status IN ('SUCCESS', 'SKIPPED') THEN GETDATE() ELSE lastSuccessfulSyncAt END,
                nextSyncAt = CASE WHEN syncEnabled = 1 THEN DATEADD(minute, syncFrequencyMinutes, GETDATE()) ELSE nextSyncAt END,
                lastSyncStatus = @status,
                lastError = @lastError,
                lastNewCount = @lastNewCount,
                lastInsertedCount = @lastInsertedCount,
                updatedAt = GETDATE()
            WHERE id = @deviceId
        `);
}

export async function listDueAttendanceDevices(): Promise<AttendanceDeviceConfig[]> {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT TOP 10
            id,
            name,
            branchName,
            protocol,
            ipAddress,
            port,
            ISNULL(passCode, '0') as passCode,
            isActive,
            syncEnabled,
            syncFrequencyMinutes,
            timeoutMs,
            retryCount,
            CASE WHEN passCode IS NULL OR passCode = '' THEN 0 ELSE 1 END as hasPass,
            FORMAT(lastSyncAt, 'yyyy-MM-dd HH:mm:ss') as lastSyncAt,
            FORMAT(lastSuccessfulSyncAt, 'yyyy-MM-dd HH:mm:ss') as lastSuccessfulSyncAt,
            FORMAT(nextSyncAt, 'yyyy-MM-dd HH:mm:ss') as nextSyncAt,
            lastSyncStatus,
            lastError,
            lastNewCount,
            lastInsertedCount
        FROM AttendanceDevices
        WHERE isActive = 1
          AND syncEnabled = 1
          AND (nextSyncAt IS NULL OR nextSyncAt <= GETDATE())
        ORDER BY ISNULL(nextSyncAt, '1900-01-01') ASC
    `);
    return result.recordset;
}

export async function getEmployeeAttendanceSummary(input: {
    employeeId: string;
    fromDate: string;
    toDate: string;
    checkInFrom?: string | null;
}): Promise<AttendanceDaySummary[]> {
    const pool = await getPool();
    const result = await pool.request()
        .input('employeeId', input.employeeId)
        .input('fromDate', input.fromDate)
        .input('toDate', input.toDate)
        .input('checkInFrom', input.checkInFrom ?? null)
        .query(`
            WITH Daily AS (
                SELECT
                    CONVERT(varchar, recordTime, 23) as attendanceDate,
                    FORMAT(recordTime, 'yyyy-MM-dd HH:mm:ss') as recordTime
                FROM AttendanceLogs
                WHERE employeeId = @employeeId
                  AND recordTime >= @fromDate
                  AND recordTime < DATEADD(day, 1, @toDate)
            ),
            FirstPunch AS (
                SELECT attendanceDate, MIN(recordTime) as firstRecordTime
                FROM Daily
                GROUP BY attendanceDate
            )
            SELECT d.attendanceDate, d.recordTime
            FROM Daily d
            INNER JOIN FirstPunch fp ON fp.attendanceDate = d.attendanceDate
            WHERE @checkInFrom IS NULL OR CONVERT(varchar(5), CAST(fp.firstRecordTime AS datetime2), 108) >= @checkInFrom
            ORDER BY d.attendanceDate ASC, d.recordTime ASC
        `);
    return summarizeDailyAttendanceRows(result.recordset);
}
```

- [ ] **Step 4: Run summary tests**

Run:

```powershell
node --experimental-strip-types tests/attendance-summary.test.mjs
```

Expected: `attendance summary tests passed`.

- [ ] **Step 5: Commit repository**

```powershell
git add src/lib/attendance/repository.ts tests/attendance-summary.test.mjs
git commit -m "Add attendance repository helpers"
```

---

### Task 4: Add HIP TCP Client and Sync Service

**Files:**
- Create: `src/lib/attendance/hip-client.ts`
- Create: `src/lib/attendance/sync-service.ts`
- Modify: `src/lib/attendance/repository.ts`

- [ ] **Step 1: Implement TCP client**

Create `src/lib/attendance/hip-client.ts`:

```ts
import net from 'node:net';
import { buildHipFrame, decodeHipRecord, parseNewCountResponse, splitA1Records } from './hip-protocol';
import type { DecodedHipAttendanceRecord } from './types';

export interface HipClientConfig {
    ipAddress: string;
    port: number;
    timeoutMs: number;
}

export interface HipIncrementalClient {
    testConnection(): Promise<void>;
    getNewCount(): Promise<number>;
    readNewRecords(newCount: number): Promise<DecodedHipAttendanceRecord[]>;
    confirmRead(newCount: number): Promise<void>;
}

export class HipCmif68sClient implements HipIncrementalClient {
    private seq = 1;

    constructor(private readonly config: HipClientConfig) {}

    async testConnection(): Promise<void> {
        await this.sendFrame(buildHipFrame({
            cmd: 0xb4,
            field4: 6,
            field8: 0xffff0000,
            length: 0,
            seq: this.nextSeq(),
        }), 10);
    }

    async getNewCount(): Promise<number> {
        const seq = this.nextSeq();
        const response = await this.sendFrame(buildHipFrame({
            cmd: 0xb4,
            field4: 6,
            field8: 0xffff0000,
            length: 0,
            seq,
        }), 10);
        return parseNewCountResponse(response, seq);
    }

    async readNewRecords(newCount: number): Promise<DecodedHipAttendanceRecord[]> {
        if (!Number.isInteger(newCount) || newCount < 1) {
            return [];
        }

        const response = await this.sendFrame(buildHipFrame({
            cmd: 0xa1,
            field4: 0,
            field8: newCount,
            length: newCount * 20,
            seq: this.nextSeq(),
        }), 10 + 2 + (newCount * 20));

        return splitA1Records(response, newCount).map((record) => decodeHipRecord(record));
    }

    async confirmRead(newCount: number): Promise<void> {
        if (!Number.isInteger(newCount) || newCount < 1) {
            return;
        }

        await this.sendFrame(buildHipFrame({
            cmd: 0xa2,
            field4: newCount,
            field8: 0xffff0000,
            length: 0,
            seq: this.nextSeq(),
        }), 10);
    }

    private nextSeq(): number {
        const current = this.seq;
        this.seq = this.seq >= 0xffff ? 1 : this.seq + 1;
        return current;
    }

    private sendFrame(frame: Buffer, minimumBytes: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            const socket = net.createConnection({
                host: this.config.ipAddress,
                port: this.config.port,
            });

            const cleanup = () => {
                socket.removeAllListeners();
                socket.destroy();
            };

            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(`HIP TCP timeout after ${this.config.timeoutMs}ms`));
            }, this.config.timeoutMs);

            socket.on('connect', () => {
                socket.write(frame);
            });

            socket.on('data', (chunk) => {
                chunks.push(chunk);
                const combined = Buffer.concat(chunks);
                if (combined.length >= minimumBytes) {
                    clearTimeout(timer);
                    cleanup();
                    resolve(combined);
                }
            });

            socket.on('error', (error) => {
                clearTimeout(timer);
                cleanup();
                reject(error);
            });
        });
    }
}
```

- [ ] **Step 2: Implement sync service**

Create `src/lib/attendance/sync-service.ts`:

```ts
import sql from 'mssql';
import { getPool } from '@/lib/db';
import type { AttendanceDeviceConfig, AttendanceSyncResult, AttendanceTriggerType } from './types';
import { HipCmif68sClient, type HipIncrementalClient } from './hip-client';
import {
    createSyncRun,
    finishSyncRun,
    getAttendanceDeviceConfig,
    insertAttendanceRecordsInTransaction,
    releaseDeviceSyncLock,
    tryAcquireDeviceSyncLock,
    updateDeviceSyncStatus,
} from './repository';

export interface RunAttendanceSyncInput {
    deviceId: number;
    triggerType: AttendanceTriggerType;
    triggeredByUserId: number | null;
    client?: HipIncrementalClient;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function buildClient(device: AttendanceDeviceConfig): HipIncrementalClient {
    if (device.protocol !== 'HIP_CMIF68S') {
        throw new Error(`Unsupported attendance protocol: ${device.protocol}`);
    }

    return new HipCmif68sClient({
        ipAddress: device.ipAddress,
        port: device.port,
        timeoutMs: device.timeoutMs,
    });
}

export async function runAttendanceIncrementalSync(input: RunAttendanceSyncInput): Promise<AttendanceSyncResult> {
    const owner = `attendance-sync-${process.pid}-${Date.now()}`;
    const device = await getAttendanceDeviceConfig(input.deviceId);
    if (!device) {
        throw new Error('Attendance device not found');
    }

    const locked = await tryAcquireDeviceSyncLock(device.id, owner);
    if (!locked) {
        const result: AttendanceSyncResult = {
            runId: 0,
            status: 'SKIPPED',
            newCount: 0,
            receivedCount: 0,
            insertedCount: 0,
            duplicateCount: 0,
            confirmedCount: 0,
            errorMessage: 'Device sync is already running',
        };
        return result;
    }

    const runId = await createSyncRun({
        deviceId: device.id,
        triggerType: input.triggerType,
        triggeredByUserId: input.triggeredByUserId,
    });

    let finalResult: AttendanceSyncResult = {
        runId,
        status: 'FAILED',
        newCount: 0,
        receivedCount: 0,
        insertedCount: 0,
        duplicateCount: 0,
        confirmedCount: 0,
        errorMessage: null,
    };

    try {
        const client = input.client ?? buildClient(device);
        const newCount = await client.getNewCount();
        finalResult.newCount = newCount;

        if (newCount === 0) {
            finalResult = { ...finalResult, status: 'SUCCESS' };
            await finishSyncRun(finalResult);
            await updateDeviceSyncStatus(device.id, finalResult);
            return finalResult;
        }

        const records = await client.readNewRecords(newCount);
        finalResult.receivedCount = records.length;

        if (records.length !== newCount) {
            throw new Error(`HIP returned ${records.length} records but new_count was ${newCount}`);
        }

        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const insertResult = await insertAttendanceRecordsInTransaction(transaction, device.id, records);
            finalResult.insertedCount = insertResult.insertedCount;
            finalResult.duplicateCount = insertResult.duplicateCount;
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        await client.confirmRead(newCount);
        finalResult = {
            ...finalResult,
            status: 'SUCCESS',
            confirmedCount: newCount,
        };

        await finishSyncRun(finalResult);
        await updateDeviceSyncStatus(device.id, finalResult);
        return finalResult;
    } catch (error) {
        finalResult = {
            ...finalResult,
            status: 'FAILED',
            errorMessage: errorMessage(error),
        };
        await finishSyncRun(finalResult);
        await updateDeviceSyncStatus(device.id, finalResult);
        return finalResult;
    } finally {
        await releaseDeviceSyncLock(device.id, owner);
    }
}
```

- [ ] **Step 3: Add service-level fake-client test before using live hardware**

Add a small test later when repository functions are injectable. For this first pass, do not connect to the live HIP device from automated tests; live TCP is verified manually from the admin page and API.

- [ ] **Step 4: Commit sync client/service**

```powershell
git add src/lib/attendance/hip-client.ts src/lib/attendance/sync-service.ts
git commit -m "Add HIP incremental sync service"
```

---

### Task 5: Add System Admin Attendance APIs

**Files:**
- Create: `src/app/api/admin/attendance/devices/route.ts`
- Create: `src/app/api/admin/attendance/devices/[deviceId]/test/route.ts`
- Create: `src/app/api/admin/attendance/devices/[deviceId]/sync/route.ts`
- Create: `src/app/api/admin/attendance/sync-runs/route.ts`
- Modify: `src/lib/audit.ts`

- [ ] **Step 1: Extend audit action/table unions**

Modify `src/lib/audit.ts`:

```ts
export type AuditAction =
    | 'LOGIN'
    // keep existing actions
    | 'CREATE_ATTENDANCE_DEVICE'
    | 'UPDATE_ATTENDANCE_DEVICE'
    | 'TEST_ATTENDANCE_DEVICE'
    | 'SYNC_ATTENDANCE_DEVICE';

export type TargetTable =
    | 'Users'
    // keep existing target tables
    | 'AttendanceDevices'
    | 'AttendanceSyncRuns';
```

Also add Thai display labels in `getActionDisplayName()`:

```ts
'CREATE_ATTENDANCE_DEVICE': 'เพิ่มเครื่องบันทึกเวลา',
'UPDATE_ATTENDANCE_DEVICE': 'แก้ไขเครื่องบันทึกเวลา',
'TEST_ATTENDANCE_DEVICE': 'ทดสอบเครื่องบันทึกเวลา',
'SYNC_ATTENDANCE_DEVICE': 'ซิงก์เครื่องบันทึกเวลา',
```

- [ ] **Step 2: Create devices API**

Create `src/app/api/admin/attendance/devices/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { logAudit } from '@/lib/audit';
import { listAttendanceDevices, upsertAttendanceDevice } from '@/lib/attendance/repository';

function isAdmin(session: Awaited<ReturnType<typeof auth>>): boolean {
    return session?.user?.role === 'ADMIN';
}

function parseBoolean(value: unknown): boolean {
    return value === true || value === 'true' || value === 1;
}

function parseNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function validateDeviceBody(body: any) {
    const name = String(body.name || '').trim();
    const branchName = String(body.branchName || '').trim() || null;
    const ipAddress = String(body.ipAddress || '').trim();
    const port = parseNumber(body.port, 5005);
    const syncFrequencyMinutes = parseNumber(body.syncFrequencyMinutes, 60);
    const timeoutMs = parseNumber(body.timeoutMs, 10000);
    const retryCount = parseNumber(body.retryCount, 2);

    if (!name) throw new Error('กรุณาระบุชื่อเครื่อง');
    if (!ipAddress) throw new Error('กรุณาระบุ IP address');
    if (port < 1 || port > 65535) throw new Error('Port ต้องอยู่ระหว่าง 1-65535');
    if (![15, 30, 60, 120].includes(syncFrequencyMinutes)) throw new Error('ความถี่ Sync ต้องเป็น 15, 30, 60 หรือ 120 นาที');
    if (timeoutMs < 1000 || timeoutMs > 60000) throw new Error('Timeout ต้องอยู่ระหว่าง 1000-60000 ms');
    if (retryCount < 0 || retryCount > 5) throw new Error('Retry ต้องอยู่ระหว่าง 0-5 ครั้ง');

    return {
        id: body.id ? parseNumber(body.id, 0) : undefined,
        name,
        branchName,
        ipAddress,
        port,
        passCode: String(body.passCode ?? '0').trim() || '0',
        isActive: parseBoolean(body.isActive),
        syncEnabled: parseBoolean(body.syncEnabled),
        syncFrequencyMinutes,
        timeoutMs,
        retryCount,
    };
}

export async function GET() {
    const session = await auth();
    if (!isAdmin(session)) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const devices = await listAttendanceDevices();
    return NextResponse.json({ success: true, devices });
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!isAdmin(session)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const device = validateDeviceBody(body);
        const id = await upsertAttendanceDevice(device);

        await logAudit({
            userId: Number(session.user.id),
            action: device.id ? 'UPDATE_ATTENDANCE_DEVICE' : 'CREATE_ATTENDANCE_DEVICE',
            targetTable: 'AttendanceDevices',
            targetId: id,
            newValue: { ...device, passCode: device.passCode ? '[hidden]' : null },
        });

        return NextResponse.json({ success: true, id });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save attendance device';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
```

- [ ] **Step 3: Create test connection API**

Create `src/app/api/admin/attendance/devices/[deviceId]/test/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { logAudit } from '@/lib/audit';
import { getAttendanceDeviceConfig } from '@/lib/attendance/repository';
import { HipCmif68sClient } from '@/lib/attendance/hip-client';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
    const session = await auth();
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { deviceId } = await params;
    const id = Number(deviceId);
    const device = await getAttendanceDeviceConfig(id);
    if (!device) {
        return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const client = new HipCmif68sClient({
        ipAddress: device.ipAddress,
        port: device.port,
        timeoutMs: device.timeoutMs,
    });

    try {
        await client.testConnection();
        await logAudit({
            userId: Number(session.user.id),
            action: 'TEST_ATTENDANCE_DEVICE',
            targetTable: 'AttendanceDevices',
            targetId: id,
            newValue: { result: 'SUCCESS' },
        });
        return NextResponse.json({ success: true, message: 'เชื่อมต่อเครื่องสำเร็จ' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection test failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
```

- [ ] **Step 4: Create manual sync API**

Create `src/app/api/admin/attendance/devices/[deviceId]/sync/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { logAudit } from '@/lib/audit';
import { runAttendanceIncrementalSync } from '@/lib/attendance/sync-service';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
    const session = await auth();
    if (session?.user?.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { deviceId } = await params;
    const result = await runAttendanceIncrementalSync({
        deviceId: Number(deviceId),
        triggerType: 'MANUAL',
        triggeredByUserId: Number(session.user.id),
    });

    await logAudit({
        userId: Number(session.user.id),
        action: 'SYNC_ATTENDANCE_DEVICE',
        targetTable: 'AttendanceSyncRuns',
        targetId: result.runId || null,
        newValue: result,
    });

    return NextResponse.json({ success: result.status !== 'FAILED', result });
}
```

- [ ] **Step 5: Create sync runs API**

Create `src/app/api/admin/attendance/sync-runs/route.ts` with admin-only access and pagination. Query:

```sql
SELECT TOP 50
    sr.id,
    sr.deviceId,
    d.name as deviceName,
    sr.mode,
    sr.status,
    sr.triggerType,
    sr.startedAt,
    sr.finishedAt,
    sr.newCount,
    sr.receivedCount,
    sr.insertedCount,
    sr.duplicateCount,
    sr.confirmedCount,
    sr.errorMessage
FROM AttendanceSyncRuns sr
INNER JOIN AttendanceDevices d ON d.id = sr.deviceId
ORDER BY sr.startedAt DESC
```

Return `{ success: true, runs: recordset }`.

- [ ] **Step 6: Commit APIs**

```powershell
git add src/lib/audit.ts src/app/api/admin/attendance
git commit -m "Add attendance admin APIs"
```

---

### Task 6: Add Scheduled Attendance Sync Endpoint

**Files:**
- Create: `src/app/api/cron/attendance-sync/route.ts`

- [ ] **Step 1: Create cron API**

Create `src/app/api/cron/attendance-sync/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { listDueAttendanceDevices } from '@/lib/attendance/repository';
import { runAttendanceIncrementalSync } from '@/lib/attendance/sync-service';

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return process.env.NODE_ENV !== 'production';
    }
    return request.headers.get('x-cron-secret') === secret;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const devices = await listDueAttendanceDevices();
    const results = [];

    for (const device of devices) {
        const result = await runAttendanceIncrementalSync({
            deviceId: device.id,
            triggerType: 'CRON',
            triggeredByUserId: null,
        });
        results.push({ deviceId: device.id, deviceName: device.name, ...result });
    }

    return NextResponse.json({
        success: true,
        count: results.length,
        results,
    });
}
```

- [ ] **Step 2: Document production scheduler command**

Add to `DEVELOPER_HANDOFF.md` after implementation:

```text
Production should call GET /api/cron/attendance-sync every 5-15 minutes.
Each device decides whether it is due using AttendanceDevices.nextSyncAt and syncFrequencyMinutes.
Set CRON_SECRET and send x-cron-secret in production.
```

- [ ] **Step 3: Commit cron API**

```powershell
git add src/app/api/cron/attendance-sync/route.ts
git commit -m "Add attendance cron sync endpoint"
```

---

### Task 7: Add System Admin Device UI

**Files:**
- Create: `src/app/(dashboard)/admin/attendance-devices/page.tsx`
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add sidebar link**

In `src/components/layout/sidebar.tsx`, import `Fingerprint` from `lucide-react` and add to `adminNavItems`:

```tsx
{ href: '/admin/attendance-devices', label: 'เครื่องบันทึกเวลา', icon: <Fingerprint className="w-5 h-5" />, roles: [UserRole.ADMIN] },
```

- [ ] **Step 2: Create admin page**

Create `src/app/(dashboard)/admin/attendance-devices/page.tsx` as a client page using the same card/table pattern as `admin/audit-logs` and `admin/rate-limit`.

Required state:

```ts
interface AttendanceDevice {
    id: number;
    name: string;
    branchName: string | null;
    ipAddress: string;
    port: number;
    isActive: boolean;
    syncEnabled: boolean;
    syncFrequencyMinutes: number;
    timeoutMs: number;
    retryCount: number;
    hasPass: boolean;
    lastSyncAt: string | null;
    lastSuccessfulSyncAt: string | null;
    nextSyncAt: string | null;
    lastSyncStatus: string | null;
    lastError: string | null;
    lastNewCount: number | null;
    lastInsertedCount: number | null;
}

interface DeviceForm {
    id?: number;
    name: string;
    branchName: string;
    ipAddress: string;
    port: number;
    passCode: string;
    isActive: boolean;
    syncEnabled: boolean;
    syncFrequencyMinutes: number;
    timeoutMs: number;
    retryCount: number;
}
```

Required UI:
- Header: `เครื่องบันทึกเวลา`
- Primary button: `เพิ่มเครื่อง`
- Device table columns: เครื่อง, สาขา, IP/Port, Sync, สถานะล่าสุด, Actions
- Actions: edit, test connection, sync now
- Form fields: name, branchName, ipAddress, port, passCode password input with placeholder `0`, syncEnabled toggle, frequency select `15/30/60/120`, timeoutMs, retryCount, isActive toggle
- Sync log panel below table showing latest 50 runs from `/api/admin/attendance/sync-runs`

Use message banners like `admin/rate-limit/page.tsx` for success/error. Do not display raw pass after save; leave the password input empty on edit and label it `ปล่อยว่างเพื่อใช้ค่าเดิม`.

- [ ] **Step 3: Manual UI smoke test**

Start dev server:

```powershell
npm run dev
```

Open `/admin/attendance-devices` with an ADMIN account.

Expected:
- Non-admin users see permission denied.
- ADMIN sees seeded `HIP CMiF68S` device.
- Save works without entering pass.
- Test connection shows success or a clear TCP error.
- Sync now shows counts from sync result.

- [ ] **Step 4: Commit admin UI**

```powershell
git add src/components/layout/sidebar.tsx "src/app/(dashboard)/admin/attendance-devices/page.tsx"
git commit -m "Add attendance device admin UI"
```

---

### Task 8: Add Employee Attendance API and UI

**Files:**
- Create: `src/app/api/attendance/me/route.ts`
- Create: `src/app/(dashboard)/attendance/page.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create employee self API**

Create `src/app/api/attendance/me/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getEmployeeAttendanceSummary } from '@/lib/attendance/repository';

function dateOnly(value: Date): string {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function startOfCurrentMonth(): string {
    const now = new Date();
    return dateOnly(new Date(now.getFullYear(), now.getMonth(), 1));
}

function today(): string {
    return dateOnly(new Date());
}

function isValidDateText(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimeText(value: string): boolean {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.employeeId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || startOfCurrentMonth();
    const to = searchParams.get('to') || today();
    const checkInFrom = searchParams.get('checkInFrom');

    if (!isValidDateText(from) || !isValidDateText(to)) {
        return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }

    if (checkInFrom && !isValidTimeText(checkInFrom)) {
        return NextResponse.json({ error: 'Invalid check-in time filter' }, { status: 400 });
    }

    const days = await getEmployeeAttendanceSummary({
        employeeId: session.user.employeeId,
        fromDate: from,
        toDate: to,
        checkInFrom,
    });

    return NextResponse.json({ success: true, days });
}
```

- [ ] **Step 2: Add employee sidebar link**

In `src/components/layout/sidebar.tsx`, import `Clock3` and add to `navItems` after dashboard:

```tsx
{ href: '/attendance', label: 'เวลาเข้า-ออก', icon: <Clock3 className="w-5 h-5" /> },
```

- [ ] **Step 3: Create employee attendance page**

Create `src/app/(dashboard)/attendance/page.tsx` as a client page.

Required UI:
- Header `เวลาเข้า-ออก`
- Filter row:
  - month input or month select default current month
  - date from
  - date to
  - check-in from time input
  - clear filter button
- Table columns only:
  - `วันที่`
  - `เวลาเข้า`
  - `เวลาออก`
- Empty state: `ยังไม่พบข้อมูลเวลาเข้า-ออก`

Do not render device/source/sync fields.

- [ ] **Step 4: Add dashboard today card**

In `src/app/(dashboard)/dashboard/page.tsx`, add a small card below the welcome header or above recent leave requests:

```tsx
<div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
    <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900 dark:text-white">เวลาเข้า-ออกวันนี้</h2>
        </div>
        <Link href="/attendance" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            ดูย้อนหลัง
        </Link>
    </div>
    <div className="grid grid-cols-2 gap-4">
        <div>
            <p className="text-sm text-gray-500">เวลาเข้า</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayAttendance?.checkIn ?? '--:--'}</p>
        </div>
        <div>
            <p className="text-sm text-gray-500">เวลาออก</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{todayAttendance?.checkOut ?? '--:--'}</p>
        </div>
    </div>
</div>
```

Fetch today's summary server-side using `getEmployeeAttendanceSummary({ employeeId: session.user.employeeId, fromDate: today, toDate: today })`.

- [ ] **Step 5: Commit employee UI**

```powershell
git add src/app/api/attendance/me/route.ts "src/app/(dashboard)/attendance/page.tsx" "src/app/(dashboard)/dashboard/page.tsx" src/components/layout/sidebar.tsx
git commit -m "Add employee attendance view"
```

---

### Task 9: Verify Live HIP Sync and Employee Mapping

**Files:**
- No required source changes unless verification reveals employee ID mapping mismatch.

- [ ] **Step 1: Confirm local tests**

Run:

```powershell
node --experimental-strip-types tests/hip-protocol.test.mjs
node --experimental-strip-types tests/attendance-summary.test.mjs
npm run lint
```

Expected:
- Both tests pass.
- Lint passes or only reports pre-existing warnings already present before this work.

- [ ] **Step 2: Test connection from UI**

Use ADMIN account on `/admin/attendance-devices`.

Expected:
- `ทดสอบการเชื่อมต่อ` reaches `192.168.108.201:5005`.
- Failure message is visible and not raw stack trace if the server cannot reach the device.

- [ ] **Step 3: Run manual incremental sync**

Click `Sync now`.

Expected:
- If HIP `new_count = 0`, a sync run appears with status `SUCCESS`, `newCount=0`, `confirmedCount=0`.
- If `new_count > 0`, `AttendanceLogs` receives rows and sync run shows `confirmedCount = newCount`.
- `0xA2` is not sent if DB insert/commit fails.

- [ ] **Step 4: Verify employee mapping**

Run SQL for a known HIP user key:

```sql
SELECT TOP 20 userKey, employeeId, recordTime, verifyType
FROM AttendanceLogs
ORDER BY recordTime DESC;

SELECT id, employeeId, firstName, lastName
FROM Users
WHERE employeeId IN (
    SELECT DISTINCT employeeId
    FROM AttendanceLogs
);
```

Expected: `AttendanceLogs.employeeId` matches `Users.employeeId` for at least the pilot employees. If not, stop before release and add a small mapping table in a follow-up plan; do not guess mappings in code.

- [ ] **Step 5: Verify employee UI**

Login as an employee whose `Users.employeeId` matches an attendance `userKey`.

Expected:
- `/dashboard` shows today's check-in/out if logs exist for today.
- `/attendance` defaults to current month.
- Employee table columns are only `วันที่`, `เวลาเข้า`, `เวลาออก`.
- Filter `เวลาเข้า ตั้งแต่ 08:45` filters days by first punch time.
- Employee cannot see another employee's attendance by changing query params.

---

### Task 10: Update Documentation and Final Verification

**Files:**
- Modify: `DEVELOPER_HANDOFF.md`
- Modify: `README.md` if local setup instructions need the attendance migration called out.

- [ ] **Step 1: Update developer handoff**

Add an attendance section to `DEVELOPER_HANDOFF.md`:

```markdown
### Attendance / HIP CMiF68S

- System Admin config page: `/admin/attendance-devices`
- Employee self view: `/attendance`
- Device protocol: HIP CMiF68S custom TCP, not node-zklib
- Incremental flow: B4 field4=6 -> A1 -> DB transaction/dedupe -> A2 only after commit
- Employee UI intentionally shows only date/check-in/check-out
- Phase 1 does not calculate late status, shifts, working hours, or leave effects
- Production scheduler should call `/api/cron/attendance-sync` regularly with `x-cron-secret` when `CRON_SECRET` is set
```

- [ ] **Step 2: Run final verification**

Run:

```powershell
node --experimental-strip-types tests/hip-protocol.test.mjs
node --experimental-strip-types tests/attendance-summary.test.mjs
npm run lint
npm run build
```

Expected:
- Tests pass.
- Lint passes.
- Build passes.

- [ ] **Step 3: Final commit**

```powershell
git add DEVELOPER_HANDOFF.md README.md
git commit -m "Document attendance sync module"
```

---

## Production Notes

- Apply `database/migrations/add_attendance_tables.sql` to production before deploying code.
- Production server must be able to reach HIP devices over TCP, for example `192.168.108.201:5005`.
- Configure `CRON_SECRET` in production and call `GET /api/cron/attendance-sync` with header `x-cron-secret`.
- Start with sync frequency `60` minutes. After observing sync duration and device behavior, reduce to `30` or `15` minutes if stable.
- Keep System Admin-only access for device IP, pass, manual sync, and sync logs.
- Do not expose device name/source/sync timestamp on employee pages.

## Self-Review

- Spec coverage: device config, incremental protocol, DB dedupe, DB-before-A2 safety, admin UI, employee UI, filters, cron, and docs are covered.
- Scope check: late/normal/early, shift support, work-hour calculation, leave integration, HR reports, and work-schedule changes are intentionally excluded.
- Risk: employee matching assumes HIP `user_key` equals `Users.employeeId` when converted to text. Task 9 explicitly verifies this with real data before release.
