import { getPool } from './db';

export type AuditAction =
    | 'LOGIN'
    | 'LOGOUT'
    | 'CREATE_EMPLOYEE'
    | 'UPDATE_EMPLOYEE'
    | 'DELETE_EMPLOYEE'
    | 'DEACTIVATE_EMPLOYEE'
    | 'RESET_PASSWORD'
    | 'CREATE_LEAVE_REQUEST'
    | 'CANCEL_LEAVE_REQUEST'
    | 'APPROVE_LEAVE'
    | 'REJECT_LEAVE'
    | 'CREATE_HOLIDAY'
    | 'UPDATE_HOLIDAY'
    | 'DELETE_HOLIDAY'
    | 'UPDATE_SETTINGS'
    | 'YEAR_END_PROCESS'
    | 'IMPORT_EMPLOYEES'
    | 'EXPORT_EMPLOYEES'
    | 'CREATE_COMPANY'
    | 'UPDATE_COMPANY'
    | 'DELETE_COMPANY'
    | 'CREATE_WORKING_SATURDAY'
    | 'DELETE_WORKING_SATURDAY'
    | 'CREATE_DELEGATE'
    | 'CANCEL_DELEGATE';

export type TargetTable =
    | 'Users'
    | 'LeaveRequests'
    | 'PublicHolidays'
    | 'LeaveQuotaSettings'
    | 'LeaveBalances'
    | 'SystemSettings'
    | 'Companies'
    | 'WorkingSaturdays'
    | 'DelegateApprovers';

interface AuditLogParams {
    userId: number;
    action: AuditAction;
    targetTable: TargetTable;
    targetId?: number | null;
    oldValue?: object | null;
    newValue?: object | null;
    ipAddress?: string | null;
}

/**
 * Log an audit event to the database
 */
export async function logAudit({
    userId,
    action,
    targetTable,
    targetId = null,
    oldValue = null,
    newValue = null,
    ipAddress = null
}: AuditLogParams): Promise<void> {
    try {
        const pool = await getPool();

        await pool.request()
            .input('userId', userId)
            .input('action', action)
            .input('targetTable', targetTable)
            .input('targetId', targetId)
            .input('oldValue', oldValue ? JSON.stringify(oldValue) : null)
            .input('newValue', newValue ? JSON.stringify(newValue) : null)
            .input('ipAddress', ipAddress)
            .query(`
                INSERT INTO AuditLogs (userId, action, targetTable, targetId, oldValue, newValue, ipAddress)
                VALUES (@userId, @action, @targetTable, @targetId, @oldValue, @newValue, @ipAddress)
            `);
    } catch (error) {
        // Log error but don't throw - audit should not break main functionality
        console.error('Audit log error:', error);
    }
}

/**
 * Get action display name in Thai
 */
export function getActionDisplayName(action: AuditAction): string {
    const names: Record<AuditAction, string> = {
        'LOGIN': 'เข้าสู่ระบบ',
        'LOGOUT': 'ออกจากระบบ',
        'CREATE_EMPLOYEE': 'สร้างพนักงาน',
        'UPDATE_EMPLOYEE': 'แก้ไขพนักงาน',
        'DELETE_EMPLOYEE': 'ลบพนักงาน',
        'DEACTIVATE_EMPLOYEE': 'ปิดการใช้งานพนักงาน',
        'RESET_PASSWORD': 'รีเซ็ตรหัสผ่าน',
        'CREATE_LEAVE_REQUEST': 'ยื่นขอลา',
        'CANCEL_LEAVE_REQUEST': 'ยกเลิกใบลา',
        'APPROVE_LEAVE': 'อนุมัติใบลา',
        'REJECT_LEAVE': 'ไม่อนุมัติใบลา',
        'CREATE_HOLIDAY': 'เพิ่มวันหยุด',
        'UPDATE_HOLIDAY': 'แก้ไขวันหยุด',
        'DELETE_HOLIDAY': 'ลบวันหยุด',
        'UPDATE_SETTINGS': 'แก้ไขการตั้งค่า',
        'YEAR_END_PROCESS': 'ประมวลผลสิ้นปี',
        'IMPORT_EMPLOYEES': 'Import พนักงาน',
        'EXPORT_EMPLOYEES': 'Export พนักงาน',
        'CREATE_COMPANY': 'เพิ่มบริษัท',
        'UPDATE_COMPANY': 'แก้ไขบริษัท',
        'DELETE_COMPANY': 'ลบบริษัท',
        'CREATE_WORKING_SATURDAY': 'เพิ่มวันเสาร์ทำงาน',
        'DELETE_WORKING_SATURDAY': 'ลบวันเสาร์ทำงาน',
        'CREATE_DELEGATE': 'มอบหมายผู้อนุมัติแทน',
        'CANCEL_DELEGATE': 'ยกเลิกผู้อนุมัติแทน'
    };
    return names[action] || action;
}
