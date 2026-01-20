import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/leave/pending
 * ดึงใบลาที่รออนุมัติ (สำหรับ Manager/HR)
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
        const userRole = session.user.role;

        // Only managers and HR can see pending requests
        if (userRole !== 'MANAGER' && userRole !== 'HR' && userRole !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Permission denied' },
                { status: 403 }
            );
        }

        const pool = await getPool();

        // For now, managers see all pending requests
        // TODO: Implement hierarchical approval (only subordinates)
        // Filter by role:
        // - ADMIN/HR: See all pending requests
        // - MANAGER: See only requests from subordinates (where departmentHeadId = currentUserId)
        let query = `
            SELECT 
                lr.id,
                u.employeeId,
                u.firstName + ' ' + u.lastName as employeeName,
                u.department,
                lr.leaveType,
                CONVERT(varchar, lr.startDatetime, 23) as startDate,
                CONVERT(varchar, lr.endDatetime, 23) as endDate,
                lr.isHourly,
                lr.startTime,
                lr.endTime,
                lr.usageAmount,
                lr.reason,
                lr.hasMedicalCertificate as hasMedicalCert,
                lr.medicalCertificateFile,
                CONVERT(varchar, lr.createdAt, 23) as createdAt
            FROM LeaveRequests lr
            INNER JOIN Users u ON lr.userId = u.id
            WHERE lr.status = 'PENDING'
        `;

        if (userRole === 'MANAGER') {
            query += ` AND u.departmentHeadId = @userId`;
        }

        query += ` ORDER BY lr.createdAt DESC`;

        const requestBuilder = pool.request();
        if (userRole === 'MANAGER') {
            requestBuilder.input('userId', userId);
        }

        const result = await requestBuilder.query(query);

        return NextResponse.json({
            success: true,
            data: result.recordset,
        });

    } catch (error) {
        console.error('Error fetching pending requests:', error);
        return NextResponse.json(
            { error: 'Failed to fetch pending requests' },
            { status: 500 }
        );
    }
}
