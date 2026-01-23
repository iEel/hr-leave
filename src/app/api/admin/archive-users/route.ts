import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { query, execute } from '@/lib/db';

/**
 * Archive Users API
 * 
 * GET: Preview users eligible for archiving (AD_DELETED > 1 year)
 * POST: Execute archive operation
 */

interface UserToArchive {
    id: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    deletedAt: Date;
    daysSinceDeleted: number;
}

// GET: Preview users that would be archived
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        // Find users with adStatus = 'AD_DELETED' and deletedAt > 1 year ago
        const usersToArchive = await query<UserToArchive>(`
            SELECT 
                id, employeeId, firstName, lastName, email, deletedAt,
                DATEDIFF(DAY, deletedAt, GETDATE()) as daysSinceDeleted
            FROM Users 
            WHERE adStatus = 'AD_DELETED' 
            AND deletedAt IS NOT NULL 
            AND DATEDIFF(YEAR, deletedAt, GETDATE()) >= 1
            ORDER BY deletedAt ASC
        `);

        return NextResponse.json({
            success: true,
            preview: true,
            usersToArchive: usersToArchive,
            count: usersToArchive.length,
            message: `Found ${usersToArchive.length} user(s) eligible for archiving (deleted > 1 year ago)`
        });

    } catch (error) {
        console.error('Error previewing archive:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST: Execute archive operation
export async function POST() {
    try {
        const session = await auth();
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        // 1. Find users to archive
        const usersToArchive = await query<{ id: number; employeeId: string }>(`
            SELECT id, employeeId
            FROM Users 
            WHERE adStatus = 'AD_DELETED' 
            AND deletedAt IS NOT NULL 
            AND DATEDIFF(YEAR, deletedAt, GETDATE()) >= 1
        `);

        if (usersToArchive.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No users to archive',
                archived: { users: 0, leaveRequests: 0, leaveBalances: 0 }
            });
        }

        const userIds = usersToArchive.map(u => u.id);
        const placeholders = userIds.map((_, i) => `@uid${i}`).join(',');
        const params: Record<string, any> = {};
        userIds.forEach((id, i) => {
            params[`uid${i}`] = id;
        });

        // 2. Copy LeaveRequests to archive
        const archivedRequests = await execute(`
            INSERT INTO LeaveRequestsArchive 
            (id, userId, leaveType, startDatetime, endDatetime, isHourly, startTime, endTime, 
             timeSlot, usageAmount, reason, status, rejectionReason, hasMedicalCertificate, 
             medicalCertificateFile, approverId, approvedAt, archivedAt, createdAt, updatedAt)
            SELECT 
                id, userId, leaveType, startDatetime, endDatetime, isHourly, startTime, endTime,
                timeSlot, usageAmount, reason, status, rejectionReason, hasMedicalCertificate,
                medicalCertificateFile, approverId, approvedAt, GETDATE(), createdAt, updatedAt
            FROM LeaveRequests
            WHERE userId IN (${placeholders})
        `, params);

        // 3. Copy LeaveBalances to archive
        const archivedBalances = await execute(`
            INSERT INTO LeaveBalancesArchive 
            (id, userId, leaveType, year, entitlement, used, remaining, carryOver, archivedAt, createdAt, updatedAt)
            SELECT 
                id, userId, leaveType, year, entitlement, used, remaining, carryOver, GETDATE(), createdAt, updatedAt
            FROM LeaveBalances
            WHERE userId IN (${placeholders})
        `, params);

        // 4. Copy Users to archive
        const archivedUsers = await execute(`
            INSERT INTO UsersArchive 
            (id, employeeId, email, password, firstName, lastName, role, company, department, gender,
             startDate, departmentHeadId, isActive, isADUser, adUsername, authProvider, adStatus, 
             deletedAt, archivedAt, createdAt, updatedAt)
            SELECT 
                id, employeeId, email, password, firstName, lastName, role, company, department, gender,
                startDate, departmentHeadId, isActive, isADUser, adUsername, authProvider, 'ARCHIVED',
                deletedAt, GETDATE(), createdAt, updatedAt
            FROM Users
            WHERE id IN (${placeholders})
        `, params);

        // 5. Delete from original tables (in correct order for foreign keys)
        // First: Delete notifications
        await execute(`DELETE FROM Notifications WHERE userId IN (${placeholders})`, params);

        // Second: Delete leave requests
        await execute(`DELETE FROM LeaveRequests WHERE userId IN (${placeholders})`, params);

        // Third: Delete leave balances
        await execute(`DELETE FROM LeaveBalances WHERE userId IN (${placeholders})`, params);

        // Fourth: Update departmentHeadId references to NULL
        await execute(`UPDATE Users SET departmentHeadId = NULL WHERE departmentHeadId IN (${placeholders})`, params);

        // Fifth: Delete users
        await execute(`DELETE FROM Users WHERE id IN (${placeholders})`, params);

        return NextResponse.json({
            success: true,
            message: `Successfully archived ${archivedUsers} user(s)`,
            archived: {
                users: archivedUsers,
                leaveRequests: archivedRequests,
                leaveBalances: archivedBalances
            }
        });

    } catch (error) {
        console.error('Error archiving users:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
