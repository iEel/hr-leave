import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/hr/settings
 * Fetch all system settings
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Only HR/Admin can view settings
        // Only HR/Admin can view settings
        const role = session.user.role;
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (role !== 'HR' && role !== 'ADMIN' && !isHRStaff) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const pool = await getPool();

        const result = await pool.request().query(`
            SELECT settingKey, settingValue, description, updatedAt
            FROM SystemSettings
            ORDER BY settingKey
        `);

        // Convert to key-value object for easier frontend consumption
        const settings: Record<string, { value: string; description: string; updatedAt: string }> = {};
        for (const row of result.recordset) {
            settings[row.settingKey] = {
                value: row.settingValue,
                description: row.description,
                updatedAt: row.updatedAt
            };
        }

        return NextResponse.json({ success: true, settings });

    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

/**
 * PUT /api/hr/settings
 * Update system settings
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { settings } = body; // { LEAVE_QUOTA_VACATION: '10', ... }

        if (!settings || typeof settings !== 'object') {
            return NextResponse.json({ error: 'Invalid settings format' }, { status: 400 });
        }

        const pool = await getPool();
        const userId = Number(session.user.id);

        // Update each setting
        for (const [key, value] of Object.entries(settings)) {
            // 1. Update SystemSettings (The generic settings table)
            await pool.request()
                .input('key', key)
                .input('value', String(value))
                .input('userId', userId)
                .query(`
                    UPDATE SystemSettings
                    SET settingValue = @value,
                        updatedAt = GETDATE(),
                        updatedBy = @userId
                    WHERE settingKey = @key
                `);

            // 2. Check if it's a Quota setting (e.g., LEAVE_QUOTA_VACATION)
            if (key.startsWith('LEAVE_QUOTA_')) {
                const type = key.replace('LEAVE_QUOTA_', ''); // VACATION, SICK...
                const days = parseInt(String(value));

                if (!isNaN(days)) {
                    // 2.1 Update Default in LeaveQuotaSettings table (For new users/future years)
                    await pool.request()
                        .input('type', type)
                        .input('days', days)
                        .query(`
                            UPDATE LeaveQuotaSettings 
                            SET defaultDays = @days, updatedAt = GETDATE()
                            WHERE leaveType = @type
                        `);

                    // 2.2 Sync to Current Year Balances for ALL users
                    // This creates the immediate effect expected by the user
                    const currentYear = new Date().getFullYear();
                    await pool.request()
                        .input('days', days)
                        .input('type', type)
                        .input('year', currentYear)
                        .query(`
                            UPDATE LeaveBalances 
                            SET entitlement = @days, 
                                remaining = @days - used, -- Recalculate remaining based on new entitlement
                                updatedAt = GETDATE()
                            WHERE leaveType = @type AND year = @year
                        `);
                }
            }
        }

        // Audit log
        await logAudit({
            userId,
            action: 'UPDATE_SETTINGS',
            targetTable: 'SystemSettings',
            newValue: settings
        });

        return NextResponse.json({ success: true, message: 'Settings updated successfully' });

    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
