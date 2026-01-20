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
        const role = session.user.role;
        if (role !== 'HR' && role !== 'ADMIN') {
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
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN')) {
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
