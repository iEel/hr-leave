import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { getDelegatingManagers } from '@/lib/delegate';
import { canViewLeaveDetail } from '@/lib/leave-access';
import { formatLeaveRequestNo } from '@/lib/leave-request-number';
import { normalizeMedicalCertificateFileRecord } from '@/lib/medical-files';

interface LeaveOwnerRecord {
    id: number;
    userId: number;
    managerId: number | null;
}

interface LeaveDetailRecord extends LeaveOwnerRecord {
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    company: string;
    department: string;
    managerName: string | null;
    approverId: number | null;
    approverName: string | null;
    leaveType: string;
    startDate: string;
    endDate: string;
    isHourly: boolean;
    startTime: string | null;
    endTime: string | null;
    timeSlot: string;
    usageAmount: number;
    reason: string;
    status: string;
    rejectionReason: string | null;
    hasMedicalCert: boolean;
    medicalCertificateFile: string | null;
    createdAt: string;
    approvedAt: string | null;
    updatedAt: string;
}

const LEAVE_NOT_FOUND_RESPONSE = { error: 'Leave request not found' };

function parsePositiveInteger(value: string): number | null {
    if (!/^[1-9]\d*$/.test(value)) return null;

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * GET /api/leave/detail/[leaveId]
 * Fetch one leave request when the current user can view the owner detail.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ leaveId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { leaveId } = await params;
        const parsedLeaveId = parsePositiveInteger(leaveId);
        if (!parsedLeaveId) {
            return NextResponse.json({ error: 'Invalid leave ID' }, { status: 400 });
        }

        const pool = await getPool();
        const ownerResult = await pool.request()
            .input('leaveId', parsedLeaveId)
            .query(`
                SELECT TOP 1
                    lr.id,
                    lr.userId,
                    u.departmentHeadId as managerId
                FROM LeaveRequests lr
                INNER JOIN Users u ON lr.userId = u.id
                WHERE lr.id = @leaveId
            `);

        if (ownerResult.recordset.length === 0) {
            return NextResponse.json(LEAVE_NOT_FOUND_RESPONSE, { status: 404 });
        }

        const owner = ownerResult.recordset[0] as LeaveOwnerRecord;
        const viewerId = Number(session.user.id);
        const delegatingManagerIds = await getDelegatingManagers(viewerId);
        const canView = canViewLeaveDetail(
            {
                userId: viewerId,
                role: session.user.role,
                isHRStaff: session.user.isHRStaff === true,
                delegatingManagerIds,
            },
            {
                userId: owner.userId,
                managerId: owner.managerId,
            }
        );

        if (!canView) {
            // Permission denied responses use the same not-found shape to avoid leave ID enumeration.
            return NextResponse.json(LEAVE_NOT_FOUND_RESPONSE, { status: 404 });
        }

        const detailResult = await pool.request()
            .input('leaveId', owner.id)
            .query(`
                SELECT TOP 1
                    lr.id,
                    lr.userId,
                    u.employeeId,
                    u.firstName + ' ' + u.lastName as employeeName,
                    u.email as employeeEmail,
                    u.company,
                    u.department,
                    u.departmentHeadId as managerId,
                    manager.firstName + ' ' + manager.lastName as managerName,
                    lr.approverId,
                    approver.firstName + ' ' + approver.lastName as approverName,
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
                    CONVERT(varchar, lr.updatedAt, 23) as updatedAt
                FROM LeaveRequests lr
                INNER JOIN Users u ON lr.userId = u.id
                LEFT JOIN Users manager ON u.departmentHeadId = manager.id
                LEFT JOIN Users approver ON lr.approverId = approver.id
                WHERE lr.id = @leaveId
            `);

        if (detailResult.recordset.length === 0) {
            return NextResponse.json(LEAVE_NOT_FOUND_RESPONSE, { status: 404 });
        }

        const leave = detailResult.recordset[0] as LeaveDetailRecord;
        const normalizedLeave = normalizeMedicalCertificateFileRecord(leave);

        return NextResponse.json({
            success: true,
            data: {
                ...normalizedLeave,
                leaveRequestNo: formatLeaveRequestNo({
                    id: normalizedLeave.id,
                    createdAt: normalizedLeave.createdAt,
                }),
            },
        });
    } catch (error) {
        console.error('Error fetching leave detail:', error);
        return NextResponse.json({ error: 'Failed to fetch leave detail' }, { status: 500 });
    }
}
