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

        // Get leave history this year
        const historyResult = await pool.request()
            .input('userId', userId)
            .input('year', currentYear)
            .query(`
                SELECT 
                    id, leaveType, status, usageAmount as days,
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
                balances: balanceResult.recordset,
                leaveHistory: historyResult.recordset
            }
        });

    } catch (error) {
        console.error('Error fetching employee balance:', error);
        return NextResponse.json({ error: 'Failed to fetch employee balance' }, { status: 500 });
    }
}
