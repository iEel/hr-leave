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

assert.deepEqual(
    getAttendancePeriodRange('2026-06', 1),
    { from: '2026-06-01', to: '2026-06-30' }
);

const normalOnTime = summarizeDailyAttendanceRowsWithSchedule([
    { attendanceDate: '2026-06-04', recordTime: '08:45:00' },
], context)[0];

assert.equal(normalOnTime.rawIsLate, false);
assert.equal(normalOnTime.isLate, false);
assert.equal(normalOnTime.rawIsIncomplete, true);
assert.equal(normalOnTime.isIncomplete, true);
assert.equal(normalOnTime.effectiveLateAfterTime, '08:45');
assert.equal(normalOnTime.adjustedByApprovedLeave, false);
assert.equal(normalOnTime.leaveAdjustment, null);
assert.deepEqual(normalOnTime.relatedLeaveRequests, []);

const normalLate = summarizeDailyAttendanceRowsWithSchedule([
    { attendanceDate: '2026-06-04', recordTime: '08:46:00' },
], context)[0];

assert.equal(normalLate.rawIsLate, true);
assert.equal(normalLate.isLate, true);
assert.equal(normalLate.effectiveLateAfterTime, '08:45');

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
        effectiveLateAfterTime: '09:00',
        rawIsLate: false,
        isLate: false,
        rawIsIncomplete: true,
        isIncomplete: true,
        missingCheckIn: false,
        missingCheckOut: true,
        adjustedByApprovedLeave: false,
        leaveAdjustment: null,
        relatedLeaveRequests: [],
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
        effectiveLateAfterTime: '09:00',
        rawIsLate: false,
        isLate: false,
        rawIsIncomplete: true,
        isIncomplete: true,
        missingCheckIn: true,
        missingCheckOut: false,
        adjustedByApprovedLeave: false,
        leaveAdjustment: null,
        relatedLeaveRequests: [],
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
        effectiveLateAfterTime: null,
        rawIsLate: false,
        isLate: false,
        rawIsIncomplete: false,
        isIncomplete: false,
        missingCheckIn: false,
        missingCheckOut: false,
        adjustedByApprovedLeave: false,
        leaveAdjustment: null,
        relatedLeaveRequests: [],
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
        effectiveLateAfterTime: null,
        rawIsLate: false,
        isLate: false,
        rawIsIncomplete: false,
        isIncomplete: false,
        missingCheckIn: false,
        missingCheckOut: false,
        adjustedByApprovedLeave: false,
        leaveAdjustment: null,
        relatedLeaveRequests: [],
    }
);

const includedWorkday = summarizeDailyAttendanceRowsWithSchedule([], {
    ...context,
    includedDates: ['2026-06-04'],
})[0];

assert.deepEqual(includedWorkday, {
    date: '2026-06-04',
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
});

assert.equal(
    summarizeDailyAttendanceRowsWithSchedule([
        { attendanceDate: '2026-06-04', recordTime: '18:35:00' },
    ], context)[0].checkOut,
    '18:35'
);

console.log('attendance schedule rules tests passed');