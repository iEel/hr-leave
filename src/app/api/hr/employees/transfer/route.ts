import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * POST /api/hr/employees/transfer
 * Transfer subordinates from one manager to another
 * Body: { fromManagerId: number, toManagerId: number | null }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Only HR/Admin/HRStaff can transfer subordinates
        const role = session.user.role;
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (role !== 'HR' && role !== 'ADMIN' && !isHRStaff) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { fromManagerId, toManagerId } = body;

        if (!fromManagerId) {
            return NextResponse.json({ error: 'fromManagerId is required' }, { status: 400 });
        }

        const pool = await getPool();

        // Count how many subordinates will be transferred
        const countResult = await pool.request()
            .input('fromManagerId', fromManagerId)
            .query(`SELECT COUNT(*) as count FROM Users WHERE departmentHeadId = @fromManagerId`);

        const subordinateCount = countResult.recordset[0].count;

        if (subordinateCount === 0) {
            return NextResponse.json({
                success: true,
                transferred: 0,
                message: 'ไม่มีลูกน้องที่ต้องโอนย้าย'
            });
        }

        // Transfer subordinates to new manager (or null)
        await pool.request()
            .input('fromManagerId', fromManagerId)
            .input('toManagerId', toManagerId || null)
            .query(`
                UPDATE Users 
                SET departmentHeadId = @toManagerId,
                    updatedAt = GETDATE()
                WHERE departmentHeadId = @fromManagerId
            `);

        return NextResponse.json({
            success: true,
            transferred: subordinateCount,
            message: `โอนย้ายลูกน้อง ${subordinateCount} คน เรียบร้อย`
        });

    } catch (error) {
        console.error('Error transferring subordinates:', error);
        return NextResponse.json({ error: 'Failed to transfer subordinates' }, { status: 500 });
    }
}

/**
 * GET /api/hr/employees/transfer?managerId=X
 * Get count of subordinates for a manager
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const managerId = searchParams.get('managerId');

        if (!managerId) {
            return NextResponse.json({ error: 'managerId is required' }, { status: 400 });
        }

        const pool = await getPool();

        // Get subordinate count and list
        const result = await pool.request()
            .input('managerId', managerId)
            .query(`
                SELECT id, employeeId, firstName, lastName, department
                FROM Users 
                WHERE departmentHeadId = @managerId
                ORDER BY firstName
            `);

        return NextResponse.json({
            success: true,
            subordinates: result.recordset,
            count: result.recordset.length
        });

    } catch (error) {
        console.error('Error fetching subordinates:', error);
        return NextResponse.json({ error: 'Failed to fetch subordinates' }, { status: 500 });
    }
}
