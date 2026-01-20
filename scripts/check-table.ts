import { getPool } from '../src/lib/db';

async function checkTable() {
    const pool = await getPool();

    console.log('Checking SystemSettings table structure...');

    const result = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'SystemSettings'
    `);

    console.log('Columns:', result.recordset);

    const data = await pool.request().query(`SELECT TOP 5 * FROM SystemSettings`);
    console.log('Sample data:', data.recordset);

    await pool.close();
}

checkTable().catch(console.error);
