
import dotenv from 'dotenv';
import path from 'path';

// 1. Load Env FIRST
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function checkUsers() {
    try {
        // 2. Import DB AFTER Env is loaded
        const { query } = await import('../src/lib/db');

        console.log('Querying Users...');

        // Debug DB Config (Masked)
        console.log('DB Host:', process.env.DB_SERVER);
        console.log('DB Name:', process.env.DB_NAME);

        const users = await query(`
            SELECT 
                u.id, 
                u.firstName + ' ' + u.lastName as name, 
                u.email, 
                u.departmentHeadId,
                m.id as managerId,
                m.firstName + ' ' + m.lastName as managerName,
                m.email as managerEmail
            FROM Users u
            LEFT JOIN Users m ON u.departmentHeadId = m.id
        `);
        console.table(users);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkUsers();
