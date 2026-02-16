import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { verifyApprovalToken } from '@/lib/tokens';
import { logAudit } from '@/lib/audit';
import { notifyLeaveApproval } from '@/lib/notifications';
import { sendLeaveApprovalEmail } from '@/lib/email';

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

        // 2. Perform Action in Transaction
        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const rejectionReason = action === 'REJECT' ? (reason || 'Rejected via Email') : null;

        // === BEGIN TRANSACTION ===
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            await new sql.Request(transaction)
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

            // 3. If REJECTED, Refund Balance using year-split data
            if (newStatus === 'REJECTED') {
                const leaveData = await new sql.Request(transaction)
                    .input('leaveId', leaveId)
                    .query(`SELECT userId, leaveType, usageAmount, startDatetime FROM LeaveRequests WHERE id = @leaveId`);

                if (leaveData.recordset.length > 0) {
                    const { userId, leaveType, usageAmount, startDatetime } = leaveData.recordset[0];

                    const splitResult = await new sql.Request(transaction)
                        .input('leaveId', leaveId)
                        .query(`SELECT year, usageAmount FROM LeaveRequestYearSplit WHERE leaveRequestId = @leaveId`);

                    if (splitResult.recordset.length > 0) {
                        for (const split of splitResult.recordset) {
                            await new sql.Request(transaction)
                                .input('userId', userId)
                                .input('leaveType', leaveType)
                                .input('usageAmount', split.usageAmount)
                                .input('year', split.year)
                                .query(`
                                    UPDATE LeaveBalances
                                    SET used = used - @usageAmount,
                                        remaining = remaining + @usageAmount
                                    WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                                `);
                        }
                    } else {
                        // Fallback: use startDatetime year
                        const leaveYear = new Date(startDatetime).getFullYear();
                        await new sql.Request(transaction)
                            .input('userId', userId)
                            .input('leaveType', leaveType)
                            .input('usageAmount', usageAmount)
                            .input('year', leaveYear)
                            .query(`
                                UPDATE LeaveBalances
                                SET used = used - @usageAmount,
                                    remaining = remaining + @usageAmount
                                WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                            `);
                    }
                }
            }

            // 4. Audit Log (inside transaction)
            await logAudit({
                userId: approverId,
                action: action === 'APPROVE' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE',
                targetTable: 'LeaveRequests',
                targetId: leaveId,
                newValue: { status: newStatus, via: 'EMAIL_MAGIC_LINK' },
                transaction
            });

            await transaction.commit();
            // === END TRANSACTION ===

        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }

        // 5. Send Notification to Employee (outside transaction - non-critical)
        try {
            const leaveDetails = await pool.request()
                .input('leaveId', leaveId)
                .query(`
                    SELECT lr.userId, lr.leaveType, lr.usageAmount,
                           CONVERT(varchar, lr.startDatetime, 23) as startDate,
                           CONVERT(varchar, lr.endDatetime, 23) as endDate,
                           u.email as employeeEmail,
                           u.firstName + ' ' + u.lastName as employeeName
                    FROM LeaveRequests lr
                    JOIN Users u ON lr.userId = u.id
                    WHERE lr.id = @leaveId
                `);

            if (leaveDetails.recordset.length > 0) {
                const { userId, leaveType, startDate, endDate, usageAmount, employeeEmail, employeeName } = leaveDetails.recordset[0];

                // In-app notification
                await notifyLeaveApproval(
                    userId,
                    leaveId,
                    action === 'APPROVE',
                    leaveType,
                    startDate,
                    rejectionReason
                );

                // Email notification
                if (employeeEmail) {
                    await sendLeaveApprovalEmail(
                        employeeEmail,
                        employeeName,
                        {
                            id: leaveId,
                            type: leaveType,
                            startDate: startDate,
                            endDate: endDate,
                            days: usageAmount,
                        },
                        action === 'APPROVE',
                        rejectionReason
                    );
                }
            }
        } catch (notifyError) {
            console.error('Error sending notifications:', notifyError);
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

