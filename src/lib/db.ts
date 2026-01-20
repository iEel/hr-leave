import sql, { config as SqlConfig, ConnectionPool } from 'mssql';

const sqlConfig: SqlConfig = {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_NAME || 'HRLeave',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
    },
};

// Global connection pool (singleton pattern)
let pool: ConnectionPool | null = null;

export async function getConnection(): Promise<ConnectionPool> {
    if (!pool) {
        pool = await sql.connect(sqlConfig);
        console.log('✅ Database connected successfully');
    }
    return pool;
}

export async function closeConnection(): Promise<void> {
    if (pool) {
        await pool.close();
        pool = null;
        console.log('🔌 Database connection closed');
    }
}

// Helper function for parameterized queries (SQL Injection Prevention)
export async function query<T>(
    queryString: string,
    params?: Record<string, unknown>
): Promise<T[]> {
    const connection = await getConnection();
    const request = connection.request();

    // Bind parameters safely (Parameterized Query)
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            request.input(key, value);
        });
    }

    const result = await request.query(queryString);
    return result.recordset as T[];
}

// Execute non-select queries (INSERT, UPDATE, DELETE)
export async function execute(
    queryString: string,
    params?: Record<string, unknown>
): Promise<number> {
    const connection = await getConnection();
    const request = connection.request();

    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            request.input(key, value);
        });
    }

    const result = await request.query(queryString);
    return result.rowsAffected[0] || 0;
}

export { sql };

// Alias for getConnection (for consistency)
export const getPool = getConnection;
