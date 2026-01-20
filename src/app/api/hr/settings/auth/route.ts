import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAuthSettings, updateAuthSettings, AuthSettings } from '@/lib/auth/settings';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/hr/settings/auth
 * ดึงการตั้งค่า Authentication ปัจจุบัน
 */
export async function GET() {
    try {
        const session = await auth();

        // Only HR and ADMIN can access
        if (!session?.user?.id || !['HR', 'ADMIN'].includes(session.user.role)) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin/HR only' },
                { status: 403 }
            );
        }

        const settings = await getAuthSettings();

        return NextResponse.json({
            success: true,
            data: settings
        });

    } catch (error) {
        console.error('Error fetching auth settings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch auth settings' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/hr/settings/auth
 * อัปเดตการตั้งค่า Authentication
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        // Only ADMIN can change auth settings
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized - Admin only' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const {
            authMode,
            ldapUrl,
            ldapDomain,
            ldapBaseDN,
            ldapBindDN,
            azureAdEnabled,
            azureAdTenantId,
            azureAdClientId
        } = body;

        // Validate authMode
        const validModes = ['LOCAL', 'LDAP', 'AZURE', 'HYBRID'];
        if (authMode && !validModes.includes(authMode)) {
            return NextResponse.json(
                { error: 'Invalid auth mode. Must be: LOCAL, LDAP, AZURE, or HYBRID' },
                { status: 400 }
            );
        }

        // Update settings
        const updateData: Partial<AuthSettings> = {};
        if (authMode !== undefined) updateData.authMode = authMode;
        if (ldapUrl !== undefined) updateData.ldapUrl = ldapUrl;
        if (ldapDomain !== undefined) updateData.ldapDomain = ldapDomain;
        if (ldapBaseDN !== undefined) updateData.ldapBaseDN = ldapBaseDN;
        if (ldapBindDN !== undefined) updateData.ldapBindDN = ldapBindDN;
        if (azureAdEnabled !== undefined) updateData.azureAdEnabled = azureAdEnabled;
        if (azureAdTenantId !== undefined) updateData.azureAdTenantId = azureAdTenantId;
        if (azureAdClientId !== undefined) updateData.azureAdClientId = azureAdClientId;

        await updateAuthSettings(updateData);

        // Audit log
        await logAudit({
            userId: Number(session.user.id),
            action: 'UPDATE_SETTINGS',
            targetTable: 'SystemSettings',
            targetId: 0,
            newValue: updateData
        });

        return NextResponse.json({
            success: true,
            message: 'Authentication settings updated successfully',
            note: 'Server restart may be required for some changes to take effect'
        });

    } catch (error) {
        console.error('Error updating auth settings:', error);
        return NextResponse.json(
            { error: 'Failed to update auth settings' },
            { status: 500 }
        );
    }
}
