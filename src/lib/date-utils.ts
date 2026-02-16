import {
    differenceInDays,
    eachDayOfInterval,
    isWeekend,
    format,
    parseISO,
    addDays,
    startOfDay,
    endOfDay,
} from 'date-fns';
import { th } from 'date-fns/locale';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { TimeSlot } from '@/types';

const TIMEZONE = 'Asia/Bangkok';

/**
 * Convert date to Bangkok timezone
 */
export function toBangkokTime(date: Date | string): Date {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return toZonedTime(d, TIMEZONE);
}

/**
 * Format date in Bangkok timezone (24-hour format)
 */
export function formatBangkokDate(
    date: Date | string,
    formatStr: string = 'dd/MM/yyyy HH:mm'
): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return formatInTimeZone(d, TIMEZONE, formatStr, { locale: th });
}

/**
 * Format date for display (Thai format)
 */
export function formatThaiDate(date: Date | string): string {
    return formatBangkokDate(date, 'd MMMM yyyy');
}

/**
 * Working Saturday data structure
 */
export interface WorkingSaturdayData {
    date: string;          // yyyy-MM-dd
    startTime: string;     // HH:mm
    endTime: string;       // HH:mm
    workHours: number;     // hours of work on that Saturday
}

/**
 * Calculate net working days (excluding weekends and holidays, including working Saturdays)
 * @param startDate Start date of leave
 * @param endDate End date of leave
 * @param holidays Array of holiday dates
 * @param timeSlot Time slot (FULL_DAY, HALF_MORNING, HALF_AFTERNOON)
 * @param workingSaturdays Array of working Saturday data (optional)
 * @param workHoursPerDay Standard work hours per day (default: 7.5)
 */
export function calculateNetWorkingDays(
    startDate: Date,
    endDate: Date,
    holidays: Date[],
    timeSlot: TimeSlot = TimeSlot.FULL_DAY,
    workingSaturdays: WorkingSaturdayData[] = [],
    workHoursPerDay: number = 7.5
): number {
    // Get all days in the range
    const allDays = eachDayOfInterval({
        start: startOfDay(startDate),
        end: startOfDay(endDate),
    });

    // Convert holidays to string for easy comparison
    const holidayStrings = holidays.map((h) => format(startOfDay(h), 'yyyy-MM-dd'));

    // Create map of working Saturdays for quick lookup
    const workingSaturdayMap = new Map<string, WorkingSaturdayData>();
    for (const ws of workingSaturdays) {
        workingSaturdayMap.set(ws.date, ws);
    }

    let totalDays = 0;

    // Calculate for each day
    for (const day of allDays) {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = day.getDay(); // 0=Sun, 6=Sat
        const isHoliday = holidayStrings.includes(dayStr);

        // Skip holidays
        if (isHoliday) continue;

        // Sunday - always skip
        if (dayOfWeek === 0) continue;

        // Saturday - check if it's a working Saturday
        if (dayOfWeek === 6) {
            const workingSat = workingSaturdayMap.get(dayStr);
            if (workingSat) {
                // Calculate partial day based on Saturday work hours
                const satDayValue = workingSat.workHours / workHoursPerDay;
                totalDays += satDayValue;
            }
            // If not a working Saturday, skip it
            continue;
        }

        // Regular weekday (Mon-Fri) - count as 1 day
        totalDays += 1;
    }

    // If half day, subtract 0.5 (only applies to single day leaves)
    if (timeSlot === TimeSlot.HALF_MORNING || timeSlot === TimeSlot.HALF_AFTERNOON) {
        if (allDays.length === 1 && totalDays > 0) {
            totalDays = totalDays * 0.5;
        }
    }

    // Round to 2 decimal places
    return Math.round(totalDays * 100) / 100;
}

/**
 * Split leave usage amount by year for cross-year leave requests.
 * Uses the same day-counting logic as calculateNetWorkingDays but groups by year.
 * @returns Map<year, usageAmount> e.g. { 2025: 3, 2026: 1 }
 */
export function splitLeaveByYear(
    startDate: Date,
    endDate: Date,
    holidays: Date[],
    timeSlot: TimeSlot = TimeSlot.FULL_DAY,
    workingSaturdays: WorkingSaturdayData[] = [],
    workHoursPerDay: number = 7.5
): Map<number, number> {
    const allDays = eachDayOfInterval({
        start: startOfDay(startDate),
        end: startOfDay(endDate),
    });

    const holidayStrings = holidays.map((h) => format(startOfDay(h), 'yyyy-MM-dd'));

    const workingSaturdayMap = new Map<string, WorkingSaturdayData>();
    for (const ws of workingSaturdays) {
        workingSaturdayMap.set(ws.date, ws);
    }

    const yearMap = new Map<number, number>();

    for (const day of allDays) {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = day.getDay();
        const isHoliday = holidayStrings.includes(dayStr);
        const year = day.getFullYear();

        if (isHoliday) continue;
        if (dayOfWeek === 0) continue;

        let dayValue = 0;

        if (dayOfWeek === 6) {
            const workingSat = workingSaturdayMap.get(dayStr);
            if (workingSat) {
                dayValue = workingSat.workHours / workHoursPerDay;
            }
            // If not a working Saturday, skip
        } else {
            // Regular weekday (Mon-Fri)
            dayValue = 1;
        }

        if (dayValue > 0) {
            yearMap.set(year, (yearMap.get(year) || 0) + dayValue);
        }
    }

    // If half day, apply to the single-day result
    if (timeSlot === TimeSlot.HALF_MORNING || timeSlot === TimeSlot.HALF_AFTERNOON) {
        if (allDays.length === 1) {
            for (const [year, val] of yearMap) {
                yearMap.set(year, val * 0.5);
            }
        }
    }

    // Round all values to 2 decimal places
    for (const [year, val] of yearMap) {
        yearMap.set(year, Math.round(val * 100) / 100);
    }

    return yearMap;
}

/**
 * Check if two date ranges overlap
 * Algorithm: (StartNew <= EndExisting) AND (EndNew >= StartExisting)
 */
export function isDateRangeOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date
): boolean {
    return startOfDay(start1) <= startOfDay(end2) && startOfDay(end1) >= startOfDay(start2);
}

/**
 * Calculate tenure in years from start date
 */
export function calculateTenureYears(startDate: Date): number {
    const now = new Date();
    const diffDays = differenceInDays(now, startDate);
    return Math.floor(diffDays / 365);
}

/**
 * Check if employee is eligible for vacation leave (>= 1 year tenure)
 */
export function isEligibleForVacation(startDate: Date): boolean {
    return calculateTenureYears(startDate) >= 1;
}

/**
 * Check if employee is eligible for ordination leave (>= 2 years tenure)
 */
export function isEligibleForOrdination(startDate: Date): boolean {
    return calculateTenureYears(startDate) >= 2;
}

/**
 * Get current year
 */
export function getCurrentYear(): number {
    return new Date().getFullYear();
}
