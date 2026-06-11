import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { parseAdvanceNoticeDays } from '@/lib/leave-advance-notice';
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

function parseNonNegativeInteger(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
            settings.vacationAfterProbationYears = parseNonNegativeInteger(
                row.settingValue,
                DEFAULT_VACATION_AFTER_PROBATION_YEARS
            );
        } else if (row.settingKey === 'LEAVE_ADVANCE_DAYS') {
            settings.advanceNoticeDays = parseAdvanceNoticeDays(row.settingValue, DEFAULT_ADVANCE_NOTICE_DAYS);
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
    user: UserEligibilityRow,
    settings: Settings
): VacationEligibilityInput | null {
    if (!user.startDate) {
        return null;
    }

    return {
        startDate: user.startDate,
        probationDays: user.probationDays ?? settings.probationStandardDays,
        probationExtensionDays: user.probationExtensionDays,
        probationOverrideDate: user.probationOverrideDate,
        vacationDelayYears: settings.vacationAfterProbationYears,
    };
}

function filterVacationBalanceRows<T extends { leaveType: string }>(
    rows: T[],
    canShowVacationBalance: boolean
): T[] {
    return canShowVacationBalance ? rows : rows.filter((row) => row.leaveType !== 'VACATION');
}

function buildVacationEligibilityMetadata(
    user: UserEligibilityRow,
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
    const eligibilityInput = buildVacationEligibilityInput(user, settings);

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
 * GET /api/leave/balance
 * ดึงยอดวันลาคงเหลือของ User ปัจจุบัน
 */
export async function GET() {
    try {
        // Check authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get database connection
        const pool = await getPool();
        const userId = Number(session.user.id);
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

        if (userResult.recordset.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const user = userResult.recordset[0] as UserEligibilityRow;
        const vacationEligibility = buildVacationEligibilityMetadata(user, settings, today);
        const canShowVacationBalance =
            vacationEligibility.isEligibleToday && vacationEligibility.entitledInCurrentFiscalYear;

        // Query leave balances for current user and year
        const result = await pool.request()
            .input('userId', userId)
            .input('year', currentYear)
            .query(`
                SELECT 
                    lb.id,
                    lb.leaveType,
                    lb.year,
                    lb.entitlement,
                    lb.used,
                    lb.remaining,
                    lb.carryOver
                FROM LeaveBalances lb
                WHERE lb.userId = @userId AND lb.year = @year
                ORDER BY lb.leaveType
            `);

        // If no balance records exist, create default ones
        if (result.recordset.length === 0) {
            // Get default quotas from LeaveQuotaSettings
            const quotaResult = await pool.request().query(`
                SELECT leaveType, defaultDays FROM LeaveQuotaSettings
            `);

            // Insert default balances for this user
            for (const quota of quotaResult.recordset) {
                if (quota.leaveType === 'VACATION' && !canShowVacationBalance) {
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

            // Re-query to get the newly created balances
            const newResult = await pool.request()
                .input('userId', userId)
                .input('year', currentYear)
                .query(`
                    SELECT 
                        lb.id,
                        lb.leaveType,
                        lb.year,
                        lb.entitlement,
                        lb.used,
                        lb.remaining,
                        lb.carryOver
                    FROM LeaveBalances lb
                    WHERE lb.userId = @userId AND lb.year = @year
                    ORDER BY lb.leaveType
                `);

            return NextResponse.json({
                success: true,
                data: filterVacationBalanceRows(newResult.recordset, canShowVacationBalance),
                year: currentYear,
                vacationEligibility,
            });
        }

        return NextResponse.json({
            success: true,
            data: filterVacationBalanceRows(result.recordset, canShowVacationBalance),
            year: currentYear,
            vacationEligibility,
        });

    } catch (error) {
        console.error('Error fetching leave balance:', error);
        return NextResponse.json(
            { error: 'Failed to fetch leave balance' },
            { status: 500 }
        );
    }
}
