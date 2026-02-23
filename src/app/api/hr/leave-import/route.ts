import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { calculateNetWorkingDays, WorkingSaturdayData } from '@/lib/date-utils';
import { calculateHourlyDuration } from '@/lib/leave-utils';

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
    startTime?: string;
    endTime?: string;
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

        // --- Fetch shared data for auto-calculation ---
        // Get all public holidays
        const holidayResult = await pool.request().query(`SELECT date FROM PublicHolidays`);
        const holidays = holidayResult.recordset.map((r: any) => new Date(r.date));

        // Get all working Saturdays
        const wSatResult = await pool.request().query(`SELECT date, startTime, endTime, workHours FROM WorkingSaturdays`);
        const workingSaturdays: WorkingSaturdayData[] = wSatResult.recordset.map((r: any) => ({
            date: new Date(r.date).toISOString().split('T')[0],
            startTime: r.startTime,
            endTime: r.endTime,
            workHours: r.workHours
        }));

        // Get WORK_HOURS_PER_DAY setting
        const whpdResult = await pool.request()
            .input('key', 'WORK_HOURS_PER_DAY')
            .query('SELECT settingValue FROM SystemSettings WHERE settingKey = @key');
        const workHoursPerDay = whpdResult.recordset.length > 0
            ? parseFloat(whpdResult.recordset[0].settingValue)
            : 7.5;

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

                const excelDays = Number(row.days);

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

                // --- Determine hourly vs full day ---
                // Only treat as hourly if excelDays < 1 (e.g. 0.25, 0.5) AND time values provided
                const isHourly = excelDays < 1 && row.startTime && row.endTime ? 1 : 0;
                const timeSlot = isHourly ? 'HOURLY' : 'FULL_DAY';
                const startTime = isHourly ? row.startTime! : null;
                const endTime = isHourly ? row.endTime! : null;

                // --- Auto-calculate days from dates ---
                let days: number;
                if (isHourly && row.startTime && row.endTime) {
                    // For hourly leave: calculate from time range
                    const duration = calculateHourlyDuration(row.startTime, row.endTime);
                    days = duration.netHours / workHoursPerDay;
                    days = Math.round(days * 10000) / 10000; // precision
                } else {
                    // For full-day leave: calculate net working days
                    days = calculateNetWorkingDays(
                        startDate,
                        endDate,
                        holidays,
                        'FULL_DAY' as any,
                        workingSaturdays,
                        workHoursPerDay
                    );
                }

                if (days <= 0) {
                    errors.push({ row: rowNum, employeeId: row.employeeId, message: 'คำนวณจำนวนวันได้ 0 (อาจเป็นวันหยุดทั้งหมด)' });
                    errorCount++;
                    continue;
                }

                // --- Check leave balance (skip for OTHER type) ---
                if (row.leaveType !== 'OTHER') {
                    const balanceResult = await pool.request()
                        .input('userId', userId)
                        .input('leaveType', row.leaveType)
                        .input('year', leaveYear)
                        .query(`
                            SELECT remaining FROM LeaveBalances
                            WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                        `);

                    let remaining: number;

                    if (balanceResult.recordset.length === 0) {
                        // Auto-create balance from LeaveQuotaSettings (same as leave/request route)
                        const quotaResult = await pool.request()
                            .input('leaveType', row.leaveType)
                            .query(`SELECT defaultDays FROM LeaveQuotaSettings WHERE leaveType = @leaveType`);

                        if (quotaResult.recordset.length === 0) {
                            errors.push({ row: rowNum, employeeId: row.employeeId, message: `ไม่พบการตั้งค่าโควตาประเภท ${row.leaveType}` });
                            errorCount++;
                            continue;
                        }

                        const defaultDays = quotaResult.recordset[0].defaultDays;
                        await pool.request()
                            .input('userId', userId)
                            .input('leaveType', row.leaveType)
                            .input('year', leaveYear)
                            .input('entitlement', defaultDays)
                            .input('remaining', defaultDays)
                            .query(`
                                INSERT INTO LeaveBalances (userId, leaveType, year, entitlement, used, remaining, carryOver, isAutoCreated)
                                VALUES (@userId, @leaveType, @year, @entitlement, 0, @remaining, 0, 1)
                            `);

                        remaining = defaultDays;
                    } else {
                        remaining = balanceResult.recordset[0].remaining;
                    }

                    if (remaining < days) {
                        errors.push({ row: rowNum, employeeId: row.employeeId, message: `วันลาไม่เพียงพอ (เหลือ ${remaining} วัน, ต้องการ ${days} วัน)` });
                        errorCount++;
                        continue;
                    }
                }


                // --- Insert leave request (status = APPROVED) ---
                const insertResult = await pool.request()
                    .input('userId', userId)
                    .input('leaveType', row.leaveType)
                    .input('startDatetime', startDateStr)
                    .input('endDatetime', endDateStr)
                    .input('isHourly', isHourly)
                    .input('startTime', startTime)
                    .input('endTime', endTime)
                    .input('timeSlot', timeSlot)
                    .input('usageAmount', days)
                    .input('reason', row.reason || 'นำเข้าจากระบบเดิม')
                    .query(`
                        INSERT INTO LeaveRequests (
                            userId, leaveType, startDatetime, endDatetime,
                            isHourly, startTime, endTime, timeSlot,
                            usageAmount, reason, hasMedicalCertificate, medicalCertificateFile,
                            status
                        )
                        OUTPUT INSERTED.id
                        VALUES (
                            @userId, @leaveType, @startDatetime, @endDatetime,
                            @isHourly, @startTime, @endTime, @timeSlot,
                            @usageAmount, @reason, 0, NULL,
                            'APPROVED'
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
