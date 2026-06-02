import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import {
    calculateVacationEligibleDate,
    isVacationEntitledInFiscalYear,
    type VacationEligibilityInput,
} from '@/lib/vacation-eligibility';

const DEFAULT_PROBATION_STANDARD_DAYS = 90;
const DEFAULT_VACATION_AFTER_PROBATION_YEARS = 1;
const DEFAULT_FISCAL_YEAR_START = '01-01';

type YearEndSettings = {
    probationStandardDays: number;
    vacationAfterProbationYears: number;
    fiscalYearStart: string;
};

type VacationEligibilityUser = {
    startDate: string | null;
    probationDays: number | null;
    probationExtensionDays: number | null;
    probationOverrideDate: string | null;
};

type LeaveQuotaSetting = {
    defaultDays: number;
    allowCarryOver: boolean;
    maxCarryOverDays: number;
    minTenureYears: number;
};

type SourceBalance = {
    remaining: number;
    used: number;
    entitlement: number;
};

type PreviewBalance = {
    leaveType: string;
    currentRemaining: number;
    currentUsed: number;
    currentEntitlement: number;
    carryOver: number;
    newEntitlement: number;
    newTotal: number;
    vacationEligibleDate?: string | null;
    vacationEligibleInFromYear?: boolean;
    vacationEligibleInToYear?: boolean;
    vacationEligibilityStatus?: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'MISSING_START_DATE';
    vacationEligibilityReason?: string;
    vacationCarryOverBlockedByEligibility?: boolean;
};

type InternalEmployeePreview = VacationEligibilityUser & {
    userId: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    department: string;
    company: string;
    sourceBalances: Record<string, SourceBalance>;
    balances: PreviewBalance[];
};

function isHRStaffSessionUser(user: unknown): boolean {
    return typeof user === 'object' && user !== null && 'isHRStaff' in user && user.isHRStaff === true;
}

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

function buildSettings(rows: Array<{ settingKey: string; settingValue: string | null }>): YearEndSettings {
    const settings: YearEndSettings = {
        probationStandardDays: DEFAULT_PROBATION_STANDARD_DAYS,
        vacationAfterProbationYears: DEFAULT_VACATION_AFTER_PROBATION_YEARS,
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
        } else if (row.settingKey === 'LEAVE_YEAR_START') {
            settings.fiscalYearStart = parseFiscalYearStart(row.settingValue);
        }
    }

    return settings;
}

async function loadYearEndSettings(pool: Awaited<ReturnType<typeof getPool>>): Promise<YearEndSettings> {
    const settingsResult = await pool.request().query(`
        SELECT settingKey, settingValue
        FROM SystemSettings
        WHERE settingKey IN (
            'PROBATION_STANDARD_DAYS',
            'VACATION_AFTER_PROBATION_YEARS',
            'LEAVE_YEAR_START'
        )
    `);

    return buildSettings(settingsResult.recordset);
}

function buildVacationEligibilityInput(
    user: VacationEligibilityUser,
    settings: YearEndSettings
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

/**
 * GET /api/hr/year-end/preview
 * Preview year-end processing - shows what will happen
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        // Allow if role is HR/ADMIN OR user has isHRStaff flag
        const isHRStaff = isHRStaffSessionUser(session?.user);
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const fromYear = parseInt(searchParams.get('fromYear') || String(new Date().getFullYear()));
        const toYear = fromYear + 1;

        const pool = await getPool();
        const settings = await loadYearEndSettings(pool);

        // Get leave quota settings for carry-over rules
        const quotaResult = await pool.request()
            .query(`
                SELECT leaveType, defaultDays, allowCarryOver, maxCarryOverDays, minTenureYears
                FROM LeaveQuotaSettings
            `);

        const quotaSettings: Record<string, LeaveQuotaSetting> = {};
        const leaveTypes: string[] = [];
        for (const row of quotaResult.recordset) {
            quotaSettings[row.leaveType] = {
                defaultDays: row.defaultDays,
                allowCarryOver: row.allowCarryOver,
                maxCarryOverDays: row.maxCarryOverDays,
                minTenureYears: row.minTenureYears ?? 0
            };
            leaveTypes.push(row.leaveType);
        }

        // Get all active employees with their current year balances
        const employeesResult = await pool.request()
            .input('year', fromYear)
            .query(`
                SELECT 
                    u.id as userId,
                    u.employeeId,
                    u.firstName,
                    u.lastName,
                    u.department,
                    u.company,
                    CONVERT(varchar, u.startDate, 23) as startDate,
                    u.probationDays,
                    u.probationExtensionDays,
                    CONVERT(varchar, u.probationOverrideDate, 23) as probationOverrideDate,
                    lb.leaveType,
                    ISNULL(lb.remaining, 0) as remaining,
                    ISNULL(lb.used, 0) as used,
                    ISNULL(lb.entitlement, 0) as entitlement
                FROM Users u
                LEFT JOIN LeaveBalances lb ON u.id = lb.userId AND lb.year = @year
                WHERE u.isActive = 1
                ORDER BY u.employeeId, lb.leaveType
            `);

        // Check if next year already has data (including auto-created info)
        const nextYearCheck = await pool.request()
            .input('toYear', toYear)
            .query(`
                SELECT 
                    COUNT(*) as totalCount,
                    SUM(CASE WHEN isAutoCreated = 1 THEN 1 ELSE 0 END) as autoCreatedCount
                FROM LeaveBalances WHERE year = @toYear
            `);

        const nextYearTotalCount = nextYearCheck.recordset[0].totalCount;
        const nextYearAutoCreatedCount = nextYearCheck.recordset[0].autoCreatedCount || 0;
        const nextYearExists = nextYearTotalCount > 0;
        const nextYearAllAutoCreated = nextYearTotalCount > 0 && nextYearTotalCount === nextYearAutoCreatedCount;

        // Group source-year balances by employee, then generate preview rows from configured leave types.
        const employeeMap: Record<number, InternalEmployeePreview> = {};

        for (const row of employeesResult.recordset) {
            if (!employeeMap[row.userId]) {
                employeeMap[row.userId] = {
                    userId: row.userId,
                    employeeId: row.employeeId,
                    firstName: row.firstName,
                    lastName: row.lastName,
                    department: row.department,
                    company: row.company,
                    startDate: row.startDate,
                    probationDays: row.probationDays,
                    probationExtensionDays: row.probationExtensionDays,
                    probationOverrideDate: row.probationOverrideDate,
                    sourceBalances: {},
                    balances: []
                };
            }

            if (row.leaveType) {
                employeeMap[row.userId].sourceBalances[row.leaveType] = {
                    remaining: row.remaining,
                    used: row.used,
                    entitlement: row.entitlement
                };
            }
        }

        for (const employee of Object.values(employeeMap)) {
            const startYear = employee.startDate ? Number.parseInt(employee.startDate.slice(0, 4), 10) : toYear;
            const yearsOfService = toYear - startYear;

            for (const leaveType of leaveTypes) {
                const quota = quotaSettings[leaveType];
                const sourceBalance = employee.sourceBalances[leaveType] || {
                    remaining: 0,
                    used: 0,
                    entitlement: 0
                };
                let carryOver = quota.allowCarryOver
                    ? Math.min(sourceBalance.remaining, quota.maxCarryOverDays)
                    : 0;
                let newEntitlement = quota.defaultDays;
                let vacationEligibleDate: string | null | undefined;
                let vacationEligibleInFromYear: boolean | undefined;
                let vacationEligibleInToYear: boolean | undefined;
                let vacationEligibilityStatus: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'MISSING_START_DATE' | undefined;
                let vacationEligibilityReason: string | undefined;
                let vacationCarryOverBlockedByEligibility: boolean | undefined;

                if (leaveType === 'VACATION') {
                    const eligibilityInput = buildVacationEligibilityInput(employee, settings);

                    if (eligibilityInput) {
                        vacationEligibleDate = toDateText(calculateVacationEligibleDate(eligibilityInput));
                        vacationEligibleInFromYear = isVacationEntitledInFiscalYear(
                            eligibilityInput,
                            fromYear,
                            settings.fiscalYearStart
                        );
                        vacationEligibleInToYear = isVacationEntitledInFiscalYear(
                            eligibilityInput,
                            toYear,
                            settings.fiscalYearStart
                        );
                        carryOver = vacationEligibleInFromYear && quota.allowCarryOver
                            ? Math.min(sourceBalance.remaining, quota.maxCarryOverDays)
                            : 0;
                        newEntitlement = vacationEligibleInToYear ? quota.defaultDays : 0;
                        vacationEligibilityStatus = vacationEligibleInToYear ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
                        vacationEligibilityReason = vacationEligibleInToYear
                            ? 'eligible_in_target_fiscal_year'
                            : 'not_eligible_in_target_fiscal_year';
                        vacationCarryOverBlockedByEligibility =
                            !vacationEligibleInFromYear && quota.allowCarryOver && sourceBalance.remaining > 0;
                    } else {
                        carryOver = 0;
                        newEntitlement = 0;
                        vacationEligibleDate = null;
                        vacationEligibleInFromYear = false;
                        vacationEligibleInToYear = false;
                        vacationEligibilityStatus = 'MISSING_START_DATE';
                        vacationEligibilityReason = 'missing_start_date';
                        vacationCarryOverBlockedByEligibility = quota.allowCarryOver && sourceBalance.remaining > 0;
                    }
                } else if (yearsOfService < quota.minTenureYears) {
                    continue;
                }

                employee.balances.push({
                    leaveType,
                    currentRemaining: sourceBalance.remaining,
                    currentUsed: sourceBalance.used,
                    currentEntitlement: sourceBalance.entitlement,
                    carryOver,
                    newEntitlement,
                    newTotal: newEntitlement + carryOver,
                    vacationEligibleDate,
                    vacationEligibleInFromYear,
                    vacationEligibleInToYear,
                    vacationEligibilityStatus,
                    vacationEligibilityReason,
                    vacationCarryOverBlockedByEligibility
                });
            }
        }

        // Calculate summary stats
        const employees = Object.values(employeeMap).map(employee => ({
            userId: employee.userId,
            employeeId: employee.employeeId,
            firstName: employee.firstName,
            lastName: employee.lastName,
            department: employee.department,
            company: employee.company,
            balances: employee.balances
        }));
        const totalCarryOverByType: Record<string, number> = {};

        for (const emp of employees) {
            for (const bal of emp.balances) {
                if (!totalCarryOverByType[bal.leaveType]) {
                    totalCarryOverByType[bal.leaveType] = 0;
                }
                totalCarryOverByType[bal.leaveType] += bal.carryOver;
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                fromYear,
                toYear,
                nextYearExists,
                nextYearAutoCreatedCount,
                nextYearAllAutoCreated,
                employees,
                summary: {
                    totalEmployees: employees.length,
                    carryOverByType: totalCarryOverByType
                },
                quotaSettings
            }
        });

    } catch (error) {
        console.error('Error previewing year-end:', error);
        return NextResponse.json({ error: 'Failed to preview year-end processing' }, { status: 500 });
    }
}
