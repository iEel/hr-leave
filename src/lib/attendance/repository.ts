import type { Transaction } from 'mssql';
import {
    DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS,
    summarizeDailyAttendanceRowsWithSchedule,
    type AttendanceDaySummary,
    type AttendanceScheduleSettings,
    type AttendanceSummaryContext,
    type DailyAttendanceRow,
    type WorkingSaturdaySchedule,
} from './schedule-rules';
import type {
    AttendanceDeviceConfig,
    AttendanceProtocol,
    AttendanceSyncMode,
    AttendanceSyncStatus,
    AttendanceTriggerType,
    DecodedHipAttendanceRecord,
} from './types';


export type {
    AttendanceDaySummary,
    AttendanceScheduleSettings,
    AttendanceSummaryContext,
    DailyAttendanceRow,
    WorkingSaturdaySchedule,
} from './schedule-rules';

export interface AttendanceDeviceListItem {
    id: number;
    name: string;
    branchName: string | null;
    protocol: AttendanceProtocol;
    host: string;
    port: number;
    hasPass: boolean;
    isActive: boolean;
    syncEnabled: boolean;
    syncFrequencyMinutes: number;
    timeoutMs: number;
    retryCount: number;
    lastSyncAt: string | null;
    lastSuccessfulSyncAt: string | null;
    nextSyncAt: string | null;
    lastSyncStatus: AttendanceSyncStatus | null;
    lastError: string | null;
    lastNewCount: number | null;
    lastInsertedCount: number | null;
}

export interface AttendanceDeviceConfigRecord extends AttendanceDeviceListItem {
    passCode: string;
    config: AttendanceDeviceConfig;
}

export interface UpsertAttendanceDeviceInput {
    id?: number | string | null;
    name: string;
    branchName?: string | null;
    protocol?: AttendanceProtocol;
    host: string;
    port?: number;
    passCode?: string | null;
    isActive?: boolean;
    syncEnabled?: boolean;
    syncFrequencyMinutes?: number;
    timeoutMs?: number;
    retryCount?: number;
    nextSyncAt?: string | Date | null;
}

export interface CreateSyncRunInput {
    deviceId: number | string;
    mode: AttendanceSyncMode;
    triggerType: AttendanceTriggerType;
    triggeredByUserId?: number | null;
}

export interface FinishSyncRunInput {
    syncRunId: number | string;
    status: AttendanceSyncStatus;
    newCount?: number;
    receivedCount?: number;
    insertedCount?: number;
    duplicateCount?: number;
    confirmedCount?: number;
    errorMessage?: string | null;
}

export interface UpdateDeviceSyncStatusInput {
    status: AttendanceSyncStatus;
    lastError?: string | null;
    lastNewCount?: number | null;
    lastInsertedCount?: number | null;
    lastRecordTime?: string | null;
    syncFrequencyMinutes?: number;
}

export interface AttendanceRecordInsertInput extends DecodedHipAttendanceRecord {
    recordHex: string;
    sourceCommand?: string;
}

export interface InsertAttendanceRecordsResult {
    insertedCount: number;
    duplicateCount: number;
}

export interface EmployeeAttendanceSummaryInput {
    employeeId: string;
    fromDate: string;
    toDate: string;
    checkInFrom?: string;
}

export interface EmployeeAttendanceReportInput extends EmployeeAttendanceSummaryInput {
    periodMonth?: string;
    settings?: AttendanceScheduleSettings;
}

export interface EmployeeAttendanceReport {
    days: AttendanceDaySummary[];
    settings: AttendanceScheduleSettings;
    period: {
        month: string | null;
        from: string;
        to: string;
    };
}

interface EmployeeAttendanceSummaryContextInput extends EmployeeAttendanceSummaryInput {
    settings: AttendanceScheduleSettings;
    workingSaturdays: WorkingSaturdaySchedule[];
}

type DbModule = typeof import('@/lib/db');

async function loadDb(): Promise<DbModule> {
    return import('@/lib/db');
}

function normalizeDeviceId(deviceId: number | string): number {
    return typeof deviceId === 'number' ? deviceId : Number.parseInt(deviceId, 10);
}

function normalizePassCode(passCode: string | null | undefined): string {
    const trimmed = passCode?.trim();
    return trimmed ? trimmed : '0';
}

function normalizeOptionalPassCode(passCode: string | null | undefined): string | null {
    if (passCode == null) {
        return null;
    }

    return normalizePassCode(passCode);
}

function toNullableIso(value: Date | string | null | undefined): string | null {
    if (!value) {
        return null;
    }
    return value instanceof Date ? value.toISOString() : value;
}

function normalizeTimeValue(value: unknown, fallback: string): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return String(value.getHours()).padStart(2, '0') + ':' + String(value.getMinutes()).padStart(2, '0');
    }

    if (typeof value === 'string') {
        const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
        if (match) {
            const hours = Number(match[1]);
            const minutes = Number(match[2]);

            if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
            }
        }
    }

    return fallback;
}

function normalizeIntegerSetting(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);

    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function normalizeDateValue(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    return String(value).slice(0, 10);
}

function normalizeWorkHours(value: unknown, startTime: string, endTime: string): number {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));

    if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
    }

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    return ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60;
}

function mapDeviceRow(row: Record<string, unknown>): AttendanceDeviceListItem {
    return {
        id: Number(row.id),
        name: String(row.name),
        branchName: (row.branchName as string | null) ?? null,
        protocol: row.protocol as AttendanceProtocol,
        host: String(row.ipAddress),
        port: Number(row.port),
        hasPass: Boolean(row.hasPass),
        isActive: Boolean(row.isActive),
        syncEnabled: Boolean(row.syncEnabled),
        syncFrequencyMinutes: Number(row.syncFrequencyMinutes),
        timeoutMs: Number(row.timeoutMs),
        retryCount: Number(row.retryCount),
        lastSyncAt: toNullableIso(row.lastSyncAt as Date | string | null),
        lastSuccessfulSyncAt: toNullableIso(row.lastSuccessfulSyncAt as Date | string | null),
        nextSyncAt: toNullableIso(row.nextSyncAt as Date | string | null),
        lastSyncStatus: (row.lastSyncStatus as AttendanceSyncStatus | null) ?? null,
        lastError: (row.lastError as string | null) ?? null,
        lastNewCount: row.lastNewCount == null ? null : Number(row.lastNewCount),
        lastInsertedCount: row.lastInsertedCount == null ? null : Number(row.lastInsertedCount),
    };
}

function mapDeviceConfigRow(row: Record<string, unknown>): AttendanceDeviceConfigRecord {
    const device = mapDeviceRow({
        ...row,
        hasPass: row.passCode != null && String(row.passCode).length > 0,
    });

    return {
        ...device,
        passCode: String(row.passCode ?? '0'),
        config: {
            protocol: device.protocol,
            host: device.host,
            port: device.port,
            timeoutMs: device.timeoutMs,
        },
    };
}

export function summarizeDailyAttendanceRows(
    rows: DailyAttendanceRow[],
    context: AttendanceSummaryContext = { settings: DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS }
): AttendanceDaySummary[] {
    return summarizeDailyAttendanceRowsWithSchedule(rows, context);
}

const DEVICE_SELECT_COLUMNS = `
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
    CONVERT(varchar(19), lastSyncAt, 126) AS lastSyncAt,
    CONVERT(varchar(19), lastSuccessfulSyncAt, 126) AS lastSuccessfulSyncAt,
    CONVERT(varchar(19), nextSyncAt, 126) AS nextSyncAt,
    lastSyncStatus,
    lastError,
    lastNewCount,
    lastInsertedCount
`;

const DEVICE_OUTPUT_COLUMNS = `
    INSERTED.id,
    INSERTED.name,
    INSERTED.branchName,
    INSERTED.protocol,
    INSERTED.ipAddress,
    INSERTED.port,
    INSERTED.isActive,
    INSERTED.syncEnabled,
    INSERTED.syncFrequencyMinutes,
    INSERTED.timeoutMs,
    INSERTED.retryCount,
    INSERTED.lastSyncAt,
    INSERTED.lastSuccessfulSyncAt,
    INSERTED.nextSyncAt,
    INSERTED.lastSyncStatus,
    INSERTED.lastError,
    INSERTED.lastNewCount,
    INSERTED.lastInsertedCount,
    INSERTED.passCode
`;

function bindUpsertDeviceInput(request: import('mssql').Request, input: UpsertAttendanceDeviceInput) {
    return request
        .input('name', input.name)
        .input('branchName', input.branchName ?? null)
        .input('protocol', input.protocol ?? 'HIP_CMIF68S')
        .input('ipAddress', input.host)
        .input('port', input.port ?? 5005)
        .input('passCode', normalizeOptionalPassCode(input.passCode))
        .input('isActive', input.isActive ?? true)
        .input('syncEnabled', input.syncEnabled ?? false)
        .input('syncFrequencyMinutes', input.syncFrequencyMinutes ?? 60)
        .input('timeoutMs', input.timeoutMs ?? 10000)
        .input('retryCount', input.retryCount ?? 2)
        .input('nextSyncAt', input.nextSyncAt ?? null);
}

export async function listAttendanceDevices(): Promise<AttendanceDeviceListItem[]> {
    const { getPool } = await loadDb();
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT
            ${DEVICE_SELECT_COLUMNS},
            CAST(CASE WHEN NULLIF(passCode, '') IS NULL THEN 0 ELSE 1 END AS bit) AS hasPass
        FROM AttendanceDevices
        ORDER BY name ASC, id ASC
    `);

    return result.recordset.map(mapDeviceRow);
}

export async function getAttendanceDeviceConfig(
    deviceId: number | string
): Promise<AttendanceDeviceConfigRecord | null> {
    const { getPool } = await loadDb();
    const pool = await getPool();
    const result = await pool.request()
        .input('deviceId', normalizeDeviceId(deviceId))
        .query(`
            SELECT
                ${DEVICE_SELECT_COLUMNS},
                passCode
            FROM AttendanceDevices
            WHERE id = @deviceId
        `);

    return result.recordset[0] ? mapDeviceConfigRow(result.recordset[0]) : null;
}

export async function upsertAttendanceDevice(
    input: UpsertAttendanceDeviceInput
): Promise<AttendanceDeviceConfigRecord> {
    const { getPool } = await loadDb();
    const pool = await getPool();

    if (input.id != null) {
        const updateResult = await bindUpsertDeviceInput(pool.request(), input)
            .input('deviceId', normalizeDeviceId(input.id))
            .query(`
                UPDATE AttendanceDevices
                SET
                    name = @name,
                    branchName = @branchName,
                    protocol = @protocol,
                    ipAddress = @ipAddress,
                    port = @port,
                    passCode = CASE WHEN @passCode IS NULL THEN passCode ELSE @passCode END,
                    isActive = @isActive,
                    syncEnabled = @syncEnabled,
                    syncFrequencyMinutes = @syncFrequencyMinutes,
                    timeoutMs = @timeoutMs,
                    retryCount = @retryCount,
                    nextSyncAt = @nextSyncAt,
                    updatedAt = GETDATE()
                OUTPUT ${DEVICE_OUTPUT_COLUMNS}
                WHERE id = @deviceId
            `);

        if (updateResult.recordset[0]) {
            return mapDeviceConfigRow(updateResult.recordset[0]);
        }
    }

    const insertResult = await bindUpsertDeviceInput(pool.request(), input).query(`
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
        OUTPUT ${DEVICE_OUTPUT_COLUMNS}
        VALUES (
            @name,
            @branchName,
            @protocol,
            @ipAddress,
            @port,
            COALESCE(@passCode, '0'),
            @isActive,
            @syncEnabled,
            @syncFrequencyMinutes,
            @timeoutMs,
            @retryCount,
            @nextSyncAt
        )
    `);

    return mapDeviceConfigRow(insertResult.recordset[0]);
}

export async function createSyncRun(input: CreateSyncRunInput): Promise<number> {
    const { getPool } = await loadDb();
    const pool = await getPool();
    const result = await pool.request()
        .input('deviceId', normalizeDeviceId(input.deviceId))
        .input('mode', input.mode)
        .input('triggerType', input.triggerType)
        .input('triggeredByUserId', input.triggeredByUserId ?? null)
        .query(`
            INSERT INTO AttendanceSyncRuns (
                deviceId,
                mode,
                status,
                triggerType,
                triggeredByUserId
            )
            OUTPUT INSERTED.id
            VALUES (
                @deviceId,
                @mode,
                'RUNNING',
                @triggerType,
                @triggeredByUserId
            )
        `);

    return Number(result.recordset[0].id);
}

export async function tryAcquireDeviceSyncLock(
    deviceId: number | string,
    owner: string,
    lockMinutes = 15
): Promise<boolean> {
    const { getPool } = await loadDb();
    const pool = await getPool();
    const result = await pool.request()
        .input('deviceId', normalizeDeviceId(deviceId))
        .input('owner', owner)
        .input('lockMinutes', lockMinutes)
        .query(`
            UPDATE AttendanceDevices
            SET
                syncLockOwner = @owner,
                syncLockUntil = DATEADD(minute, @lockMinutes, GETDATE()),
                updatedAt = GETDATE()
            WHERE id = @deviceId
              AND (
                  syncLockUntil IS NULL
                  OR syncLockUntil < GETDATE()
                  OR syncLockOwner = @owner
              )
        `);

    return (result.rowsAffected[0] ?? 0) > 0;
}

export async function releaseDeviceSyncLock(
    deviceId: number | string,
    owner: string
): Promise<boolean> {
    const { getPool } = await loadDb();
    const pool = await getPool();
    const result = await pool.request()
        .input('deviceId', normalizeDeviceId(deviceId))
        .input('owner', owner)
        .query(`
            UPDATE AttendanceDevices
            SET
                syncLockOwner = NULL,
                syncLockUntil = NULL,
                updatedAt = GETDATE()
            WHERE id = @deviceId
              AND syncLockOwner = @owner
        `);

    return (result.rowsAffected[0] ?? 0) > 0;
}

export async function insertAttendanceRecordsInTransaction(
    transaction: Transaction,
    deviceId: number | string,
    records: AttendanceRecordInsertInput[]
): Promise<InsertAttendanceRecordsResult> {
    if (records.length === 0) {
        return { insertedCount: 0, duplicateCount: 0 };
    }

    const { sql } = await loadDb();
    const normalizedDeviceId = normalizeDeviceId(deviceId);
    const recordsJson = JSON.stringify(records.map((record) => ({
        userKey: record.userKey,
        employeeId: record.employeeId,
        recordTime: record.recordTime,
        rawRecordTime: record.rawRecordTime,
        yearCode: record.yearCode,
        verifyCode: record.verifyCode,
        verifyType: record.verifyType,
        recordHex: record.recordHex,
        sourceCommand: record.sourceCommand ?? 'A1',
    })));

    const result = await new sql.Request(transaction)
        .input('deviceId', normalizedDeviceId)
        .input('recordsJson', sql.NVarChar(sql.MAX), recordsJson)
        .query(`
            WITH Parsed AS (
                SELECT
                    userKey,
                    employeeId,
                    recordTime,
                    rawRecordTime,
                    yearCode,
                    verifyCode,
                    verifyType,
                    recordHex,
                    sourceCommand
                FROM OPENJSON(@recordsJson)
                WITH (
                    userKey INT '$.userKey',
                    employeeId NVARCHAR(20) '$.employeeId',
                    recordTime DATETIME2 '$.recordTime',
                    rawRecordTime DATETIME2 '$.rawRecordTime',
                    yearCode INT '$.yearCode',
                    verifyCode INT '$.verifyCode',
                    verifyType NVARCHAR(20) '$.verifyType',
                    recordHex VARCHAR(40) '$.recordHex',
                    sourceCommand NVARCHAR(20) '$.sourceCommand'
                )
            ),
            Deduped AS (
                SELECT
                    *,
                    ROW_NUMBER() OVER (
                        PARTITION BY userKey, recordTime, verifyType, recordHex
                        ORDER BY userKey
                    ) AS rowNumber
                FROM Parsed
            )
                INSERT INTO AttendanceLogs (
                    deviceId,
                    userKey,
                    employeeId,
                    recordTime,
                    rawRecordTime,
                    yearCode,
                    verifyCode,
                    verifyType,
                    recordHex,
                    sourceCommand
                )
                SELECT
                    @deviceId,
                    userKey,
                    employeeId,
                    recordTime,
                    rawRecordTime,
                    yearCode,
                    verifyCode,
                    verifyType,
                    recordHex,
                    COALESCE(sourceCommand, 'A1')
                FROM Deduped src
                WHERE src.rowNumber = 1
                  AND NOT EXISTS (
                      SELECT 1
                      FROM AttendanceLogs target
                      WHERE target.deviceId = @deviceId
                        AND target.userKey = src.userKey
                        AND target.recordTime = src.recordTime
                        AND target.verifyType = src.verifyType
                        AND target.recordHex = src.recordHex
                  )
        `);

    const insertedCount = result.rowsAffected[0] ?? 0;

    return {
        insertedCount,
        duplicateCount: records.length - insertedCount,
    };
}

export async function finishSyncRun(input: FinishSyncRunInput): Promise<boolean> {
    const { getPool } = await loadDb();
    const pool = await getPool();
    const result = await pool.request()
        .input('syncRunId', Number(input.syncRunId))
        .input('status', input.status)
        .input('newCount', input.newCount ?? 0)
        .input('receivedCount', input.receivedCount ?? 0)
        .input('insertedCount', input.insertedCount ?? 0)
        .input('duplicateCount', input.duplicateCount ?? 0)
        .input('confirmedCount', input.confirmedCount ?? 0)
        .input('errorMessage', input.errorMessage ?? null)
        .query(`
            UPDATE AttendanceSyncRuns
            SET
                status = @status,
                finishedAt = GETDATE(),
                newCount = @newCount,
                receivedCount = @receivedCount,
                insertedCount = @insertedCount,
                duplicateCount = @duplicateCount,
                confirmedCount = @confirmedCount,
                errorMessage = @errorMessage
            WHERE id = @syncRunId
        `);

    return (result.rowsAffected[0] ?? 0) > 0;
}

export async function updateDeviceSyncStatus(
    deviceId: number | string,
    result: UpdateDeviceSyncStatusInput
): Promise<boolean> {
    const { getPool } = await loadDb();
    const pool = await getPool();
    const request = pool.request()
        .input('deviceId', normalizeDeviceId(deviceId))
        .input('status', result.status)
        .input('lastError', result.lastError ?? null)
        .input('lastNewCount', result.lastNewCount ?? null)
        .input('lastInsertedCount', result.lastInsertedCount ?? null)
        .input('lastRecordTime', result.lastRecordTime ?? null)
        .input('syncFrequencyMinutes', result.syncFrequencyMinutes ?? 60);

    const updateResult = await request.query(`
        UPDATE AttendanceDevices
        SET
            lastSyncAt = GETDATE(),
            lastSuccessfulSyncAt = CASE WHEN @status = 'SUCCESS' THEN GETDATE() ELSE lastSuccessfulSyncAt END,
            nextSyncAt = DATEADD(minute, @syncFrequencyMinutes, GETDATE()),
            lastSyncStatus = @status,
            lastError = @lastError,
            lastNewCount = @lastNewCount,
            lastInsertedCount = @lastInsertedCount,
            updatedAt = GETDATE()
        WHERE id = @deviceId
    `);

    return (updateResult.rowsAffected[0] ?? 0) > 0;
}

export async function listDueAttendanceDevices(): Promise<AttendanceDeviceConfigRecord[]> {
    const { getPool } = await loadDb();
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT
            ${DEVICE_SELECT_COLUMNS},
            passCode
        FROM AttendanceDevices
        WHERE isActive = 1
          AND syncEnabled = 1
          AND (nextSyncAt IS NULL OR nextSyncAt <= GETDATE())
          AND (syncLockUntil IS NULL OR syncLockUntil < GETDATE())
        ORDER BY nextSyncAt ASC, id ASC
    `);

    return result.recordset.map(mapDeviceConfigRow);
}

export async function getAttendanceScheduleSettings(): Promise<AttendanceScheduleSettings> {
    const defaults = DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS;
    const { getPool } = await loadDb();
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT settingKey, settingValue
        FROM SystemSettings
        WHERE settingKey IN (
            'WORK_START_TIME',
            'WORK_END_TIME',
            'BREAK_START_TIME',
            'BREAK_END_TIME',
            'SAT_WORK_START_TIME',
            'SAT_WORK_END_TIME',
            'WORKDAY_LATE_GRACE_MINUTES',
            'ATTENDANCE_PERIOD_START_DAY'
        )
    `);

    const settings = new Map<string, unknown>();
    for (const row of result.recordset) {
        settings.set(String(row.settingKey), row.settingValue);
    }

    return {
        workStartTime: normalizeTimeValue(settings.get('WORK_START_TIME'), defaults.workStartTime),
        workEndTime: normalizeTimeValue(settings.get('WORK_END_TIME'), defaults.workEndTime),
        breakStartTime: normalizeTimeValue(settings.get('BREAK_START_TIME'), defaults.breakStartTime),
        breakEndTime: normalizeTimeValue(settings.get('BREAK_END_TIME'), defaults.breakEndTime),
        satWorkStartTime: normalizeTimeValue(settings.get('SAT_WORK_START_TIME'), defaults.satWorkStartTime),
        satWorkEndTime: normalizeTimeValue(settings.get('SAT_WORK_END_TIME'), defaults.satWorkEndTime),
        weekdayGraceMinutes: normalizeIntegerSetting(
            settings.get('WORKDAY_LATE_GRACE_MINUTES'),
            defaults.weekdayGraceMinutes,
            0,
            240
        ),
        periodStartDay: normalizeIntegerSetting(
            settings.get('ATTENDANCE_PERIOD_START_DAY'),
            defaults.periodStartDay,
            1,
            28
        ),
    };
}

export async function listWorkingSaturdaysForRange(
    fromDate: string,
    toDate: string
): Promise<WorkingSaturdaySchedule[]> {
    const defaults = DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS;
    const { getPool } = await loadDb();
    const pool = await getPool();
    const result = await pool.request()
        .input('fromDate', fromDate)
        .input('toDate', toDate)
        .query(`
            SELECT
                CONVERT(char(10), CAST(date AS date), 23) AS date,
                startTime,
                endTime,
                workHours
            FROM WorkingSaturdays
            WHERE date >= CAST(@fromDate AS date)
              AND date <= CAST(@toDate AS date)
            ORDER BY date ASC
        `);

    return result.recordset.map((row) => {
        const startTime = normalizeTimeValue(row.startTime, defaults.satWorkStartTime);
        const endTime = normalizeTimeValue(row.endTime, defaults.satWorkEndTime);

        return {
            date: normalizeDateValue(row.date),
            startTime,
            endTime,
            workHours: normalizeWorkHours(row.workHours, startTime, endTime),
        };
    });
}

async function getEmployeeAttendanceSummaryWithContext({
    employeeId,
    fromDate,
    toDate,
    checkInFrom,
    settings,
    workingSaturdays,
}: EmployeeAttendanceSummaryContextInput): Promise<AttendanceDaySummary[]> {
    const { getPool } = await loadDb();
    const pool = await getPool();
    const request = pool.request()
        .input('employeeId', employeeId)
        .input('fromDate', fromDate)
        .input('toDate', toDate);

    const result = await request.query<DailyAttendanceRow>(`
        SELECT
            CONVERT(char(10), CAST(recordTime AS date), 23) AS attendanceDate,
            CONVERT(char(8), CAST(recordTime AS time), 108) AS recordTime
        FROM AttendanceLogs
        WHERE employeeId = @employeeId
          AND recordTime >= CAST(@fromDate AS date)
          AND recordTime < DATEADD(day, 1, CAST(@toDate AS date))
        ORDER BY attendanceDate ASC, recordTime ASC
    `);

    const days = summarizeDailyAttendanceRows(result.recordset, { settings, workingSaturdays });

    if (!checkInFrom) {
        return days;
    }

    return days.filter((day) => day.checkIn != null && day.checkIn >= checkInFrom);
}

export async function getEmployeeAttendanceSummary(
    input: EmployeeAttendanceSummaryInput
): Promise<AttendanceDaySummary[]> {
    const settings = await getAttendanceScheduleSettings();
    const workingSaturdays = await listWorkingSaturdaysForRange(input.fromDate, input.toDate);

    return getEmployeeAttendanceSummaryWithContext({
        ...input,
        settings,
        workingSaturdays,
    });
}

export async function getEmployeeAttendanceReport(
    input: EmployeeAttendanceReportInput
): Promise<EmployeeAttendanceReport> {
    const settings = input.settings ?? await getAttendanceScheduleSettings();
    const workingSaturdays = await listWorkingSaturdaysForRange(input.fromDate, input.toDate);
    const days = await getEmployeeAttendanceSummaryWithContext({
        ...input,
        settings,
        workingSaturdays,
    });

    return {
        days,
        settings,
        period: {
            month: input.periodMonth ?? null,
            from: input.fromDate,
            to: input.toDate,
        },
    };
}
