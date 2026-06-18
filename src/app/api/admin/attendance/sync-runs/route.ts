import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT TOP (50)
                sr.id,
                sr.deviceId,
                d.name AS deviceName,
                sr.mode,
                sr.status,
                sr.triggerType,
                sr.triggeredByUserId,
                u.employeeId AS triggeredByEmployeeId,
                u.firstName AS triggeredByFirstName,
                u.lastName AS triggeredByLastName,
                sr.startedAt,
                sr.finishedAt,
                sr.newCount,
                sr.receivedCount,
                sr.insertedCount,
                sr.duplicateCount,
                sr.confirmedCount,
                sr.errorMessage
            FROM AttendanceSyncRuns sr
            LEFT JOIN AttendanceDevices d ON d.id = sr.deviceId
            LEFT JOIN Users u ON u.id = sr.triggeredByUserId
            ORDER BY sr.startedAt DESC, sr.id DESC
        `);

        return NextResponse.json({
            success: true,
            runs: result.recordset,
        });
    } catch (error) {
        console.error('Error fetching attendance sync runs:', error);
        return NextResponse.json({ error: 'Failed to fetch attendance sync runs' }, { status: 500 });
    }
}
