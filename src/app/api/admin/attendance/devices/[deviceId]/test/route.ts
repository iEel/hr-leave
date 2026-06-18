import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { HipCmif68sClient } from '@/lib/attendance/hip-client';
import { getAttendanceDeviceConfig } from '@/lib/attendance/repository';
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

        const device = await getAttendanceDeviceConfig(parsedDeviceId);

        if (!device) {
            return NextResponse.json({ error: 'Attendance device not found' }, { status: 404 });
        }

        const client = new HipCmif68sClient({
            ipAddress: device.host,
            port: device.port,
            timeoutMs: device.timeoutMs,
            passCode: device.passCode,
            retryCount: device.retryCount,
        });

        await client.testConnection();

        await logAudit({
            userId: Number(session.user.id),
            action: 'TEST_ATTENDANCE_DEVICE',
            targetTable: 'AttendanceDevices',
            targetId: device.id,
            newValue: {
                id: device.id,
                name: device.name,
                host: device.host,
                port: device.port,
                status: 'SUCCESS',
            },
        });

        return NextResponse.json({
            success: true,
            message: 'เชื่อมต่อเครื่องสำเร็จ',
        });
    } catch (error) {
        console.error('Error testing attendance device:', error);
        return NextResponse.json({ error: 'ไม่สามารถเชื่อมต่อเครื่องบันทึกเวลาได้' }, { status: 500 });
    }
}

function parsePositiveDeviceId(deviceId: string): number | null {
    if (!/^\d+$/.test(deviceId)) {
        return null;
    }

    const parsed = Number(deviceId);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
