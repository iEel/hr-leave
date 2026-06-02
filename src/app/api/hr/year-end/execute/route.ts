import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool, sql } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import {
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
 * POST /api/hr/year-end/execute
 * Execute year-end processing - create new year balances with carry-over
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = isHRStaffSessionUser(session?.user);
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { fromYear, forceOverwrite = false } = body;

        if (!fromYear) {
            return NextResponse.json({ error: 'fromYear is required' }, { status: 400 });
        }

        const toYear = fromYear + 1;
        const pool = await getPool();
        const settings = await loadYearEndSettings(pool);

        // Check if next year already has data
        const nextYearCheck = await pool.request()
            .input('toYear', toYear)
            .query(`
                SELECT 
                    COUNT(*) as totalCount,
                    SUM(CASE WHEN isAutoCreated = 1 THEN 1 ELSE 0 END) as autoCreatedCount
                FROM LeaveBalances WHERE year = @toYear
            `);

        const totalCount = nextYearCheck.recordset[0].totalCount;
        const autoCreatedCount = nextYearCheck.recordset[0].autoCreatedCount;
        const allAutoCreated = totalCount > 0 && totalCount === autoCreatedCount;

        if (totalCount > 0 && !allAutoCreated && !forceOverwrite) {
            return NextResponse.json({
                error: `ปี ${toYear} มีข้อมูลอยู่แล้ว กรุณาเลือก "เขียนทับ" หากต้องการประมวลผลใหม่`
            }, { status: 400 });
        }

        // Snapshot existing usage before deleting (for auto-created records)
        const existingUsage: Record<string, { used: number }> = {};
        let overwrittenCount = 0;

        // Get leave quota settings (read-only, outside transaction)
        const quotaResult = await pool.request()
            .query(`
                SELECT leaveType, defaultDays, allowCarryOver, maxCarryOverDays, minTenureYears
                FROM LeaveQuotaSettings
            `);

        const quotaSettings: Record<string, {
            defaultDays: number;
            allowCarryOver: boolean;
            maxCarryOverDays: number;
            minTenureYears: number;
        }> = {};
        const leaveTypes: string[] = [];

        for (const row of quotaResult.recordset) {
            quotaSettings[row.leaveType] = {
                defaultDays: row.defaultDays,
                allowCarryOver: row.allowCarryOver,
                maxCarryOverDays: row.maxCarryOverDays,
                minTenureYears: row.minTenureYears
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
                    CONVERT(varchar, u.startDate, 23) as startDate,
                    u.probationDays,
                    u.probationExtensionDays,
                    CONVERT(varchar, u.probationOverrideDate, 23) as probationOverrideDate,
                    lb.leaveType,
                    ISNULL(lb.remaining, 0) as remaining
                FROM Users u
                LEFT JOIN LeaveBalances lb ON u.id = lb.userId AND lb.year = @year
                WHERE u.isActive = 1
            `);

        // Group by employee
        const employeeData: Record<number, {
            userId: number;
            employeeId: string;
            startDate: string | null;
            probationDays: number | null;
            probationExtensionDays: number | null;
            probationOverrideDate: string | null;
            balances: Record<string, number>;
        }> = {};

        for (const row of employeesResult.recordset) {
            if (!employeeData[row.userId]) {
                employeeData[row.userId] = {
                    userId: row.userId,
                    employeeId: row.employeeId,
                    startDate: row.startDate,
                    probationDays: row.probationDays,
                    probationExtensionDays: row.probationExtensionDays,
                    probationOverrideDate: row.probationOverrideDate,
                    balances: {}
                };
            }
            if (row.leaveType) {
                employeeData[row.userId].balances[row.leaveType] = row.remaining;
            }
        }

        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];
        const carryOverSummary: Record<string, { count: number; totalDays: number }> = {};
        const vacationEligibilitySummary = {
            checked: 0,
            eligibleInToYear: 0,
            skippedInToYear: 0,
            missingStartDate: 0,
            carryOverEligibleInFromYear: 0,
            carryOverBlockedByFromYearEligibility: 0
        };

        // === BEGIN TRANSACTION ===
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Delete existing data if force overwrite or all auto-created
            if (totalCount > 0 && (forceOverwrite || allAutoCreated)) {
                // Save existing usage amounts (from cross-year leaves taken before year-end)
                const usageSnapshot = await new sql.Request(transaction)
                    .input('toYear', toYear)
                    .query(`
                        SELECT userId, leaveType, used 
                        FROM LeaveBalances 
                        WHERE year = @toYear AND used > 0
                    `);

                for (const row of usageSnapshot.recordset) {
                    const key = `${row.userId}_${row.leaveType}`;
                    existingUsage[key] = { used: row.used };
                }

                const deleteResult = await new sql.Request(transaction)
                    .input('toYear', toYear)
                    .query(`DELETE FROM LeaveBalances WHERE year = @toYear`);

                overwrittenCount = deleteResult.rowsAffected[0] || 0;
            }

            // Process each employee
            for (const emp of Object.values(employeeData)) {
                try {
                    // Calculate years of service by end of toYear
                    const startYear = emp.startDate ? Number.parseInt(emp.startDate.slice(0, 4), 10) : toYear;
                    const yearsOfService = toYear - startYear;

                    // Insert new balance for each leave type
                    for (const leaveType of leaveTypes) {
                        const quota = quotaSettings[leaveType];

                        const currentRemaining = emp.balances[leaveType] || 0;
                        let carryOver = quota.allowCarryOver
                            ? Math.min(currentRemaining, quota.maxCarryOverDays)
                            : 0;
                        let entitlement = quota.defaultDays;

                        if (leaveType === 'VACATION') {
                            vacationEligibilitySummary.checked++;
                            const eligibilityInput = buildVacationEligibilityInput(emp, settings);

                            if (!eligibilityInput) {
                                vacationEligibilitySummary.missingStartDate++;
                                continue;
                            }

                            const eligibleInFromYear = isVacationEntitledInFiscalYear(
                                eligibilityInput,
                                fromYear,
                                settings.fiscalYearStart
                            );
                            const eligibleInToYear = isVacationEntitledInFiscalYear(
                                eligibilityInput,
                                toYear,
                                settings.fiscalYearStart
                            );

                            if (!eligibleInToYear) {
                                vacationEligibilitySummary.skippedInToYear++;
                                continue;
                            }

                            vacationEligibilitySummary.eligibleInToYear++;
                            entitlement = quota.defaultDays;
                            carryOver = eligibleInFromYear && quota.allowCarryOver
                                ? Math.min(currentRemaining, quota.maxCarryOverDays)
                                : 0;

                            if (eligibleInFromYear) {
                                vacationEligibilitySummary.carryOverEligibleInFromYear++;
                            } else if (quota.allowCarryOver && currentRemaining > 0) {
                                vacationEligibilitySummary.carryOverBlockedByFromYearEligibility++;
                            }
                        } else if (yearsOfService < quota.minTenureYears) {
                            continue; // Skip this leave type
                        }

                        // Check if there was pre-existing usage (from cross-year leaves)
                        const usageKey = `${emp.userId}_${leaveType}`;
                        const priorUsed = existingUsage[usageKey]?.used || 0;

                        const remaining = entitlement + carryOver - priorUsed;

                        await new sql.Request(transaction)
                            .input('userId', emp.userId)
                            .input('leaveType', leaveType)
                            .input('year', toYear)
                            .input('entitlement', entitlement)
                            .input('carryOver', carryOver)
                            .input('used', priorUsed)
                            .input('remaining', remaining)
                            .query(`
                                INSERT INTO LeaveBalances (userId, leaveType, year, entitlement, used, remaining, carryOver, isAutoCreated)
                                VALUES (@userId, @leaveType, @year, @entitlement, @used, @remaining, @carryOver, 0)
                            `);

                        // Track carry-over stats for audit
                        if (carryOver > 0) {
                            if (!carryOverSummary[leaveType]) {
                                carryOverSummary[leaveType] = { count: 0, totalDays: 0 };
                            }
                            carryOverSummary[leaveType].count++;
                            carryOverSummary[leaveType].totalDays += carryOver;
                        }
                    }

                    successCount++;

                } catch (empError) {
                    console.error(`Error processing employee ${emp.employeeId}:`, empError);
                    errors.push(`${emp.employeeId}: Processing failed`);
                    errorCount++;
                }
            }

            // Enhanced Audit log (inside transaction)
            await logAudit({
                userId: parseInt(session.user.id),
                action: 'YEAR_END_PROCESS',
                targetTable: 'LeaveBalances',
                oldValue: overwrittenCount > 0 ? {
                    overwrittenRecords: overwrittenCount,
                    autoCreatedOverwritten: autoCreatedCount,
                    existingUsagePreserved: Object.keys(existingUsage).length
                } : null,
                newValue: {
                    fromYear,
                    toYear,
                    totalEmployees: Object.keys(employeeData).length,
                    successCount,
                    errorCount,
                    forceOverwrite,
                    leaveTypesProcessed: leaveTypes,
                    carryOverSummary,
                    vacationEligibilitySummary,
                    vacationEligibilitySettings: {
                        fiscalYearStart: settings.fiscalYearStart,
                        probationStandardDays: settings.probationStandardDays,
                        vacationAfterProbationYears: settings.vacationAfterProbationYears
                    }
                },
                transaction
            });

            await transaction.commit();
            // === END TRANSACTION ===

        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }

        return NextResponse.json({
            success: true,
            message: `ประมวลผลสิ้นปีเสร็จสิ้น`,
            stats: {
                fromYear,
                toYear,
                totalEmployees: Object.keys(employeeData).length,
                success: successCount,
                errors: errorCount
            },
            errorDetails: errors.slice(0, 10)
        });

    } catch (error) {
        console.error('Error executing year-end:', error);
        return NextResponse.json({ error: 'Failed to execute year-end processing' }, { status: 500 });
    }
}
