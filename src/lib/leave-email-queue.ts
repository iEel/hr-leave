import sql from 'mssql';
import { sendLeaveRequestEmail } from './email';

type LeaveDetails = Parameters<typeof sendLeaveRequestEmail>[3];
export interface LeaveEmailRecipient { id: number; employeeName: string; }

/** Called inside the same transaction that creates the leave; never performs SMTP. */
export async function queueLeaveRequestEmails(
    transaction: sql.Transaction, userId: number, details: LeaveDetails,
): Promise<LeaveEmailRecipient[]> {
    const result = await new sql.Request(transaction).input('userId', sql.Int, userId).query(`
        SELECT u.firstName + ' ' + u.lastName AS employeeName, m.id AS managerId,
               m.firstName + ' ' + m.lastName AS managerName, m.email AS managerEmail
        FROM Users u LEFT JOIN Users m ON u.departmentHeadId=m.id WHERE u.id=@userId;
    `);
    const info = result.recordset[0];
    if (!info) throw new Error('Leave request employee not found');
    const recipients: LeaveEmailRecipient[] = [];
    // Preserve an explicit failed job for missing routing instead of silently dropping mail.
    await sendLeaveRequestEmail(info.managerEmail || '', info.managerName || 'Manager', info.employeeName,
        details, info.managerId || 0, transaction);
    if (!info.managerId) return recipients;
    recipients.push({ id: info.managerId, employeeName: info.employeeName });
    const delegates = await new sql.Request(transaction)
        .input('managerId', sql.Int, info.managerId).input('userId', sql.Int, userId)
        .query(`
            SELECT DISTINCT u.id, u.firstName + ' ' + u.lastName AS name, u.email
            FROM DelegateApprovers d JOIN Users u ON u.id=d.delegateUserId
            WHERE d.managerId=@managerId AND d.isActive=1 AND u.isActive=1
              AND u.id<>@userId AND u.id<>@managerId
              AND CAST(GETDATE() AS DATE) BETWEEN d.startDate AND d.endDate;
        `);
    for (const delegate of delegates.recordset) {
        await sendLeaveRequestEmail(delegate.email || '', delegate.name || 'ผู้อนุมัติแทน', info.employeeName,
            details, delegate.id, transaction);
        recipients.push({ id: delegate.id, employeeName: `${info.employeeName} (แทน${info.managerName})` });
    }
    return recipients;
}
