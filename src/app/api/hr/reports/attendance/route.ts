import { auth } from '@/auth';
import {
    filterHrAttendanceRows,
    formatHrAttendanceCsv,
    getHrAttendanceReport,
    type HrAttendanceReportRow,
    type HrAttendanceStatusFilter,
} from '@/lib/attendance/hr-report';
import {
    getAttendanceScheduleSettings,
    listWorkingSaturdaysForRange,
} from '@/lib/attendance/repository';
import { getAttendancePeriodRange } from '@/lib/attendance/schedule-rules';
import { NextRequest, NextResponse } from 'next/server';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const STATUS_FILTERS = new Set<HrAttendanceStatusFilter>([
    'ALL',
    'LATE',
    'ADJUSTED_BY_LEAVE',
    'INCOMPLETE',
    'NO_HIP_DATA',
]);

interface AttendanceReportSummary {
    total: number;
    late: number;
    adjustedByLeave: number;
    incomplete: number;
    noHipData: number;
}

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
        parsed.getFullYear() === year
        && parsed.getMonth() === month - 1
        && parsed.getDate() === day
    );
}

function isValidPeriod(value: string): boolean {
    if (!PERIOD_PATTERN.test(value)) {
        return false;
    }

    const [year, month] = value.split('-').map(Number);
    return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

function parseStatus(value: string | null): HrAttendanceStatusFilter | null {
    if (value == null || value === '') {
        return 'ALL';
    }

    return STATUS_FILTERS.has(value as HrAttendanceStatusFilter)
        ? value as HrAttendanceStatusFilter
        : null;
}

function buildSummary(rows: HrAttendanceReportRow[]): AttendanceReportSummary {
    return {
        total: rows.length,
        late: filterHrAttendanceRows(rows, 'LATE').length,
        adjustedByLeave: filterHrAttendanceRows(rows, 'ADJUSTED_BY_LEAVE').length,
        incomplete: filterHrAttendanceRows(rows, 'INCOMPLETE').length,
        noHipData: filterHrAttendanceRows(rows, 'NO_HIP_DATA').length,
    };
}

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        const isHRStaff = (session?.user as { isHRStaff?: boolean } | undefined)?.isHRStaff === true;

        if (!session?.user?.id || (session.user.role !== 'HR' && session.user.role !== 'ADMIN' && !isHRStaff)) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const periodMonth = searchParams.get('period') || formatPeriodMonth(new Date());
        if (!isValidPeriod(periodMonth)) {
            return NextResponse.json({ error: 'Invalid period format' }, { status: 400 });
        }

        const status = parseStatus(searchParams.get('status'));
        if (status == null) {
            return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
        }

        const settings = await getAttendanceScheduleSettings();
        const computedRange = getAttendancePeriodRange(periodMonth, settings.periodStartDay);
        const fromDate = searchParams.get('from') || computedRange.from;
        const toDate = searchParams.get('to') || computedRange.to;

        if (!isValidDate(fromDate) || !isValidDate(toDate) || fromDate > toDate) {
            return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
        }

        const workingSaturdays = await listWorkingSaturdaysForRange(fromDate, toDate);
        const rows = await getHrAttendanceReport({
            fromDate,
            toDate,
            settings,
            workingSaturdays,
            company: searchParams.get('company') || undefined,
            department: searchParams.get('department') || undefined,
            employee: searchParams.get('employee') || undefined,
            status,
        });
        const summary = buildSummary(rows);
        const period = {
            month: periodMonth,
            from: fromDate,
            to: toDate,
        };

        if (searchParams.get('format') === 'csv') {
            return new NextResponse(formatHrAttendanceCsv(rows), {
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="attendance_report_${periodMonth}.csv"`,
                },
            });
        }

        return NextResponse.json({
            success: true,
            period,
            rows,
            summary,
        });
    } catch (error) {
        console.error('Error generating HR attendance report:', error);
        return NextResponse.json({ error: 'Failed to generate attendance report' }, { status: 500 });
    }
}
