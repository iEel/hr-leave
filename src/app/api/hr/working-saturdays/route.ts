import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/hr/working-saturdays
 * Get list of working Saturdays
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const year = searchParams.get('year') || new Date().getFullYear().toString();
        const month = searchParams.get('month'); // optional

        const pool = await getPool();

        let query = `
            SELECT 
                ws.id,
                ws.date,
                ws.startTime,
                ws.endTime,
                ws.workHours,
                ws.description,
                ws.company,
                u.firstName + ' ' + u.lastName as createdByName,
                ws.createdAt
            FROM WorkingSaturdays ws
            LEFT JOIN Users u ON ws.createdBy = u.id
            WHERE YEAR(ws.date) = @year
        `;

        const req = pool.request().input('year', parseInt(year));

        if (month) {
            query += ` AND MONTH(ws.date) = @month`;
            req.input('month', parseInt(month));
        }

        query += ` ORDER BY ws.date ASC`;

        const result = await req.query(query);

        return NextResponse.json({
            success: true,
            workingSaturdays: result.recordset.map(row => ({
                ...row,
                date: row.date.toISOString().split('T')[0]
            }))
        });
    } catch (error) {
        console.error('Error fetching working saturdays:', error);
        return NextResponse.json({ error: 'Failed to fetch working saturdays' }, { status: 500 });
    }
}

/**
 * POST /api/hr/working-saturdays
 * Add a working Saturday
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { date, startTime, endTime, description, company } = body;

        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        // Validate it's a Saturday
        const dateObj = new Date(date);
        if (dateObj.getDay() !== 6) {
            return NextResponse.json({ error: 'วันที่เลือกไม่ใช่วันเสาร์' }, { status: 400 });
        }

        // Calculate work hours
        const start = startTime || '09:00';
        const end = endTime || '12:00';
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        const workHours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;

        const pool = await getPool();

        // Check if already exists
        const existing = await pool.request()
            .input('date', date)
            .query(`SELECT id FROM WorkingSaturdays WHERE date = @date`);

        if (existing.recordset.length > 0) {
            return NextResponse.json({ error: 'วันเสาร์นี้ถูกกำหนดไว้แล้ว' }, { status: 400 });
        }

        const result = await pool.request()
            .input('date', date)
            .input('startTime', start)
            .input('endTime', end)
            .input('workHours', workHours)
            .input('description', description || null)
            .input('company', company || null)
            .input('createdBy', parseInt(session.user.id))
            .query(`
                INSERT INTO WorkingSaturdays (date, startTime, endTime, workHours, description, company, createdBy)
                OUTPUT INSERTED.id
                VALUES (@date, @startTime, @endTime, @workHours, @description, @company, @createdBy)
            `);

        await logAudit({
            userId: parseInt(session.user.id),
            action: 'CREATE_WORKING_SATURDAY',
            targetTable: 'WorkingSaturdays',
            targetId: result.recordset[0].id,
            newValue: { date, startTime: start, endTime: end, workHours }
        });

        return NextResponse.json({
            success: true,
            message: `เพิ่มวันเสาร์ทำงาน ${date} เรียบร้อย`,
            id: result.recordset[0].id
        });
    } catch (error) {
        console.error('Error adding working saturday:', error);
        return NextResponse.json({ error: 'Failed to add working saturday' }, { status: 500 });
    }
}

/**
 * DELETE /api/hr/working-saturdays
 * Remove a working Saturday
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const date = searchParams.get('date');

        if (!id && !date) {
            return NextResponse.json({ error: 'ID or date is required' }, { status: 400 });
        }

        const pool = await getPool();

        let deleteQuery = '';
        const req = pool.request();

        if (id) {
            req.input('id', parseInt(id));
            deleteQuery = `DELETE FROM WorkingSaturdays WHERE id = @id`;
        } else {
            req.input('date', date);
            deleteQuery = `DELETE FROM WorkingSaturdays WHERE date = @date`;
        }

        const result = await req.query(deleteQuery);

        if (result.rowsAffected[0] === 0) {
            return NextResponse.json({ error: 'ไม่พบข้อมูลที่ต้องการลบ' }, { status: 404 });
        }

        await logAudit({
            userId: parseInt(session.user.id),
            action: 'DELETE_WORKING_SATURDAY',
            targetTable: 'WorkingSaturdays',
            oldValue: { id, date }
        });

        return NextResponse.json({
            success: true,
            message: 'ลบวันเสาร์ทำงานเรียบร้อย'
        });
    } catch (error) {
        console.error('Error deleting working saturday:', error);
        return NextResponse.json({ error: 'Failed to delete working saturday' }, { status: 500 });
    }
}
