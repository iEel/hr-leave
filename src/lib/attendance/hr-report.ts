import {
    applyAttendanceLeaveAdjustments,
    type AttendanceLeaveRecord,
} from './leave-adjustments';
import {
    summarizeDailyAttendanceRows,
    type AttendanceDaySummary,
    type AttendanceScheduleSettings,
    type DailyAttendanceRow,
    type WorkingSaturdaySchedule,
} from './repository';

export type HrAttendanceStatusFilter = 'ALL' | 'LATE' | 'ADJUSTED_BY_LEAVE' | 'INCOMPLETE' | 'NO_HIP_DATA';

export interface HrAttendanceReportInput {
    fromDate: string;
    toDate: string;
    settings: AttendanceScheduleSettings;
    workingSaturdays: WorkingSaturdaySchedule[];
    company?: string;
    department?: string;
    employee?: string;
    status?: HrAttendanceStatusFilter;
}

export interface HrAttendanceReportRow {
    date: string;
    userId: number;
    employeeId: string;
    employeeName: string;
    company: string;
    department: string;
    checkIn: string | null;
    checkOut: string | null;
    scanCount: number;
    scheduledStartTime: string | null;
    scheduledEndTime: string | null;
    lateAfterTime: string | null;
    effectiveLateAfterTime: string | null;
    rawIsLate: boolean;
    rawIsIncomplete: boolean;
    isLate: boolean;
    isIncomplete: boolean;
    missingCheckIn: boolean;
    missingCheckOut: boolean;
    adjustedByApprovedLeave: boolean;
    finalStatus: string;
    leaveRequestId: number | null;
    leaveRequestNo: string | null;
    leaveType: string | null;
    leaveAdjustmentLabel: string | null;
    relatedLeaveRequests: AttendanceDaySummary['relatedLeaveRequests'];
}

interface HrReportUser {
    id: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    company: string;
    department: string;
}

interface AttendanceLogRecord extends DailyAttendanceRow {
    employeeId: string;
}

interface LeaveRecord extends AttendanceLeaveRecord {
    userId: number;
}

const CSV_COLUMNS: Array<keyof HrAttendanceReportRow> = [
    'date',
    'employeeId',
    'employeeName',
    'company',
    'department',
    'checkIn',
    'checkOut',
    'scanCount',
    'scheduledStartTime',
    'scheduledEndTime',
    'lateAfterTime',
    'effectiveLateAfterTime',
    'rawIsLate',
    'rawIsIncomplete',
    'isLate',
    'isIncomplete',
    'missingCheckIn',
    'missingCheckOut',
    'adjustedByApprovedLeave',
    'finalStatus',
    'leaveRequestId',
    'leaveRequestNo',
    'leaveType',
    'leaveAdjustmentLabel',
];

type DbModule = typeof import('@/lib/db');

async function loadDb(): Promise<DbModule> {
    return import('@/lib/db');
}

export function filterHrAttendanceRows(
    rows: HrAttendanceReportRow[],
    status: HrAttendanceStatusFilter = 'ALL'
): HrAttendanceReportRow[] {
    switch (status) {
        case 'LATE':
            return rows.filter((row) => row.isLate);
        case 'ADJUSTED_BY_LEAVE':
            return rows.filter((row) => row.adjustedByApprovedLeave);
        case 'INCOMPLETE':
            return rows.filter((row) => row.finalStatus === 'ข้อมูลไม่ครบ');
        case 'NO_HIP_DATA':
            return rows.filter((row) => row.scanCount === 0 && !row.adjustedByApprovedLeave);
        case 'ALL':
        default:
            return rows;
    }
}

export function formatHrAttendanceCsv(rows: HrAttendanceReportRow[]): string {
    const header = CSV_COLUMNS.join(',');
    const body = rows.map((row) => CSV_COLUMNS
        .map((column) => formatCsvCell(row[column]))
        .join(','));

    return `\uFEFF${[header, ...body].join('\n')}`;
}

export async function getHrAttendanceReport(input: HrAttendanceReportInput): Promise<HrAttendanceReportRow[]> {
    const users = await listHrReportUsers(input);
    if (users.length === 0) {
        return [];
    }

    const [logs, leaves] = await Promise.all([
        listAttendanceLogsForEmployees(users.map((user) => user.employeeId), input.fromDate, input.toDate),
        listApprovedLeavesForUsers(users.map((user) => user.id), input.fromDate, input.toDate),
    ]);

    const workDates = listWorkDatesForRange(input.fromDate, input.toDate, input.workingSaturdays);
    const logsByEmployee = groupBy(logs, (log) => log.employeeId);
    const leavesByUser = groupBy(leaves, (leave) => String(leave.userId));
    const rows: HrAttendanceReportRow[] = [];

    for (const user of users) {
        const userLogs = logsByEmployee.get(user.employeeId) ?? [];
        const userLeaves = leavesByUser.get(String(user.id)) ?? [];
        const days = applyAttendanceLeaveAdjustments(
            summarizeDailyAttendanceRows(userLogs, {
                settings: input.settings,
                workingSaturdays: input.workingSaturdays,
                includedDates: workDates,
            }),
            userLeaves
        );

        for (const day of days) {
            if (day.dayType === 'NON_WORKDAY' && day.scanCount === 0 && day.relatedLeaveRequests.length === 0) {
                continue;
            }

            rows.push(toHrAttendanceReportRow(user, day));
        }
    }

    rows.sort((left, right) => {
        const dateCompare = left.date.localeCompare(right.date);
        if (dateCompare !== 0) return dateCompare;

        return left.employeeId.localeCompare(right.employeeId);
    });

    return filterHrAttendanceRows(rows, input.status ?? 'ALL');
}

async function listHrReportUsers(input: HrAttendanceReportInput): Promise<HrReportUser[]> {
    const { getPool } = await loadDb();
    const pool = await getPool();
    const trimmedEmployee = input.employee?.trim();
    const result = await pool.request()
        .input('company', input.company?.trim() || null)
        .input('department', input.department?.trim() || null)
        .input('employee', trimmedEmployee ? `%${trimmedEmployee}%` : null)
        .query<HrReportUser>(`
            SELECT
                id,
                employeeId,
                firstName,
                lastName,
                company,
                department
            FROM Users
            WHERE isActive = 1
              AND (@company IS NULL OR company = @company)
              AND (@department IS NULL OR department = @department)
              AND (
                  @employee IS NULL
                  OR employeeId LIKE @employee
                  OR firstName LIKE @employee
                  OR lastName LIKE @employee
                  OR CONCAT(firstName, ' ', lastName) LIKE @employee
              )
            ORDER BY company ASC, department ASC, employeeId ASC
        `);

    return result.recordset.map((row) => ({
        id: Number(row.id),
        employeeId: String(row.employeeId),
        firstName: String(row.firstName),
        lastName: String(row.lastName),
        company: String(row.company),
        department: String(row.department),
    }));
}

async function listAttendanceLogsForEmployees(
    employeeIds: string[],
    fromDate: string,
    toDate: string
): Promise<AttendanceLogRecord[]> {
    const { getPool, sql } = await loadDb();
    const pool = await getPool();
    const result = await pool.request()
        .input('employeeIdsJson', sql.NVarChar(sql.MAX), JSON.stringify(employeeIds))
        .input('fromDate', fromDate)
        .input('toDate', toDate)
        .query<AttendanceLogRecord>(`
            WITH SelectedEmployees AS (
                SELECT employeeId
                FROM OPENJSON(@employeeIdsJson)
                WITH (employeeId NVARCHAR(20) '$')
            )
            SELECT
                al.employeeId,
                CONVERT(char(10), CAST(al.recordTime AS date), 23) AS attendanceDate,
                CONVERT(char(8), CAST(al.recordTime AS time), 108) AS recordTime
            FROM AttendanceLogs al
            JOIN SelectedEmployees se ON se.employeeId = al.employeeId
            WHERE al.recordTime >= CAST(@fromDate AS date)
              AND al.recordTime < DATEADD(day, 1, CAST(@toDate AS date))
            ORDER BY al.employeeId ASC, attendanceDate ASC, recordTime ASC
        `);

    return result.recordset.map((row) => ({
        employeeId: String(row.employeeId),
        attendanceDate: String(row.attendanceDate),
        recordTime: String(row.recordTime),
    }));
}

async function listApprovedLeavesForUsers(
    userIds: number[],
    fromDate: string,
    toDate: string
): Promise<LeaveRecord[]> {
    const { getPool, sql } = await loadDb();
    const pool = await getPool();
    const result = await pool.request()
        .input('userIdsJson', sql.NVarChar(sql.MAX), JSON.stringify(userIds))
        .input('fromDate', fromDate)
        .input('toDate', toDate)
        .query<Record<string, unknown>>(`
            WITH SelectedUsers AS (
                SELECT userId
                FROM OPENJSON(@userIdsJson)
                WITH (userId INT '$')
            )
            SELECT
                lr.id,
                lr.userId,
                lr.leaveType,
                lr.status,
                CONVERT(char(10), CAST(lr.startDatetime AS date), 23) AS startDate,
                CONVERT(char(10), CAST(lr.endDatetime AS date), 23) AS endDate,
                lr.isHourly,
                lr.timeSlot,
                lr.startTime,
                lr.endTime,
                CONVERT(char(10), lr.createdAt, 23) AS createdAt
            FROM LeaveRequests lr
            JOIN SelectedUsers su ON su.userId = lr.userId
            WHERE lr.status = 'APPROVED'
              AND CAST(lr.startDatetime AS date) <= CAST(@toDate AS date)
              AND CAST(lr.endDatetime AS date) >= CAST(@fromDate AS date)
            ORDER BY lr.userId ASC, lr.startDatetime ASC, lr.id ASC
        `);

    return result.recordset.map((row) => ({
        id: Number(row.id),
        userId: Number(row.userId),
        leaveType: String(row.leaveType),
        status: String(row.status),
        startDate: normalizeDateValue(row.startDate),
        endDate: normalizeDateValue(row.endDate),
        isHourly: Boolean(row.isHourly),
        timeSlot: row.timeSlot as AttendanceLeaveRecord['timeSlot'],
        startTime: normalizeNullableTimeValue(row.startTime),
        endTime: normalizeNullableTimeValue(row.endTime),
        createdAt: (row.createdAt as string | Date | null | undefined) ?? null,
    }));
}

function toHrAttendanceReportRow(user: HrReportUser, day: AttendanceDaySummary): HrAttendanceReportRow {
    const leaveAdjustment = day.leaveAdjustment;

    return {
        date: day.date,
        userId: user.id,
        employeeId: user.employeeId,
        employeeName: `${user.firstName} ${user.lastName}`.trim(),
        company: user.company,
        department: user.department,
        checkIn: day.checkIn,
        checkOut: day.checkOut,
        scanCount: day.scanCount,
        scheduledStartTime: day.scheduledStartTime,
        scheduledEndTime: day.scheduledEndTime,
        lateAfterTime: day.lateAfterTime,
        effectiveLateAfterTime: day.effectiveLateAfterTime,
        rawIsLate: day.rawIsLate,
        rawIsIncomplete: day.rawIsIncomplete,
        isLate: day.isLate,
        isIncomplete: day.isIncomplete,
        missingCheckIn: day.missingCheckIn,
        missingCheckOut: day.missingCheckOut,
        adjustedByApprovedLeave: day.adjustedByApprovedLeave,
        finalStatus: getFinalStatus(day),
        leaveRequestId: leaveAdjustment?.leaveRequestId ?? null,
        leaveRequestNo: leaveAdjustment?.leaveRequestNo ?? null,
        leaveType: leaveAdjustment?.leaveType ?? null,
        leaveAdjustmentLabel: leaveAdjustment?.label ?? null,
        relatedLeaveRequests: day.relatedLeaveRequests,
    };
}

function getFinalStatus(day: AttendanceDaySummary): string {
    if (day.adjustedByApprovedLeave && !day.isLate && !day.isIncomplete) {
        return 'ไม่คิดสายจากใบลา';
    }

    if (day.scanCount === 0 && !day.adjustedByApprovedLeave) {
        return 'ไม่พบข้อมูล HIP';
    }

    if (day.isLate) {
        return 'สาย';
    }

    if (day.isIncomplete) {
        return 'ข้อมูลไม่ครบ';
    }

    return 'ปกติ';
}

function listWorkDatesForRange(
    fromDate: string,
    toDate: string,
    workingSaturdays: WorkingSaturdaySchedule[]
): string[] {
    const workingSaturdayDates = new Set(workingSaturdays.map((workingSaturday) => workingSaturday.date));
    const dates: string[] = [];
    const current = parseUtcDate(fromDate);
    const end = parseUtcDate(toDate);

    while (current.getTime() <= end.getTime()) {
        const date = formatDate(current);
        const dayOfWeek = current.getUTCDay();
        if ((dayOfWeek >= 1 && dayOfWeek <= 5) || workingSaturdayDates.has(date)) {
            dates.push(date);
        }
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
    const grouped = new Map<string, T[]>();

    for (const item of items) {
        const key = getKey(item);
        const existing = grouped.get(key) ?? [];
        existing.push(item);
        grouped.set(key, existing);
    }

    return grouped;
}

function formatCsvCell(value: unknown): string {
    if (value == null) {
        return '';
    }

    const normalized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
}

function normalizeDateValue(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    return String(value).slice(0, 10);
}

function normalizeNullableTimeValue(value: unknown): string | null {
    if (value == null) {
        return null;
    }

    const text = String(value).trim();
    const match = text.match(/^(\d{1,2}):(\d{2})/);
    if (!match) {
        return null;
    }

    return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function parseUtcDate(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}
