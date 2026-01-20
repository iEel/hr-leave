import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/hr/reports/monthly
 * Get monthly leave report data
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
        const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString());
        const format = searchParams.get('format') || 'json'; // json, csv, or excel

        const pool = await getPool();

        // Get leave requests for the specified month
        const result = await pool.request()
            .input('year', year)
            .input('month', month)
            .query(`
                SELECT 
                    u.employeeId,
                    u.firstName,
                    u.lastName,
                    u.department,
                    u.company,
                    lr.leaveType,
                    lr.status,
                    lr.usageAmount as days,
                    CONVERT(varchar, lr.startDatetime, 23) as startDate,
                    CONVERT(varchar, lr.endDatetime, 23) as endDate,
                    lr.reason
                FROM LeaveRequests lr
                JOIN Users u ON lr.userId = u.id
                WHERE YEAR(lr.startDatetime) = @year
                  AND MONTH(lr.startDatetime) = @month
                ORDER BY lr.startDatetime ASC
            `);

        // Get summary statistics
        const summaryResult = await pool.request()
            .input('year', year)
            .input('month', month)
            .query(`
                SELECT 
                    leaveType,
                    status,
                    COUNT(*) as count,
                    SUM(usageAmount) as totalDays
                FROM LeaveRequests
                WHERE YEAR(startDatetime) = @year
                  AND MONTH(startDatetime) = @month
                GROUP BY leaveType, status
            `);

        // Get employee attendance summary
        const attendanceResult = await pool.request()
            .input('year', year)
            .input('month', month)
            .query(`
                SELECT 
                    u.id,
                    u.employeeId,
                    u.firstName,
                    u.lastName,
                    u.department,
                    u.company,
                    ISNULL(SUM(CASE WHEN lr.leaveType = 'VACATION' AND lr.status = 'APPROVED' THEN lr.usageAmount ELSE 0 END), 0) as vacationDays,
                    ISNULL(SUM(CASE WHEN lr.leaveType = 'SICK' AND lr.status = 'APPROVED' THEN lr.usageAmount ELSE 0 END), 0) as sickDays,
                    ISNULL(SUM(CASE WHEN lr.leaveType = 'PERSONAL' AND lr.status = 'APPROVED' THEN lr.usageAmount ELSE 0 END), 0) as personalDays,
                    ISNULL(SUM(CASE WHEN lr.status = 'APPROVED' THEN lr.usageAmount ELSE 0 END), 0) as totalLeaveDays
                FROM Users u
                LEFT JOIN LeaveRequests lr ON u.id = lr.userId 
                    AND YEAR(lr.startDatetime) = @year 
                    AND MONTH(lr.startDatetime) = @month
                WHERE u.isActive = 1
                GROUP BY u.id, u.employeeId, u.firstName, u.lastName, u.department, u.company
                ORDER BY u.department, u.employeeId
            `);

        if (format === 'csv') {
            // Generate CSV
            const headers = ['รหัสพนักงาน', 'ชื่อ-นามสกุล', 'แผนก', 'บริษัท', 'พักร้อน', 'ลาป่วย', 'ลากิจ', 'รวม'];
            const rows = attendanceResult.recordset.map(r => [
                r.employeeId,
                `${r.firstName} ${r.lastName}`,
                r.department,
                r.company,
                r.vacationDays,
                r.sickDays,
                r.personalDays,
                r.totalLeaveDays
            ]);

            const BOM = '\uFEFF';
            const csvContent = BOM + [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            return new NextResponse(csvContent, {
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="leave_report_${year}_${month.toString().padStart(2, '0')}.csv"`
                }
            });
        }

        // Return JSON data
        return NextResponse.json({
            success: true,
            data: {
                year,
                month,
                leaveRequests: result.recordset,
                summary: summaryResult.recordset,
                attendance: attendanceResult.recordset
            }
        });

    } catch (error) {
        console.error('Error generating report:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
