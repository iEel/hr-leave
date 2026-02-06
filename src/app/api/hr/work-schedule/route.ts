import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

/**
 * GET /api/hr/work-schedule
 * Get work schedule settings
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT settingKey, settingValue 
            FROM SystemSettings 
            WHERE settingKey IN (
                'WORK_START_TIME', 'WORK_END_TIME',
                'BREAK_START_TIME', 'BREAK_END_TIME',
                'WORK_HOURS_PER_DAY',
                'SAT_WORK_START_TIME', 'SAT_WORK_END_TIME', 'SAT_WORK_HOURS'
            )
        `);

        const settings: Record<string, string> = {};
        for (const row of result.recordset) {
            settings[row.settingKey] = row.settingValue;
        }

        return NextResponse.json({
            success: true,
            settings: {
                workStartTime: settings['WORK_START_TIME'] || '08:30',
                workEndTime: settings['WORK_END_TIME'] || '17:00',
                breakStartTime: settings['BREAK_START_TIME'] || '12:00',
                breakEndTime: settings['BREAK_END_TIME'] || '13:00',
                workHoursPerDay: parseFloat(settings['WORK_HOURS_PER_DAY'] || '7.5'),
                satWorkStartTime: settings['SAT_WORK_START_TIME'] || '09:00',
                satWorkEndTime: settings['SAT_WORK_END_TIME'] || '12:00',
                satWorkHours: parseFloat(settings['SAT_WORK_HOURS'] || '3'),
            }
        });
    } catch (error) {
        console.error('Error fetching work schedule:', error);
        return NextResponse.json({ error: 'Failed to fetch work schedule' }, { status: 500 });
    }
}

/**
 * PUT /api/hr/work-schedule
 * Update work schedule settings
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = (session?.user as any)?.isHRStaff === true;
        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const body = await request.json();
        const {
            workStartTime,
            workEndTime,
            breakStartTime,
            breakEndTime,
            satWorkStartTime,
            satWorkEndTime,
        } = body;

        const pool = await getPool();

        // Calculate work hours
        const calculateHours = (start: string, end: string, breakMins: number = 0): number => {
            const [startH, startM] = start.split(':').map(Number);
            const [endH, endM] = end.split(':').map(Number);
            const totalMins = (endH * 60 + endM) - (startH * 60 + startM) - breakMins;
            return totalMins / 60;
        };

        const breakMins = calculateHours(breakStartTime, breakEndTime) * 60;
        const workHoursPerDay = calculateHours(workStartTime, workEndTime, breakMins);
        const satWorkHours = calculateHours(satWorkStartTime, satWorkEndTime);

        // Upsert settings
        const settings = [
            { key: 'WORK_START_TIME', value: workStartTime },
            { key: 'WORK_END_TIME', value: workEndTime },
            { key: 'BREAK_START_TIME', value: breakStartTime },
            { key: 'BREAK_END_TIME', value: breakEndTime },
            { key: 'WORK_HOURS_PER_DAY', value: workHoursPerDay.toString() },
            { key: 'SAT_WORK_START_TIME', value: satWorkStartTime },
            { key: 'SAT_WORK_END_TIME', value: satWorkEndTime },
            { key: 'SAT_WORK_HOURS', value: satWorkHours.toString() },
        ];

        for (const s of settings) {
            await pool.request()
                .input('key', s.key)
                .input('value', s.value)
                .query(`
                    MERGE SystemSettings AS target
                    USING (SELECT @key AS settingKey) AS source
                    ON target.settingKey = source.settingKey
                    WHEN MATCHED THEN UPDATE SET settingValue = @value, updatedAt = GETDATE()
                    WHEN NOT MATCHED THEN INSERT (settingKey, settingValue) VALUES (@key, @value);
                `);
        }

        return NextResponse.json({
            success: true,
            message: 'บันทึกการตั้งค่าเวลาทำงานเรียบร้อย',
            calculatedHours: {
                workHoursPerDay,
                satWorkHours
            }
        });
    } catch (error) {
        console.error('Error updating work schedule:', error);
        return NextResponse.json({ error: 'Failed to update work schedule' }, { status: 500 });
    }
}
