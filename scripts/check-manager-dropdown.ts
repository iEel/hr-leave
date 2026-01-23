import sql from 'mssql';

const config = {
    server: '192.168.110.106',
    database: 'HRLeaveDev',
    user: 'sa',
    password: 'Sonic@rama3',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkUsers() {
    try {
        const pool = await sql.connect(config);

        // Check users 4079 and 8250
        console.log('\n=== Users 4079 and 8250 ===');
        const users = await pool.request().query(`
            SELECT id, employeeId, firstName, lastName, role, department, isActive 
            FROM Users 
            WHERE employeeId IN ('8250', '4079')
        `);
        console.log(JSON.stringify(users.recordset, null, 2));

        // Search for Ittirith
        console.log('\n=== Searching for Ittirith ===');
        const ittirith = await pool.request().query(`
            SELECT id, employeeId, firstName, lastName, role, department, isActive 
            FROM Users 
            WHERE firstName LIKE '%Ittirith%' OR lastName LIKE '%Kosiar%' OR employeeId = '8250'
        `);
        console.log(JSON.stringify(ittirith.recordset, null, 2));

        // Check manager count
        console.log('\n=== Manager Count by Role ===');
        const roleCount = await pool.request().query(`
            SELECT role, COUNT(*) as count, SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeCount
            FROM Users 
            WHERE role IN ('MANAGER', 'HR', 'ADMIN')
            GROUP BY role
        `);
        console.log(JSON.stringify(roleCount.recordset, null, 2));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkUsers();
