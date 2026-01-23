import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { query, execute } from '@/lib/db';

/**
 * Purge Archived Users API
 * 
 * GET: Preview archived users eligible for permanent deletion (archived > 3 years)
 * POST: Execute purge operation (requires confirmation token)
 * 
 * ⚠️ WARNING: This permanently deletes data. Cannot be undone.
 */

interface ArchivedUser {
    id: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    archivedAt: Date;
    daysSinceArchived: number;
}

// GET: Preview archived users that would be purged
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        // Find users archived > 3 years ago
        const usersToPurge = await query<ArchivedUser>(`
            SELECT 
                id, employeeId, firstName, lastName, archivedAt,
                DATEDIFF(DAY, archivedAt, GETDATE()) as daysSinceArchived
            FROM UsersArchive 
            WHERE DATEDIFF(YEAR, archivedAt, GETDATE()) >= 3
            ORDER BY archivedAt ASC
        `);

        // Count related data
        const userIds = usersToPurge.map(u => u.id);
        let relatedLeaveRequests = 0;
        let relatedLeaveBalances = 0;

        if (userIds.length > 0) {
            const placeholders = userIds.map((_, i) => `@uid${i}`).join(',');
            const params: Record<string, any> = {};
            userIds.forEach((id, i) => {
                params[`uid${i}`] = id;
            });

            const reqCount = await query<{ cnt: number }>(`
                SELECT COUNT(*) as cnt FROM LeaveRequestsArchive WHERE userId IN (${placeholders})
            `, params);
            relatedLeaveRequests = reqCount[0]?.cnt || 0;

            const balCount = await query<{ cnt: number }>(`
                SELECT COUNT(*) as cnt FROM LeaveBalancesArchive WHERE userId IN (${placeholders})
            `, params);
            relatedLeaveBalances = balCount[0]?.cnt || 0;
        }

        // Generate confirmation token (simple timestamp-based for demo)
        const confirmationToken = Buffer.from(`purge-${Date.now()}`).toString('base64');

        return NextResponse.json({
            success: true,
            preview: true,
            usersToPurge: usersToPurge,
            count: usersToPurge.length,
            relatedData: {
                leaveRequests: relatedLeaveRequests,
                leaveBalances: relatedLeaveBalances
            },
            confirmationToken: confirmationToken,
            message: `Found ${usersToPurge.length} user(s) eligible for permanent deletion (archived > 3 years ago)`,
            warning: '⚠️ This action is PERMANENT and cannot be undone!'
        });

    } catch (error) {
        console.error('Error previewing purge:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST: Execute purge operation
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        const { confirmationToken } = body;

        // Validate confirmation token (basic validation)
        if (!confirmationToken || !confirmationToken.startsWith('cHVyZ2U')) { // base64 starts with 'purge'
            return NextResponse.json({
                success: false,
                error: 'Invalid or missing confirmation token. Please use the token from GET preview.'
            }, { status: 400 });
        }

        // 1. Find users to purge
        const usersToPurge = await query<{ id: number; employeeId: string }>(`
            SELECT id, employeeId
            FROM UsersArchive 
            WHERE DATEDIFF(YEAR, archivedAt, GETDATE()) >= 3
        `);

        if (usersToPurge.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No archived users to purge',
                purged: { users: 0, leaveRequests: 0, leaveBalances: 0 }
            });
        }

        const userIds = usersToPurge.map(u => u.id);
        const placeholders = userIds.map((_, i) => `@uid${i}`).join(',');
        const params: Record<string, any> = {};
        userIds.forEach((id, i) => {
            params[`uid${i}`] = id;
        });

        // 2. Delete LeaveRequestsArchive
        const purgedRequests = await execute(`
            DELETE FROM LeaveRequestsArchive WHERE userId IN (${placeholders})
        `, params);

        // 3. Delete LeaveBalancesArchive
        const purgedBalances = await execute(`
            DELETE FROM LeaveBalancesArchive WHERE userId IN (${placeholders})
        `, params);

        // 4. Delete UsersArchive
        const purgedUsers = await execute(`
            DELETE FROM UsersArchive WHERE id IN (${placeholders})
        `, params);

        return NextResponse.json({
            success: true,
            message: `Permanently deleted ${purgedUsers} archived user(s)`,
            purged: {
                users: purgedUsers,
                leaveRequests: purgedRequests,
                leaveBalances: purgedBalances
            }
        });

    } catch (error) {
        console.error('Error purging archived users:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
