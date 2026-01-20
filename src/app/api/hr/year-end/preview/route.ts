import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/hr/year-end/preview
 * Preview year-end processing - shows what will happen
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const fromYear = parseInt(searchParams.get('fromYear') || String(new Date().getFullYear()));
        const toYear = fromYear + 1;

        const pool = await getPool();

        // Get leave quota settings for carry-over rules
        const quotaResult = await pool.request()
            .query(`
                SELECT leaveType, defaultDays, allowCarryOver, maxCarryOverDays
                FROM LeaveQuotaSettings
            `);

        const quotaSettings: Record<string, { defaultDays: number; allowCarryOver: boolean; maxCarryOverDays: number }> = {};
        for (const row of quotaResult.recordset) {
            quotaSettings[row.leaveType] = {
                defaultDays: row.defaultDays,
                allowCarryOver: row.allowCarryOver,
                maxCarryOverDays: row.maxCarryOverDays
            };
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
                    lb.leaveType,
                    ISNULL(lb.remaining, 0) as remaining,
                    ISNULL(lb.used, 0) as used,
                    ISNULL(lb.entitlement, 0) as entitlement
                FROM Users u
                LEFT JOIN LeaveBalances lb ON u.id = lb.userId AND lb.year = @year
                WHERE u.isActive = 1
                ORDER BY u.employeeId, lb.leaveType
            `);

        // Check if next year already has data
        const nextYearCheck = await pool.request()
            .input('toYear', toYear)
            .query(`SELECT COUNT(*) as count FROM LeaveBalances WHERE year = @toYear`);

        const nextYearExists = nextYearCheck.recordset[0].count > 0;

        // Group by employee and calculate carry-over
        const employeeMap: Record<number, {
            userId: number;
            employeeId: string;
            firstName: string;
            lastName: string;
            department: string;
            company: string;
            balances: Array<{
                leaveType: string;
                currentRemaining: number;
                currentUsed: number;
                currentEntitlement: number;
                carryOver: number;
                newEntitlement: number;
                newTotal: number;
            }>;
        }> = {};

        for (const row of employeesResult.recordset) {
            if (!employeeMap[row.userId]) {
                employeeMap[row.userId] = {
                    userId: row.userId,
                    employeeId: row.employeeId,
                    firstName: row.firstName,
                    lastName: row.lastName,
                    department: row.department,
                    company: row.company,
                    balances: []
                };
            }

            if (row.leaveType) {
                const quota = quotaSettings[row.leaveType] || { defaultDays: 0, allowCarryOver: false, maxCarryOverDays: 0 };
                const carryOver = quota.allowCarryOver
                    ? Math.min(row.remaining, quota.maxCarryOverDays)
                    : 0;

                employeeMap[row.userId].balances.push({
                    leaveType: row.leaveType,
                    currentRemaining: row.remaining,
                    currentUsed: row.used,
                    currentEntitlement: row.entitlement,
                    carryOver,
                    newEntitlement: quota.defaultDays,
                    newTotal: quota.defaultDays + carryOver
                });
            }
        }

        // Calculate summary stats
        const employees = Object.values(employeeMap);
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
