import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/hr/analytics
 * ดึงสถิติการลา (สำหรับ HR)
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = session.user.role;
        if (role !== 'HR' && role !== 'ADMIN') {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

        const pool = await getPool();

        // 1. สถิติรวม
        const summaryResult = await pool.request()
            .input('year', year)
            .query(`
                SELECT 
                    COUNT(*) as totalRequests,
                    SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
                    SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
                    SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
                    SUM(CASE WHEN status = 'APPROVED' THEN usageAmount ELSE 0 END) as totalDaysUsed
                FROM LeaveRequests
                WHERE YEAR(startDatetime) = @year
            `);

        // 2. สถิติตามประเภทการลา
        const byTypeResult = await pool.request()
            .input('year', year)
            .query(`
                SELECT 
                    leaveType,
                    COUNT(*) as count,
                    SUM(CASE WHEN status = 'APPROVED' THEN usageAmount ELSE 0 END) as daysUsed
                FROM LeaveRequests
                WHERE YEAR(startDatetime) = @year
                GROUP BY leaveType
                ORDER BY count DESC
            `);

        // 3. สถิติรายเดือน
        const byMonthResult = await pool.request()
            .input('year', year)
            .query(`
                SELECT 
                    MONTH(startDatetime) as month,
                    COUNT(*) as count,
                    SUM(CASE WHEN status = 'APPROVED' THEN usageAmount ELSE 0 END) as daysUsed
                FROM LeaveRequests
                WHERE YEAR(startDatetime) = @year
                GROUP BY MONTH(startDatetime)
                ORDER BY month
            `);

        // 4. Top 5 พนักงานที่ลามากที่สุด
        const topUsersResult = await pool.request()
            .input('year', year)
            .query(`
                SELECT TOP 5
                    u.firstName + ' ' + u.lastName as employeeName,
                    u.department,
                    COUNT(*) as requestCount,
                    SUM(CASE WHEN lr.status = 'APPROVED' THEN lr.usageAmount ELSE 0 END) as totalDays
                FROM LeaveRequests lr
                INNER JOIN Users u ON lr.userId = u.id
                WHERE YEAR(lr.startDatetime) = @year
                GROUP BY u.id, u.firstName, u.lastName, u.department
                ORDER BY totalDays DESC
            `);

        // 5. จำนวนพนักงานทั้งหมด
        const employeeCountResult = await pool.request()
            .query(`SELECT COUNT(*) as count FROM Users WHERE isActive = 1`);

        return NextResponse.json({
            success: true,
            data: {
                year,
                summary: summaryResult.recordset[0],
                byType: byTypeResult.recordset,
                byMonth: byMonthResult.recordset,
                topUsers: topUsersResult.recordset,
                totalEmployees: employeeCountResult.recordset[0].count,
            },
        });

    } catch (error) {
        console.error('Error fetching analytics:', error);
        return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }
}
