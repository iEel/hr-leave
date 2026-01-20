import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRateLimitSettings, updateRateLimitSettings, RateLimitSettings } from '@/lib/rate-limiter';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/rate-limit
 * ดึงการตั้งค่า Rate Limiting
 */
export async function GET() {
    try {
        const session = await auth();

        // Only ADMIN can access
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized - Admin only' },
                { status: 403 }
            );
        }

        const settings = await getRateLimitSettings();

        return NextResponse.json({
            success: true,
            data: settings
        });

    } catch (error) {
        console.error('Error fetching rate limit settings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch settings' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/rate-limit
 * อัปเดตการตั้งค่า Rate Limiting
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        // Only ADMIN can change settings
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized - Admin only' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const {
            enabled,
            loginMaxAttempts,
            loginWindowSeconds,
            apiMaxRequests,
            apiWindowSeconds
        } = body;

        // Validate values
        if (loginMaxAttempts !== undefined && (loginMaxAttempts < 1 || loginMaxAttempts > 100)) {
            return NextResponse.json(
                { error: 'Login max attempts must be between 1 and 100' },
                { status: 400 }
            );
        }

        if (loginWindowSeconds !== undefined && (loginWindowSeconds < 60 || loginWindowSeconds > 3600)) {
            return NextResponse.json(
                { error: 'Login window must be between 60 and 3600 seconds' },
                { status: 400 }
            );
        }

        // Update settings
        const updateData: Partial<RateLimitSettings> = {};
        if (enabled !== undefined) updateData.enabled = enabled;
        if (loginMaxAttempts !== undefined) updateData.loginMaxAttempts = loginMaxAttempts;
        if (loginWindowSeconds !== undefined) updateData.loginWindowSeconds = loginWindowSeconds;
        if (apiMaxRequests !== undefined) updateData.apiMaxRequests = apiMaxRequests;
        if (apiWindowSeconds !== undefined) updateData.apiWindowSeconds = apiWindowSeconds;

        await updateRateLimitSettings(updateData);

        // Audit log
        await logAudit({
            userId: Number(session.user.id),
            action: 'UPDATE_SETTINGS',
            targetTable: 'SystemSettings',
            targetId: 0,
            newValue: { type: 'RATE_LIMIT', ...updateData }
        });

        return NextResponse.json({
            success: true,
            message: 'Rate limit settings updated successfully'
        });

    } catch (error) {
        console.error('Error updating rate limit settings:', error);
        return NextResponse.json(
            { error: 'Failed to update settings' },
            { status: 500 }
        );
    }
}
