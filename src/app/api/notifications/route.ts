import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/notifications
 * ดึงการแจ้งเตือนของ User ปัจจุบัน
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = Number(session.user.id);
        const pool = await getPool();

        // Get notifications for user
        const result = await pool.request()
            .input('userId', userId)
            .query(`
                SELECT TOP 20
                    id,
                    title,
                    message,
                    link,
                    isRead,
                    CONVERT(varchar, createdAt, 120) as createdAt
                FROM Notifications
                WHERE userId = @userId
                ORDER BY createdAt DESC
            `);

        // Count unread
        const unreadResult = await pool.request()
            .input('userId', userId)
            .query(`
                SELECT COUNT(*) as count FROM Notifications
                WHERE userId = @userId AND isRead = 0
            `);

        return NextResponse.json({
            success: true,
            data: result.recordset,
            unreadCount: unreadResult.recordset[0]?.count || 0,
        });

    } catch (error) {
        console.error('Error fetching notifications:', error);
        return NextResponse.json(
            { error: 'Failed to fetch notifications' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/notifications
 * Mark notifications as read
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = Number(session.user.id);
        const body = await request.json();
        const { notificationId, markAllRead } = body;

        const pool = await getPool();

        if (markAllRead) {
            // Mark all as read
            await pool.request()
                .input('userId', userId)
                .query(`
                    UPDATE Notifications
                    SET isRead = 1
                    WHERE userId = @userId AND isRead = 0
                `);
        } else if (notificationId) {
            // Mark single as read
            await pool.request()
                .input('id', notificationId)
                .input('userId', userId)
                .query(`
                    UPDATE Notifications
                    SET isRead = 1
                    WHERE id = @id AND userId = @userId
                `);
        }

        return NextResponse.json({
            success: true,
            message: 'Notifications marked as read',
        });

    } catch (error) {
        console.error('Error updating notifications:', error);
        return NextResponse.json(
            { error: 'Failed to update notifications' },
            { status: 500 }
        );
    }
}
