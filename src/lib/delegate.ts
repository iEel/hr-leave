import { getPool } from '@/lib/db';

/**
 * ดึง active delegate userIds สำหรับ manager ณ วันนี้
 * @param managerId - ID ของ Manager ที่ต้องการหา delegates
 * @returns array ของ delegateUserId ที่ active อยู่
 */
export async function getActiveDelegates(managerId: number): Promise<number[]> {
    const pool = await getPool();
    const result = await pool.request()
        .input('managerId', managerId)
        .query(`
            SELECT delegateUserId
            FROM DelegateApprovers
            WHERE managerId = @managerId
              AND isActive = 1
              AND CAST(GETDATE() AS DATE) BETWEEN startDate AND endDate
        `);

    return result.recordset.map((r: { delegateUserId: number }) => r.delegateUserId);
}

/**
 * หา managers ที่ userId นี้เป็น active delegate อยู่ (กลับทิศ)
 * ใช้สำหรับ pending route เพื่อดึงใบลาของทีมที่ถูกมอบหมาย
 * @param userId - ID ของ user ที่ต้องการเช็คว่าเป็น delegate ของใคร
 * @returns array ของ managerId
 */
export async function getDelegatingManagers(userId: number): Promise<number[]> {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', userId)
        .query(`
            SELECT managerId
            FROM DelegateApprovers
            WHERE delegateUserId = @userId
              AND isActive = 1
              AND CAST(GETDATE() AS DATE) BETWEEN startDate AND endDate
        `);

    return result.recordset.map((r: { managerId: number }) => r.managerId);
}

/**
 * ตรวจสอบว่า userId เป็น delegate ของ managerId ไหม ณ วันนี้
 */
export async function isDelegateOf(userId: number, managerId: number): Promise<boolean> {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', userId)
        .input('managerId', managerId)
        .query(`
            SELECT TOP 1 id
            FROM DelegateApprovers
            WHERE delegateUserId = @userId
              AND managerId = @managerId
              AND isActive = 1
              AND CAST(GETDATE() AS DATE) BETWEEN startDate AND endDate
        `);

    return result.recordset.length > 0;
}

/**
 * ตรวจว่า userId มี active delegate assignment ไหม (สำหรับ sidebar)
 */
export async function hasActiveDelegateRole(userId: number): Promise<boolean> {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', userId)
        .query(`
            SELECT TOP 1 id
            FROM DelegateApprovers
            WHERE delegateUserId = @userId
              AND isActive = 1
              AND CAST(GETDATE() AS DATE) BETWEEN startDate AND endDate
        `);

    return result.recordset.length > 0;
}
