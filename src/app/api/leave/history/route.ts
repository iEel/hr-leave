import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/leave/history
 * ดึงประวัติการลาของ User ปัจจุบัน
 */
export async function GET(request: NextRequest) {
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
        const { searchParams } = new URL(request.url);

        // Optional filters
        const status = searchParams.get('status');
        const leaveType = searchParams.get('leaveType');

        const pool = await getPool();

        // Build query with optional filters
        let query = `
            SELECT 
                lr.id,
                lr.leaveType,
                CONVERT(varchar, lr.startDatetime, 23) as startDate,
                CONVERT(varchar, lr.endDatetime, 23) as endDate,
                lr.isHourly,
                lr.startTime,
                lr.endTime,
                lr.timeSlot,
                lr.usageAmount,
                lr.reason,
                lr.status,
                lr.rejectionReason,
                lr.hasMedicalCertificate as hasMedicalCert,
                lr.medicalCertificateFile,
                CONVERT(varchar, lr.createdAt, 23) as createdAt,
                CONVERT(varchar, lr.approvedAt, 23) as approvedAt,
                approver.firstName + ' ' + approver.lastName as approverName
            FROM LeaveRequests lr
            LEFT JOIN Users approver ON lr.approverId = approver.id
            WHERE lr.userId = @userId
        `;

        if (status && status !== 'ALL') {
            query += ` AND lr.status = @status`;
        }
        if (leaveType && leaveType !== 'ALL') {
            query += ` AND lr.leaveType = @leaveType`;
        }

        query += ` ORDER BY lr.createdAt DESC`;

        const requestObj = pool.request().input('userId', userId);

        if (status && status !== 'ALL') {
            requestObj.input('status', status);
        }
        if (leaveType && leaveType !== 'ALL') {
            requestObj.input('leaveType', leaveType);
        }

        const result = await requestObj.query(query);

        return NextResponse.json({
            success: true,
            data: result.recordset,
        });

    } catch (error) {
        console.error('Error fetching leave history:', error);
        return NextResponse.json(
            { error: 'Failed to fetch leave history' },
            { status: 500 }
        );
    }
}
