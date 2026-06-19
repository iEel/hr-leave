import assert from 'node:assert/strict';

import {
    getAttendancePeriodRange,
    summarizeDailyAttendanceRowsWithSchedule,
} from '../src/lib/attendance/schedule-rules.ts';

const context = {
    settings: {
        workStartTime: '08:30',
        workEndTime: '17:00',
        breakStartTime: '12:00',
        breakEndTime: '13:00',
        satWorkStartTime: '09:00',
        satWorkEndTime: '12:00',
        weekdayGraceMinutes: 15,
        periodStartDay: 21,
    },
    workingSaturdays: [
        {
            date: '2026-06-20',
            startTime: '09:00',
            endTime: '12:00',
            workHours: 3,
        },
    ],
};

assert.deepEqual(
    getAttendancePeriodRange('2026-06', 21),
    { from: '2026-05-21', to: '2026-06-20' }
);

assert.deepEqual(
    getAttendancePeriodRange('2026-01', 21),
    { from: '2025-12-21', to: '2026-01-20' }
);

assert.equal(
    summarizeDailyAttendanceRowsWithSchedule([
        { attendanceDate: '2026-06-04', recordTime: '08:45:00' },
    ], context)[0].isLate,
    false
);

assert.equal(
    summarizeDailyAttendanceRowsWithSchedule([
        { attendanceDate: '2026-06-04', recordTime: '08:46:00' },
    ], context)[0].isLate,
    true
);

assert.deepEqual(
    summarizeDailyAttendanceRowsWithSchedule([
        { attendanceDate: '2026-06-20', recordTime: '09:00:00' },
    ], context)[0],
    {
        date: '2026-06-20',
        checkIn: '09:00',
        checkOut: null,
        scanCount: 1,
        dayType: 'WORKING_SATURDAY',
        scheduledStartTime: '09:00',
        scheduledEndTime: '12:00',
        lateAfterTime: '09:00',
        isLate: false,
        isIncomplete: true,
        missingCheckIn: false,
        missingCheckOut: true,
    }
);

assert.equal(
    summarizeDailyAttendanceRowsWithSchedule([
        { attendanceDate: '2026-06-20', recordTime: '09:01:00' },
    ], context)[0].isLate,
    true
);

assert.deepEqual(
    summarizeDailyAttendanceRowsWithSchedule([
        { attendanceDate: '2026-06-20', recordTime: '11:30:00' },
    ], context)[0],
    {
        date: '2026-06-20',
        checkIn: null,
        checkOut: '11:30',
        scanCount: 1,
        dayType: 'WORKING_SATURDAY',
        scheduledStartTime: '09:00',
        scheduledEndTime: '12:00',
        lateAfterTime: '09:00',
        isLate: false,
        isIncomplete: true,
        missingCheckIn: true,
        missingCheckOut: false,
    }
);

assert.deepEqual(
    summarizeDailyAttendanceRowsWithSchedule([
        { attendanceDate: '2026-06-27', recordTime: '09:30:00' },
    ], context)[0],
    {
        date: '2026-06-27',
        checkIn: '09:30',
        checkOut: null,
        scanCount: 1,
        dayType: 'NON_WORKDAY',
        scheduledStartTime: null,
        scheduledEndTime: null,
        lateAfterTime: null,
        isLate: false,
        isIncomplete: false,
        missingCheckIn: false,
        missingCheckOut: false,
    }
);

assert.deepEqual(
    summarizeDailyAttendanceRowsWithSchedule([
        { attendanceDate: '2026-06-21', recordTime: '09:30:00' },
    ], context)[0],
    {
        date: '2026-06-21',
        checkIn: '09:30',
        checkOut: null,
        scanCount: 1,
        dayType: 'NON_WORKDAY',
        scheduledStartTime: null,
        scheduledEndTime: null,
        lateAfterTime: null,
        isLate: false,
        isIncomplete: false,
        missingCheckIn: false,
        missingCheckOut: false,
    }
);

assert.equal(
    summarizeDailyAttendanceRowsWithSchedule([
        { attendanceDate: '2026-06-04', recordTime: '18:35:00' },
    ], context)[0].checkOut,
    '18:35'
);

console.log('attendance schedule rules tests passed');
