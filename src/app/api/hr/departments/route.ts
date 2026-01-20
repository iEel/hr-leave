import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/hr/departments
 * Get distinct departments from Users table
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const pool = await getPool();

        const result = await pool.request()
            .query(`
                SELECT DISTINCT department
                FROM Users
                WHERE department IS NOT NULL AND department != ''
                ORDER BY department ASC
            `);

        const departments = result.recordset.map(r => r.department);

        return NextResponse.json({
            success: true,
            data: departments
        });

    } catch (error) {
        console.error('Error fetching departments:', error);
        return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
    }
}
