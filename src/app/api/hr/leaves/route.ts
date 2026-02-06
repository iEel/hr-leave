import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/hr/leaves
 * ดึงประวัติการลาทั้งหมด (สำหรับ HR)
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRole = session.user.role;
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (userRole !== 'HR' && userRole !== 'ADMIN' && !isHRStaff) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const leaveType = searchParams.get('leaveType');
        const search = searchParams.get('search');
        const hasMedicalCert = searchParams.get('hasMedicalCert');

        const pool = await getPool();

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
                lr.status,
                lr.hasMedicalCertificate as hasMedicalCert,
                lr.medicalCertificateFile,
                lr.rejectionReason,
                CONVERT(varchar, lr.createdAt, 23) as createdAt
            FROM LeaveRequests lr
            INNER JOIN Users u ON lr.userId = u.id
            WHERE 1=1
        `;

        const inputs: { name: string; value: string }[] = [];

        if (status) {
            query += ` AND lr.status = @status`;
            inputs.push({ name: 'status', value: status });
        }

        if (leaveType) {
            query += ` AND lr.leaveType = @leaveType`;
            inputs.push({ name: 'leaveType', value: leaveType });
        }

        if (hasMedicalCert === 'true') {
            query += ` AND lr.hasMedicalCertificate = 1`;
        }

        if (search) {
            query += ` AND (u.firstName LIKE @search OR u.lastName LIKE @search OR u.employeeId LIKE @search)`;
            inputs.push({ name: 'search', value: `%${search}%` });
        }

        query += ` ORDER BY lr.createdAt DESC`;

        const requestBuilder = pool.request();
        for (const input of inputs) {
            requestBuilder.input(input.name, input.value);
        }

        const result = await requestBuilder.query(query);

        return NextResponse.json({
            success: true,
            data: result.recordset,
        });

    } catch (error) {
        console.error('Error fetching HR leaves:', error);
        return NextResponse.json({ error: 'Failed to fetch leaves' }, { status: 500 });
    }
}
