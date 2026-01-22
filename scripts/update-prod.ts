import dotenv from 'dotenv';
import path from 'path';
import sql from 'mssql';
import bcrypt from 'bcryptjs';

// Load Env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DEV_DB = process.env.DB_NAME || 'HRLeaveDev';
const PROD_DB = 'HRLeave';

const config = {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: true,
    }
};

async function updateProduction() {
    console.log(`\n🚀 Starting Production Update: ${DEV_DB} -> ${PROD_DB}`);

    try {
        // 1. Connect to Dev to get Settings
        console.log(`\n📥 Fetching settings from Dev (${DEV_DB})...`);
        const poolDev = await sql.connect({ ...config, database: DEV_DB });
        const settingsResult = await poolDev.request().query("SELECT * FROM SystemSettings");
        const devSettings = settingsResult.recordset;
        console.log(`Found ${devSettings.length} settings in Dev.`);
        await poolDev.close();

        // 2. Connect to Prod
        console.log(`\n📤 Connecting to Prod (${PROD_DB})...`);
        const poolProd = await sql.connect({ ...config, database: PROD_DB });

        // Check if Tables exist
        try {
            await poolProd.request().query("SELECT TOP 1 * FROM Users");
        } catch (e) {
            console.error(`❌ Error: Tables not found in ${PROD_DB}. Please run the schema script first!`);
            process.exit(1);
        }

        // 3. Update ADMIN001 Password
        console.log('\n👤 Verifying ADMIN001 in Prod...');
        const adminCheck = await poolProd.request().query("SELECT employeeId, password FROM Users WHERE employeeId = 'ADMIN001'");

        if (adminCheck.recordset.length === 0) {
            console.log('⚠️ ADMIN001 not found. Creating default admin...');
            const hash = await bcrypt.hash('admin123', 10);
            await poolProd.request()
                .input('pass', sql.NVarChar, hash)
                .query(`
                    INSERT INTO Users (employeeId, email, password, firstName, lastName, role, company, department, gender, startDate)
                    VALUES ('ADMIN001', 'admin@sonic.co.th', @pass, 'System', 'Administrator', 'ADMIN', 'SONIC', 'IT', 'M', '2020-01-01')
                `);
            console.log('✅ Created ADMIN001.');
        } else {
            const admin = adminCheck.recordset[0];
            const isMatch = await bcrypt.compare('admin123', admin.password);
            if (!isMatch) {
                console.log('⚠️ Password mismatch. Updating to "admin123"...');
                const hash = await bcrypt.hash('admin123', 10);
                await poolProd.request()
                    .input('pass', sql.NVarChar, hash)
                    .query("UPDATE Users SET password = @pass WHERE employeeId = 'ADMIN001'");
                console.log('✅ Updated ADMIN001 password.');
            } else {
                console.log('✅ ADMIN001 password is correct.');
            }
        }

        // 3.5 Ensure SystemSettings Table Exists
        await poolProd.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
            BEGIN
                CREATE TABLE SystemSettings (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    settingKey NVARCHAR(50) NOT NULL UNIQUE,
                    settingValue NVARCHAR(MAX) NULL,
                    updatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
                );
                CREATE INDEX IX_SystemSettings_Key ON SystemSettings(settingKey);
                PRINT 'Created SystemSettings table';
            END
        `);

        // 4. Strings Settings Sync
        console.log('\n⚙️ Syncing SystemSettings...');
        for (const setting of devSettings) {
            console.log(`   - Syncing ${setting.settingKey}...`);
            await poolProd.request()
                .input('key', sql.NVarChar, setting.settingKey)
                .input('value', sql.NVarChar, setting.settingValue)
                .query(`
                    IF EXISTS (SELECT 1 FROM SystemSettings WHERE settingKey = @key)
                        UPDATE SystemSettings SET settingValue = @value, updatedAt = GETDATE() WHERE settingKey = @key
                    ELSE
                        INSERT INTO SystemSettings (settingKey, settingValue) VALUES (@key, @value)
                `);
        }
        console.log('✅ Settings synced successfully.');

        await poolProd.close();
        console.log('\n✨ Production Update Completed!');

    } catch (error) {
        console.error('❌ Error during update:', error);
    }
}

updateProduction();
