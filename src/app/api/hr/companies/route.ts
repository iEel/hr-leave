import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

interface Company {
    id: number;
    code: string;
    name: string;
    shortName: string | null;
    color: string;
    isActive: boolean;
}

/**
 * GET /api/hr/companies
 * ดึงรายชื่อบริษัททั้งหมด
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const activeOnly = searchParams.get('activeOnly') !== 'false';

        const pool = await getPool();

        const query = activeOnly
            ? `SELECT id, code, name, shortName, color, isActive FROM Companies WHERE isActive = 1 ORDER BY code`
            : `SELECT id, code, name, shortName, color, isActive FROM Companies ORDER BY code`;

        const result = await pool.request().query(query);

        return NextResponse.json({
            success: true,
            data: result.recordset
        });

    } catch (error) {
        console.error('Error fetching companies:', error);
        return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
    }
}

/**
 * POST /api/hr/companies
 * สร้างบริษัทใหม่
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { code, name, shortName, color } = body;

        if (!code || !name) {
            return NextResponse.json({ error: 'Missing required fields: code, name' }, { status: 400 });
        }

        const pool = await getPool();

        // Check for duplicate code
        const checkResult = await pool.request()
            .input('code', code.toUpperCase())
            .query(`SELECT id FROM Companies WHERE code = @code`);

        if (checkResult.recordset.length > 0) {
            return NextResponse.json({ error: 'รหัสบริษัทนี้มีอยู่แล้ว' }, { status: 409 });
        }

        // Insert
        await pool.request()
            .input('code', code.toUpperCase())
            .input('name', name)
            .input('shortName', shortName || null)
            .input('color', color || '#3B82F6')
            .query(`
                INSERT INTO Companies (code, name, shortName, color)
                VALUES (@code, @name, @shortName, @color)
            `);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'CREATE_COMPANY',
            targetTable: 'Companies',
            newValue: { code, name, shortName, color }
        });

        return NextResponse.json({ success: true, message: 'สร้างบริษัทสำเร็จ' });

    } catch (error) {
        console.error('Error creating company:', error);
        return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
    }
}

/**
 * PUT /api/hr/companies
 * แก้ไขบริษัท
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { id, name, shortName, color, isActive } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing company ID' }, { status: 400 });
        }

        const pool = await getPool();

        await pool.request()
            .input('id', id)
            .input('name', name)
            .input('shortName', shortName || null)
            .input('color', color || '#3B82F6')
            .input('isActive', isActive !== undefined ? (isActive ? 1 : 0) : 1)
            .query(`
                UPDATE Companies
                SET name = @name,
                    shortName = @shortName,
                    color = @color,
                    isActive = @isActive,
                    updatedAt = GETDATE()
                WHERE id = @id
            `);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'UPDATE_COMPANY',
            targetTable: 'Companies',
            targetId: id,
            newValue: { name, shortName, color, isActive }
        });

        return NextResponse.json({ success: true, message: 'แก้ไขบริษัทสำเร็จ' });

    } catch (error) {
        console.error('Error updating company:', error);
        return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
    }
}

/**
 * DELETE /api/hr/companies
 * ลบบริษัท (soft delete)
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Permission denied - Admin only' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing company ID' }, { status: 400 });
        }

        const pool = await getPool();

        // Check if company has users
        const usersCheck = await pool.request()
            .input('id', id)
            .query(`
                SELECT c.code, (SELECT COUNT(*) FROM Users WHERE company = c.code) as userCount
                FROM Companies c WHERE c.id = @id
            `);

        if (usersCheck.recordset.length > 0 && usersCheck.recordset[0].userCount > 0) {
            return NextResponse.json({
                error: `ไม่สามารถลบได้ มีพนักงาน ${usersCheck.recordset[0].userCount} คน ในบริษัทนี้`
            }, { status: 400 });
        }

        // Soft delete
        await pool.request()
            .input('id', id)
            .query(`UPDATE Companies SET isActive = 0, updatedAt = GETDATE() WHERE id = @id`);

        // Audit log
        await logAudit({
            userId: parseInt(session.user.id),
            action: 'DELETE_COMPANY',
            targetTable: 'Companies',
            targetId: parseInt(id)
        });

        return NextResponse.json({ success: true, message: 'ลบบริษัทสำเร็จ' });

    } catch (error) {
        console.error('Error deleting company:', error);
        return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 });
    }
}
