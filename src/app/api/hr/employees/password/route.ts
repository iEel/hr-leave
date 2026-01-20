import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * POST /api/hr/employees/password
 * Reset employee password (HR only)
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { userId, newPassword } = body;

        if (!userId || !newPassword) {
            return NextResponse.json({ error: 'Missing userId or newPassword' }, { status: 400 });
        }

        const pool = await getPool();

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.request()
            .input('userId', userId)
            .input('password', hashedPassword)
            .query(`
                UPDATE Users
                SET password = @password,
                    updatedAt = GETDATE()
                WHERE id = @userId
            `);

        return NextResponse.json({ success: true, message: 'Password reset successfully' });

    } catch (error) {
        console.error('Error resetting password:', error);
        return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
    }
}
