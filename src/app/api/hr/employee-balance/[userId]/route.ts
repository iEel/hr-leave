import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { normalizeMedicalCertificateFileRecord } from '@/lib/medical-files';
import {
    calculateProbationEndDate,
    calculateVacationEligibleDate,
    daysUntilVacationEligible,
    getFiscalYearRange,
    isVacationEligibleOnDate,
    isVacationEntitledInFiscalYear,
    type VacationEligibilityInput,
} from '@/lib/vacation-eligibility';

const DEFAULT_PROBATION_STANDARD_DAYS = 90;
const DEFAULT_VACATION_AFTER_PROBATION_YEARS = 1;
const DEFAULT_ADVANCE_NOTICE_DAYS = 3;
const DEFAULT_FISCAL_YEAR_START = '01-01';

interface BalanceRow {
    leaveType: string;
    entitlement: number;
    used: number;
    remaining: number;
    carryOver: number;
}

interface EmployeeRow {
    id: number;
    employeeId: string | null;
    firstName: string;
    lastName: string;
    department: string | null;
    company: string | null;
    startDate: string | null;
    probationDays: number | null;
    probationExtensionDays: number | null;
    probationOverrideDate: string | null;
}

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

type VacationEligibilityMetadata = {
    probationEndDate: string | null;
    vacationEligibleDate: string | null;
    daysUntilEligible: number | null;
    isEligibleToday: boolean;
    entitledInCurrentFiscalYear: boolean;
    fiscalYearStart: string;
    fiscalYearStartDate: string;
    fiscalYearEndDate: string;
    advanceNoticeDays: number;
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

function toDateOnly(value: Date): Date {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}

function getCurrentFiscalYear(today: Date, fiscalYearStart: string): number {
    const calendarYear = today.getFullYear();
    const currentYearRange = getFiscalYearRange(calendarYear, fiscalYearStart);

    return toDateOnly(today) >= currentYearRange.start ? calendarYear : calendarYear - 1;
}

function buildVacationEligibilityInput(
    employee: EmployeeRow,
    settings: Settings
): VacationEligibilityInput | null {
    if (!employee.startDate) {
        return null;
    }

    return {
        startDate: employee.startDate,
        probationDays: employee.probationDays ?? settings.probationStandardDays,
        probationExtensionDays: employee.probationExtensionDays,
        probationOverrideDate: employee.probationOverrideDate,
        vacationDelayYears: settings.vacationAfterProbationYears,
    };
}

function buildVacationEligibilityMetadata(
    employee: EmployeeRow,
    settings: Settings,
    today: Date
): VacationEligibilityMetadata {
    const currentFiscalYear = getCurrentFiscalYear(today, settings.fiscalYearStart);
    const fiscalYearRange = getFiscalYearRange(currentFiscalYear, settings.fiscalYearStart);
    const baseMetadata = {
        fiscalYearStart: settings.fiscalYearStart,
        fiscalYearStartDate: toDateText(fiscalYearRange.start),
        fiscalYearEndDate: toDateText(fiscalYearRange.end),
        advanceNoticeDays: settings.advanceNoticeDays,
    };
    const eligibilityInput = buildVacationEligibilityInput(employee, settings);

    if (!eligibilityInput) {
        return {
            ...baseMetadata,
            probationEndDate: null,
            vacationEligibleDate: null,
            daysUntilEligible: null,
            isEligibleToday: false,
            entitledInCurrentFiscalYear: false,
        };
    }

    const probationEndDate = calculateProbationEndDate(eligibilityInput);
    const vacationEligibleDate = calculateVacationEligibleDate(eligibilityInput);

    return {
        ...baseMetadata,
        probationEndDate: toDateText(probationEndDate),
        vacationEligibleDate: toDateText(vacationEligibleDate),
        daysUntilEligible: daysUntilVacationEligible(eligibilityInput, today),
        isEligibleToday: isVacationEligibleOnDate(eligibilityInput, today),
        entitledInCurrentFiscalYear: isVacationEntitledInFiscalYear(
            eligibilityInput,
            currentFiscalYear,
            settings.fiscalYearStart
        ),
    };
}

/**
 * GET /api/hr/employee-balance/[userId]
 * Get leave balance for a specific employee
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { userId } = await params;
        const pool = await getPool();

        // Check permissions: HR, ADMIN can view anyone, MANAGER can view their subordinates
        const isHRorAdmin = session.user.role === 'HR' || session.user.role === 'ADMIN';

        if (!isHRorAdmin) {
            // Check if the target user is a subordinate of this manager
            const subordinateCheck = await pool.request()
                .input('managerId', session.user.id)
                .input('userId', userId)
                .query(`
                    SELECT id FROM Users 
                    WHERE id = @userId AND departmentHeadId = @managerId
                `);

            if (subordinateCheck.recordset.length === 0) {
                return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
            }
        }

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
        const settings = buildSettings(settingsResult.recordset);
        const today = new Date();
        const currentYear = getCurrentFiscalYear(today, settings.fiscalYearStart);

        // Get employee info
        const empResult = await pool.request()
            .input('userId', userId)
            .query(`
                SELECT id, employeeId, firstName, lastName, department, company, 
                       CONVERT(varchar, startDate, 23) as startDate,
                       probationDays,
                       probationExtensionDays,
                       CONVERT(varchar, probationOverrideDate, 23) as probationOverrideDate
                FROM Users 
                WHERE id = @userId
            `);

        if (empResult.recordset.length === 0) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        const employee = empResult.recordset[0] as EmployeeRow;
        const vacationEligibility = buildVacationEligibilityMetadata(employee, settings, today);

        // Get current year balance
        const balanceResult = await pool.request()
            .input('userId', userId)
            .input('year', currentYear)
            .query(`
                SELECT leaveType, entitlement, used, remaining, carryOver
                FROM LeaveBalances
                WHERE userId = @userId AND year = @year
                ORDER BY leaveType
            `);

        // Auto-create missing balance records from LeaveQuotaSettings
        if (balanceResult.recordset.length === 0 || balanceResult.recordset.length < 9) {
            const quotaResult = await pool.request().query(`
                SELECT leaveType, defaultDays FROM LeaveQuotaSettings
            `);

            const existingTypes = new Set(balanceResult.recordset.map((b: BalanceRow) => b.leaveType));

            for (const quota of quotaResult.recordset) {
                if (!existingTypes.has(quota.leaveType)) {
                    if (quota.leaveType === 'VACATION' && !vacationEligibility.entitledInCurrentFiscalYear) {
                        continue;
                    }

                    await pool.request()
                        .input('userId', userId)
                        .input('leaveType', quota.leaveType)
                        .input('year', currentYear)
                        .input('entitlement', quota.defaultDays)
                        .input('remaining', quota.defaultDays)
                        .query(`
                            INSERT INTO LeaveBalances (userId, leaveType, year, entitlement, used, remaining, carryOver, isAutoCreated)
                            VALUES (@userId, @leaveType, @year, @entitlement, 0, @remaining, 0, 1)
                        `);
                }
            }

            // Re-fetch after auto-create
            if (quotaResult.recordset.length > existingTypes.size) {
                const refreshResult = await pool.request()
                    .input('userId', userId)
                    .input('year', currentYear)
                    .query(`
                        SELECT leaveType, entitlement, used, remaining, carryOver
                        FROM LeaveBalances
                        WHERE userId = @userId AND year = @year
                        ORDER BY leaveType
                    `);
                balanceResult.recordset = refreshResult.recordset;
            }
        }

        // For unlimited leave types (entitlement=0), compute actual used minutes from LeaveRequests
        // to avoid precision loss from accumulated decimal conversions
        const actualUsedResult = await pool.request()
            .input('userId', userId)
            .input('year', currentYear)
            .query(`
                SELECT 
                    leaveType,
                    SUM(
                        CASE 
                            WHEN isHourly = 1 AND TRY_CAST(startTime AS TIME) IS NOT NULL AND TRY_CAST(endTime AS TIME) IS NOT NULL THEN
                                -- Calculate net minutes directly from times
                                DATEDIFF(MINUTE, 
                                    TRY_CAST(startTime AS TIME), 
                                    TRY_CAST(endTime AS TIME)
                                )
                                -- Deduct lunch overlap if applicable
                                - CASE 
                                    WHEN TRY_CAST(startTime AS TIME) < CAST('13:00' AS TIME) 
                                         AND TRY_CAST(endTime AS TIME) > CAST('12:00' AS TIME) 
                                    THEN 
                                        DATEDIFF(MINUTE,
                                            CASE WHEN TRY_CAST(startTime AS TIME) > CAST('12:00' AS TIME) THEN TRY_CAST(startTime AS TIME) ELSE CAST('12:00' AS TIME) END,
                                            CASE WHEN TRY_CAST(endTime AS TIME) < CAST('13:00' AS TIME) THEN TRY_CAST(endTime AS TIME) ELSE CAST('13:00' AS TIME) END
                                        )
                                    ELSE 0
                                  END
                            ELSE 
                                -- For full/half day leaves, convert days to minutes
                                CAST(usageAmount * 7.5 * 60 AS INT)
                        END
                    ) as totalUsedMinutes
                FROM LeaveRequests
                WHERE userId = @userId 
                    AND YEAR(startDatetime) = @year
                    AND status IN ('PENDING', 'APPROVED')
                GROUP BY leaveType
            `);

        // Create a map of actual used minutes per leave type
        const actualUsedMap: Record<string, number> = {};
        for (const row of actualUsedResult.recordset) {
            actualUsedMap[row.leaveType] = row.totalUsedMinutes || 0;
        }

        // Enrich balance data with actual used minutes for unlimited types
        const enrichedBalances = balanceResult.recordset.map((b: BalanceRow) => ({
            ...b,
            actualUsedMinutes: actualUsedMap[b.leaveType] || 0,
        }));

        // Get leave history this year
        const historyResult = await pool.request()
            .input('userId', userId)
            .input('year', currentYear)
            .query(`
                SELECT 
                    id, leaveType, status, usageAmount as days,
                    isHourly, startTime, endTime,
                    hasMedicalCertificate as hasMedicalCert,
                    medicalCertificateFile,
                    CONVERT(varchar, startDatetime, 23) as startDate,
                    CONVERT(varchar, endDatetime, 23) as endDate,
                    reason
                FROM LeaveRequests
                WHERE userId = @userId AND YEAR(startDatetime) = @year
                ORDER BY startDatetime DESC
            `);

        return NextResponse.json({
            success: true,
            data: {
                employee,
                year: currentYear,
                vacationEligibility,
                balances: enrichedBalances,
                leaveHistory: historyResult.recordset.map(normalizeMedicalCertificateFileRecord)
            }
        });

    } catch (error) {
        console.error('Error fetching employee balance:', error);
        return NextResponse.json({ error: 'Failed to fetch employee balance' }, { status: 500 });
    }
}
