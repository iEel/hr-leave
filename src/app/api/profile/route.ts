import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/profile
 * Get current user profile data
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = Number(session.user.id);
        const pool = await getPool();

        const result = await pool.request()
            .input('userId', userId)
            .query(`
                SELECT 
                    employeeId,
                    firstName,
                    lastName,
                    email,
                    company,
                    department,
                    role,
                    gender,
                    CONVERT(varchar, startDate, 23) as startDate
                FROM Users
                WHERE id = @userId
            `);

        if (result.recordset.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: result.recordset[0]
        });

    } catch (error) {
        console.error('Error fetching profile:', error);
        return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
}
