import type { AttendanceDaySummary } from './schedule-rules';

export type AttendancePunchTone = 'normal' | 'late' | 'missing';

export interface AttendanceRowDisplay {
    checkInText: string;
    checkOutText: string;
    checkInTone: AttendancePunchTone;
    checkOutTone: AttendancePunchTone;
    lateMinutes: number | null;
    statusLabel: string | null;
}

type DisplayAttendanceDay = Pick<
    AttendanceDaySummary,
    'checkIn' | 'checkOut' | 'isLate' | 'lateAfterTime' | 'missingCheckIn' | 'missingCheckOut'
>;

export function getAttendanceRowDisplay(day: DisplayAttendanceDay): AttendanceRowDisplay {
    const lateMinutes = day.isLate
        ? getTimeDifferenceMinutes(day.checkIn, day.lateAfterTime)
        : null;

    return {
        checkInText: day.missingCheckIn ? 'ไม่ได้บันทึกเข้า' : day.checkIn ?? '--:--',
        checkOutText: day.missingCheckOut ? 'ไม่ได้บันทึกออก' : day.checkOut ?? '--:--',
        checkInTone: day.missingCheckIn ? 'missing' : day.isLate ? 'late' : 'normal',
        checkOutTone: day.missingCheckOut ? 'missing' : 'normal',
        lateMinutes,
        statusLabel: day.isLate ? 'สาย' : null,
    };
}

function getTimeDifferenceMinutes(time: string | null, baseline: string | null): number | null {
    if (time == null || baseline == null) {
        return null;
    }

    const difference = timeToMinutes(time) - timeToMinutes(baseline);

    return difference > 0 ? difference : null;
}

function timeToMinutes(time: string): number {
    const [hourText, minuteText] = time.split(':');

    return (Number(hourText) * 60) + Number(minuteText);
}