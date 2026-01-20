import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/leave/balance
 * ดึงยอดวันลาคงเหลือของ User ปัจจุบัน
 */
export async function GET(request: NextRequest) {
    try {
        // Check authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id;
        const currentYear = new Date().getFullYear();

        // Get database connection
        const pool = await getPool();

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
                await pool.request()
                    .input('userId', userId)
                    .input('leaveType', quota.leaveType)
                    .input('year', currentYear)
                    .input('entitlement', quota.defaultDays)
                    .input('remaining', quota.defaultDays)
                    .query(`
                        INSERT INTO LeaveBalances (userId, leaveType, year, entitlement, used, remaining, carryOver)
                        VALUES (@userId, @leaveType, @year, @entitlement, 0, @remaining, 0)
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
                data: newResult.recordset,
                year: currentYear,
            });
        }

        return NextResponse.json({
            success: true,
            data: result.recordset,
            year: currentYear,
        });

    } catch (error) {
        console.error('Error fetching leave balance:', error);
        return NextResponse.json(
            { error: 'Failed to fetch leave balance' },
            { status: 500 }
        );
    }
}
