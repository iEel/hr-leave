import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/admin/audit-logs
 * Get audit logs with pagination and filters (ADMIN ONLY)
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        // Only ADMIN can access
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const action = searchParams.get('action') || '';
        const userId = searchParams.get('userId') || '';
        const dateFrom = searchParams.get('dateFrom') || '';
        const dateTo = searchParams.get('dateTo') || '';

        const offset = (page - 1) * limit;
        const pool = await getPool();

        // Build WHERE clause
        let whereClause = '1=1';
        const inputs: { name: string; value: any }[] = [];

        if (action) {
            whereClause += ' AND al.action = @action';
            inputs.push({ name: 'action', value: action });
        }

        if (userId) {
            whereClause += ' AND al.userId = @filterUserId';
            inputs.push({ name: 'filterUserId', value: parseInt(userId) });
        }

        if (dateFrom) {
            whereClause += ' AND al.createdAt >= @dateFrom';
            inputs.push({ name: 'dateFrom', value: dateFrom });
        }

        if (dateTo) {
            whereClause += ' AND al.createdAt <= @dateTo + \' 23:59:59\'';
            inputs.push({ name: 'dateTo', value: dateTo });
        }

        // Get total count
        let countRequest = pool.request();
        for (const input of inputs) {
            countRequest = countRequest.input(input.name, input.value);
        }
        const countResult = await countRequest.query(`
            SELECT COUNT(*) as total FROM AuditLogs al WHERE ${whereClause}
        `);
        const total = countResult.recordset[0].total;

        // Get logs with user info
        let logsRequest = pool.request()
            .input('offset', offset)
            .input('limit', limit);

        for (const input of inputs) {
            logsRequest = logsRequest.input(input.name, input.value);
        }

        const logsResult = await logsRequest.query(`
            SELECT 
                al.id,
                al.userId,
                u.employeeId,
                u.firstName,
                u.lastName,
                al.action,
                al.targetTable,
                al.targetId,
                al.oldValue,
                al.newValue,
                al.ipAddress,
                FORMAT(al.createdAt, 'yyyy-MM-dd HH:mm:ss') as createdAt
            FROM AuditLogs al
            LEFT JOIN Users u ON al.userId = u.id
            WHERE ${whereClause}
            ORDER BY al.createdAt DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

        // Get distinct actions for filter dropdown
        const actionsResult = await pool.request().query(`
            SELECT DISTINCT action FROM AuditLogs ORDER BY action
        `);

        return NextResponse.json({
            success: true,
            data: {
                logs: logsResult.recordset,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                },
                availableActions: actionsResult.recordset.map(r => r.action)
            }
        });

    } catch (error) {
        console.error('Error fetching audit logs:', error);
        return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
    }
}
