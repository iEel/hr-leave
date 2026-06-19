import assert from 'node:assert/strict';

import { summarizeDailyAttendanceRows } from '../src/lib/attendance/repository.ts';

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
};

assert.deepEqual(
    summarizeDailyAttendanceRows([
        { attendanceDate: '2026-06-18', recordTime: '15:53:54' },
        { attendanceDate: '2026-06-18', recordTime: '08:31:12' },
    ], context),
    [{
        date: '2026-06-18',
        checkIn: '08:31',
        checkOut: '15:53',
        scanCount: 2,
        dayType: 'NORMAL_WORKDAY',
        scheduledStartTime: '08:30',
        scheduledEndTime: '17:00',
        lateAfterTime: '08:45',
        isLate: false,
        isIncomplete: false,
        missingCheckIn: false,
        missingCheckOut: false,
    }]
);

assert.deepEqual(
    summarizeDailyAttendanceRows([
        { attendanceDate: '2026-06-19', recordTime: '08:46:01' },
    ], context),
    [{
        date: '2026-06-19',
        checkIn: '08:46',
        checkOut: null,
        scanCount: 1,
        dayType: 'NORMAL_WORKDAY',
        scheduledStartTime: '08:30',
        scheduledEndTime: '17:00',
        lateAfterTime: '08:45',
        isLate: true,
        isIncomplete: true,
        missingCheckIn: false,
        missingCheckOut: true,
    }]
);

assert.deepEqual(summarizeDailyAttendanceRows([], context), []);

console.log('attendance summary tests passed');