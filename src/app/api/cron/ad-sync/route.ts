import { NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { searchLdapUsers } from '@/lib/ldap';
import { fetchAzureUsers } from '@/lib/azure-graph';
import bcrypt from 'bcryptjs';

/**
 * Cron AD Sync API
 * 
 * This endpoint is designed to be called by external schedulers (Windows Task Scheduler, cron, etc.)
 * It requires a secret key for authentication.
 * 
 * Usage:
 * POST /api/cron/ad-sync
 * Headers: { "x-cron-secret": "your-secret-key" }
 * Body: { "source": "azure" | "ldap" }
 */

// Get cron secret from env or SystemSettings
async function getCronSecret(): Promise<string> {
    try {
        const result = await query<{ settingValue: string }>(`
            SELECT settingValue FROM SystemSettings WHERE settingKey = 'CRON_SECRET'
        `);
        if (result.length > 0 && result[0].settingValue) {
            return result[0].settingValue;
        }
    } catch (e) {
        console.error('Error fetching cron secret:', e);
    }
    return process.env.CRON_SECRET || 'default-cron-secret-change-me';
}

// Log sync result to SystemSettings
async function logSyncResult(source: string, success: boolean, summary: string) {
    const timestamp = new Date().toISOString();
    await execute(`
        MERGE INTO SystemSettings AS target
        USING (SELECT 'LAST_AD_SYNC_${source.toUpperCase()}' AS settingKey) AS source
        ON target.settingKey = source.settingKey
        WHEN MATCHED THEN
            UPDATE SET settingValue = @value, updatedAt = GETDATE()
        WHEN NOT MATCHED THEN
            INSERT (settingKey, settingValue, updatedAt) VALUES (source.settingKey, @value, GETDATE());
    `, { value: JSON.stringify({ timestamp, success, summary }) });
}

export async function POST(req: Request) {
    try {
        // Validate cron secret
        const cronSecret = await getCronSecret();
        const providedSecret = req.headers.get('x-cron-secret');

        if (!providedSecret || providedSecret !== cronSecret) {
            console.log('Cron AD Sync: Unauthorized attempt');
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const source = body.source || 'azure'; // default to azure

        console.log(`🔄 Cron AD Sync started - Source: ${source}`);

        let rawUsers: any[] = [];

        // 1. Fetch Users based on Source
        if (source === 'azure') {
            rawUsers = await fetchAzureUsers();
        } else {
            rawUsers = await searchLdapUsers();
        }

        if (rawUsers.length === 0) {
            const msg = `No users found in ${source === 'azure' ? 'Azure AD' : 'Local AD'}`;
            await logSyncResult(source, false, msg);
            return NextResponse.json({ success: false, error: msg });
        }

        let addedCount = 0;
        let updatedCount = 0;

        for (const user of rawUsers) {
            let employeeId = '';
            let email = '';
            let firstName = '';
            let lastName = '';
            let isActive = true;

            // Map fields based on source
            if (source === 'azure') {
                const samAccount = user.onPremisesSamAccountName;
                const upnPrefix = user.userPrincipalName?.split('@')[0];
                employeeId = (samAccount || user.employeeId || upnPrefix || '').toUpperCase();
                email = user.mail || user.userPrincipalName || '';
                firstName = user.givenName || user.displayName?.split(' ')[0] || '';
                lastName = user.surname || user.displayName?.split(' ').slice(1).join(' ') || '';
                isActive = user.accountEnabled !== false;
            } else {
                if (!user.sAMAccountName) continue;
                const adEmployeeID = user.employeeID ? String(user.employeeID).trim() : null;
                employeeId = (adEmployeeID || user.sAMAccountName).toUpperCase();
                email = user.mail || `${user.sAMAccountName}@example.com`;
                firstName = user.givenName || user.displayName?.split(' ')[0] || user.sAMAccountName;
                lastName = user.sn || user.displayName?.split(' ').slice(1).join(' ') || '';
            }

            if (!employeeId) continue;

            const existingUser = await query<{ employeeId: string }>(`
                SELECT employeeId FROM Users WHERE employeeId = @id OR email = @email
            `, { id: employeeId, email: email });

            if (existingUser.length === 0) {
                // Generate random password for AD users - they authenticate via AD only, never local
                const randomPassword = require('crypto').randomBytes(32).toString('hex');
                const hashedPassword = await bcrypt.hash(randomPassword, 10);
                const adStatus = isActive ? 'ACTIVE' : 'DISABLED';
                await execute(`
                    INSERT INTO Users (employeeId, email, password, firstName, lastName, role, company, department, gender, startDate, isActive, isADUser, adUsername, authProvider, adStatus, createdAt)
                    VALUES (@id, @email, @pass, @first, @last, 'EMPLOYEE', 'SONIC', 'General', 'M', GETDATE(), @isActive, 1, @adUser, @provider, @adStatus, GETDATE())
                `, {
                    id: employeeId,
                    email: email,
                    pass: hashedPassword,
                    first: firstName,
                    last: lastName,
                    isActive: isActive ? 1 : 0,
                    adUser: user.sAMAccountName || user.onPremisesSamAccountName || '',
                    provider: source === 'azure' ? 'AZURE' : 'AD',
                    adStatus: adStatus
                });
                addedCount++;
            } else {
                const adStatus = isActive ? 'ACTIVE' : 'DISABLED';
                await execute(`
                    UPDATE Users 
                    SET firstName = @first, lastName = @last, email = @email, isActive = @isActive,
                        isADUser = 1, adUsername = @adUser, authProvider = @provider,
                        adStatus = @adStatus, deletedAt = NULL
                    WHERE employeeId = @id
                `, {
                    id: employeeId,
                    email: email,
                    first: firstName,
                    last: lastName,
                    isActive: isActive ? 1 : 0,
                    adUser: user.sAMAccountName || user.onPremisesSamAccountName || '',
                    provider: source === 'azure' ? 'AZURE' : 'AD',
                    adStatus: adStatus
                });
                updatedCount++;
            }
        }

        // 3. Mark Users not found in AD as AD_DELETED
        let deletedCount = 0;
        const syncedEmployeeIds = rawUsers
            .map(u => {
                if (source === 'azure') {
                    const samAccount = u.onPremisesSamAccountName;
                    const upnPrefix = u.userPrincipalName?.split('@')[0];
                    return (samAccount || u.employeeId || upnPrefix || '').toUpperCase();
                } else {
                    const adEmployeeID = u.employeeID ? String(u.employeeID).trim() : null;
                    return (adEmployeeID || u.sAMAccountName).toUpperCase();
                }
            })
            .filter(id => id && id.length > 0);

        if (syncedEmployeeIds.length > 0) {
            const placeholders = syncedEmployeeIds.map((_, i) => `@id${i}`).join(',');
            const params: Record<string, any> = {};
            syncedEmployeeIds.forEach((id, i) => {
                params[`id${i}`] = id;
            });

            deletedCount = await execute(`
                UPDATE Users 
                SET isActive = 0, adStatus = 'AD_DELETED', deletedAt = CASE WHEN deletedAt IS NULL THEN GETDATE() ELSE deletedAt END
                WHERE isADUser = 1 
                AND authProvider = @provider
                AND adStatus != 'AD_DELETED'
                AND employeeId NOT IN (${placeholders})
            `, { ...params, provider: source === 'azure' ? 'AZURE' : 'AD' });
        }

        const summary = `Added: ${addedCount}, Updated: ${updatedCount}, Deleted: ${deletedCount}`;
        await logSyncResult(source, true, summary);

        console.log(`✅ Cron AD Sync completed - ${summary}`);

        return NextResponse.json({
            success: true,
            summary: {
                totalFound: rawUsers.length,
                added: addedCount,
                updated: updatedCount,
                markedDeleted: deletedCount,
                source: source
            }
        });

    } catch (error) {
        console.error('❌ Cron AD Sync error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
