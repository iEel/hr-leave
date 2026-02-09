import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasActiveDelegateRole } from '@/lib/delegate';

/**
 * GET /api/auth/delegate-check
 * เช็คว่า user นี้มี active delegate assignment ไหม (สำหรับ sidebar)
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = Number(session.user.id);
        const isDelegate = await hasActiveDelegateRole(userId);

        return NextResponse.json({
            success: true,
            isDelegate
        });

    } catch (error) {
        console.error('Error checking delegate status:', error);
        return NextResponse.json({ error: 'Failed to check delegate status' }, { status: 500 });
    }
}
