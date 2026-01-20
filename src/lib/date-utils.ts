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
 * Calculate net working days (excluding weekends and holidays)
 * @param startDate Start date of leave
 * @param endDate End date of leave
 * @param holidays Array of holiday dates
 * @param timeSlot Time slot (FULL_DAY, HALF_MORNING, HALF_AFTERNOON)
 */
export function calculateNetWorkingDays(
    startDate: Date,
    endDate: Date,
    holidays: Date[],
    timeSlot: TimeSlot = TimeSlot.FULL_DAY
): number {
    // Get all days in the range
    const allDays = eachDayOfInterval({
        start: startOfDay(startDate),
        end: startOfDay(endDate),
    });

    // Convert holidays to string for easy comparison
    const holidayStrings = holidays.map((h) => format(startOfDay(h), 'yyyy-MM-dd'));

    // Filter out weekends and holidays
    const workingDays = allDays.filter((day) => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const isHoliday = holidayStrings.includes(dayStr);
        return !isWeekend(day) && !isHoliday;
    });

    // Calculate total days based on time slot
    let totalDays = workingDays.length;

    // If half day, subtract 0.5
    if (timeSlot === TimeSlot.HALF_MORNING || timeSlot === TimeSlot.HALF_AFTERNOON) {
        // Half day only applies to single day leaves
        if (workingDays.length === 1) {
            totalDays = 0.5;
        }
    }

    return totalDays;
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
