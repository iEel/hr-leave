import { NextResponse } from 'next/server';
import { getAuthSettings } from '@/lib/auth/settings';

/**
 * GET /api/auth/mode
 * Public endpoint to get current authentication mode
 * This is used by the login page to determine which login options to show
 */
export async function GET() {
    try {
        const settings = await getAuthSettings();

        return NextResponse.json({
            authMode: settings.authMode,
            showMicrosoftButton: settings.authMode === 'AZURE' || settings.authMode === 'HYBRID',
            showCredentialsForm: settings.authMode === 'LOCAL' || settings.authMode === 'LDAP' || settings.authMode === 'HYBRID',
        });
    } catch (error) {
        // Fallback to LOCAL if settings can't be read
        console.error('Error getting auth mode:', error);
        return NextResponse.json({
            authMode: 'LOCAL',
            showMicrosoftButton: false,
            showCredentialsForm: true,
        });
    }
}
