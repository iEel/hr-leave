import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/manager/delegates
 * ดึงรายการ delegates ของ Manager ที่ login
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = Number(session.user.id);

        // Only managers can manage delegates
        if (session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'เฉพาะ Manager เท่านั้น' }, { status: 403 });
        }

        const pool = await getPool();
        const result = await pool.request()
            .input('managerId', userId)
            .query(`
                SELECT 
                    da.id,
                    da.delegateUserId,
                    u.firstName + ' ' + u.lastName as delegateName,
                    u.department,
                    u.employeeId,
                    CONVERT(varchar, da.startDate, 23) as startDate,
                    CONVERT(varchar, da.endDate, 23) as endDate,
                    da.isActive,
                    CASE 
                        WHEN da.isActive = 0 THEN 'CANCELLED'
                        WHEN CAST(GETDATE() AS DATE) < da.startDate THEN 'UPCOMING'
                        WHEN CAST(GETDATE() AS DATE) > da.endDate THEN 'EXPIRED'
                        ELSE 'ACTIVE'
                    END as status,
                    CONVERT(varchar, da.createdAt, 23) as createdAt
                FROM DelegateApprovers da
                JOIN Users u ON da.delegateUserId = u.id
                WHERE da.managerId = @managerId
                ORDER BY da.createdAt DESC
            `);

        return NextResponse.json({
            success: true,
            data: result.recordset
        });

    } catch (error) {
        console.error('Error fetching delegates:', error);
        return NextResponse.json({ error: 'Failed to fetch delegates' }, { status: 500 });
    }
}

/**
 * POST /api/manager/delegates
 * สร้าง delegate ใหม่
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = Number(session.user.id);

        if (session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'เฉพาะ Manager เท่านั้น' }, { status: 403 });
        }

        const body = await request.json();
        const { delegateUserId, startDate, endDate } = body;

        if (!delegateUserId || !startDate || !endDate) {
            return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 });
        }

        // Validate: ห้ามมอบหมายตัวเอง
        if (delegateUserId === userId) {
            return NextResponse.json({ error: 'ไม่สามารถมอบหมายตัวเองได้' }, { status: 400 });
        }

        // Validate: endDate >= startDate
        if (new Date(endDate) < new Date(startDate)) {
            return NextResponse.json({ error: 'วันสิ้นสุดต้องมากกว่าหรือเท่ากับวันเริ่มต้น' }, { status: 400 });
        }

        const pool = await getPool();

        // Validate: delegate user ต้อง active
        const userCheck = await pool.request()
            .input('delegateUserId', delegateUserId)
            .query(`SELECT id, firstName, lastName FROM Users WHERE id = @delegateUserId AND isActive = 1`);

        if (userCheck.recordset.length === 0) {
            return NextResponse.json({ error: 'ไม่พบผู้ใช้หรือผู้ใช้ถูกปิดการใช้งาน' }, { status: 400 });
        }

        // Validate: ห้ามช่วงวันซ้อนกับ delegate ที่มีอยู่ (active only)
        const overlapCheck = await pool.request()
            .input('managerId', userId)
            .input('delegateUserId', delegateUserId)
            .input('startDate', startDate)
            .input('endDate', endDate)
            .query(`
                SELECT id FROM DelegateApprovers
                WHERE managerId = @managerId
                  AND delegateUserId = @delegateUserId
                  AND isActive = 1
                  AND startDate <= @endDate
                  AND endDate >= @startDate
            `);

        if (overlapCheck.recordset.length > 0) {
            return NextResponse.json({ error: 'มีการมอบหมายผู้ใช้นี้ในช่วงเวลาที่ซ้อนกันอยู่แล้ว' }, { status: 400 });
        }

        // Insert
        const insertResult = await pool.request()
            .input('managerId', userId)
            .input('delegateUserId', delegateUserId)
            .input('startDate', startDate)
            .input('endDate', endDate)
            .query(`
                INSERT INTO DelegateApprovers (managerId, delegateUserId, startDate, endDate, isActive)
                OUTPUT INSERTED.id
                VALUES (@managerId, @delegateUserId, @startDate, @endDate, 1)
            `);

        const newId = insertResult.recordset[0].id;
        const delegateName = `${userCheck.recordset[0].firstName} ${userCheck.recordset[0].lastName}`;

        // Audit log
        await logAudit({
            userId,
            action: 'CREATE_DELEGATE',
            targetTable: 'DelegateApprovers',
            targetId: newId,
            newValue: { delegateUserId, delegateName, startDate, endDate }
        });

        return NextResponse.json({
            success: true,
            message: `มอบหมาย ${delegateName} เป็นผู้อนุมัติแทนสำเร็จ`,
            data: { id: newId }
        });

    } catch (error) {
        console.error('Error creating delegate:', error);
        return NextResponse.json({ error: 'Failed to create delegate' }, { status: 500 });
    }
}

/**
 * DELETE /api/manager/delegates?id=123
 * ยกเลิก delegate (soft delete)
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = Number(session.user.id);

        if (session.user.role !== 'MANAGER') {
            return NextResponse.json({ error: 'เฉพาะ Manager เท่านั้น' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const delegateId = searchParams.get('id');

        if (!delegateId) {
            return NextResponse.json({ error: 'กรุณาระบุ ID' }, { status: 400 });
        }

        const pool = await getPool();

        // Verify ownership
        const check = await pool.request()
            .input('id', delegateId)
            .input('managerId', userId)
            .query(`
                SELECT da.id, u.firstName + ' ' + u.lastName as delegateName
                FROM DelegateApprovers da
                JOIN Users u ON da.delegateUserId = u.id
                WHERE da.id = @id AND da.managerId = @managerId AND da.isActive = 1
            `);

        if (check.recordset.length === 0) {
            return NextResponse.json({ error: 'ไม่พบรายการหรือถูกยกเลิกไปแล้ว' }, { status: 404 });
        }

        // Soft delete
        await pool.request()
            .input('id', delegateId)
            .query(`UPDATE DelegateApprovers SET isActive = 0 WHERE id = @id`);

        // Audit log
        await logAudit({
            userId,
            action: 'CANCEL_DELEGATE',
            targetTable: 'DelegateApprovers',
            targetId: Number(delegateId),
            newValue: { delegateName: check.recordset[0].delegateName, cancelled: true }
        });

        return NextResponse.json({
            success: true,
            message: 'ยกเลิกการมอบหมายสำเร็จ'
        });

    } catch (error) {
        console.error('Error cancelling delegate:', error);
        return NextResponse.json({ error: 'Failed to cancel delegate' }, { status: 500 });
    }
}
