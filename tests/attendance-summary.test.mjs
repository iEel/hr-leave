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
        effectiveLateAfterTime: '08:45',
        rawIsLate: false,
        isLate: false,
        rawIsIncomplete: false,
        isIncomplete: false,
        missingCheckIn: false,
        missingCheckOut: false,
        adjustedByApprovedLeave: false,
        leaveAdjustment: null,
        relatedLeaveRequests: [],
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
        effectiveLateAfterTime: '08:45',
        rawIsLate: true,
        isLate: true,
        rawIsIncomplete: true,
        isIncomplete: true,
        missingCheckIn: false,
        missingCheckOut: true,
        adjustedByApprovedLeave: false,
        leaveAdjustment: null,
        relatedLeaveRequests: [],
    }]
);

assert.deepEqual(
    summarizeDailyAttendanceRows([], {
        ...context,
        includedDates: ['2026-06-22'],
    }),
    [{
        date: '2026-06-22',
        checkIn: null,
        checkOut: null,
        scanCount: 0,
        dayType: 'NORMAL_WORKDAY',
        scheduledStartTime: '08:30',
        scheduledEndTime: '17:00',
        lateAfterTime: '08:45',
        effectiveLateAfterTime: '08:45',
        rawIsLate: false,
        isLate: false,
        rawIsIncomplete: true,
        isIncomplete: true,
        missingCheckIn: true,
        missingCheckOut: true,
        adjustedByApprovedLeave: false,
        leaveAdjustment: null,
        relatedLeaveRequests: [],
    }]
);
assert.deepEqual(summarizeDailyAttendanceRows([], context), []);

console.log('attendance summary tests passed');
