import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import {
    calculateProbationEndDate,
    calculateVacationEligibleDate,
    daysUntilVacationEligible,
    getFiscalYearRange,
    isVacationEligibleOnDate,
    isVacationEntitledInFiscalYear,
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
    probationEndDate: string | null;
};

type Settings = {
    probationStandardDays: number;
    vacationAfterProbationYears: number;
    advanceNoticeDays: number;
    fiscalYearStart: string;
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

function buildSettings(rows: Array<{ settingKey: string; settingValue: string | null }>): Settings {
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
            settings.advanceNoticeDays = parseNonNegativeInteger(row.settingValue, DEFAULT_ADVANCE_NOTICE_DAYS);
        } else if (row.settingKey === 'LEAVE_YEAR_START') {
            settings.fiscalYearStart = parseFiscalYearStart(row.settingValue);
        }
    }

    return settings;
}

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const pool = await getPool();
        const userResult = await pool.request()
            .input('userId', Number(session.user.id))
            .query(`
                SELECT
                    CONVERT(varchar, startDate, 23) as startDate,
                    probationDays,
                    probationExtensionDays,
                    CONVERT(varchar, probationOverrideDate, 23) as probationOverrideDate,
                    CONVERT(varchar, probationEndDate, 23) as probationEndDate
                FROM Users
                WHERE id = @userId
            `);

        if (userResult.recordset.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
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

        const user = userResult.recordset[0] as UserEligibilityRow;
        const settings = buildSettings(settingsResult.recordset);
        const today = new Date();
        const currentFiscalYear = getCurrentFiscalYear(today, settings.fiscalYearStart);
        const fiscalYearRange = getFiscalYearRange(currentFiscalYear, settings.fiscalYearStart);

        const baseData = {
            startDate: user.startDate,
            probationDays: user.probationDays,
            probationExtensionDays: user.probationExtensionDays,
            probationOverrideDate: user.probationOverrideDate,
            fiscalYearStart: settings.fiscalYearStart,
            fiscalYearStartDate: toDateText(fiscalYearRange.start),
            fiscalYearEndDate: toDateText(fiscalYearRange.end),
            probationStandardDays: settings.probationStandardDays,
            vacationAfterProbationYears: settings.vacationAfterProbationYears,
            advanceNoticeDays: settings.advanceNoticeDays,
        };

        if (!user.startDate) {
            return NextResponse.json({
                success: true,
                data: {
                    ...baseData,
                    probationEndDate: null,
                    vacationEligibleDate: null,
                    daysUntilEligible: null,
                    isEligibleToday: false,
                    entitledInCurrentFiscalYear: false,
                },
            });
        }

        const eligibilityInput = {
            startDate: user.startDate,
            probationDays: user.probationDays ?? settings.probationStandardDays,
            probationExtensionDays: user.probationExtensionDays,
            probationOverrideDate: user.probationOverrideDate,
            vacationDelayYears: settings.vacationAfterProbationYears,
        };

        const probationEndDate = calculateProbationEndDate(eligibilityInput);
        const vacationEligibleDate = calculateVacationEligibleDate(eligibilityInput);

        return NextResponse.json({
            success: true,
            data: {
                ...baseData,
                probationEndDate: toDateText(probationEndDate),
                vacationEligibleDate: toDateText(vacationEligibleDate),
                daysUntilEligible: daysUntilVacationEligible(eligibilityInput, today),
                isEligibleToday: isVacationEligibleOnDate(eligibilityInput, today),
                entitledInCurrentFiscalYear: isVacationEntitledInFiscalYear(
                    eligibilityInput,
                    currentFiscalYear,
                    settings.fiscalYearStart
                ),
            },
        });
    } catch (error) {
        console.error('Error fetching vacation eligibility:', error);
        return NextResponse.json({ error: 'Failed to fetch vacation eligibility' }, { status: 500 });
    }
}
