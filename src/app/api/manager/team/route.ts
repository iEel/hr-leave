import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if user is a manager (has subordinates)
        const pool = await getPool();
        const userId = parseInt(session.user.id);

        // Get team members (subordinates)
        const teamResult = await pool.request()
            .input('managerId', userId)
            .query(`
                SELECT 
                    u.id,
                    u.employeeId,
                    u.firstName,
                    u.lastName,
                    u.email,
                    u.department,
                    u.role,
                    u.isActive,
                    u.startDate
                FROM Users u
                WHERE u.departmentHeadId = @managerId AND u.isActive = 1
                ORDER BY u.firstName
            `);

        const team = teamResult.recordset;

        if (team.length === 0) {
            return NextResponse.json({
                success: true,
                data: {
                    team: [],
                    stats: {
                        totalMembers: 0,
                        pendingRequests: 0,
                        onLeaveToday: 0,
                        leavesThisMonth: 0,
                        totalDaysUsed: 0
                    },
                    leaveBreakdown: []
                }
            });
        }

        const teamIds = team.map(t => t.id);

        // Get pending requests for team
        const pendingResult = await pool.request()
            .query(`
                SELECT COUNT(*) as count
                FROM LeaveRequests
                WHERE userId IN (${teamIds.join(',')})
                AND status = 'PENDING'
            `);

        // Get who's on leave today
        const today = new Date().toISOString().split('T')[0];
        const onLeaveResult = await pool.request()
            .input('today', today)
            .query(`
                SELECT COUNT(DISTINCT userId) as count
                FROM LeaveRequests
                WHERE userId IN (${teamIds.join(',')})
                AND status = 'APPROVED'
                AND CAST(startDatetime AS DATE) <= @today
                AND CAST(endDatetime AS DATE) >= @today
            `);

        // Get leave requests this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        const leavesThisMonthResult = await pool.request()
            .input('startOfMonth', startOfMonth.toISOString().split('T')[0])
            .query(`
                SELECT 
                    COUNT(*) as count,
                    ISNULL(SUM(usageAmount), 0) as totalDays
                FROM LeaveRequests
                WHERE userId IN (${teamIds.join(',')})
                AND status = 'APPROVED'
                AND CAST(startDatetime AS DATE) >= @startOfMonth
            `);

        // Get leave breakdown by type this year
        const year = new Date().getFullYear();
        const leaveBreakdownResult = await pool.request()
            .input('year', year)
            .query(`
                SELECT 
                    leaveType,
                    COUNT(*) as count,
                    SUM(usageAmount) as totalDays
                FROM LeaveRequests
                WHERE userId IN (${teamIds.join(',')})
                AND status = 'APPROVED'
                AND YEAR(startDatetime) = @year
                GROUP BY leaveType
                ORDER BY totalDays DESC
            `);

        return NextResponse.json({
            success: true,
            data: {
                team,
                stats: {
                    totalMembers: team.length,
                    pendingRequests: pendingResult.recordset[0].count,
                    onLeaveToday: onLeaveResult.recordset[0].count,
                    leavesThisMonth: leavesThisMonthResult.recordset[0].count,
                    totalDaysUsed: leavesThisMonthResult.recordset[0].totalDays
                },
                leaveBreakdown: leaveBreakdownResult.recordset
            }
        });

    } catch (error) {
        console.error('Error fetching manager team:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
