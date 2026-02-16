import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/hr/year-end/execute
 * Execute year-end processing - create new year balances with carry-over
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
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
        let existingUsage: Record<string, { used: number }> = {};

        // Delete existing data if force overwrite or all auto-created
        if (totalCount > 0 && (forceOverwrite || allAutoCreated)) {
            // Save existing usage amounts (from cross-year leaves taken before year-end)
            const usageSnapshot = await pool.request()
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

            await pool.request()
                .input('toYear', toYear)
                .query(`DELETE FROM LeaveBalances WHERE year = @toYear`);
        }

        // Get leave quota settings
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
                    u.startDate,
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
            startDate: Date;
            balances: Record<string, number>;
        }> = {};

        for (const row of employeesResult.recordset) {
            if (!employeeData[row.userId]) {
                employeeData[row.userId] = {
                    userId: row.userId,
                    employeeId: row.employeeId,
                    startDate: new Date(row.startDate),
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

        // Process each employee
        for (const emp of Object.values(employeeData)) {
            try {
                // Calculate years of service by end of toYear
                const yearsOfService = toYear - emp.startDate.getFullYear();

                // Insert new balance for each leave type
                for (const leaveType of leaveTypes) {
                    const quota = quotaSettings[leaveType];

                    // Check if employee meets tenure requirement
                    if (yearsOfService < quota.minTenureYears) {
                        continue; // Skip this leave type
                    }

                    const currentRemaining = emp.balances[leaveType] || 0;
                    const carryOver = quota.allowCarryOver
                        ? Math.min(currentRemaining, quota.maxCarryOverDays)
                        : 0;

                    const entitlement = quota.defaultDays;

                    // Check if there was pre-existing usage (from cross-year leaves)
                    const usageKey = `${emp.userId}_${leaveType}`;
                    const priorUsed = existingUsage[usageKey]?.used || 0;

                    const remaining = entitlement + carryOver - priorUsed;

                    await pool.request()
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
                }

                successCount++;

            } catch (empError) {
                console.error(`Error processing employee ${emp.employeeId}:`, empError);
                errors.push(`${emp.employeeId}: Processing failed`);
                errorCount++;
            }
        }

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'YEAR_END_PROCESS',
            targetTable: 'LeaveBalances',
            newValue: { fromYear, toYear, successCount, errorCount, forceOverwrite }
        });

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
