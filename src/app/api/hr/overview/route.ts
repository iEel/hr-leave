import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/hr/overview
 * Get HR dashboard overview data
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const pool = await getPool();
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        // Get employee counts
        const employeesTotal = await pool.request().query(`
            SELECT COUNT(*) as total FROM Users
        `);

        const employeesActive = await pool.request().query(`
            SELECT COUNT(*) as active FROM Users WHERE isActive = 1
        `);

        const byCompany = await pool.request().query(`
            SELECT company, COUNT(*) as count 
            FROM Users 
            WHERE isActive = 1
            GROUP BY company 
            ORDER BY count DESC
        `);

        const byDepartment = await pool.request().query(`
            SELECT department, COUNT(*) as count 
            FROM Users 
            WHERE isActive = 1 AND department IS NOT NULL AND department != ''
            GROUP BY department 
            ORDER BY count DESC
        `);

        // Get leave stats
        const pendingLeaves = await pool.request().query(`
            SELECT COUNT(*) as count FROM LeaveRequests WHERE status = 'PENDING'
        `);

        const approvedThisMonth = await pool.request()
            .input('year', currentYear)
            .input('month', currentMonth)
            .query(`
                SELECT COUNT(*) as count FROM LeaveRequests 
                WHERE status = 'APPROVED' 
                AND YEAR(approvedAt) = @year 
                AND MONTH(approvedAt) = @month
            `);

        const rejectedThisMonth = await pool.request()
            .input('year', currentYear)
            .input('month', currentMonth)
            .query(`
                SELECT COUNT(*) as count FROM LeaveRequests 
                WHERE status = 'REJECTED' 
                AND YEAR(approvedAt) = @year 
                AND MONTH(approvedAt) = @month
            `);

        const totalThisYear = await pool.request()
            .input('year', currentYear)
            .query(`
                SELECT COUNT(*) as count FROM LeaveRequests 
                WHERE YEAR(createdAt) = @year
            `);

        // Get average remaining balances
        const avgBalances = await pool.request()
            .input('year', currentYear)
            .query(`
                SELECT 
                    AVG(CASE WHEN leaveType = 'VACATION' THEN remaining ELSE NULL END) as avgVacation,
                    AVG(CASE WHEN leaveType = 'SICK' THEN remaining ELSE NULL END) as avgSick
                FROM LeaveBalances 
                WHERE year = @year
            `);

        return NextResponse.json({
            success: true,
            data: {
                employees: {
                    total: employeesTotal.recordset[0].total,
                    active: employeesActive.recordset[0].active,
                    byCompany: byCompany.recordset,
                    byDepartment: byDepartment.recordset
                },
                leaves: {
                    pending: pendingLeaves.recordset[0].count,
                    approvedThisMonth: approvedThisMonth.recordset[0].count,
                    rejectedThisMonth: rejectedThisMonth.recordset[0].count,
                    totalThisYear: totalThisYear.recordset[0].count
                },
                balances: {
                    avgVacationRemaining: avgBalances.recordset[0].avgVacation || 0,
                    avgSickRemaining: avgBalances.recordset[0].avgSick || 0
                }
            }
        });

    } catch (error) {
        console.error('Error fetching HR overview:', error);
        return NextResponse.json({ error: 'Failed to fetch overview data' }, { status: 500 });
    }
}
