import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';

const VALID_LEAVE_TYPES = [
    'VACATION', 'SICK', 'PERSONAL', 'MATERNITY', 'MILITARY',
    'ORDINATION', 'STERILIZATION', 'TRAINING', 'OTHER'
];

interface ImportRow {
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
}

/**
 * POST /api/hr/leave-import
 * นำเข้าวันลาจำนวนมาก (Bulk Leave Import)
 * สำหรับ HR กรอกวันลาย้อนหลัง หรือ migrate จากระบบเดิม
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const { data } = body as { data: ImportRow[] };

        if (!data || !Array.isArray(data) || data.length === 0) {
            return NextResponse.json({ error: 'ไม่มีข้อมูลให้นำเข้า' }, { status: 400 });
        }

        if (data.length > 500) {
            return NextResponse.json({ error: 'นำเข้าได้สูงสุด 500 รายการต่อครั้ง' }, { status: 400 });
        }

        const pool = await getPool();
        const hrUserId = Number(session.user.id);

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        const errors: { row: number; employeeId: string; message: string }[] = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowNum = i + 1;

            try {
                // --- Validate fields ---
                if (!row.employeeId?.trim()) {
                    errors.push({ row: rowNum, employeeId: row.employeeId || '-', message: 'ไม่มีรหัสพนักงาน' });
                    errorCount++;
                    continue;
                }

                if (!VALID_LEAVE_TYPES.includes(row.leaveType)) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: `ประเภทลาไม่ถูกต้อง: ${row.leaveType}` });
                    errorCount++;
                    continue;
                }

                if (!row.startDate || !row.endDate) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'ไม่มีวันที่เริ่ม/สิ้นสุด' });
                    errorCount++;
                    continue;
                }

                // Parse dates
                const startDate = new Date(row.startDate);
                const endDate = new Date(row.endDate);
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'รูปแบบวันที่ไม่ถูกต้อง' });
                    errorCount++;
                    continue;
                }

                if (endDate < startDate) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'วันสิ้นสุดน้อยกว่าวันเริ่มต้น' });
                    errorCount++;
                    continue;
                }

                const days = Number(row.days);
                if (!days || days <= 0) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'จำนวนวันต้องมากกว่า 0' });
                    errorCount++;
                    continue;
                }

                // --- Look up user ---
                const userResult = await pool.request()
                    .input('employeeId', row.employeeId.trim())
                    .query(`SELECT id FROM Users WHERE employeeId = @employeeId AND isActive = 1`);

                if (userResult.recordset.length === 0) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'ไม่พบพนักงานในระบบ' });
                    errorCount++;
                    continue;
                }

                const userId = userResult.recordset[0].id;
                const startDateStr = startDate.toISOString().split('T')[0];
                const endDateStr = endDate.toISOString().split('T')[0];
                const leaveYear = startDate.getFullYear();

                // --- Check duplicate (same user, type, dates) ---
                const dupCheck = await pool.request()
                    .input('userId', userId)
                    .input('leaveType', row.leaveType)
                    .input('startDate', startDateStr)
                    .input('endDate', endDateStr)
                    .query(`
                        SELECT id FROM LeaveRequests
                        WHERE userId = @userId AND leaveType = @leaveType
                        AND CAST(startDatetime AS DATE) = @startDate
                        AND CAST(endDatetime AS DATE) = @endDate
                        AND status IN ('PENDING', 'APPROVED')
                    `);

                if (dupCheck.recordset.length > 0) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'มีใบลาซ้ำในระบบแล้ว' });
                    skippedCount++;
                    continue;
                }

                // --- Insert leave request (status = APPROVED) ---
                const insertResult = await pool.request()
                    .input('userId', userId)
                    .input('leaveType', row.leaveType)
                    .input('startDatetime', startDateStr)
                    .input('endDatetime', endDateStr)
                    .input('usageAmount', days)
                    .input('reason', row.reason || 'นำเข้าจากระบบเดิม')
                    .input('approvedBy', hrUserId)
                    .query(`
                        INSERT INTO LeaveRequests (
                            userId, leaveType, startDatetime, endDatetime,
                            isHourly, startTime, endTime, timeSlot,
                            usageAmount, reason, hasMedicalCertificate, medicalCertificateFile,
                            status, approvedBy, approvedAt
                        )
                        OUTPUT INSERTED.id
                        VALUES (
                            @userId, @leaveType, @startDatetime, @endDatetime,
                            0, NULL, NULL, 'FULL_DAY',
                            @usageAmount, @reason, 0, NULL,
                            'APPROVED', @approvedBy, GETDATE()
                        )
                    `);

                const newId = insertResult.recordset[0].id;

                // --- Deduct leave balance (skip for OTHER type) ---
                if (row.leaveType !== 'OTHER') {
                    await pool.request()
                        .input('userId', userId)
                        .input('leaveType', row.leaveType)
                        .input('year', leaveYear)
                        .input('usageAmount', days)
                        .query(`
                            UPDATE LeaveBalances
                            SET used = used + @usageAmount,
                                remaining = remaining - @usageAmount,
                                updatedAt = GETDATE()
                            WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                        `);
                }

                successCount++;

            } catch (rowError) {
                console.error(`Error importing row ${rowNum}:`, rowError);
                errors.push({ row: rowNum, employeeId: row.employeeId, message: 'เกิดข้อผิดพลาดในการนำเข้า' });
                errorCount++;
            }
        }

        // Audit log
        await logAudit({
            userId: hrUserId,
            action: 'BULK_LEAVE_IMPORT' as any,
            targetTable: 'LeaveRequests',
            targetId: null as any,
            newValue: { total: data.length, success: successCount, errors: errorCount, skipped: skippedCount }
        });

        return NextResponse.json({
            success: true,
            message: `นำเข้าสำเร็จ ${successCount} รายการ`,
            stats: {
                total: data.length,
                success: successCount,
                errors: errorCount,
                skipped: skippedCount,
            },
            errorDetails: errors.slice(0, 50),
        });

    } catch (error) {
        console.error('Bulk leave import error:', error);
        return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการนำเข้า' }, { status: 500 });
    }
}
