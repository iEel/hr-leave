import { auth } from '@/auth';
import { getEmployeeAttendanceSummary } from '@/lib/attendance/repository';
import { NextRequest, NextResponse } from 'next/server';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function formatDate(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

        const today = new Date();
        const defaultFrom = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
        const defaultTo = formatDate(today);
        const searchParams = request.nextUrl.searchParams;
        const from = searchParams.get('from') || defaultFrom;
        const to = searchParams.get('to') || defaultTo;
        const checkInFrom = searchParams.get('checkInFrom') || undefined;

        if (!isValidDate(from) || !isValidDate(to)) {
            return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
        }

        if (checkInFrom && !isValidTime(checkInFrom)) {
            return NextResponse.json({ error: 'Invalid time format' }, { status: 400 });
        }

        const days = await getEmployeeAttendanceSummary({
            employeeId,
            fromDate: from,
            toDate: to,
            checkInFrom,
        });

        return NextResponse.json({ success: true, days });
    } catch (error) {
        console.error('Error fetching employee attendance:', error);
        return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
    }
}
