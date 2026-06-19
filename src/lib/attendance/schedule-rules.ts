export type AttendanceDayType = 'NORMAL_WORKDAY' | 'WORKING_SATURDAY' | 'NON_WORKDAY';

export interface AttendanceScheduleSettings {
    workStartTime: string;
    workEndTime: string;
    breakStartTime: string;
    breakEndTime: string;
    satWorkStartTime: string;
    satWorkEndTime: string;
    weekdayGraceMinutes: number;
    periodStartDay: number;
}

export interface WorkingSaturdaySchedule {
    workDate: string;
    startTime?: string | null;
    endTime?: string | null;
}

export interface DailyAttendanceRow {
    attendanceDate: string;
    recordTime: string;
}

export interface AttendanceDaySummary {
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    scanCount: number;
    dayType: AttendanceDayType;
    scheduledStartTime: string | null;
    scheduledEndTime: string | null;
    lateAfterTime: string | null;
    isLate: boolean;
    isIncomplete: boolean;
    missingCheckIn: boolean;
    missingCheckOut: boolean;
}

export interface AttendanceSummaryContext {
    settings?: AttendanceScheduleSettings;
    workingSaturdays?: WorkingSaturdaySchedule[];
}

export const DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS: AttendanceScheduleSettings = {
    workStartTime: '08:30',
    workEndTime: '17:00',
    breakStartTime: '12:00',
    breakEndTime: '13:00',
    satWorkStartTime: '09:00',
    satWorkEndTime: '12:00',
    weekdayGraceMinutes: 15,
    periodStartDay: 21,
};

export function getAttendancePeriodRange(periodMonth: string, periodStartDay: number): { from: string; to: string } {
    const [yearText, monthText] = periodMonth.split('-');
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const from = new Date(Date.UTC(year, monthIndex - 1, periodStartDay));
    const to = new Date(Date.UTC(year, monthIndex, periodStartDay - 1));

    return {
        from: formatDate(from),
        to: formatDate(to),
    };
}

export function summarizeDailyAttendanceRowsWithSchedule(
    rows: DailyAttendanceRow[],
    context: AttendanceSummaryContext = {}
): AttendanceDaySummary[] {
    const settings = context.settings ?? DEFAULT_ATTENDANCE_SCHEDULE_SETTINGS;
    const workingSaturdays = new Map(
        (context.workingSaturdays ?? []).map((schedule) => [schedule.workDate, schedule])
    );
    const rowsByDate = new Map<string, string[]>();

    for (const row of rows) {
        const times = rowsByDate.get(row.attendanceDate) ?? [];
        times.push(row.recordTime);
        rowsByDate.set(row.attendanceDate, times);
    }

    return Array.from(rowsByDate.entries())
        .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
        .map(([date, recordTimes]) => {
            const sortedTimes = [...recordTimes].sort((left, right) => left.localeCompare(right));
            const daySchedule = getDaySchedule(date, settings, workingSaturdays.get(date));
            const { checkIn, checkOut } = getDisplayPunches(sortedTimes, settings, daySchedule);
            const missingCheckIn = daySchedule.dayType !== 'NON_WORKDAY' && checkIn == null;
            const missingCheckOut = daySchedule.dayType !== 'NON_WORKDAY' && checkOut == null;
            const isIncomplete = daySchedule.dayType !== 'NON_WORKDAY' && (missingCheckIn || missingCheckOut);

            return {
                date,
                checkIn,
                checkOut,
                scanCount: sortedTimes.length,
                dayType: daySchedule.dayType,
                scheduledStartTime: daySchedule.scheduledStartTime,
                scheduledEndTime: daySchedule.scheduledEndTime,
                lateAfterTime: daySchedule.lateAfterTime,
                isLate: isLate(checkIn, daySchedule),
                isIncomplete,
                missingCheckIn,
                missingCheckOut,
            };
        });
}

interface DaySchedule {
    dayType: AttendanceDayType;
    scheduledStartTime: string | null;
    scheduledEndTime: string | null;
    lateAfterTime: string | null;
    singleScanCutoffTime: string;
}

function getDaySchedule(
    date: string,
    settings: AttendanceScheduleSettings,
    workingSaturday: WorkingSaturdaySchedule | undefined
): DaySchedule {
    const dayOfWeek = getDayOfWeek(date);

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const lateAfterTime = addMinutes(settings.workStartTime, settings.weekdayGraceMinutes);

        return {
            dayType: 'NORMAL_WORKDAY',
            scheduledStartTime: settings.workStartTime,
            scheduledEndTime: settings.workEndTime,
            lateAfterTime,
            singleScanCutoffTime: settings.breakStartTime,
        };
    }

    if (dayOfWeek === 6 && workingSaturday) {
        const scheduledStartTime = workingSaturday.startTime ?? settings.satWorkStartTime;
        const scheduledEndTime = workingSaturday.endTime ?? settings.satWorkEndTime;

        return {
            dayType: 'WORKING_SATURDAY',
            scheduledStartTime,
            scheduledEndTime,
            lateAfterTime: scheduledStartTime,
            singleScanCutoffTime: getMidpointTime(scheduledStartTime, scheduledEndTime),
        };
    }

    return {
        dayType: 'NON_WORKDAY',
        scheduledStartTime: null,
        scheduledEndTime: null,
        lateAfterTime: null,
        singleScanCutoffTime: settings.breakStartTime,
    };
}

function getDisplayPunches(
    sortedTimes: string[],
    settings: AttendanceScheduleSettings,
    daySchedule: DaySchedule
): { checkIn: string | null; checkOut: string | null } {
    if (sortedTimes.length === 0) {
        return { checkIn: null, checkOut: null };
    }

    if (sortedTimes.length > 1) {
        return {
            checkIn: formatTime(sortedTimes[0]),
            checkOut: formatTime(sortedTimes[sortedTimes.length - 1]),
        };
    }

    const time = formatTime(sortedTimes[0]);
    const cutoff = daySchedule.dayType === 'NON_WORKDAY'
        ? settings.breakStartTime
        : daySchedule.singleScanCutoffTime;

    return time < cutoff
        ? { checkIn: time, checkOut: null }
        : { checkIn: null, checkOut: time };
}

function isLate(checkIn: string | null, daySchedule: DaySchedule): boolean {
    return daySchedule.lateAfterTime != null && checkIn != null && checkIn > daySchedule.lateAfterTime;
}

function getDayOfWeek(date: string): number {
    return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function formatTime(recordTime: string): string {
    return recordTime.slice(0, 5);
}

function addMinutes(time: string, minutesToAdd: number): string {
    return minutesToTime(timeToMinutes(time) + minutesToAdd);
}

function getMidpointTime(startTime: string, endTime: string): string {
    return minutesToTime(Math.floor((timeToMinutes(startTime) + timeToMinutes(endTime)) / 2));
}

function timeToMinutes(time: string): number {
    const [hourText, minuteText] = time.split(':');
    return (Number(hourText) * 60) + Number(minuteText);
}

function minutesToTime(minutes: number): string {
    const normalizedMinutes = ((minutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalizedMinutes / 60);
    const remainingMinutes = normalizedMinutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}