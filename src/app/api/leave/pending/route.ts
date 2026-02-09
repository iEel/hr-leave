import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { getDelegatingManagers } from '@/lib/delegate';

/**
 * GET /api/leave/pending
 * ดึงใบลาที่รออนุมัติ (สำหรับ Manager/HR/Delegate)
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

        // Check if user is a delegate (any role can be a delegate)
        const delegatingManagers = await getDelegatingManagers(userId);
        const isDelegate = delegatingManagers.length > 0;

        // Only managers, HR, admin, or active delegates can see pending requests
        if (userRole !== 'MANAGER' && userRole !== 'HR' && userRole !== 'ADMIN' && !isDelegate) {
            return NextResponse.json(
                { error: 'Permission denied' },
                { status: 403 }
            );
        }

        const pool = await getPool();

        let query = `
            SELECT 
                lr.id,
                lr.userId,
                u.employeeId,
                u.firstName + ' ' + u.lastName as employeeName,
                u.department,
                u.departmentHeadId,
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
                CONVERT(varchar, lr.createdAt, 23) as createdAt,
                m.firstName + ' ' + m.lastName as managerName
            FROM LeaveRequests lr
            INNER JOIN Users u ON lr.userId = u.id
            LEFT JOIN Users m ON u.departmentHeadId = m.id
            WHERE lr.status = 'PENDING'
        `;

        if (userRole === 'HR' || userRole === 'ADMIN') {
            // HR/ADMIN see all pending requests
        } else if (userRole === 'MANAGER' && isDelegate) {
            // Manager who is also a delegate: see own team + delegated teams
            const allManagerIds = [userId, ...delegatingManagers];
            query += ` AND u.departmentHeadId IN (${allManagerIds.join(',')})`;
        } else if (userRole === 'MANAGER') {
            // Manager: see only own team
            query += ` AND u.departmentHeadId = @userId`;
        } else if (isDelegate) {
            // Non-manager delegate: see only delegated teams
            query += ` AND u.departmentHeadId IN (${delegatingManagers.join(',')})`;
        }

        // Exclude self-requests (delegate shouldn't see their own leave here to approve)
        query += ` AND lr.userId != @currentUserId`;
        query += ` ORDER BY lr.createdAt DESC`;

        const requestBuilder = pool.request();
        requestBuilder.input('currentUserId', userId);
        if (userRole === 'MANAGER' && !isDelegate) {
            requestBuilder.input('userId', userId);
        }

        const result = await requestBuilder.query(query);

        // Add isDelegated flag to each record
        const data = result.recordset.map((r: { departmentHeadId: number; managerName: string }) => ({
            ...r,
            isDelegated: r.departmentHeadId !== userId,
            originalManagerName: r.departmentHeadId !== userId ? r.managerName : null
        }));

        return NextResponse.json({
            success: true,
            data,
        });

    } catch (error) {
        console.error('Error fetching pending requests:', error);
        return NextResponse.json(
            { error: 'Failed to fetch pending requests' },
            { status: 500 }
        );
    }
}
