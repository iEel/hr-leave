import nodemailer from 'nodemailer';
import { generateApprovalToken, getMagicLink } from './tokens';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export async function sendLeaveRequestEmail(
    managerEmail: string,
    managerName: string,
    employeeName: string,
    leaveDetails: {
        id: number;
        type: string;
        startDate: string;
        endDate: string;
        reason: string;
        days: number;
    },
    approverId: number
) {
    // Generate Magic Links
    const approveToken = generateApprovalToken({ leaveId: leaveDetails.id, approverId, action: 'APPROVE' });
    const rejectToken = generateApprovalToken({ leaveId: leaveDetails.id, approverId, action: 'REJECT' });

    const approveLink = getMagicLink(approveToken, 'APPROVE');
    const rejectLink = getMagicLink(rejectToken, 'REJECT');

    // Leave Type Localized Map
    const leaveTypeMap: Record<string, string> = {
        'SICK': 'ลาป่วย',
        'PERSONAL': 'ลากิจ',
        'VACATION': 'ลาพักร้อน',
        'MATERNITY': 'ลาคลอด',
        'MILITARY': 'เกณฑ์ทหาร',
        'ORDINATION': 'ลาบวช',
        'STERILIZATION': 'ลาทำหมัน',
        'TRAINING': 'ลาฝึกอบรม',
        'OTHER': 'อื่นๆ'
    };
    const leaveTypeThai = leaveTypeMap[leaveDetails.type] || leaveDetails.type;

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #3b82f6; padding: 20px; text-align: center;">
                <h2 style="color: white; margin: 0;">คำขอลาใหม่ (New Leave Request)</h2>
            </div>
            <div style="padding: 24px;">
                <p>เรียนคุณ <strong>${managerName}</strong>,</p>
                <p>มีคำขอลางานใหม่จาก <strong>${employeeName}</strong> รายละเอียดดังนี้:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f9fafb;">
                    <tr>
                        <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">ประเภทการลา</td>
                        <td style="padding: 12px; border: 1px solid #e5e7eb;">${leaveTypeThai}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">วันที่</td>
                        <td style="padding: 12px; border: 1px solid #e5e7eb;">${leaveDetails.startDate} - ${leaveDetails.endDate}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">จำนวนวัน</td>
                        <td style="padding: 12px; border: 1px solid #e5e7eb;">${leaveDetails.days} วัน</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">เหตุผล</td>
                        <td style="padding: 12px; border: 1px solid #e5e7eb;">${leaveDetails.reason}</td>
                    </tr>
                </table>

                <p style="margin-bottom: 24px;">กรุณาพิจารณาคำขอ:</p>

                <div style="text-align: center; gap: 16px; display: flex; justify-content: center;">
                    <a href="${approveLink}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px;">
                        ✅ อนุมัติ (Approve)
                    </a>
                    <a href="${rejectLink}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        ❌ ไม่อนุมัติ (Reject)
                    </a>
                </div>
                
                <p style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center;">
                    ลิงก์นี้มีอายุ 7 วัน หากปุ่มกดไม่ได้ กรุณาเข้าสู่ระบบเพื่อทำรายการ
                </p>
            </div>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: `"HR Leave System" <${process.env.SMTP_USER}>`,
            to: managerEmail,
            subject: `[Leave Request] ${employeeName} - ${leaveTypeThai}`,
            html: htmlContent,
        });
        console.log(`Email sent to ${managerEmail}`);
    } catch (error) {
        console.error('Failed to send email:', error);
    }
}
