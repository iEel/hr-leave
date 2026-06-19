import { auth } from '@/auth';
import { getAttendancePeriodRange } from '@/lib/attendance/schedule-rules';
import {
    getAttendanceScheduleSettings,
    getEmployeeAttendanceReport,
} from '@/lib/attendance/repository';
import { NextRequest, NextResponse } from 'next/server';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function formatPeriodMonth(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function isValidDate(value: string): boolean {
    if (!DATE_PATTERN.test(value)) {
        return false;
    }

    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);

    return (
        parsed.getFullYear() === year &&
        parsed.getMonth() === month - 1 &&
        parsed.getDate() === day
    );
}

function isValidPeriod(value: string): boolean {
    if (!PERIOD_PATTERN.test(value)) {
        return false;
    }

    const [year, month] = value.split('-').map(Number);
    return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

function isValidTime(value: string): boolean {
    if (!TIME_PATTERN.test(value)) {
        return false;
    }

    const [hours, minutes] = value.split(':').map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        const employeeId = session?.user?.employeeId;

        if (!employeeId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const periodMonth = searchParams.get('period') || formatPeriodMonth(new Date());
        const checkInFrom = searchParams.get('checkInFrom') || undefined;

        if (!isValidPeriod(periodMonth)) {
            return NextResponse.json({ error: 'Invalid period format' }, { status: 400 });
        }

        const settings = await getAttendanceScheduleSettings();
        const computedRange = getAttendancePeriodRange(periodMonth, settings.periodStartDay);
        const from = searchParams.get('from') || computedRange.from;
        const to = searchParams.get('to') || computedRange.to;

        if (!isValidDate(from) || !isValidDate(to)) {
            return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
        }

        if (checkInFrom && !isValidTime(checkInFrom)) {
            return NextResponse.json({ error: 'Invalid time format' }, { status: 400 });
        }

        const report = await getEmployeeAttendanceReport({
            employeeId,
            fromDate: from,
            toDate: to,
            checkInFrom,
            periodMonth,
        });

        return NextResponse.json({ success: true, ...report });
    } catch (error) {
        console.error('Error fetching employee attendance:', error);
        return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
    }
}
