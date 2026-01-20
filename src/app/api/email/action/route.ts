import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { verifyApprovalToken } from '@/lib/tokens';
import { logAudit } from '@/lib/audit';
import { notifyLeaveApproval } from '@/lib/notifications';

/**
 * POST /api/email/action
 * Execute action from Magic Link
 */
export async function POST(request: NextRequest) {
    try {
        const { token, reason } = await request.json();

        if (!token) {
            return NextResponse.json({ error: 'Token required' }, { status: 400 });
        }

        const payload = verifyApprovalToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
        }

        const { leaveId, approverId, action } = payload;
        const pool = await getPool();

        // 1. Check current status
        const leaveCheck = await pool.request()
            .input('leaveId', leaveId)
            .query(`SELECT status FROM LeaveRequests WHERE id = @leaveId`);

        if (leaveCheck.recordset.length === 0) {
            return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
        }

        if (leaveCheck.recordset[0].status !== 'PENDING') {
            return NextResponse.json({
                error: 'รายการนี้ถูกดำเนินการไปแล้ว',
                currentStatus: leaveCheck.recordset[0].status
            }, { status: 409 }); // 409 Conflict
        }

        // 2. Perform Action
        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const rejectionReason = action === 'REJECT' ? (reason || 'Rejected via Email') : null;

        await pool.request()
            .input('leaveId', leaveId)
            .input('approverId', approverId)
            .input('status', newStatus)
            .input('rejectionReason', rejectionReason)
            .query(`
                UPDATE LeaveRequests
                SET status = @status,
                    approverId = @approverId,
                    rejectionReason = @rejectionReason,
                    updatedAt = GETDATE()
                WHERE id = @leaveId
            `);

        // 3. If REJECTED, Refund Balance
        if (newStatus === 'REJECTED') {
            // Fetch usage amount and type to refund
            const leaveData = await pool.request()
                .input('leaveId', leaveId)
                .query(`SELECT userId, leaveType, usageAmount FROM LeaveRequests WHERE id = @leaveId`);

            if (leaveData.recordset.length > 0) {
                const { userId, leaveType, usageAmount } = leaveData.recordset[0];
                const currentYear = new Date().getFullYear();

                await pool.request()
                    .input('userId', userId)
                    .input('leaveType', leaveType)
                    .input('usageAmount', usageAmount)
                    .input('year', currentYear)
                    .query(`
                        UPDATE LeaveBalances
                        SET used = used - @usageAmount,
                            remaining = remaining + @usageAmount
                        WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                    `);
            }
        }

        // 4. Audit Log
        await logAudit({
            userId: approverId,
            action: action === 'APPROVE' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE',
            targetTable: 'LeaveRequests',
            targetId: leaveId,
            newValue: { status: newStatus, via: 'EMAIL_MAGIC_LINK' }
        });

        // 5. Send Notification to Employee
        // Fetch necessary data for notification if not available
        const leaveDetails = await pool.request()
            .input('leaveId', leaveId)
            .query(`SELECT userId, leaveType, CONVERT(varchar, startDatetime, 23) as startDate FROM LeaveRequests WHERE id = @leaveId`);

        if (leaveDetails.recordset.length > 0) {
            const { userId, leaveType, startDate } = leaveDetails.recordset[0];
            await notifyLeaveApproval(
                userId,
                leaveId,
                action === 'APPROVE',
                leaveType,
                startDate,
                rejectionReason
            );
        }

        return NextResponse.json({ success: true, status: newStatus });

    } catch (error) {
        console.error('Magic Link Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

}

/**
 * GET /api/email/action?token=...
 * Check if token is valid and actionable
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json({ error: 'Token required' }, { status: 400 });
        }

        const payload = verifyApprovalToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
        }

        const { leaveId } = payload;
        const pool = await getPool();

        const leaveCheck = await pool.request()
            .input('leaveId', leaveId)
            .query(`SELECT status, userId FROM LeaveRequests WHERE id = @leaveId`);

        if (leaveCheck.recordset.length === 0) {
            return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
        }

        const currentStatus = leaveCheck.recordset[0].status;

        // Fetch Employee Name for UI
        const userCheck = await pool.request()
            .input('userId', leaveCheck.recordset[0].userId)
            .query(`SELECT firstName, lastName FROM Users WHERE id = @userId`);

        const employeeName = userCheck.recordset[0]
            ? `${userCheck.recordset[0].firstName} ${userCheck.recordset[0].lastName}`
            : 'Unknown';

        return NextResponse.json({
            valid: true,
            status: currentStatus,
            canAction: currentStatus === 'PENDING',
            employeeName
        });

    } catch (error) {
        console.error('Check Token Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

