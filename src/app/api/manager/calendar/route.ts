import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
        const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString());

        const pool = await getPool();
        const userId = parseInt(session.user.id);

        // Get team members (subordinates)
        const teamResult = await pool.request()
            .input('managerId', userId)
            .query(`
                SELECT id, employeeId, firstName, lastName, department
                FROM Users
                WHERE departmentHeadId = @managerId AND isActive = 1
            `);

        const team = teamResult.recordset;

        if (team.length === 0) {
            return NextResponse.json({
                success: true,
                data: {
                    team: [],
                    leaves: [],
                    holidays: []
                }
            });
        }

        const teamIds = team.map(t => t.id);

        // Get leave requests for the month
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0); // Last day of month

        const leavesResult = await pool.request()
            .input('startDate', startDate.toISOString().split('T')[0])
            .input('endDate', endDate.toISOString().split('T')[0])
            .query(`
                SELECT 
                    lr.id,
                    lr.userId,
                    u.firstName,
                    u.lastName,
                    u.employeeId,
                    lr.leaveType,
                    CAST(lr.startDatetime AS DATE) as startDate,
                    CAST(lr.endDatetime AS DATE) as endDate,
                    lr.usageAmount,
                    lr.status,
                    lr.timeSlot
                FROM LeaveRequests lr
                JOIN Users u ON lr.userId = u.id
                WHERE lr.userId IN (${teamIds.join(',')})
                AND lr.status IN ('APPROVED', 'PENDING')
                AND (
                    (CAST(lr.startDatetime AS DATE) >= @startDate AND CAST(lr.startDatetime AS DATE) <= @endDate)
                    OR (CAST(lr.endDatetime AS DATE) >= @startDate AND CAST(lr.endDatetime AS DATE) <= @endDate)
                    OR (CAST(lr.startDatetime AS DATE) <= @startDate AND CAST(lr.endDatetime AS DATE) >= @endDate)
                )
                ORDER BY lr.startDatetime
            `);

        // Get holidays for the month
        const holidaysResult = await pool.request()
            .input('startDate', startDate.toISOString().split('T')[0])
            .input('endDate', endDate.toISOString().split('T')[0])
            .query(`
                SELECT date, name, type
                FROM PublicHolidays
                WHERE date >= @startDate AND date <= @endDate
                ORDER BY date
            `);

        // Format leaves for calendar
        const formattedLeaves = leavesResult.recordset.map(leave => ({
            id: leave.id,
            userId: leave.userId,
            employeeName: `${leave.firstName} ${leave.lastName}`,
            employeeId: leave.employeeId,
            leaveType: leave.leaveType,
            startDate: leave.startDate.toISOString().split('T')[0],
            endDate: leave.endDate.toISOString().split('T')[0],
            days: leave.usageAmount,
            status: leave.status,
            timeSlot: leave.timeSlot
        }));

        return NextResponse.json({
            success: true,
            data: {
                team,
                leaves: formattedLeaves,
                holidays: holidaysResult.recordset.map(h => ({
                    date: h.date.toISOString().split('T')[0],
                    name: h.name,
                    type: h.type
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching team calendar:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
