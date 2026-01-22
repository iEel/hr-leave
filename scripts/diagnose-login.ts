import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';
import sql from 'mssql';

// Load Env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PASSWORD_TO_CHECK = 'admin123';

async function checkDatabase(dbName: string, config: any) {
    console.log(`\n--- Checking Database: ${dbName} ---`);
    try {
        const pool = await sql.connect({
            ...config,
            database: dbName,
            options: {
                encrypt: process.env.DB_ENCRYPT === 'true',
                trustServerCertificate: true,
            }
        });

        const result = await pool.request().query("SELECT employeeId, password FROM Users WHERE employeeId = 'ADMIN001'");

        if (result.recordset.length === 0) {
            console.log(`❌ User ADMIN001 NOT FOUND in ${dbName}`);
            await pool.close();
            return;
        }

        const user = result.recordset[0];
        const isMatch = await bcrypt.compare(PASSWORD_TO_CHECK, user.password);

        console.log(`User: ${user.employeeId}`);
        console.log(`Hash: ${user.password.substring(0, 20)}...`);
        console.log(`Password '${PASSWORD_TO_CHECK}' Match: ${isMatch ? '✅ YES' : '❌ NO'}`);

        if (!isMatch) {
            console.log(`⚠️  Mismatch detected in ${dbName}. Updating password...`);
            const newHash = await bcrypt.hash(PASSWORD_TO_CHECK, 10);
            await pool.request()
                .input('password', sql.NVarChar, newHash)
                .query("UPDATE Users SET password = @password WHERE employeeId = 'ADMIN001'");
            console.log(`✅ Password updated in ${dbName}`);
        }

        await pool.close();
    } catch (error) {
        console.log(`❌ Error connecting to ${dbName}:`, (error as Error).message || error);
    }
}

async function runDiagnosis() {
    const baseConfig = {
        server: process.env.DB_SERVER || 'localhost',
        port: parseInt(process.env.DB_PORT || '1433'),
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || '',
    };

    // Check Configured DB
    await checkDatabase(process.env.DB_NAME || 'HRLeaveDev', baseConfig);

    // Check Fallback/Old DB
    if (process.env.DB_NAME !== 'HRLeave') {
        await checkDatabase('HRLeave', baseConfig);
    }
}

runDiagnosis();
