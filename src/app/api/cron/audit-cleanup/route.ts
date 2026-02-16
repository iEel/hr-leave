import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { query } from '@/lib/db';

/**
 * Cron Audit Cleanup API
 * 
 * ลบ Audit Logs ที่เก่ากว่า 12 เดือน
 * 
 * Usage:
 * POST /api/cron/audit-cleanup
 * Headers: { "x-cron-secret": "your-secret-key" }
 * 
 * ตั้ง Schedule:
 * - Windows Task Scheduler: รันทุกเดือนวันที่ 1 เวลา 02:00
 *   curl -X POST http://localhost:3000/api/cron/audit-cleanup -H "x-cron-secret: YOUR_SECRET"
 */

async function getCronSecret(): Promise<string> {
    try {
        const result = await query<{ settingValue: string }>(`
            SELECT settingValue FROM SystemSettings WHERE settingKey = 'CRON_SECRET'
        `);
        if (result.length > 0 && result[0].settingValue) {
            return result[0].settingValue;
        }
    } catch (e) {
        console.error('Error fetching cron secret:', e);
    }
    return process.env.CRON_SECRET || '';
}

export async function POST(request: NextRequest) {
    try {
        // Authenticate
        const cronSecret = await getCronSecret();
        const providedSecret = request.headers.get('x-cron-secret');

        if (!cronSecret || providedSecret !== cronSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const pool = await getPool();

        // Count records to be deleted
        const countResult = await pool.request().query(`
            SELECT COUNT(*) as count 
            FROM AuditLogs 
            WHERE createdAt < DATEADD(MONTH, -12, GETDATE())
        `);
        const recordsToDelete = countResult.recordset[0].count;

        if (recordsToDelete === 0) {
            return NextResponse.json({
                success: true,
                message: 'No old audit logs to clean up',
                deleted: 0
            });
        }

        // Delete in batches of 5000 to avoid lock timeout
        let totalDeleted = 0;
        let batchDeleted = 0;

        do {
            const result = await pool.request().query(`
                DELETE TOP (5000) FROM AuditLogs 
                WHERE createdAt < DATEADD(MONTH, -12, GETDATE())
            `);
            batchDeleted = result.rowsAffected[0];
            totalDeleted += batchDeleted;
        } while (batchDeleted === 5000);

        return NextResponse.json({
            success: true,
            message: `Cleaned up ${totalDeleted} audit log records older than 12 months`,
            deleted: totalDeleted,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in audit cleanup:', error);
        return NextResponse.json({ error: 'Audit cleanup failed' }, { status: 500 });
    }
}
