import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * POST /api/profile/password
 * Change current user password
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = Number(session.user.id);
        const body = await request.json();
        const { currentPassword, newPassword } = body;

        if (!currentPassword || !newPassword) {
            return NextResponse.json({ error: 'กรุณากรอกรหัสผ่านให้ครบ' }, { status: 400 });
        }

        if (newPassword.length < 6) {
            return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
        }

        const pool = await getPool();

        // Get current password hash
        const userResult = await pool.request()
            .input('userId', userId)
            .query(`SELECT password FROM Users WHERE id = @userId`);

        if (userResult.recordset.length === 0) {
            return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
        }

        const currentHash = userResult.recordset[0].password;

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, currentHash);
        if (!isValid) {
            return NextResponse.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 400 });
        }

        // Hash new password
        const newHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await pool.request()
            .input('userId', userId)
            .input('password', newHash)
            .query(`
                UPDATE Users 
                SET password = @password, updatedAt = GETDATE()
                WHERE id = @userId
            `);

        return NextResponse.json({
            success: true,
            message: 'เปลี่ยนรหัสผ่านสำเร็จ'
        });

    } catch (error) {
        console.error('Error changing password:', error);
        return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' }, { status: 500 });
    }
}
