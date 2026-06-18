import { NextRequest, NextResponse } from 'next/server';
import { listDueAttendanceDevices } from '@/lib/attendance/repository';
import { runAttendanceIncrementalSync } from '@/lib/attendance/sync-service';

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const devices = await listDueAttendanceDevices();
        const results = [];

        for (const device of devices) {
            const result = await runAttendanceIncrementalSync({
                deviceId: device.id,
                triggerType: 'CRON',
                triggeredByUserId: null,
            });

            results.push({
                deviceId: device.id,
                deviceName: device.name,
                ...result,
            });
        }

        return NextResponse.json({
            success: true,
            count: results.length,
            results,
        });
    } catch (error) {
        console.error('Error running cron attendance sync:', error);
        return NextResponse.json({ error: 'Attendance sync failed' }, { status: 500 });
    }
}

function isAuthorized(request: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
        return request.headers.get('x-cron-secret') === cronSecret;
    }

    return process.env.NODE_ENV !== 'production';
}
