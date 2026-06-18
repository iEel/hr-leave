import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { runAttendanceIncrementalSync } from '@/lib/attendance/sync-service';
import { logAudit } from '@/lib/audit';

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ deviceId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const { deviceId } = await params;
        const parsedDeviceId = parsePositiveDeviceId(deviceId);
        if (parsedDeviceId == null) {
            return NextResponse.json({ error: 'Invalid device id' }, { status: 400 });
        }

        const result = await runAttendanceIncrementalSync({
            deviceId: parsedDeviceId,
            triggerType: 'MANUAL',
            triggeredByUserId: Number(session.user.id),
        });

        await logAudit({
            userId: Number(session.user.id),
            action: 'SYNC_ATTENDANCE_DEVICE',
            targetTable: 'AttendanceSyncRuns',
            targetId: result.runId || null,
            newValue: {
                deviceId: parsedDeviceId,
                result,
            },
        });

        return NextResponse.json({
            success: result.status !== 'FAILED',
            result,
        });
    } catch (error) {
        console.error('Error syncing attendance device:', error);
        return NextResponse.json({ error: 'Failed to sync attendance device' }, { status: 500 });
    }
}

function parsePositiveDeviceId(deviceId: string): number | null {
    if (!/^\d+$/.test(deviceId)) {
        return null;
    }

    const parsed = Number(deviceId);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
