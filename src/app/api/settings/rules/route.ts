import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const pool = await getPool();
        const result = await pool.request()
            .query(`
                SELECT settingKey, settingValue 
                FROM SystemSettings 
                WHERE settingKey IN ('LEAVE_ADVANCE_DAYS', 'LEAVE_SICK_CERT_DAYS')
            `);

        const rules = {
            advanceNoticeDays: 3, // Default
            sickCertThreshold: 3  // Default
        };

        result.recordset.forEach(row => {
            if (row.settingKey === 'LEAVE_ADVANCE_DAYS') {
                rules.advanceNoticeDays = parseInt(row.settingValue, 10) || 3;
            } else if (row.settingKey === 'LEAVE_SICK_CERT_DAYS') {
                rules.sickCertThreshold = parseInt(row.settingValue, 10) || 3;
            }
        });

        return NextResponse.json({ success: true, rules });
    } catch (error) {
        console.error('Error fetching leave rules:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
