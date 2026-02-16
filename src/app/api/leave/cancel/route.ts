import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool, sql } from '@/lib/db';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/leave/cancel
 * ยกเลิกใบลา (เฉพาะสถานะ PENDING เท่านั้น)
 */
export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = Number(session.user.id);
        const body = await request.json();
        const { leaveId } = body;

        if (!leaveId) {
            return NextResponse.json(
                { error: 'Missing leaveId' },
                { status: 400 }
            );
        }

        const pool = await getPool();

        // Get the leave request and verify ownership and status
        const leaveResult = await pool.request()
            .input('leaveId', leaveId)
            .query(`
                SELECT id, userId, leaveType, usageAmount, status, startDatetime
                FROM LeaveRequests
                WHERE id = @leaveId
            `);

        if (leaveResult.recordset.length === 0) {
            return NextResponse.json(
                { error: 'ไม่พบใบลานี้' },
                { status: 404 }
            );
        }

        const leave = leaveResult.recordset[0];
        const userRole = session.user.role;
        const isOwner = leave.userId === userId;
        const isHrOrAdmin = userRole === 'HR' || userRole === 'ADMIN';

        // Permission check
        if (!isOwner && !isHrOrAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            );
        }

        // Logic check
        if (leave.status === 'CANCELLED' || leave.status === 'REJECTED') {
            return NextResponse.json(
                { error: 'ใบลาถูกยกเลิกหรือปฏิเสธไปแล้ว' },
                { status: 400 }
            );
        }

        // If regular user, can only cancel PENDING
        if (!isHrOrAdmin && leave.status !== 'PENDING') {
            return NextResponse.json(
                { error: 'สามารถยกเลิกได้เฉพาะใบลาที่สถานะ "รออนุมัติ" เท่านั้น (หากอนุมัติแล้วกรุณาติดต่อ HR)' },
                { status: 400 }
            );
        }

        // === BEGIN TRANSACTION ===
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Update status to CANCELLED (with optimistic lock on current status)
            const updateResult = await new sql.Request(transaction)
                .input('leaveId', leaveId)
                .input('status', 'CANCELLED')
                .input('cancelledBy', userId)
                .query(`
                    UPDATE LeaveRequests
                    SET status = @status, 
                        updatedAt = GETDATE(),
                        rejectionReason = 'Cancelled by ' + CAST(@cancelledBy as varchar)
                    WHERE id = @leaveId AND status NOT IN ('CANCELLED', 'REJECTED')
                `);

            if (updateResult.rowsAffected[0] === 0) {
                await transaction.rollback();
                return NextResponse.json(
                    { error: 'ใบลาถูกดำเนินการไปแล้ว (กรุณารีเฟรชหน้า)' },
                    { status: 409 }
                );
            }

            // Return the used days back to balance using year-split data
            const splitResult = await new sql.Request(transaction)
                .input('leaveId', leaveId)
                .query(`SELECT year, usageAmount FROM LeaveRequestYearSplit WHERE leaveRequestId = @leaveId`);

            if (splitResult.recordset.length > 0) {
                // Refund using split data (new system)
                for (const split of splitResult.recordset) {
                    await new sql.Request(transaction)
                        .input('userId', leave.userId)
                        .input('leaveType', leave.leaveType)
                        .input('year', split.year)
                        .input('usageAmount', split.usageAmount)
                        .query(`
                            UPDATE LeaveBalances
                            SET used = used - @usageAmount,
                                remaining = remaining + @usageAmount,
                                updatedAt = GETDATE()
                            WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                        `);
                }
            } else {
                // Fallback for pre-migration leaves: use startDatetime year
                const leaveYear = new Date(leave.startDatetime).getFullYear();
                await new sql.Request(transaction)
                    .input('userId', leave.userId)
                    .input('leaveType', leave.leaveType)
                    .input('year', leaveYear)
                    .input('usageAmount', leave.usageAmount)
                    .query(`
                        UPDATE LeaveBalances
                        SET used = used - @usageAmount,
                            remaining = remaining + @usageAmount,
                            updatedAt = GETDATE()
                        WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                    `);
            }

            // Audit log (inside transaction)
            await logAudit({
                userId,
                action: 'CANCEL_LEAVE_REQUEST',
                targetTable: 'LeaveRequests',
                targetId: leaveId,
                oldValue: { leaveType: leave.leaveType, usageAmount: leave.usageAmount, status: leave.status },
                newValue: { status: 'CANCELLED' },
                transaction
            });

            await transaction.commit();
            // === END TRANSACTION ===

        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }

        return NextResponse.json({
            success: true,
            message: 'ยกเลิกใบลาสำเร็จ',
        });

    } catch (error) {
        console.error('Error cancelling leave:', error);
        return NextResponse.json(
            { error: 'Failed to cancel leave' },
            { status: 500 }
        );
    }
}
