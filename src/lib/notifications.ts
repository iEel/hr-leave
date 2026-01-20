import { getPool } from '@/lib/db';

interface CreateNotificationParams {
    userId: number;
    title: string;
    message: string;
    link?: string;
}

/**
 * สร้าง Notification ใหม่
 */
export async function createNotification(params: CreateNotificationParams) {
    try {
        const pool = await getPool();
        await pool.request()
            .input('userId', params.userId)
            .input('title', params.title)
            .input('message', params.message)
            .input('link', params.link || null)
            .query(`
                INSERT INTO Notifications (userId, title, message, link, isRead)
                VALUES (@userId, @title, @message, @link, 0)
            `);
    } catch (error) {
        console.error('Error creating notification:', error);
    }
}

/**
 * สร้าง Notification สำหรับการอนุมัติ/ปฏิเสธใบลา
 */
export async function notifyLeaveApproval(
    userId: number,
    leaveId: number,
    isApproved: boolean,
    leaveType: string,
    startDate: string,
    rejectionReason?: string
) {
    const leaveTypeNames: Record<string, string> = {
        VACATION: 'ลาพักร้อน',
        SICK: 'ลาป่วย',
        PERSONAL: 'ลากิจ',
        MATERNITY: 'ลาคลอด',
        MILITARY: 'เกณฑ์ทหาร',
        ORDINATION: 'ลาบวช',
        STERILIZATION: 'ลาทำหมัน',
        TRAINING: 'ลาฝึกอบรม',
    };

    const typeName = leaveTypeNames[leaveType] || leaveType;

    if (isApproved) {
        await createNotification({
            userId,
            title: 'คำขอลาได้รับการอนุมัติ',
            message: `ใบ${typeName}วันที่ ${startDate} ได้รับการอนุมัติแล้ว`,
            link: `/leave/history`,
        });
    } else {
        await createNotification({
            userId,
            title: 'คำขอลาไม่ได้รับการอนุมัติ',
            message: `ใบ${typeName}วันที่ ${startDate} ไม่ได้รับการอนุมัติ${rejectionReason ? `: ${rejectionReason}` : ''}`,
            link: `/leave/history`,
        });
    }
}

/**
 * แจ้งเตือน Manager ว่ามีใบลารออนุมัติ
 */
export async function notifyPendingApproval(
    managerId: number,
    employeeName: string,
    leaveType: string
) {
    const leaveTypeNames: Record<string, string> = {
        VACATION: 'ลาพักร้อน',
        SICK: 'ลาป่วย',
        PERSONAL: 'ลากิจ',
        MATERNITY: 'ลาคลอด',
        MILITARY: 'เกณฑ์ทหาร',
        ORDINATION: 'ลาบวช',
        STERILIZATION: 'ลาทำหมัน',
        TRAINING: 'ลาฝึกอบรม',
    };

    const typeName = leaveTypeNames[leaveType] || leaveType;

    await createNotification({
        userId: managerId,
        title: 'มีคำขอลารอการอนุมัติ',
        message: `${employeeName} ส่งคำขอ${typeName}`,
        link: `/approvals`,
    });
}
