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
                employeeId = (user.employeeID || user.sAMAccountName).toUpperCase();
                email = user.mail || `${user.sAMAccountName}@example.com`;
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
                    `INSERT INTO Users (employeeId, email, password, firstName, lastName, role, company, department, isActive, createdAt)
                     VALUES (@id, @email, @pass, @first, @last, 'EMPLOYEE', 'SONIC', 'General', @isActive, GETDATE())`,
                    {
                        id: employeeId,
                        email: email,
                        pass: hashedPassword,
                        first: firstName,
                        last: lastName,
                        isActive: isActive ? 1 : 0
                    }
                );
                addedCount++;
            } else if (updateExisting) {
                // CASE: Update Existing
                await execute(
                    `UPDATE Users 
                     SET firstName = @first, lastName = @last, email = @email, isActive = @isActive
                     WHERE employeeId = @id`,
                    {
                        id: employeeId,
                        email: email,
                        first: firstName,
                        last: lastName,
                        isActive: isActive ? 1 : 0
                    }
                );
                updatedCount++;
            }
        }

        return NextResponse.json({
            success: true,
            summary: {
                totalFound: rawUsers.length,
                added: addedCount,
                updated: updatedCount,
                source: source || 'ldap'
            }
        });

    } catch (error) {
        console.error('Error syncing users:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}


