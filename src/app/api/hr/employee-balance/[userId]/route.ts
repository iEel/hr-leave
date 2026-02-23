import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

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
        const currentYear = new Date().getFullYear();
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

        // Get employee info
        const empResult = await pool.request()
            .input('userId', userId)
            .query(`
                SELECT id, employeeId, firstName, lastName, department, company, 
                       CONVERT(varchar, startDate, 23) as startDate
                FROM Users 
                WHERE id = @userId
            `);

        if (empResult.recordset.length === 0) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        const employee = empResult.recordset[0];

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

            const existingTypes = new Set(balanceResult.recordset.map((b: any) => b.leaveType));

            for (const quota of quotaResult.recordset) {
                if (!existingTypes.has(quota.leaveType)) {
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
        const enrichedBalances = balanceResult.recordset.map((b: any) => ({
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
                balances: enrichedBalances,
                leaveHistory: historyResult.recordset
            }
        });

    } catch (error) {
        console.error('Error fetching employee balance:', error);
        return NextResponse.json({ error: 'Failed to fetch employee balance' }, { status: 500 });
    }
}
