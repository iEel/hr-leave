import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { notifyPendingApproval } from '@/lib/notifications';

/**
 * POST /api/leave/request
 * สร้างใบลาใหม่
 */
export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = Number(session.user.id);
        const body = await request.json();

        // Validate required fields
        const {
            leaveType,
            startDate,
            endDate,
            isHourly = false,
            timeSlot = 'FULL_DAY',
            startTime = null,
            endTime = null,
            reason,
            hasMedicalCert = false,
            medicalCertificateFile = null,
            usageAmount
        } = body;

        if (!leaveType || !startDate || !endDate || !reason) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const pool = await getPool();

        // Check for overlapping leave requests
        const overlapCheck = await pool.request()
            .input('userId', userId)
            .input('startDate', startDate)
            .input('endDate', endDate)
            .query(`
                SELECT id FROM LeaveRequests
                WHERE userId = @userId
                AND status IN ('PENDING', 'APPROVED')
                AND (
                    (CAST(startDatetime AS DATE) <= @endDate AND CAST(endDatetime AS DATE) >= @startDate)
                )
            `);

        if (overlapCheck.recordset.length > 0) {
            return NextResponse.json(
                { error: 'คุณมีใบลาในช่วงเวลานี้อยู่แล้ว' },
                { status: 400 }
            );
        }

        // === WEEKEND VALIDATION FOR HOURLY LEAVE ===
        if (isHourly) {
            const start = new Date(startDate);
            const dayOfWeek = start.getDay(); // 0 = Sunday, 6 = Saturday

            // Rule 1: Sunday is always non-working day
            if (dayOfWeek === 0) {
                return NextResponse.json(
                    { error: 'ไม่สามารถลาวันอาทิตย์ได้ เนื่องจากเป็นวันหยุด' },
                    { status: 400 }
                );
            }

            // Rule 2: Saturday must be in WorkingSaturdays table
            if (dayOfWeek === 6) {
                const saturdayCheck = await pool.request()
                    .input('date', startDate)
                    .query(`
                        SELECT id FROM WorkingSaturdays 
                        WHERE date = @date
                    `);

                if (saturdayCheck.recordset.length === 0) {
                    return NextResponse.json(
                        { error: 'ไม่สามารถลาวันเสาร์นี้ได้ เนื่องจากไม่ใช่วันทำงาน' },
                        { status: 400 }
                    );
                }
            }

            // Rule 3: Public Holiday check
            const holidayCheck = await pool.request()
                .input('date', startDate)
                .query(`
                    SELECT name FROM PublicHolidays 
                    WHERE date = @date
                `);

            if (holidayCheck.recordset.length > 0) {
                const holidayName = holidayCheck.recordset[0].name;
                return NextResponse.json(
                    { error: `ไม่สามารถลาได้ เนื่องจากเป็นวันหยุด: ${holidayName}` },
                    { status: 400 }
                );
            }
        }

        // === PUBLIC HOLIDAY VALIDATION FOR FULL-DAY/HALF-DAY LEAVE ===
        // Block if single day leave falls on a public holiday
        if (!isHourly && startDate === endDate) {
            const holidayCheck = await pool.request()
                .input('date', startDate)
                .query(`
                    SELECT name FROM PublicHolidays 
                    WHERE date = @date
                `);

            if (holidayCheck.recordset.length > 0) {
                const holidayName = holidayCheck.recordset[0].name;
                return NextResponse.json(
                    { error: `ไม่สามารถลาได้ เนื่องจากเป็นวันหยุด: ${holidayName}` },
                    { status: 400 }
                );
            }
        }

        // === VACATION LEAVE SPECIAL RULES ===
        if (leaveType === 'VACATION') {
            // Get user's start date
            const userResult = await pool.request()
                .input('userId', userId)
                .query(`SELECT startDate FROM Users WHERE id = @userId`);

            if (userResult.recordset.length > 0 && userResult.recordset[0].startDate) {
                const userStartDate = new Date(userResult.recordset[0].startDate);
                const today = new Date();

                // Rule 1: Must work at least 1 year before using vacation leave
                const oneYearFromStart = new Date(userStartDate);
                oneYearFromStart.setFullYear(oneYearFromStart.getFullYear() + 1);

                if (today < oneYearFromStart) {
                    const remainingDays = Math.ceil((oneYearFromStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    return NextResponse.json(
                        { error: `ต้องทำงานครบ 1 ปี ก่อนใช้สิทธิ์ลาพักร้อน (เหลืออีก ${remainingDays} วัน)` },
                        { status: 400 }
                    );
                }
            }

            // Rule 2: Dynamic Advance Notice (Default: 3 days)
            // Fetch setting from DB
            const settingResult = await pool.request()
                .input('key', 'LEAVE_ADVANCE_DAYS')
                .query('SELECT settingValue FROM SystemSettings WHERE settingKey = @key');

            const advanceDays = settingResult.recordset.length > 0
                ? parseInt(settingResult.recordset[0].settingValue, 10)
                : 3; // Default fallback

            const leaveStartDate = new Date(startDate);
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);
            leaveStartDate.setHours(0, 0, 0, 0);

            const diffDays = Math.floor((leaveStartDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays < advanceDays) {
                return NextResponse.json(
                    { error: `การลาพักร้อนต้องแจ้งล่วงหน้าอย่างน้อย ${advanceDays} วัน` },
                    { status: 400 }
                );
            }
        }

        // === SICK LEAVE CERTIFICATE RULE ===
        if (leaveType === 'SICK') {
            // Fetch setting from DB
            const sickResult = await pool.request()
                .input('key', 'LEAVE_SICK_CERT_DAYS')
                .query('SELECT settingValue FROM SystemSettings WHERE settingKey = @key');

            const threshold = sickResult.recordset.length > 0
                ? parseInt(sickResult.recordset[0].settingValue, 10)
                : 3; // Default fallback

            if (usageAmount >= threshold && !hasMedicalCert) {
                return NextResponse.json(
                    { error: `ลาป่วยตั้งแต่ ${threshold} วันขึ้นไป ต้องมีใบรับรองแพทย์` },
                    { status: 400 }
                );
            }
        }

        // === SPLIT-YEAR BALANCE CHECK & DEDUCTION ===
        const leaveStartDate2 = new Date(startDate);
        const leaveEndDate2 = new Date(endDate);
        const startYear = leaveStartDate2.getFullYear();
        const endYear = leaveEndDate2.getFullYear();

        // Determine year-split usage
        let yearSplits: Map<number, number>;

        if (startYear === endYear) {
            // Same year — simple case
            yearSplits = new Map([[startYear, usageAmount]]);
        } else {
            // Cross-year — calculate split using holidays and working saturdays
            const holidayResult = await pool.request()
                .input('startDate2', startDate)
                .input('endDate2', endDate)
                .query(`SELECT date FROM PublicHolidays WHERE date BETWEEN @startDate2 AND @endDate2`);
            const holidays = holidayResult.recordset.map((r: any) => new Date(r.date));

            const wSatResult = await pool.request()
                .input('startDate2', startDate)
                .input('endDate2', endDate)
                .query(`SELECT date, startTime, endTime, workHours FROM WorkingSaturdays WHERE date BETWEEN @startDate2 AND @endDate2`);
            const workingSats = wSatResult.recordset.map((r: any) => ({
                date: new Date(r.date).toISOString().split('T')[0],
                startTime: r.startTime,
                endTime: r.endTime,
                workHours: r.workHours
            }));

            // Fetch WORK_HOURS_PER_DAY setting
            const whpdResult = await pool.request()
                .input('key', 'WORK_HOURS_PER_DAY')
                .query('SELECT settingValue FROM SystemSettings WHERE settingKey = @key');
            const workHoursPerDay = whpdResult.recordset.length > 0
                ? parseFloat(whpdResult.recordset[0].settingValue)
                : 7.5;

            const { splitLeaveByYear } = await import('@/lib/date-utils');
            yearSplits = splitLeaveByYear(
                leaveStartDate2,
                leaveEndDate2,
                holidays,
                isHourly ? 'FULL_DAY' as any : timeSlot,
                workingSats,
                workHoursPerDay
            );
        }

        // Check balance for each year (skip for OTHER type)
        if (leaveType !== 'OTHER') {
            for (const [year, amount] of yearSplits) {
                const balanceCheck = await pool.request()
                    .input('userId', userId)
                    .input('leaveType', leaveType)
                    .input('year', year)
                    .query(`
                        SELECT remaining FROM LeaveBalances
                        WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                    `);

                if (balanceCheck.recordset.length === 0) {
                    // Auto-create balance for this year if not exists
                    const quotaResult = await pool.request()
                        .input('leaveType', leaveType)
                        .query(`SELECT defaultDays FROM LeaveQuotaSettings WHERE leaveType = @leaveType`);

                    if (quotaResult.recordset.length > 0) {
                        const defaultDays = quotaResult.recordset[0].defaultDays;
                        await pool.request()
                            .input('userId', userId)
                            .input('leaveType', leaveType)
                            .input('year', year)
                            .input('entitlement', defaultDays)
                            .input('remaining', defaultDays)
                            .query(`
                                INSERT INTO LeaveBalances (userId, leaveType, year, entitlement, used, remaining, carryOver, isAutoCreated)
                                VALUES (@userId, @leaveType, @year, @entitlement, 0, @remaining, 0, 1)
                            `);

                        if (defaultDays < amount) {
                            return NextResponse.json(
                                { error: `วันลาปี ${year} ไม่เพียงพอ (มี ${defaultDays} วัน, ต้องการ ${amount} วัน)` },
                                { status: 400 }
                            );
                        }
                    } else {
                        return NextResponse.json(
                            { error: `ไม่พบข้อมูลโควตาประเภท ${leaveType}` },
                            { status: 400 }
                        );
                    }
                } else if (balanceCheck.recordset[0].remaining < amount) {
                    return NextResponse.json(
                        { error: `วันลาปี ${year} ไม่เพียงพอ (เหลือ ${balanceCheck.recordset[0].remaining} วัน, ต้องการ ${amount} วัน)` },
                        { status: 400 }
                    );
                }
            }
        }

        // Insert leave request
        const insertResult = await pool.request()
            .input('userId', userId)
            .input('leaveType', leaveType)
            .input('startDatetime', startDate)
            .input('endDatetime', endDate)
            .input('isHourly', isHourly ? 1 : 0)
            .input('startTime', startTime)
            .input('endTime', endTime)
            .input('timeSlot', isHourly ? 'HOURLY' : timeSlot)
            .input('usageAmount', usageAmount)
            .input('reason', reason)
            .input('hasMedicalCert', hasMedicalCert ? 1 : 0)
            .input('medicalCertFile', medicalCertificateFile)
            .query(`
                INSERT INTO LeaveRequests (
                    userId, leaveType, startDatetime, endDatetime,
                    isHourly, startTime, endTime, timeSlot,
                    usageAmount, reason, hasMedicalCertificate, medicalCertificateFile, status
                )
                OUTPUT INSERTED.id
                VALUES (
                    @userId, @leaveType, @startDatetime, @endDatetime,
                    @isHourly, @startTime, @endTime, @timeSlot,
                    @usageAmount, @reason, @hasMedicalCert, @medicalCertFile, 'PENDING'
                )
            `);

        const newRequestId = insertResult.recordset[0].id;

        // Deduct balance for each year and record year splits
        for (const [year, amount] of yearSplits) {
            if (leaveType !== 'OTHER') {
                await pool.request()
                    .input('userId', userId)
                    .input('leaveType', leaveType)
                    .input('year', year)
                    .input('usageAmount', amount)
                    .query(`
                        UPDATE LeaveBalances
                        SET used = used + @usageAmount,
                            remaining = remaining - @usageAmount,
                            updatedAt = GETDATE()
                        WHERE userId = @userId AND leaveType = @leaveType AND year = @year
                    `);
            }

            // Always record year split for tracking
            await pool.request()
                .input('leaveRequestId', newRequestId)
                .input('year', year)
                .input('usageAmount', amount)
                .query(`
                    INSERT INTO LeaveRequestYearSplit (leaveRequestId, year, usageAmount)
                    VALUES (@leaveRequestId, @year, @usageAmount)
                `);
        }

        // Audit log
        await logAudit({
            userId,
            action: 'CREATE_LEAVE_REQUEST',
            targetTable: 'LeaveRequests',
            targetId: newRequestId,
            newValue: { leaveType, startDate, endDate, usageAmount, reason }
        });

        // Notify manager about pending leave request
        try {
            const managerResult = await pool.request()
                .input('userId', userId)
                .query(`
                    SELECT 
                        u.firstName + ' ' + u.lastName as employeeName,
                        m.id as managerId,
                        m.firstName + ' ' + m.lastName as managerName,
                        m.email as managerEmail
                    FROM Users u
                    LEFT JOIN Users m ON u.departmentHeadId = m.id
                    WHERE u.id = @userId
                `);

            const info = managerResult.recordset[0];

            if (info?.managerId) {
                // 1. System Notification to Manager
                await notifyPendingApproval(
                    info.managerId,
                    info.employeeName,
                    leaveType
                );

                // 2. Email Notification to Manager (Magic Link)
                if (info.managerEmail) {
                    const { sendLeaveRequestEmail } = await import('@/lib/email');
                    await sendLeaveRequestEmail(
                        info.managerEmail,
                        info.managerName || 'Manager',
                        info.employeeName,
                        {
                            id: newRequestId,
                            type: leaveType,
                            startDate: startDate,
                            endDate: endDate,
                            reason: reason,
                            days: usageAmount
                        },
                        info.managerId
                    );
                }

                // 3. Notify Delegates (if any)
                try {
                    const { getActiveDelegates } = await import('@/lib/delegate');
                    const delegateIds = await getActiveDelegates(info.managerId);

                    for (const delegateId of delegateIds) {
                        // Skip if delegate is the same person who is requesting leave
                        if (delegateId === userId) continue;

                        // Fetch delegate info
                        const delegateResult = await pool.request()
                            .input('delegateId', delegateId)
                            .query(`SELECT firstName + ' ' + lastName as name, email FROM Users WHERE id = @delegateId AND isActive = 1`);

                        if (delegateResult.recordset.length > 0) {
                            const delegate = delegateResult.recordset[0];

                            // System Notification
                            await notifyPendingApproval(
                                delegateId,
                                `${info.employeeName} (แทน${info.managerName})`,
                                leaveType
                            );

                            // Email with Magic Link
                            if (delegate.email) {
                                const { sendLeaveRequestEmail } = await import('@/lib/email');
                                await sendLeaveRequestEmail(
                                    delegate.email,
                                    delegate.name || 'ผู้อนุมัติแทน',
                                    info.employeeName,
                                    {
                                        id: newRequestId,
                                        type: leaveType,
                                        startDate: startDate,
                                        endDate: endDate,
                                        reason: reason,
                                        days: usageAmount
                                    },
                                    delegateId
                                );
                            }
                        }
                    }
                } catch (delegateError) {
                    console.error('Error notifying delegates:', delegateError);
                }
            }
        } catch (notifyError) {
            console.error('Error notifying manager:', notifyError);
            // Don't fail the request if notification fails
        }

        return NextResponse.json({
            success: true,
            message: 'สร้างใบลาสำเร็จ',
            data: { id: newRequestId }
        });

    } catch (error) {
        console.error('Error creating leave request:', error);
        return NextResponse.json(
            { error: 'Failed to create leave request' },
            { status: 500 }
        );
    }
}
