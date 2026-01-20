import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * POST /api/admin/migrate-ad
 * Run AD Authentication migration - ADMIN ONLY
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        // Only ADMIN can run migrations
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized - Admin only' },
                { status: 403 }
            );
        }

        const pool = await getPool();
        const results: string[] = [];

        // 1. Add isADUser column
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'isADUser')
                BEGIN
                    ALTER TABLE Users ADD isADUser BIT DEFAULT 0
                END
            `);
            results.push('✅ isADUser column ready');
        } catch (e: any) {
            results.push(`⚠️ isADUser: ${e.message}`);
        }

        // 2. Add adUsername column
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'adUsername')
                BEGIN
                    ALTER TABLE Users ADD adUsername NVARCHAR(100)
                END
            `);
            results.push('✅ adUsername column ready');
        } catch (e: any) {
            results.push(`⚠️ adUsername: ${e.message}`);
        }

        // 3. Add authProvider column
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'authProvider')
                BEGIN
                    ALTER TABLE Users ADD authProvider VARCHAR(20) DEFAULT 'LOCAL'
                END
            `);
            results.push('✅ authProvider column ready');
        } catch (e: any) {
            results.push(`⚠️ authProvider: ${e.message}`);
        }

        // 4. Create SystemSettings table
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
                BEGIN
                    CREATE TABLE SystemSettings (
                        [key] VARCHAR(100) PRIMARY KEY,
                        [value] NVARCHAR(MAX),
                        updatedAt DATETIME DEFAULT GETDATE()
                    )
                END
            `);
            results.push('✅ SystemSettings table ready');
        } catch (e: any) {
            results.push(`⚠️ SystemSettings table: ${e.message}`);
        }

        // 5. Insert default settings
        const defaultSettings = [
            ['AUTH_MODE', 'LOCAL'],
            ['LDAP_URL', ''],
            ['LDAP_DOMAIN', ''],
            ['LDAP_BASE_DN', ''],
            ['LDAP_BIND_DN', ''],
            ['AZURE_AD_ENABLED', 'false'],
            ['AZURE_AD_TENANT_ID', ''],
            ['AZURE_AD_CLIENT_ID', ''],
        ];

        for (const [key, value] of defaultSettings) {
            try {
                await pool.request()
                    .input('key', key)
                    .input('value', value)
                    .query(`
                        IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE [key] = @key)
                        BEGIN
                            INSERT INTO SystemSettings ([key], [value]) VALUES (@key, @value)
                        END
                    `);
            } catch (e: any) {
                results.push(`⚠️ Setting ${key}: ${e.message}`);
            }
        }
        results.push('✅ Default settings inserted');

        // 6. Update existing users
        try {
            await pool.request().query(`
                UPDATE Users SET authProvider = 'LOCAL' WHERE authProvider IS NULL;
                UPDATE Users SET isADUser = 0 WHERE isADUser IS NULL;
            `);
            results.push('✅ Existing users updated');
        } catch (e: any) {
            results.push(`⚠️ Update users: ${e.message}`);
        }

        return NextResponse.json({
            success: true,
            message: 'AD Authentication migration completed',
            results
        });

    } catch (error: any) {
        console.error('Migration error:', error);
        return NextResponse.json(
            { error: 'Migration failed', details: error.message },
            { status: 500 }
        );
    }
}
