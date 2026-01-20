import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

/**
 * GET /api/holidays
 * ดึงรายการวันหยุดราชการ
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const year = searchParams.get('year') || new Date().getFullYear().toString();

        const pool = await getPool();

        const result = await pool.request()
            .input('year', parseInt(year))
            .query(`
                SELECT 
                    id,
                    CONVERT(varchar, date, 23) as date,
                    name,
                    type
                FROM PublicHolidays
                WHERE YEAR(date) = @year
                ORDER BY date ASC
            `);

        // Map to expected format
        const holidays = result.recordset.map(h => ({
            id: h.id,
            date: h.date,
            name: h.name,
            description: null,
            isRecurring: h.type === 'PUBLIC',
        }));

        return NextResponse.json({
            success: true,
            data: holidays,
            year: parseInt(year),
        });

    } catch (error) {
        console.error('Error fetching holidays:', error);
        return NextResponse.json(
            { error: 'Failed to fetch holidays' },
            { status: 500 }
        );
    }
}
