import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { parseSyncRunsQuery } from '@/lib/attendance/sync-runs-query';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const query = parseSyncRunsQuery(searchParams);
        const pool = await getPool();
        const whereConditions: string[] = [];
        const countRequest = pool.request();
        const runsRequest = pool.request()
            .input('offset', query.offset)
            .input('limit', query.limit);

        if (query.deviceId != null) {
            whereConditions.push('sr.deviceId = @deviceId');
            countRequest.input('deviceId', query.deviceId);
            runsRequest.input('deviceId', query.deviceId);
        }

        if (query.mode != null) {
            whereConditions.push('sr.mode = @mode');
            countRequest.input('mode', query.mode);
            runsRequest.input('mode', query.mode);
        }

        if (query.status != null) {
            whereConditions.push('sr.status = @status');
            countRequest.input('status', query.status);
            runsRequest.input('status', query.status);
        }

        if (query.periodDays != null) {
            const periodStart = new Date();
            periodStart.setDate(periodStart.getDate() - query.periodDays);
            whereConditions.push('sr.startedAt >= @periodStart');
            countRequest.input('periodStart', periodStart);
            runsRequest.input('periodStart', periodStart);
        }

        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';
        const countResult = await countRequest.query(`
            SELECT COUNT(*) AS total
            FROM AttendanceSyncRuns sr
            ${whereClause}
        `);
        const result = await runsRequest.query(`
            SELECT
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
                CONVERT(varchar(19), sr.startedAt, 126) AS startedAt,
                CONVERT(varchar(19), sr.finishedAt, 126) AS finishedAt,
                sr.newCount,
                sr.receivedCount,
                sr.insertedCount,
                sr.duplicateCount,
                sr.confirmedCount,
                sr.errorMessage
            FROM AttendanceSyncRuns sr
            LEFT JOIN AttendanceDevices d ON d.id = sr.deviceId
            LEFT JOIN Users u ON u.id = sr.triggeredByUserId
            ${whereClause}
            ORDER BY sr.startedAt DESC, sr.id DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);
        const total = Number(countResult.recordset[0]?.total ?? 0);
        const totalPages = Math.max(1, Math.ceil(total / query.limit));

        return NextResponse.json({
            success: true,
            runs: result.recordset,
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages,
                hasPrevious: query.page > 1,
                hasNext: query.page < totalPages,
            },
        });
    } catch (error) {
        console.error('Error fetching attendance sync runs:', error);
        return NextResponse.json({ error: 'Failed to fetch attendance sync runs' }, { status: 500 });
    }
}
