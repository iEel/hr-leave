import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/auth/log
 * Log authentication events (LOGIN, LOGOUT)
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { action } = body;

        if (action !== 'LOGIN' && action !== 'LOGOUT') {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const userId = Number(session.user.id);

        await logAudit({
            userId,
            action,
            targetTable: 'Users',
            targetId: userId,
            newValue: {
                employeeId: session.user.employeeId,
                timestamp: new Date().toISOString()
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error logging auth event:', error);
        return NextResponse.json({ error: 'Failed to log event' }, { status: 500 });
    }
}
