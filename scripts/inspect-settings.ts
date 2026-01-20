import 'dotenv/config';
import { getPool } from '../src/lib/db';

async function inspectTable() {
    try {
        const pool = await getPool();
        console.log('Connected to DB');

        // 1. Check if table exists
        const tableCheck = await pool.request().query(`
            SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SystemSettings'
        `);
        console.log('Table Exists:', tableCheck.recordset.length > 0);

        if (tableCheck.recordset.length > 0) {
            // 2. Get all columns
            const columns = await pool.request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'SystemSettings'
            `);
            console.log('Columns:', columns.recordset.map(r => r.COLUMN_NAME));
        }

        await pool.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

inspectTable();
