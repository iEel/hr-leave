import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/manager/delegates/search?q=...
 * ค้นหา user สำหรับเลือกเป็น delegate (เฉพาะ Manager)
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const userId = Number(session.user.id);
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q')?.trim();

        if (!query || query.length < 2) {
            return NextResponse.json({ success: true, data: [] });
        }

        const pool = await getPool();
        const result = await pool.request()
            .input('query', `%${query}%`)
            .input('userId', userId)
            .query(`
                SELECT TOP 10
                    id,
                    firstName + ' ' + lastName as name,
                    department,
                    employeeId
                FROM Users
                WHERE isActive = 1
                  AND id != @userId
                  AND (
                      firstName + ' ' + lastName LIKE @query
                      OR employeeId LIKE @query
                  )
                ORDER BY firstName, lastName
            `);

        return NextResponse.json({
            success: true,
            data: result.recordset
        });

    } catch (error) {
        console.error('Error searching users:', error);
        return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
    }
}
