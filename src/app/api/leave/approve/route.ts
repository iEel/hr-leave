import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { notifyLeaveApproval } from '@/lib/notifications';
import { logAudit } from '@/lib/audit';
import { sendLeaveApprovalEmail } from '@/lib/email';
import { isDelegateOf, getDelegatingManagers } from '@/lib/delegate';

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

        // Check if user is a delegate (any role can be a delegate)
        const delegatingManagers = await getDelegatingManagers(approverId);
        const isDelegate = delegatingManagers.length > 0;

        // Only managers, HR, admin, or active delegates can approve
        if (userRole !== 'MANAGER' && userRole !== 'HR' && userRole !== 'ADMIN' && !isDelegate) {
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

        // Get the leave request with employee details
        const leaveResult = await pool.request()
            .input('leaveId', leaveId)
            .query(`
                SELECT lr.id, lr.userId, lr.leaveType, lr.usageAmount, lr.status,
                       CONVERT(varchar, lr.startDatetime, 23) as startDate,
                       CONVERT(varchar, lr.endDatetime, 23) as endDate,
                       u.email as employeeEmail,
                       u.firstName + ' ' + u.lastName as employeeName,
                       u.departmentHeadId
                FROM LeaveRequests lr
                JOIN Users u ON lr.userId = u.id
                WHERE lr.id = @leaveId
            `);

        if (leaveResult.recordset.length === 0) {
            return NextResponse.json(
                { error: 'ไม่พบใบลานี้' },
                { status: 404 }
            );
        }

        const leave = leaveResult.recordset[0];

        // Block self-approval
        if (approverId === leave.userId) {
            return NextResponse.json(
                { error: 'ไม่สามารถอนุมัติใบลาของตัวเองได้' },
                { status: 403 }
            );
        }

        // Verify authority for non-HR/ADMIN
        if (userRole !== 'HR' && userRole !== 'ADMIN') {
            const isDirectManager = approverId === leave.departmentHeadId;
            const isDelegateApprover = leave.departmentHeadId ? await isDelegateOf(approverId, leave.departmentHeadId) : false;

            if (!isDirectManager && !isDelegateApprover) {
                return NextResponse.json(
                    { error: 'คุณไม่มีสิทธิ์อนุมัติใบลานี้' },
                    { status: 403 }
                );
            }
        }

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

        // If rejected, return the used days back to balance using year-split data
        if (action === 'REJECT') {
            const splitResult = await pool.request()
                .input('leaveId', leaveId)
                .query(`SELECT year, usageAmount FROM LeaveRequestYearSplit WHERE leaveRequestId = @leaveId`);

            if (splitResult.recordset.length > 0) {
                for (const split of splitResult.recordset) {
                    await pool.request()
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
                // Fallback: use startDate year from the leave record
                const leaveYear = new Date(leave.startDate).getFullYear();
                await pool.request()
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
        }

        // Send in-app notification to the employee
        await notifyLeaveApproval(
            leave.userId,
            leaveId,
            action === 'APPROVE',
            leave.leaveType,
            leave.startDate,
            rejectionReason
        );

        // Send email notification to the employee
        if (leave.employeeEmail) {
            await sendLeaveApprovalEmail(
                leave.employeeEmail,
                leave.employeeName,
                {
                    id: leaveId,
                    type: leave.leaveType,
                    startDate: leave.startDate,
                    endDate: leave.endDate,
                    days: leave.usageAmount,
                },
                action === 'APPROVE',
                rejectionReason
            );
        }

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
