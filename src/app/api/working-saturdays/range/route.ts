import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

/**
 * GET /api/working-saturdays/range
 * Get working Saturdays within a date range (public API for leave calculation)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
        }

        const pool = await getPool();

        const result = await pool.request()
            .input('startDate', startDate)
            .input('endDate', endDate)
            .query(`
                SELECT 
                    FORMAT(date, 'yyyy-MM-dd') as date,
                    startTime,
                    endTime,
                    workHours
                FROM WorkingSaturdays
                WHERE date >= @startDate AND date <= @endDate
                ORDER BY date ASC
            `);

        return NextResponse.json({
            success: true,
            workingSaturdays: result.recordset
        });
    } catch (error) {
        console.error('Error fetching working saturdays range:', error);
        return NextResponse.json({ error: 'Failed to fetch working saturdays' }, { status: 500 });
    }
}
