import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool, sql } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { notifyPendingApproval } from '@/lib/notifications';
import { TimeSlot } from '@/types';
import {
    calculateVacationEligibleDate,
    isVacationEligibleOnDate,
    isVacationEntitledInFiscalYear,
    type VacationEligibilityInput,
} from '@/lib/vacation-eligibility';

const DEFAULT_PROBATION_STANDARD_DAYS = 90;
const DEFAULT_VACATION_AFTER_PROBATION_YEARS = 1;
const DEFAULT_ADVANCE_NOTICE_DAYS = 3;
const DEFAULT_FISCAL_YEAR_START = '01-01';
const DAY_MS = 24 * 60 * 60 * 1000;

type UserEligibilityRow = {
    startDate: string | null;
    probationDays: number | null;
    probationExtensionDays: number | null;
    probationOverrideDate: string | null;
};

type Settings = {
    probationStandardDays: number;
    vacationAfterProbationYears: number;
    advanceNoticeDays: number;
    fiscalYearStart: string;
};

type SettingRow = {
    settingKey: string;
    settingValue: string | null;
};

type HolidayRow = {
    date: string | Date;
};

type WorkingSaturdayRow = {
    date: string | Date;
    startTime: string;
    endTime: string;
    workHours: number;
};

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

function buildSettings(rows: SettingRow[]): Settings {
    const settings: Settings = {
        probationStandardDays: DEFAULT_PROBATION_STANDARD_DAYS,
        vacationAfterProbationYears: DEFAULT_VACATION_AFTER_PROBATION_YEARS,
        advanceNoticeDays: DEFAULT_ADVANCE_NOTICE_DAYS,
        fiscalYearStart: DEFAULT_FISCAL_YEAR_START,
    };

    for (const row of rows) {
        if (row.settingKey === 'PROBATION_STANDARD_DAYS') {
            settings.probationStandardDays = parsePositiveInteger(row.settingValue, DEFAULT_PROBATION_STANDARD_DAYS);
        } else if (row.settingKey === 'VACATION_AFTER_PROBATION_YEARS') {
            settings.vacationAfterProbationYears = parsePositiveInteger(row.settingValue, DEFAULT_VACATION_AFTER_PROBATION_YEARS);
        } else if (row.settingKey === 'LEAVE_ADVANCE_DAYS') {
            settings.advanceNoticeDays = parsePositiveInteger(row.settingValue, DEFAULT_ADVANCE_NOTICE_DAYS);
        } else if (row.settingKey === 'LEAVE_YEAR_START') {
            settings.fiscalYearStart = parseFiscalYearStart(row.settingValue);
        }
    }

    return settings;
}

function toDateText(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function toDateOnly(value: string | Date): Date {
    if (value instanceof Date) {
        return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    }

    const [datePart] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function getDateOnlyDifferenceInDays(from: string | Date, to: string | Date): number {
    return Math.floor((toDateOnly(to).getTime() - toDateOnly(from).getTime()) / DAY_MS);
}

/**
 * POST /api/leave/request
 * สร้างใบลาใหม่
 */
export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = Number(session.user.id);
        const body = await request.json();

        // Validate required fields
        const {
            leaveType,
            startDate,
            endDate,
            isHourly = false,
            timeSlot = 'FULL_DAY',
            startTime = null,
            endTime = null,
            reason,
            hasMedicalCert = false,
            medicalCertificateFile = null,
            usageAmount
        } = body;

        if (!leaveType || !startDate || !endDate || !reason) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const pool = await getPool();

        // Check for overlapping leave requests
        // For hourly leaves: check time range overlap, not just date overlap
        const overlapQuery = isHourly && startTime && endTime
            ? `
                SELECT id FROM LeaveRequests
                WHERE userId = @userId
                AND status IN ('PENDING', 'APPROVED')
                AND (CAST(startDatetime AS DATE) <= @endDate AND CAST(endDatetime AS DATE) >= @startDate)
                AND (
                    -- Non-hourly existing leave on same day = always overlap
                    isHourly = 0
                    OR (
                        -- Hourly existing leave: check time range intersection
                        isHourly = 1
                        AND startTime < @endTime
                        AND endTime > @startTime
                    )
                )
            `
            : `
                SELECT id FROM LeaveRequests
                WHERE userId = @userId
                AND status IN ('PENDING', 'APPROVED')
                AND (CAST(startDatetime AS DATE) <= @endDate AND CAST(endDatetime AS DATE) >= @startDate)
            `;

        const overlapCheckReq = pool.request()
            .input('userId', userId)
            .input('startDate', startDate)
            .input('endDate', endDate);

        if (isHourly && startTime && endTime) {
            overlapCheckReq.input('startTime', startTime);
            overlapCheckReq.input('endTime', endTime);
        }

        const overlapCheck = await overlapCheckReq.query(overlapQuery);

        if (overlapCheck.recordset.length > 0) {
            return NextResponse.json(
                { error: 'คุณมีใบลาในช่วงเวลานี้อยู่แล้ว' },
                { status: 400 }
            );
        }

        // === WEEKEND VALIDATION FOR HOURLY LEAVE ===
        if (isHourly) {
            const start = new Date(startDate);
            const dayOfWeek = start.getDay(); // 0 = Sunday, 6 = Saturday

            // Rule 1: Sunday is always non-working day
            if (dayOfWeek === 0) {
                return NextResponse.json(
                    { error: 'ไม่สามารถลาวันอาทิตย์ได้ เนื่องจากเป็นวันหยุด' },
                    { status: 400 }
                );
            }

            // Rule 2: Saturday must be in WorkingSaturdays table
            if (dayOfWeek === 6) {
                const saturdayCheck = await pool.request()
                    .input('date', startDate)
                    .query(`
                        SELECT id FROM WorkingSaturdays 
                        WHERE date = @date
                    `);

                if (saturdayCheck.recordset.length === 0) {
                    return NextResponse.json(
                        { error: 'ไม่สามารถลาวันเสาร์นี้ได้ เนื่องจากไม่ใช่วันทำงาน' },
                        { status: 400 }
                    );
                }
            }

            // Rule 3: Public Holiday check
            const holidayCheck = await pool.request()
                .input('date', startDate)
                .query(`
                    SELECT name FROM PublicHolidays 
                    WHERE date = @date
                `);

            if (holidayCheck.recordset.length > 0) {
                const holidayName = holidayCheck.recordset[0].name;
                return NextResponse.json(
                    { error: `ไม่สามารถลาได้ เนื่องจากเป็นวันหยุด: ${holidayName}` },
                    { status: 400 }
                );
            }
        }

        // === PUBLIC HOLIDAY VALIDATION FOR FULL-DAY/HALF-DAY LEAVE ===
        // Block if single day leave falls on a public holiday
        if (!isHourly && startDate === endDate) {
            const holidayCheck = await pool.request()
                .input('date', startDate)
                .query(`
                    SELECT name FROM PublicHolidays 
                    WHERE date = @date
                `);

            if (holidayCheck.recordset.length > 0) {
                const holidayName = holidayCheck.recordset[0].name;
                return NextResponse.json(
                    { error: `ไม่สามารถลาได้ เนื่องจากเป็นวันหยุด: ${holidayName}` },
                    { status: 400 }
                );
            }
        }

        let vacationEligibilityInput: VacationEligibilityInput | null = null;
        let vacationSettings: Settings | null = null;
        let vacationEligibleDateText: string | null = null;

        // === VACATION LEAVE SPECIAL RULES ===
        if (leaveType === 'VACATION') {
            const settingsResult = await pool.request().query(`
                SELECT settingKey, settingValue
                FROM SystemSettings
                WHERE settingKey IN (
                    'PROBATION_STANDARD_DAYS',
                    'VACATION_AFTER_PROBATION_YEARS',
                    'LEAVE_ADVANCE_DAYS',
                    'LEAVE_YEAR_START'
                )
            `);
            vacationSettings = buildSettings(settingsResult.recordset);

            const userResult = await pool.request()
                .input('userId', userId)
                .query(`
                    SELECT
                        CONVERT(varchar, startDate, 23) as startDate,
                        probationDays,
                        probationExtensionDays,
                        CONVERT(varchar, probationOverrideDate, 23) as probationOverrideDate
                    FROM Users
                    WHERE id = @userId
                `);

            const user = userResult.recordset[0] as UserEligibilityRow | undefined;

            if (!user?.startDate) {
                return NextResponse.json(
                    { error: 'ไม่พบวันที่เริ่มงาน จึงไม่สามารถตรวจสอบสิทธิ์ลาพักร้อนได้' },
                    { status: 400 }
                );
            }

            vacationEligibilityInput = {
                startDate: user.startDate,
                probationDays: user.probationDays ?? vacationSettings.probationStandardDays,
                probationExtensionDays: user.probationExtensionDays,
                probationOverrideDate: user.probationOverrideDate,
                vacationDelayYears: vacationSettings.vacationAfterProbationYears,
            };

            const vacationEligibleDate = calculateVacationEligibleDate(vacationEligibilityInput);
            vacationEligibleDateText = toDateText(vacationEligibleDate);

            if (!isVacationEligibleOnDate(vacationEligibilityInput, startDate)) {
                return NextResponse.json(
                    { error: `วันที่เริ่มลาพักร้อนต้องไม่ก่อนวันที่มีสิทธิ์ (${vacationEligibleDateText})` },
                    { status: 400 }
                );
            }

            // Rule 2: Dynamic Advance Notice (Default: 3 days)
            const diffDays = getDateOnlyDifferenceInDays(new Date(), startDate);

            if (diffDays < vacationSettings.advanceNoticeDays) {
                return NextResponse.json(
                    { error: `การลาพักร้อนต้องแจ้งล่วงหน้าอย่างน้อย ${vacationSettings.advanceNoticeDays} วัน` },
                    { status: 400 }
                );
            }
        }

        // === SICK LEAVE CERTIFICATE RULE ===
        if (leaveType === 'SICK') {
            // Fetch setting from DB
            const sickResult = await pool.request()
                .input('key', 'LEAVE_SICK_CERT_DAYS')
                .query('SELECT settingValue FROM SystemSettings WHERE settingKey = @key');

            const threshold = sickResult.recordset.length > 0
                ? parseInt(sickResult.recordset[0].settingValue, 10)
                : 3; // Default fallback

            if (usageAmount >= threshold && !hasMedicalCert) {
                return NextResponse.json(
                    { error: `ลาป่วยตั้งแต่ ${threshold} วันขึ้นไป ต้องมีใบรับรองแพทย์` },
                    { status: 400 }
                );
            }
        }

        // === SPLIT-YEAR BALANCE CHECK & DEDUCTION ===
        const leaveStartDate2 = new Date(startDate);
        const leaveEndDate2 = new Date(endDate);
        const startYear = leaveStartDate2.getFullYear();
        const endYear = leaveEndDate2.getFullYear();

        // Determine year-split usage
        let yearSplits: Map<number, number>;

        if (startYear === endYear) {
            // Same year — simple case
            yearSplits = new Map([[startYear, usageAmount]]);
        } else {
            // Cross-year — calculate split using holidays and working saturdays
            const holidayResult = await pool.request()
                .input('startDate2', startDate)
                .input('endDate2', endDate)
                .query(`SELECT date FROM PublicHolidays WHERE date BETWEEN @startDate2 AND @endDate2`);
            const holidays = holidayResult.recordset.map((r: HolidayRow) => new Date(r.date));

            const wSatResult = await pool.request()
                .input('startDate2', startDate)
                .input('endDate2', endDate)
                .query(`SELECT date, startTime, endTime, workHours FROM WorkingSaturdays WHERE date BETWEEN @startDate2 AND @endDate2`);
            const workingSats = wSatResult.recordset.map((r: WorkingSaturdayRow) => ({
                date: new Date(r.date).toISOString().split('T')[0],
                startTime: r.startTime,
                endTime: r.endTime,
                workHours: r.workHours
            }));

            // Fetch WORK_HOURS_PER_DAY setting
            const whpdResult = await pool.request()
                .input('key', 'WORK_HOURS_PER_DAY')
                .query('SELECT settingValue FROM SystemSettings WHERE settingKey = @key');
            const workHoursPerDay = whpdResult.recordset.length > 0
                ? parseFloat(whpdResult.recordset[0].settingValue)
                : 7.5;

            const { splitLeaveByYear } = await import('@/lib/date-utils');
            yearSplits = splitLeaveByYear(
                leaveStartDate2,
                leaveEndDate2,
                holidays,
                isHourly ? TimeSlot.FULL_DAY : (timeSlot as TimeSlot),
                workingSats,
                workHoursPerDay
            );
        }

        if (leaveType === 'VACATION') {
            if (!vacationEligibilityInput || !vacationSettings || !vacationEligibleDateText) {
                return NextResponse.json(
                    { error: 'ไม่สามารถตรวจสอบสิทธิ์ลาพักร้อนได้' },
                    { status: 400 }
                );
            }

            for (const [year] of yearSplits) {
                if (!isVacationEntitledInFiscalYear(vacationEligibilityInput, year, vacationSettings.fiscalYearStart)) {
                    return NextResponse.json(
                        {
                            error: `ยังไม่มีสิทธิ์ลาพักร้อนสำหรับปี ${year} (ใช้สิทธิ์ได้ตั้งแต่ ${vacationEligibleDateText})`,
                        },
                        { status: 400 }
                    );
                }
            }
        }

        // Check balance for each year (skip for OTHER type) — pre-validate before transaction
        if (leaveType !== 'OTHER') {
            for (const [year, amount] of yearSplits) {
                const balanceCheck = await pool.request()
                    .input('userId', userId)
                    .input('leaveType', leaveType)
                    .input('year', year)
                    .query(`
                        SELECT remaining FROM LeaveBalances
                        WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                    `);

                if (balanceCheck.recordset.length === 0) {
                    // Check quota exists and has enough days (validate before transaction)
                    const quotaResult = await pool.request()
                        .input('leaveType', leaveType)
                        .query(`SELECT defaultDays FROM LeaveQuotaSettings WHERE leaveType = @leaveType`);

                    if (quotaResult.recordset.length === 0) {
                        return NextResponse.json(
                            { error: `ไม่พบข้อมูลโควตาประเภท ${leaveType}` },
                            { status: 400 }
                        );
                    }

                    const defaultDays = quotaResult.recordset[0].defaultDays;
                    if (defaultDays < amount) {
                        return NextResponse.json(
                            { error: `วันลาปี ${year} ไม่เพียงพอ (มี ${defaultDays} วัน, ต้องการ ${amount} วัน)` },
                            { status: 400 }
                        );
                    }
                } else if (balanceCheck.recordset[0].remaining < amount) {
                    return NextResponse.json(
                        { error: `วันลาปี ${year} ไม่เพียงพอ (เหลือ ${balanceCheck.recordset[0].remaining} วัน, ต้องการ ${amount} วัน)` },
                        { status: 400 }
                    );
                }
            }
        }

        // === BEGIN TRANSACTION ===
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        let newRequestId: number;

        try {
            // Auto-create balance for years that don't exist yet (inside transaction)
            if (leaveType !== 'OTHER') {
                for (const [year] of yearSplits) {
                    const balanceExists = await new sql.Request(transaction)
                        .input('userId', userId)
                        .input('leaveType', leaveType)
                        .input('year', year)
                        .query(`SELECT id FROM LeaveBalances WHERE userId = @userId AND leaveType = @leaveType AND year = @year`);

                    if (balanceExists.recordset.length === 0) {
                        if (
                            leaveType === 'VACATION' &&
                            (!vacationEligibilityInput ||
                                !vacationSettings ||
                                !isVacationEntitledInFiscalYear(
                                    vacationEligibilityInput,
                                    year,
                                    vacationSettings.fiscalYearStart
                                ))
                        ) {
                            throw new Error(`Blocked VACATION balance auto-create for unentitled year ${year}`);
                        }

                        const quotaResult = await new sql.Request(transaction)
                            .input('leaveType', leaveType)
                            .query(`SELECT defaultDays FROM LeaveQuotaSettings WHERE leaveType = @leaveType`);

                        const defaultDays = quotaResult.recordset[0].defaultDays;
                        await new sql.Request(transaction)
                            .input('userId', userId)
                            .input('leaveType', leaveType)
                            .input('year', year)
                            .input('entitlement', defaultDays)
                            .input('remaining', defaultDays)
                            .query(`
                                INSERT INTO LeaveBalances (userId, leaveType, year, entitlement, used, remaining, carryOver, isAutoCreated)
                                VALUES (@userId, @leaveType, @year, @entitlement, 0, @remaining, 0, 1)
                            `);
                    }
                }
            }

            // Insert leave request
            const insertResult = await new sql.Request(transaction)
                .input('userId', userId)
                .input('leaveType', leaveType)
                .input('startDatetime', startDate)
                .input('endDatetime', endDate)
                .input('isHourly', isHourly ? 1 : 0)
                .input('startTime', startTime)
                .input('endTime', endTime)
                .input('timeSlot', isHourly ? 'HOURLY' : timeSlot)
                .input('usageAmount', usageAmount)
                .input('reason', reason)
                .input('hasMedicalCert', hasMedicalCert ? 1 : 0)
                .input('medicalCertFile', medicalCertificateFile)
                .query(`
                    INSERT INTO LeaveRequests (
                        userId, leaveType, startDatetime, endDatetime,
                        isHourly, startTime, endTime, timeSlot,
                        usageAmount, reason, hasMedicalCertificate, medicalCertificateFile, status
                    )
                    OUTPUT INSERTED.id
                    VALUES (
                        @userId, @leaveType, @startDatetime, @endDatetime,
                        @isHourly, @startTime, @endTime, @timeSlot,
                        @usageAmount, @reason, @hasMedicalCert, @medicalCertFile, 'PENDING'
                    )
                `);

            newRequestId = insertResult.recordset[0].id;

            // Deduct balance for each year and record year splits
            for (const [year, amount] of yearSplits) {
                if (leaveType !== 'OTHER') {
                    await new sql.Request(transaction)
                        .input('userId', userId)
                        .input('leaveType', leaveType)
                        .input('year', year)
                        .input('usageAmount', amount)
                        .query(`
                            UPDATE LeaveBalances
                            SET used = used + @usageAmount,
                                remaining = remaining - @usageAmount,
                                updatedAt = GETDATE()
                            WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                        `);
                }

                // Always record year split for tracking
                await new sql.Request(transaction)
                    .input('leaveRequestId', newRequestId)
                    .input('year', year)
                    .input('usageAmount', amount)
                    .query(`
                        INSERT INTO LeaveRequestYearSplit (leaveRequestId, year, usageAmount)
                        VALUES (@leaveRequestId, @year, @usageAmount)
                    `);
            }

            // Audit log (inside transaction)
            await logAudit({
                userId,
                action: 'CREATE_LEAVE_REQUEST',
                targetTable: 'LeaveRequests',
                targetId: newRequestId,
                newValue: { leaveType, startDate, endDate, usageAmount, reason },
                transaction
            });

            await transaction.commit();
            // === END TRANSACTION ===

        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }

        // Notify manager about pending leave request
        try {
            const managerResult = await pool.request()
                .input('userId', userId)
                .query(`
                    SELECT 
                        u.firstName + ' ' + u.lastName as employeeName,
                        m.id as managerId,
                        m.firstName + ' ' + m.lastName as managerName,
                        m.email as managerEmail
                    FROM Users u
                    LEFT JOIN Users m ON u.departmentHeadId = m.id
                    WHERE u.id = @userId
                `);

            const info = managerResult.recordset[0];

            if (info?.managerId) {
                // 1. System Notification to Manager
                await notifyPendingApproval(
                    info.managerId,
                    info.employeeName,
                    leaveType
                );

                // 2. Email Notification to Manager (Magic Link)
                if (info.managerEmail) {
                    const { sendLeaveRequestEmail } = await import('@/lib/email');
                    await sendLeaveRequestEmail(
                        info.managerEmail,
                        info.managerName || 'Manager',
                        info.employeeName,
                        {
                            id: newRequestId,
                            type: leaveType,
                            startDate: startDate,
                            endDate: endDate,
                            reason: reason,
                            days: usageAmount,
                            timeSlot: isHourly ? 'HOURLY' : timeSlot,
                            isHourly: isHourly,
                            startTime: startTime,
                            endTime: endTime,
                        },
                        info.managerId
                    );
                }

                // 3. Notify Delegates (if any)
                try {
                    const { getActiveDelegates } = await import('@/lib/delegate');
                    const delegateIds = await getActiveDelegates(info.managerId);

                    for (const delegateId of delegateIds) {
                        // Skip if delegate is the same person who is requesting leave
                        if (delegateId === userId) continue;

                        // Fetch delegate info
                        const delegateResult = await pool.request()
                            .input('delegateId', delegateId)
                            .query(`SELECT firstName + ' ' + lastName as name, email FROM Users WHERE id = @delegateId AND isActive = 1`);

                        if (delegateResult.recordset.length > 0) {
                            const delegate = delegateResult.recordset[0];

                            // System Notification
                            await notifyPendingApproval(
                                delegateId,
                                `${info.employeeName} (แทน${info.managerName})`,
                                leaveType
                            );

                            // Email with Magic Link
                            if (delegate.email) {
                                const { sendLeaveRequestEmail } = await import('@/lib/email');
                                await sendLeaveRequestEmail(
                                    delegate.email,
                                    delegate.name || 'ผู้อนุมัติแทน',
                                    info.employeeName,
                                    {
                                        id: newRequestId,
                                        type: leaveType,
                                        startDate: startDate,
                                        endDate: endDate,
                                        reason: reason,
                                        days: usageAmount,
                                        timeSlot: isHourly ? 'HOURLY' : timeSlot,
                                        isHourly: isHourly,
                                        startTime: startTime,
                                        endTime: endTime,
                                    },
                                    delegateId
                                );
                            }
                        }
                    }
                } catch (delegateError) {
                    console.error('Error notifying delegates:', delegateError);
                }
            }
        } catch (notifyError) {
            console.error('Error notifying manager:', notifyError);
            // Don't fail the request if notification fails
        }

        return NextResponse.json({
            success: true,
            message: 'สร้างใบลาสำเร็จ',
            data: { id: newRequestId }
        });

    } catch (error) {
        console.error('Error creating leave request:', error);
        return NextResponse.json(
            { error: 'Failed to create leave request' },
            { status: 500 }
        );
    }
}
