import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/hr/holidays
 * ดึงรายการวันหยุดทั้งหมด (สำหรับ HR)
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check HR/Admin role
        // Check HR/Admin role OR isHRStaff
        const role = session.user.role;
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (role !== 'HR' && role !== 'ADMIN' && !isHRStaff) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

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
                    type,
                    company,
                    CONVERT(varchar, createdAt, 120) as createdAt
                FROM PublicHolidays
                WHERE YEAR(date) = @year
                ORDER BY date ASC
            `);

        return NextResponse.json({
            success: true,
            data: result.recordset,
        });
    } catch (error) {
        console.error('Error fetching holidays:', error);
        return NextResponse.json({ error: 'Failed to fetch holidays' }, { status: 500 });
    }
}

/**
 * POST /api/hr/holidays
 * สร้างวันหยุดใหม่
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = session.user.role;
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (role !== 'HR' && role !== 'ADMIN' && !isHRStaff) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { date, name, type = 'PUBLIC', company = null } = body;

        if (!date || !name) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const pool = await getPool();

        // Check for duplicate
        const existing = await pool.request()
            .input('date', date)
            .query(`SELECT id FROM PublicHolidays WHERE date = @date`);

        if (existing.recordset.length > 0) {
            return NextResponse.json({ error: 'วันหยุดนี้มีอยู่แล้ว' }, { status: 400 });
        }

        const result = await pool.request()
            .input('date', date)
            .input('name', name)
            .input('type', type)
            .input('company', company)
            .query(`
                INSERT INTO PublicHolidays (date, name, type, company)
                OUTPUT INSERTED.id
                VALUES (@date, @name, @type, @company)
            `);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'CREATE_HOLIDAY',
            targetTable: 'PublicHolidays',
            targetId: result.recordset[0].id,
            newValue: { date, name, type, company }
        });

        return NextResponse.json({
            success: true,
            message: 'สร้างวันหยุดสำเร็จ',
            data: { id: result.recordset[0].id },
        });
    } catch (error) {
        console.error('Error creating holiday:', error);
        return NextResponse.json({ error: 'Failed to create holiday' }, { status: 500 });
    }
}

/**
 * PUT /api/hr/holidays
 * แก้ไขวันหยุด
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = session.user.role;
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (role !== 'HR' && role !== 'ADMIN' && !isHRStaff) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { id, date, name, type, company } = body;

        if (!id || !date || !name) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const pool = await getPool();

        // Get old value for audit
        const oldResult = await pool.request()
            .input('id', id)
            .query(`SELECT date, name, type, company FROM PublicHolidays WHERE id = @id`);
        const oldValue = oldResult.recordset[0];

        await pool.request()
            .input('id', id)
            .input('date', date)
            .input('name', name)
            .input('type', type)
            .input('company', company)
            .query(`
                UPDATE PublicHolidays
                SET date = @date, name = @name, type = @type, company = @company
                WHERE id = @id
            `);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'UPDATE_HOLIDAY',
            targetTable: 'PublicHolidays',
            targetId: id,
            oldValue,
            newValue: { date, name, type, company }
        });

        return NextResponse.json({
            success: true,
            message: 'แก้ไขวันหยุดสำเร็จ',
        });
    } catch (error) {
        console.error('Error updating holiday:', error);
        return NextResponse.json({ error: 'Failed to update holiday' }, { status: 500 });
    }
}

/**
 * DELETE /api/hr/holidays
 * ลบวันหยุด
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = session.user.role;
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (role !== 'HR' && role !== 'ADMIN' && !isHRStaff) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing holiday id' }, { status: 400 });
        }

        const pool = await getPool();

        // Get old value for audit
        const oldResult = await pool.request()
            .input('id', parseInt(id))
            .query(`SELECT date, name FROM PublicHolidays WHERE id = @id`);
        const oldValue = oldResult.recordset[0];

        await pool.request()
            .input('id', parseInt(id))
            .query(`DELETE FROM PublicHolidays WHERE id = @id`);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'DELETE_HOLIDAY',
            targetTable: 'PublicHolidays',
            targetId: parseInt(id),
            oldValue
        });

        return NextResponse.json({
            success: true,
            message: 'ลบวันหยุดสำเร็จ',
        });
    } catch (error) {
        console.error('Error deleting holiday:', error);
        return NextResponse.json({ error: 'Failed to delete holiday' }, { status: 500 });
    }
}
