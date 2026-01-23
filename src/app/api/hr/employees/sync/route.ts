import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { query, execute } from '@/lib/db';
import { searchLdapUsers } from '@/lib/ldap';
import { fetchAzureUsers } from '@/lib/azure-graph';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
    try {
        const session = await auth();
        // Permission check: Only HR or Admin
        if (!session?.user || !['HR', 'ADMIN'].includes(session.user.role)) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        const { syncNewOnly, updateExisting, source } = body; // source: 'ldap' | 'azure'

        let rawUsers: any[] = [];

        // 1. Fetch Users based on Source
        if (source === 'azure') {
            rawUsers = await fetchAzureUsers();
        } else {
            // Default to LDAP
            rawUsers = await searchLdapUsers();
        }

        if (rawUsers.length === 0) {
            return NextResponse.json({
                success: false,
                error: `No users found in ${source === 'azure' ? 'Azure AD' : 'Local AD'} or configuration missing.`
            });
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
                // Azure Mapping
                // Priority: onPremisesSamAccountName > employeeId > userPrincipalName (prefix)
                const samAccount = user.onPremisesSamAccountName;
                const upnPrefix = user.userPrincipalName?.split('@')[0];

                employeeId = (samAccount || user.employeeId || upnPrefix || '').toUpperCase();
                email = user.mail || user.userPrincipalName || '';
                firstName = user.givenName || user.displayName?.split(' ')[0] || '';
                lastName = user.surname || user.displayName?.split(' ').slice(1).join(' ') || '';
                isActive = user.accountEnabled !== false;
            } else {
                // LDAP Mapping
                if (!user.sAMAccountName) continue;

                // MAPPING REQUIREMENTS:
                // รหัสพนักงาน (employeeId) --> employeeID (AD)
                // อีเมล (email) --> mail (AD)

                const adEmployeeID = user.employeeID ? String(user.employeeID).trim() : null;
                const adMail = user.mail ? String(user.mail).trim() : null;

                // Use AD employeeID if present, otherwise fallback to sAMAccountName
                employeeId = (adEmployeeID || user.sAMAccountName).toUpperCase();

                // Use AD mail if present, otherwise fallback to generated email
                email = adMail || `${user.sAMAccountName}@sonic.co.th`; // Updated default domain to be more realistic if needed, or keep generic?
                // User didn't specify default domain, but previous was @example.com. 
                // I'll stick to @example.com or maybe infer? 
                // Let's keep @example.com to avoid breaking diff significantly, 
                // OR better, ask? No, I'll stick to @example.com for now as it was there.
                // Actually, the example showed panuwat-p@example.com in the screenshot.
                email = adMail || `${user.sAMAccountName}@example.com`;

                firstName = user.givenName || user.displayName?.split(' ')[0] || user.sAMAccountName;
                lastName = user.sn || user.displayName?.split(' ').slice(1).join(' ') || '';
            }

            if (!employeeId) continue;

            const existingUser = await query<{ employeeId: string }>(
                `SELECT employeeId FROM Users WHERE employeeId = @id OR email = @email`,
                {
                    id: employeeId,
                    email: email
                }
            );

            if (existingUser.length === 0) {
                // CASE: Insert New User
                const hashedPassword = await bcrypt.hash('password123', 10); // Default password

                await execute(
                    `INSERT INTO Users (employeeId, email, password, firstName, lastName, role, company, department, gender, startDate, isActive, isADUser, adUsername, authProvider, createdAt)
                     VALUES (@id, @email, @pass, @first, @last, 'EMPLOYEE', 'SONIC', 'General', 'M', GETDATE(), @isActive, 1, @adUser, @provider, GETDATE())`,
                    {
                        id: employeeId,
                        email: email,
                        pass: hashedPassword,
                        first: firstName,
                        last: lastName,
                        isActive: isActive ? 1 : 0,
                        adUser: user.sAMAccountName || user.onPremisesSamAccountName || '',
                        provider: source === 'azure' ? 'AZURE' : 'AD'
                    }
                );
                addedCount++;
            } else if (updateExisting) {
                // CASE: Update Existing - also update adStatus based on enabled/disabled
                const adStatus = isActive ? 'ACTIVE' : 'DISABLED';
                await execute(
                    `UPDATE Users 
                     SET firstName = @first, lastName = @last, email = @email, isActive = @isActive,
                         isADUser = 1, adUsername = @adUser, authProvider = @provider,
                         adStatus = @adStatus, deletedAt = NULL
                     WHERE employeeId = @id`,
                    {
                        id: employeeId,
                        email: email,
                        first: firstName,
                        last: lastName,
                        isActive: isActive ? 1 : 0,
                        adUser: user.sAMAccountName || user.onPremisesSamAccountName || '',
                        provider: source === 'azure' ? 'AZURE' : 'AD',
                        adStatus: adStatus
                    }
                );
                updatedCount++;
            }
        }

        // 3. Mark Users not found in AD as AD_DELETED (Soft Delete with status tracking)
        // Only for users marked as isADUser = 1
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
            // Safety: Ensure we don't deactivate everyone if sync failed partially (empty list check handled above)
            // Use query builder logic or raw string for IN clause
            const placeholders = syncedEmployeeIds.map((_, i) => `@id${i}`).join(',');
            const params: Record<string, any> = {};
            syncedEmployeeIds.forEach((id, i) => {
                params[`id${i}`] = id;
            });

            // Mark users NOT in AD as AD_DELETED with timestamp
            // Only update if not already marked as AD_DELETED (to preserve original deletedAt)
            deletedCount = await execute(
                `UPDATE Users 
                 SET isActive = 0, adStatus = 'AD_DELETED', deletedAt = CASE WHEN deletedAt IS NULL THEN GETDATE() ELSE deletedAt END
                 WHERE isADUser = 1 
                 AND authProvider = '${source === 'azure' ? 'AZURE' : 'AD'}'
                 AND adStatus != 'AD_DELETED'
                 AND employeeId NOT IN (${placeholders})`,
                params
            );
        }

        return NextResponse.json({
            success: true,
            summary: {
                totalFound: rawUsers.length,
                added: addedCount,
                updated: updatedCount,
                markedDeleted: deletedCount,
                source: source || 'ldap'
            }
        });

    } catch (error) {
        console.error('Error syncing users:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}


