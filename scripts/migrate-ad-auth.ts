import { getPool } from '../src/lib/db';

async function runMigration() {
    console.log('🔄 Running AD Authentication Migration...\n');

    const pool = await getPool();

    try {
        // 1. Add isADUser column
        console.log('Adding isADUser column...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'isADUser')
            BEGIN
                ALTER TABLE Users ADD isADUser BIT DEFAULT 0;
                PRINT 'Added column: isADUser';
            END
        `);
        console.log('✅ isADUser column ready');

        // 2. Add adUsername column
        console.log('Adding adUsername column...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'adUsername')
            BEGIN
                ALTER TABLE Users ADD adUsername NVARCHAR(100);
                PRINT 'Added column: adUsername';
            END
        `);
        console.log('✅ adUsername column ready');

        // 3. Add authProvider column
        console.log('Adding authProvider column...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'authProvider')
            BEGIN
                ALTER TABLE Users ADD authProvider VARCHAR(20) DEFAULT 'LOCAL';
                PRINT 'Added column: authProvider';
            END
        `);
        console.log('✅ authProvider column ready');

        // 4. Create SystemSettings table
        console.log('Creating SystemSettings table...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
            BEGIN
                CREATE TABLE SystemSettings (
                    [key] VARCHAR(100) PRIMARY KEY,
                    [value] NVARCHAR(MAX),
                    updatedAt DATETIME DEFAULT GETDATE()
                );
            END
        `);
        console.log('✅ SystemSettings table ready');

        // 5. Insert default settings
        console.log('Inserting default settings...');
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
            await pool.request()
                .input('key', key)
                .input('value', value)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE [key] = @key)
                    BEGIN
                        INSERT INTO SystemSettings ([key], [value]) VALUES (@key, @value)
                    END
                `);
        }
        console.log('✅ Default settings inserted');

        // 6. Update existing users
        console.log('Updating existing users...');
        await pool.request().query(`
            UPDATE Users SET authProvider = 'LOCAL' WHERE authProvider IS NULL;
            UPDATE Users SET isADUser = 0 WHERE isADUser IS NULL;
        `);
        console.log('✅ Existing users updated');

        console.log('\n✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await pool.close();
    }
}

runMigration().catch(console.error);
