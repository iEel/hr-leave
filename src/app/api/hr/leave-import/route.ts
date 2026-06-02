import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { calculateNetWorkingDays, WorkingSaturdayData } from '@/lib/date-utils';
import { calculateHourlyDuration } from '@/lib/leave-utils';
import { TimeSlot } from '@/types';
import {
    calculateVacationEligibleDate,
    isVacationEligibleOnDate,
    isVacationEntitledInFiscalYear,
    type VacationEligibilityInput,
} from '@/lib/vacation-eligibility';

const VALID_LEAVE_TYPES = [
    'VACATION', 'SICK', 'PERSONAL', 'MATERNITY', 'MILITARY',
    'ORDINATION', 'STERILIZATION', 'TRAINING', 'OTHER'
];

const DEFAULT_PROBATION_STANDARD_DAYS = 90;
const DEFAULT_VACATION_AFTER_PROBATION_YEARS = 1;
const DEFAULT_FISCAL_YEAR_START = '01-01';

interface ImportRow {
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
    startTime?: string;
    endTime?: string;
}

interface SessionUserWithHRFlag {
    isHRStaff?: boolean;
}

interface HolidayRow {
    date: string | Date;
}

interface WorkingSaturdayRow {
    date: string | Date;
    startTime: string;
    endTime: string;
    workHours: number;
}

interface ImportUserRow {
    id: number;
    startDate: string | null;
    probationDays: number | null;
    probationExtensionDays: number | null;
    probationOverrideDate: string | null;
}

interface VacationSettings {
    probationStandardDays: number;
    vacationAfterProbationYears: number;
    fiscalYearStart: string;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFiscalYearStart(value: unknown): string {
    if (typeof value !== 'string') {
        return DEFAULT_FISCAL_YEAR_START;
    }

    const match = value.match(/^(\d{2})-(\d{2})$/);
    if (!match) {
        return DEFAULT_FISCAL_YEAR_START;
    }

    const month = Number(match[1]);
    const day = Number(match[2]);
    const daysInMonth = new Date(Date.UTC(2001, month, 0)).getUTCDate();

    if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
        return DEFAULT_FISCAL_YEAR_START;
    }

    return value;
}

function buildVacationSettings(rows: Array<{ settingKey: string; settingValue: string | null }>): VacationSettings {
    const settings: VacationSettings = {
        probationStandardDays: DEFAULT_PROBATION_STANDARD_DAYS,
        vacationAfterProbationYears: DEFAULT_VACATION_AFTER_PROBATION_YEARS,
        fiscalYearStart: DEFAULT_FISCAL_YEAR_START,
    };

    for (const row of rows) {
        if (row.settingKey === 'PROBATION_STANDARD_DAYS') {
            settings.probationStandardDays = parsePositiveInteger(row.settingValue, DEFAULT_PROBATION_STANDARD_DAYS);
        } else if (row.settingKey === 'VACATION_AFTER_PROBATION_YEARS') {
            settings.vacationAfterProbationYears = parsePositiveInteger(row.settingValue, DEFAULT_VACATION_AFTER_PROBATION_YEARS);
        } else if (row.settingKey === 'LEAVE_YEAR_START') {
            settings.fiscalYearStart = parseFiscalYearStart(row.settingValue);
        }
    }

    return settings;
}

function toDateText(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/**
 * POST /api/hr/leave-import
 * นำเข้าวันลาจำนวนมาก (Bulk Leave Import)
 * สำหรับ HR กรอกวันลาย้อนหลัง หรือ migrate จากระบบเดิม
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = (session?.user as SessionUserWithHRFlag | undefined)?.isHRStaff === true;
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { data } = body as { data: ImportRow[] };

        if (!data || !Array.isArray(data) || data.length === 0) {
            return NextResponse.json({ error: 'ไม่มีข้อมูลให้นำเข้า' }, { status: 400 });
        }

        if (data.length > 500) {
            return NextResponse.json({ error: 'นำเข้าได้สูงสุด 500 รายการต่อครั้ง' }, { status: 400 });
        }

        const pool = await getPool();
        const hrUserId = Number(session.user.id);

        // --- Fetch shared data for auto-calculation ---
        // Get all public holidays
        const holidayResult = await pool.request().query(`SELECT date FROM PublicHolidays`);
        const holidays = (holidayResult.recordset as HolidayRow[]).map((r) => new Date(r.date));

        // Get all working Saturdays
        const wSatResult = await pool.request().query(`SELECT date, startTime, endTime, workHours FROM WorkingSaturdays`);
        const workingSaturdays: WorkingSaturdayData[] = (wSatResult.recordset as WorkingSaturdayRow[]).map((r) => ({
            date: new Date(r.date).toISOString().split('T')[0],
            startTime: r.startTime,
            endTime: r.endTime,
            workHours: r.workHours
        }));

        // Get WORK_HOURS_PER_DAY setting
        const whpdResult = await pool.request()
            .input('key', 'WORK_HOURS_PER_DAY')
            .query('SELECT settingValue FROM SystemSettings WHERE settingKey = @key');
        const workHoursPerDay = whpdResult.recordset.length > 0
            ? parseFloat(whpdResult.recordset[0].settingValue)
            : 7.5;

        const vacationSettingsResult = await pool.request().query(`
            SELECT settingKey, settingValue
            FROM SystemSettings
            WHERE settingKey IN (
                'PROBATION_STANDARD_DAYS',
                'VACATION_AFTER_PROBATION_YEARS',
                'LEAVE_YEAR_START'
            )
        `);
        const vacationSettings = buildVacationSettings(vacationSettingsResult.recordset);

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        const errors: { row: number; employeeId: string; message: string }[] = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowNum = i + 1;

            try {
                // --- Validate fields ---
                if (!row.employeeId?.trim()) {
                    errors.push({ row: rowNum, employeeId: row.employeeId || '-', message: 'ไม่มีรหัสพนักงาน' });
                    errorCount++;
                    continue;
                }

                if (!VALID_LEAVE_TYPES.includes(row.leaveType)) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: `ประเภทลาไม่ถูกต้อง: ${row.leaveType}` });
                    errorCount++;
                    continue;
                }

                if (!row.startDate || !row.endDate) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'ไม่มีวันที่เริ่ม/สิ้นสุด' });
                    errorCount++;
                    continue;
                }

                // Parse dates
                const startDate = new Date(row.startDate);
                const endDate = new Date(row.endDate);
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'รูปแบบวันที่ไม่ถูกต้อง' });
                    errorCount++;
                    continue;
                }

                if (endDate < startDate) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'วันสิ้นสุดน้อยกว่าวันเริ่มต้น' });
                    errorCount++;
                    continue;
                }

                const excelDays = Number(row.days);

                // --- Look up user ---
                const userResult = await pool.request()
                    .input('employeeId', row.employeeId.trim())
                    .query(`
                        SELECT
                            id,
                            CONVERT(varchar, startDate, 23) as startDate,
                            probationDays,
                            probationExtensionDays,
                            CONVERT(varchar, probationOverrideDate, 23) as probationOverrideDate
                        FROM Users
                        WHERE employeeId = @employeeId AND isActive = 1
                    `);

                if (userResult.recordset.length === 0) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'ไม่พบพนักงานในระบบ' });
                    errorCount++;
                    continue;
                }

                const user = userResult.recordset[0] as ImportUserRow;
                const userId = user.id;
                const startDateStr = startDate.toISOString().split('T')[0];
                const endDateStr = endDate.toISOString().split('T')[0];
                const leaveYear = startDate.getFullYear();
                let vacationEligibilityInput: VacationEligibilityInput | null = null;
                let vacationEligibleDateStr: string | null = null;

                if (row.leaveType === 'VACATION') {
                    if (!user.startDate) {
                        errors.push({ row: rowNum, employeeId: row.employeeId, message: 'ไม่พบวันที่เริ่มงานสำหรับตรวจสอบสิทธิ์ลาพักร้อน' });
                        errorCount++;
                        continue;
                    }

                    vacationEligibilityInput = {
                        startDate: user.startDate,
                        probationDays: user.probationDays ?? vacationSettings.probationStandardDays,
                        probationExtensionDays: user.probationExtensionDays,
                        probationOverrideDate: user.probationOverrideDate,
                        vacationDelayYears: vacationSettings.vacationAfterProbationYears,
                    };
                    vacationEligibleDateStr = toDateText(calculateVacationEligibleDate(vacationEligibilityInput));

                    if (!isVacationEligibleOnDate(vacationEligibilityInput, startDateStr)) {
                        errors.push({
                            row: rowNum,
                            employeeId: row.employeeId,
                            message: `ใช้สิทธิ์ลาพักร้อนได้ตั้งแต่ ${vacationEligibleDateStr}`
                        });
                        errorCount++;
                        continue;
                    }

                    if (!isVacationEntitledInFiscalYear(vacationEligibilityInput, leaveYear, vacationSettings.fiscalYearStart)) {
                        errors.push({
                            row: rowNum,
                            employeeId: row.employeeId,
                            message: `ยังไม่มีสิทธิ์ลาพักร้อนในปีงบประมาณ ${leaveYear} (ใช้สิทธิ์ได้ตั้งแต่ ${vacationEligibleDateStr})`
                        });
                        errorCount++;
                        continue;
                    }
                }

                // --- Check duplicate (same user, type, dates) ---
                const dupCheck = await pool.request()
                    .input('userId', userId)
                    .input('leaveType', row.leaveType)
                    .input('startDate', startDateStr)
                    .input('endDate', endDateStr)
                    .query(`
                        SELECT id FROM LeaveRequests
                        WHERE userId = @userId AND leaveType = @leaveType
                        AND CAST(startDatetime AS DATE) = @startDate
                        AND CAST(endDatetime AS DATE) = @endDate
                        AND status IN ('PENDING', 'APPROVED')
                    `);

                if (dupCheck.recordset.length > 0) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'มีใบลาซ้ำในระบบแล้ว' });
                    skippedCount++;
                    continue;
                }

                // --- Determine hourly vs full day ---
                // Only treat as hourly if excelDays < 1 (e.g. 0.25, 0.5) AND time values provided
                const isHourly = excelDays < 1 && row.startTime && row.endTime ? 1 : 0;
                const timeSlot = isHourly ? 'HOURLY' : 'FULL_DAY';
                const startTime = isHourly ? row.startTime! : null;
                const endTime = isHourly ? row.endTime! : null;

                // --- Auto-calculate days from dates ---
                let days: number;
                if (isHourly && row.startTime && row.endTime) {
                    // For hourly leave: calculate from time range
                    const duration = calculateHourlyDuration(row.startTime, row.endTime);
                    days = duration.netHours / workHoursPerDay;
                    days = Math.round(days * 10000) / 10000; // precision
                } else {
                    // For full-day leave: calculate net working days
                    days = calculateNetWorkingDays(
                        startDate,
                        endDate,
                        holidays,
                        TimeSlot.FULL_DAY,
                        workingSaturdays,
                        workHoursPerDay
                    );
                }

                if (days <= 0) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'คำนวณจำนวนวันได้ 0 (อาจเป็นวันหยุดทั้งหมด)' });
                    errorCount++;
                    continue;
                }

                // --- Check leave balance (skip for OTHER type) ---
                if (row.leaveType !== 'OTHER') {
                    const balanceResult = await pool.request()
                        .input('userId', userId)
                        .input('leaveType', row.leaveType)
                        .input('year', leaveYear)
                        .query(`
                            SELECT remaining FROM LeaveBalances
                            WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                        `);

                    let remaining: number;

                    if (balanceResult.recordset.length === 0) {
                        // Auto-create balance from LeaveQuotaSettings (same as leave/request route)
                        if (
                            row.leaveType === 'VACATION'
                            && (
                                !vacationEligibilityInput
                                || !isVacationEntitledInFiscalYear(vacationEligibilityInput, leaveYear, vacationSettings.fiscalYearStart)
                            )
                        ) {
                            errors.push({
                                row: rowNum,
                                employeeId: row.employeeId,
                                message: `ยังไม่มีสิทธิ์ลาพักร้อนในปีงบประมาณ ${leaveYear}${vacationEligibleDateStr ? ` (ใช้สิทธิ์ได้ตั้งแต่ ${vacationEligibleDateStr})` : ''}`
                            });
                            errorCount++;
                            continue;
                        }

                        const quotaResult = await pool.request()
                            .input('leaveType', row.leaveType)
                            .query(`SELECT defaultDays FROM LeaveQuotaSettings WHERE leaveType = @leaveType`);

                        if (quotaResult.recordset.length === 0) {
                            errors.push({ row: rowNum, employeeId: row.employeeId, message: `ไม่พบการตั้งค่าโควตาประเภท ${row.leaveType}` });
                            errorCount++;
                            continue;
                        }

                        const defaultDays = quotaResult.recordset[0].defaultDays;
                        await pool.request()
                            .input('userId', userId)
                            .input('leaveType', row.leaveType)
                            .input('year', leaveYear)
                            .input('entitlement', defaultDays)
                            .input('remaining', defaultDays)
                            .query(`
                                INSERT INTO LeaveBalances (userId, leaveType, year, entitlement, used, remaining, carryOver, isAutoCreated)
                                VALUES (@userId, @leaveType, @year, @entitlement, 0, @remaining, 0, 1)
                            `);

                        remaining = defaultDays;
                    } else {
                        remaining = balanceResult.recordset[0].remaining;
                    }

                    if (remaining < days) {
                        errors.push({ row: rowNum, employeeId: row.employeeId, message: `วันลาไม่เพียงพอ (เหลือ ${remaining} วัน, ต้องการ ${days} วัน)` });
                        errorCount++;
                        continue;
                    }
                }


                // --- Insert leave request (status = APPROVED) ---
                await pool.request()
                    .input('userId', userId)
                    .input('leaveType', row.leaveType)
                    .input('startDatetime', startDateStr)
                    .input('endDatetime', endDateStr)
                    .input('isHourly', isHourly)
                    .input('startTime', startTime)
                    .input('endTime', endTime)
                    .input('timeSlot', timeSlot)
                    .input('usageAmount', days)
                    .input('reason', row.reason || 'นำเข้าจากระบบเดิม')
                    .query(`
                        INSERT INTO LeaveRequests (
                            userId, leaveType, startDatetime, endDatetime,
                            isHourly, startTime, endTime, timeSlot,
                            usageAmount, reason, hasMedicalCertificate, medicalCertificateFile,
                            status
                        )
                        OUTPUT INSERTED.id
                        VALUES (
                            @userId, @leaveType, @startDatetime, @endDatetime,
                            @isHourly, @startTime, @endTime, @timeSlot,
                            @usageAmount, @reason, 0, NULL,
                            'APPROVED'
                        )
                    `);

                // --- Deduct leave balance (skip for OTHER type) ---
                if (row.leaveType !== 'OTHER') {
                    await pool.request()
                        .input('userId', userId)
                        .input('leaveType', row.leaveType)
                        .input('year', leaveYear)
                        .input('usageAmount', days)
                        .query(`
                            UPDATE LeaveBalances
                            SET used = used + @usageAmount,
                                remaining = remaining - @usageAmount,
                                updatedAt = GETDATE()
                            WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                        `);
                }

                successCount++;

            } catch (rowError) {
                console.error(`Error importing row ${rowNum}:`, rowError);
                errors.push({ row: rowNum, employeeId: row.employeeId, message: 'เกิดข้อผิดพลาดในการนำเข้า' });
                errorCount++;
            }
        }

        // Audit log
        await logAudit({
            userId: hrUserId,
            action: 'BULK_LEAVE_IMPORT' as Parameters<typeof logAudit>[0]['action'],
            targetTable: 'LeaveRequests',
            targetId: null,
            newValue: { total: data.length, success: successCount, errors: errorCount, skipped: skippedCount }
        });

        return NextResponse.json({
            success: true,
            message: `นำเข้าสำเร็จ ${successCount} รายการ`,
            stats: {
                total: data.length,
                success: successCount,
                errors: errorCount,
                skipped: skippedCount,
            },
            errorDetails: errors.slice(0, 50),
        });

    } catch (error) {
        console.error('Bulk leave import error:', error);
        return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการนำเข้า' }, { status: 500 });
    }
}
