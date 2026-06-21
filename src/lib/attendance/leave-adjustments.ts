import { formatLeaveRequestNo } from '../leave-request-number';
import type { AttendanceDaySummary, AttendanceLeaveAdjustment } from './schedule-rules';

export interface AttendanceLeaveRecord {
    id: number;
    leaveType: string;
    status: string;
    startDate: string;
    endDate: string;
    isHourly: boolean;
    timeSlot: 'FULL_DAY' | 'HALF_MORNING' | 'HALF_AFTERNOON' | 'HOURLY';
    startTime: string | null;
    endTime: string | null;
    createdAt?: string | Date | null;
}

interface DayLeaveEffects {
    fullDayLeave: AttendanceLeaveRecord | null;
    halfMorningLeave: AttendanceLeaveRecord | null;
    halfAfternoonLeave: AttendanceLeaveRecord | null;
    coveringHourlyLeaves: AttendanceLeaveRecord[];
    hourlyEffectiveLateAfterTime: string | null;
}

export function applyAttendanceLeaveAdjustments(
    days: AttendanceDaySummary[],
    leaves: AttendanceLeaveRecord[]
): AttendanceDaySummary[] {
    const approvedLeaves = leaves.filter((leave) => leave.status === 'APPROVED');

    return days.map((day) => {
        const relatedLeaves = approvedLeaves.filter((leave) => isDateInLeaveRange(day.date, leave));
        if (relatedLeaves.length === 0) {
            return { ...day, relatedLeaveRequests: [] };
        }

        const effects = getDayLeaveEffects(day, relatedLeaves);
        const adjustedDay = applyDerivedEffects(day, effects);
        const adjustedByApprovedLeave = hasApprovedLeaveAdjustment(day, adjustedDay);
        const adjustmentLeaves = adjustedByApprovedLeave
            ? findAdjustmentLeaves(day, adjustedDay, effects)
            : [];
        const adjustmentLeaveIds = new Set(adjustmentLeaves.map((leave) => leave.id));
        const relatedLeaveRequests = relatedLeaves.map((leave) => toLeaveAdjustment(
            leave,
            adjustmentLeaveIds.has(leave.id)
        ));
        const representativeAdjustmentLeave = adjustmentLeaves[0] ?? null;
        const leaveAdjustment = representativeAdjustmentLeave == null
            ? null
            : relatedLeaveRequests.find((leave) => leave.leaveRequestId === representativeAdjustmentLeave.id) ?? null;

        return {
            ...adjustedDay,
            adjustedByApprovedLeave,
            leaveAdjustment,
            relatedLeaveRequests,
        };
    });
}

export function listLeaveDates(leaves: AttendanceLeaveRecord[]): string[] {
    const dates = new Set<string>();

    for (const leave of leaves) {
        if (leave.status !== 'APPROVED') continue;

        for (const date of eachDateInRange(leave.startDate, leave.endDate)) {
            dates.add(date);
        }
    }

    return Array.from(dates).sort((left, right) => left.localeCompare(right));
}

export function listLeaveDatesForRange(
    leaves: AttendanceLeaveRecord[],
    fromDate: string,
    toDate: string
): string[] {
    const dates = new Set<string>();

    for (const leave of leaves) {
        if (leave.status !== 'APPROVED') continue;

        const clippedStartDate = maxDate(leave.startDate, fromDate);
        const clippedEndDate = minDate(leave.endDate, toDate);
        if (clippedStartDate > clippedEndDate) continue;

        for (const date of eachDateInRange(clippedStartDate, clippedEndDate)) {
            dates.add(date);
        }
    }

    return Array.from(dates).sort((left, right) => left.localeCompare(right));
}

function getDayLeaveEffects(day: AttendanceDaySummary, relatedLeaves: AttendanceLeaveRecord[]): DayLeaveEffects {
    const coveringHourlyLeaves = relatedLeaves.filter((leave) => leave.timeSlot === 'HOURLY' && coversScheduledStart(day, leave));

    return {
        fullDayLeave: relatedLeaves.find((leave) => leave.timeSlot === 'FULL_DAY') ?? null,
        halfMorningLeave: relatedLeaves.find((leave) => leave.timeSlot === 'HALF_MORNING') ?? null,
        halfAfternoonLeave: relatedLeaves.find((leave) => leave.timeSlot === 'HALF_AFTERNOON') ?? null,
        coveringHourlyLeaves,
        hourlyEffectiveLateAfterTime: getHourlyEffectiveLateAfterTime(day, coveringHourlyLeaves),
    };
}

function applyDerivedEffects(day: AttendanceDaySummary, effects: DayLeaveEffects): AttendanceDaySummary {
    const effectiveLateAfterTime = effects.hourlyEffectiveLateAfterTime ?? day.effectiveLateAfterTime;
    let isLate = effectiveLateAfterTime != null && day.checkIn != null
        ? day.checkIn > effectiveLateAfterTime
        : day.isLate;
    let missingCheckIn = day.missingCheckIn;
    let missingCheckOut = day.missingCheckOut;
    let shouldRecomputeIncomplete = false;

    if (effects.fullDayLeave != null) {
        isLate = false;
        missingCheckIn = false;
        missingCheckOut = false;
        shouldRecomputeIncomplete = true;
    } else {
        if (effects.halfMorningLeave != null) {
            isLate = false;
            missingCheckIn = false;
            shouldRecomputeIncomplete = true;
        }

        if (effects.halfAfternoonLeave != null) {
            missingCheckOut = false;
            shouldRecomputeIncomplete = true;
        }
    }

    return {
        ...day,
        effectiveLateAfterTime,
        isLate,
        missingCheckIn,
        missingCheckOut,
        isIncomplete: shouldRecomputeIncomplete ? missingCheckIn || missingCheckOut : day.isIncomplete,
    };
}

function findAdjustmentLeaves(
    original: AttendanceDaySummary,
    adjusted: AttendanceDaySummary,
    effects: DayLeaveEffects
): AttendanceLeaveRecord[] {
    if (effects.fullDayLeave != null && hasApprovedLeaveAdjustment(original, adjusted)) {
        return [effects.fullDayLeave];
    }

    const adjustmentLeaves: AttendanceLeaveRecord[] = [];

    if (
        effects.halfMorningLeave != null
        && (original.isLate !== adjusted.isLate || original.missingCheckIn !== adjusted.missingCheckIn)
    ) {
        adjustmentLeaves.push(effects.halfMorningLeave);
    }

    if (effects.halfAfternoonLeave != null && original.missingCheckOut !== adjusted.missingCheckOut) {
        adjustmentLeaves.push(effects.halfAfternoonLeave);
    }

    if (
        effects.hourlyEffectiveLateAfterTime != null
        && effects.halfMorningLeave == null
        && original.isLate !== adjusted.isLate
    ) {
        const hourlyAdjustmentLeave = getFirstMaxHourlyLeave(effects.coveringHourlyLeaves, effects.hourlyEffectiveLateAfterTime);
        if (hourlyAdjustmentLeave != null) {
            adjustmentLeaves.push(hourlyAdjustmentLeave);
        }
    }

    return adjustmentLeaves;
}

function getHourlyEffectiveLateAfterTime(
    day: AttendanceDaySummary,
    coveringHourlyLeaves: AttendanceLeaveRecord[]
): string | null {
    if (day.lateAfterTime == null || coveringHourlyLeaves.length === 0) {
        return null;
    }

    return coveringHourlyLeaves.reduce(
        (latestTime, leave) => maxTime(latestTime, normalizeTime(leave.endTime ?? latestTime)),
        day.lateAfterTime
    );
}

function getFirstMaxHourlyLeave(
    coveringHourlyLeaves: AttendanceLeaveRecord[],
    hourlyEffectiveLateAfterTime: string
): AttendanceLeaveRecord | null {
    return coveringHourlyLeaves.find((leave) => normalizeTime(leave.endTime ?? '') === hourlyEffectiveLateAfterTime) ?? null;
}

function hasApprovedLeaveAdjustment(original: AttendanceDaySummary, adjusted: AttendanceDaySummary): boolean {
    return original.rawIsLate !== adjusted.isLate
        || original.rawIsIncomplete !== adjusted.isIncomplete
        || original.missingCheckIn !== adjusted.missingCheckIn
        || original.missingCheckOut !== adjusted.missingCheckOut;
}

function coversScheduledStart(day: AttendanceDaySummary, leave: AttendanceLeaveRecord): boolean {
    if (day.scheduledStartTime == null || leave.startTime == null || leave.endTime == null) {
        return false;
    }

    const startTime = normalizeTime(leave.startTime);
    const endTime = normalizeTime(leave.endTime);

    return startTime <= day.scheduledStartTime && day.scheduledStartTime <= endTime;
}

function toLeaveAdjustment(
    leave: AttendanceLeaveRecord,
    isStatusAdjusting: boolean
): AttendanceLeaveAdjustment {
    return {
        leaveRequestId: leave.id,
        leaveRequestNo: formatLeaveRequestNo({ id: leave.id, createdAt: leave.createdAt }),
        leaveType: leave.leaveType,
        timeSlot: leave.timeSlot,
        startDate: leave.startDate,
        endDate: leave.endDate,
        startTime: leave.startTime,
        endTime: leave.endTime,
        label: formatLeaveLabel(leave),
        isStatusAdjusting,
    };
}

function formatLeaveLabel(leave: AttendanceLeaveRecord): string {
    const dateText = leave.startDate === leave.endDate
        ? leave.startDate
        : `${leave.startDate} - ${leave.endDate}`;
    const timeText = leave.startTime != null && leave.endTime != null
        ? ` ${normalizeTime(leave.startTime)}-${normalizeTime(leave.endTime)}`
        : '';

    return `${leave.leaveType} ${dateText}${timeText}`;
}

function isDateInLeaveRange(date: string, leave: AttendanceLeaveRecord): boolean {
    return leave.startDate <= date && date <= leave.endDate;
}

function eachDateInRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const current = parseDate(startDate);
    const end = parseDate(endDate);

    while (current.getTime() <= end.getTime()) {
        dates.push(formatDate(current));
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
}

function parseDate(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function normalizeTime(time: string): string {
    return time.slice(0, 5);
}

function minDate(left: string, right: string): string {
    return left <= right ? left : right;
}

function maxDate(left: string, right: string): string {
    return left >= right ? left : right;
}

function maxTime(left: string, right: string): string {
    return left >= right ? left : right;
}
