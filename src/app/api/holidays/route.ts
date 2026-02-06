import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

/**
 * GET /api/holidays
 * ดึงรายการวันหยุดราชการ
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const year = searchParams.get('year');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        const pool = await getPool();

        // Support both year and date range queries
        if (startDate && endDate) {
            // Date range query (for leave calculation)
            const result = await pool.request()
                .input('startDate', startDate)
                .input('endDate', endDate)
                .query(`
                    SELECT 
                        id,
                        CONVERT(varchar, date, 23) as date,
                        name,
                        type
                    FROM PublicHolidays
                    WHERE date BETWEEN @startDate AND @endDate
                    ORDER BY date ASC
                `);

            return NextResponse.json({
                success: true,
                holidays: result.recordset, // Simplified format for calculation
            });
        } else {
            // Year query (for dashboard/calendar display)
            const yearValue = year || new Date().getFullYear().toString();
            const result = await pool.request()
                .input('year', parseInt(yearValue))
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
                year: parseInt(yearValue),
            });
        }

    } catch (error) {
        console.error('Error fetching holidays:', error);
        return NextResponse.json(
            { error: 'Failed to fetch holidays' },
            { status: 500 }
        );
    }
}
