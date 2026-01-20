import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function GET() {
    try {
        const pool = await getConnection();

        // Test query
        const result = await pool.request().query('SELECT 1 as test, GETDATE() as serverTime');

        // Check if Users table exists and count
        const userCount = await pool.request().query('SELECT COUNT(*) as count FROM Users');

        return NextResponse.json({
            success: true,
            message: 'Database connected successfully!',
            serverTime: result.recordset[0].serverTime,
            userCount: userCount.recordset[0].count,
        });
    } catch (error) {
        console.error('Database connection error:', error);
        return NextResponse.json({
            success: false,
            message: 'Database connection failed',
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
