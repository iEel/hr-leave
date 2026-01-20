import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { notifyLeaveApproval } from '@/lib/notifications';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/leave/approve
 * อนุมัติหรือปฏิเสธใบลา
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

        const approverId = Number(session.user.id);
        const userRole = session.user.role;

        // Only managers and HR can approve
        if (userRole !== 'MANAGER' && userRole !== 'HR' && userRole !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Permission denied' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { leaveId, action, rejectionReason } = body;

        if (!leaveId || !action) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        if (action !== 'APPROVE' && action !== 'REJECT') {
            return NextResponse.json(
                { error: 'Invalid action' },
                { status: 400 }
            );
        }

        if (action === 'REJECT' && !rejectionReason?.trim()) {
            return NextResponse.json(
                { error: 'Rejection reason is required' },
                { status: 400 }
            );
        }

        const pool = await getPool();

        // Get the leave request
        const leaveResult = await pool.request()
            .input('leaveId', leaveId)
            .query(`
                SELECT id, userId, leaveType, usageAmount, status,
                       CONVERT(varchar, startDatetime, 23) as startDate
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

        if (leave.status !== 'PENDING') {
            return NextResponse.json(
                { error: 'ใบลานี้ถูกดำเนินการไปแล้ว' },
                { status: 400 }
            );
        }

        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        // Update the leave request
        await pool.request()
            .input('leaveId', leaveId)
            .input('status', newStatus)
            .input('approverId', approverId)
            .input('rejectionReason', action === 'REJECT' ? rejectionReason : null)
            .query(`
                UPDATE LeaveRequests
                SET status = @status,
                    approverId = @approverId,
                    approvedAt = GETDATE(),
                    rejectionReason = @rejectionReason,
                    updatedAt = GETDATE()
                WHERE id = @leaveId
            `);

        // If rejected, return the used days back to balance
        if (action === 'REJECT') {
            const currentYear = new Date().getFullYear();
            await pool.request()
                .input('userId', leave.userId)
                .input('leaveType', leave.leaveType)
                .input('year', currentYear)
                .input('usageAmount', leave.usageAmount)
                .query(`
                    UPDATE LeaveBalances
                    SET used = used - @usageAmount,
                        remaining = remaining + @usageAmount,
                        updatedAt = GETDATE()
                    WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                `);
        }

        // Send notification to the employee
        await notifyLeaveApproval(
            leave.userId,
            leaveId,
            action === 'APPROVE',
            leave.leaveType,
            leave.startDate,
            rejectionReason
        );

        // Audit log
        await logAudit({
            userId: approverId,
            action: action === 'APPROVE' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE',
            targetTable: 'LeaveRequests',
            targetId: leaveId,
            newValue: { leaveType: leave.leaveType, status: newStatus, rejectionReason: rejectionReason || null }
        });

        return NextResponse.json({
            success: true,
            message: action === 'APPROVE' ? 'อนุมัติใบลาสำเร็จ' : 'ไม่อนุมัติใบลาสำเร็จ',
        });

    } catch (error) {
        console.error('Error processing approval:', error);
        return NextResponse.json(
            { error: 'Failed to process approval' },
            { status: 500 }
        );
    }
}
