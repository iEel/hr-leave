import assert from 'node:assert/strict';

import {
    applyAttendanceLeaveAdjustments,
    listLeaveDates,
    listLeaveDatesForRange,
} from '../src/lib/attendance/leave-adjustments.ts';

function day(checkIn, overrides = {}) {
    const missingCheckIn = checkIn == null;
    const missingCheckOut = overrides.checkOut === undefined ? true : overrides.checkOut == null;
    const isLate = checkIn != null && checkIn > '08:45';
    const isIncomplete = missingCheckIn || missingCheckOut;

    return {
        date: '2026-06-18',
        checkIn,
        checkOut: overrides.checkOut ?? null,
        scanCount: checkIn == null ? 0 : 1,
        dayType: 'NORMAL_WORKDAY',
        scheduledStartTime: '08:30',
        scheduledEndTime: '17:00',
        lateAfterTime: '08:45',
        effectiveLateAfterTime: '08:45',
        rawIsLate: isLate,
        isLate,
        rawIsIncomplete: isIncomplete,
        isIncomplete,
        missingCheckIn,
        missingCheckOut,
        adjustedByApprovedLeave: false,
        leaveAdjustment: null,
        relatedLeaveRequests: [],
        ...overrides,
    };
}

function leave(overrides = {}) {
    return {
        id: 101,
        leaveType: 'ลากิจ',
        status: 'APPROVED',
        startDate: '2026-06-18',
        endDate: '2026-06-18',
        isHourly: true,
        timeSlot: 'HOURLY',
        startTime: '08:30',
        endTime: '09:00',
        createdAt: '2026-06-01',
        ...overrides,
    };
}

assert.equal(applyAttendanceLeaveAdjustments([day('08:46')], [])[0].isLate, true);

const hourlyBeforeScheduledStart = applyAttendanceLeaveAdjustments([
    day('08:44'),
], [
    leave({ startTime: '08:00', endTime: '08:20' }),
])[0];

assert.equal(hourlyBeforeScheduledStart.effectiveLateAfterTime, '08:45');
assert.equal(hourlyBeforeScheduledStart.adjustedByApprovedLeave, false);
assert.equal(hourlyBeforeScheduledStart.leaveAdjustment, null);

assert.equal(applyAttendanceLeaveAdjustments([day('08:50')], [leave()])[0].isLate, false);
assert.equal(applyAttendanceLeaveAdjustments([day('09:00')], [leave()])[0].isLate, false);
assert.equal(applyAttendanceLeaveAdjustments([day('09:01')], [leave()])[0].isLate, true);

const hourlyNotCoveringStart = applyAttendanceLeaveAdjustments([
    day('08:50'),
], [
    leave({ startTime: '09:00', endTime: '09:30' }),
])[0];

assert.equal(hourlyNotCoveringStart.isLate, true);
assert.equal(hourlyNotCoveringStart.adjustedByApprovedLeave, false);

const pendingLeave = applyAttendanceLeaveAdjustments([
    day('08:50'),
], [
    leave({ status: 'PENDING' }),
])[0];

assert.equal(pendingLeave.relatedLeaveRequests.length, 0);
assert.equal(pendingLeave.isLate, true);

const fullDayAdjusted = applyAttendanceLeaveAdjustments([
    day(null, { checkOut: null }),
], [
    leave({
        id: 102,
        isHourly: false,
        timeSlot: 'FULL_DAY',
        startTime: null,
        endTime: null,
    }),
])[0];

assert.equal(fullDayAdjusted.isLate, false);
assert.equal(fullDayAdjusted.isIncomplete, false);
assert.equal(fullDayAdjusted.missingCheckIn, false);
assert.equal(fullDayAdjusted.missingCheckOut, false);
assert.equal(fullDayAdjusted.adjustedByApprovedLeave, true);
assert.equal(fullDayAdjusted.leaveAdjustment?.timeSlot, 'FULL_DAY');
assert.equal(fullDayAdjusted.relatedLeaveRequests[0]?.leaveRequestNo, 'LR-2026-000102');
assert.equal(fullDayAdjusted.relatedLeaveRequests[0]?.isStatusAdjusting, true);

const halfMorningAdjusted = applyAttendanceLeaveAdjustments([
    day(null, { checkOut: null }),
], [
    leave({
        id: 103,
        isHourly: false,
        timeSlot: 'HALF_MORNING',
        startTime: null,
        endTime: null,
    }),
])[0];

assert.equal(halfMorningAdjusted.isLate, false);
assert.equal(halfMorningAdjusted.missingCheckIn, false);
assert.equal(halfMorningAdjusted.missingCheckOut, true);
assert.equal(halfMorningAdjusted.isIncomplete, true);
assert.equal(halfMorningAdjusted.leaveAdjustment?.timeSlot, 'HALF_MORNING');

const halfAfternoonAdjusted = applyAttendanceLeaveAdjustments([
    day('08:50', { checkOut: null }),
], [
    leave({
        id: 104,
        isHourly: false,
        timeSlot: 'HALF_AFTERNOON',
        startTime: null,
        endTime: null,
    }),
])[0];

assert.equal(halfAfternoonAdjusted.isLate, true);
assert.equal(halfAfternoonAdjusted.missingCheckOut, false);
assert.equal(halfAfternoonAdjusted.isIncomplete, false);
assert.equal(halfAfternoonAdjusted.leaveAdjustment?.timeSlot, 'HALF_AFTERNOON');

const halfMorningAndAfternoonAdjusted = applyAttendanceLeaveAdjustments([
    day(null, { checkOut: null }),
], [
    leave({ id: 113, isHourly: false, timeSlot: 'HALF_MORNING', startTime: null, endTime: null }),
    leave({ id: 114, isHourly: false, timeSlot: 'HALF_AFTERNOON', startTime: null, endTime: null }),
])[0];

assert.equal(halfMorningAndAfternoonAdjusted.isIncomplete, false);
assert.equal(halfMorningAndAfternoonAdjusted.adjustedByApprovedLeave, true);
assert.deepEqual(
    halfMorningAndAfternoonAdjusted.relatedLeaveRequests
        .filter((relatedLeave) => relatedLeave.isStatusAdjusting)
        .map((relatedLeave) => relatedLeave.leaveRequestId),
    [113, 114]
);
assert.equal(halfMorningAndAfternoonAdjusted.leaveAdjustment?.leaveRequestId, 113);

const noFinalChangeWithRelatedLeaves = applyAttendanceLeaveAdjustments([
    day('08:40', { checkOut: '17:30', rawIsIncomplete: false, isIncomplete: false, missingCheckOut: false }),
], [
    leave({ id: 105, startTime: '08:00', endTime: '08:20' }),
    leave({ id: 106, startTime: '09:00', endTime: '09:30' }),
])[0];

assert.equal(noFinalChangeWithRelatedLeaves.isLate, false);
assert.equal(noFinalChangeWithRelatedLeaves.adjustedByApprovedLeave, false);
assert.equal(noFinalChangeWithRelatedLeaves.leaveAdjustment, null);
assert.equal(noFinalChangeWithRelatedLeaves.relatedLeaveRequests.some((relatedLeave) => relatedLeave.isStatusAdjusting), false);

const hourlyLeavesLongThenShort = applyAttendanceLeaveAdjustments([
    day('09:30', { checkOut: '17:30', rawIsIncomplete: false, isIncomplete: false, missingCheckOut: false }),
], [
    leave({ id: 107, startTime: '08:30', endTime: '10:00' }),
    leave({ id: 108, startTime: '08:30', endTime: '09:00' }),
])[0];

const hourlyLeavesShortThenLong = applyAttendanceLeaveAdjustments([
    day('09:30', { checkOut: '17:30', rawIsIncomplete: false, isIncomplete: false, missingCheckOut: false }),
], [
    leave({ id: 108, startTime: '08:30', endTime: '09:00' }),
    leave({ id: 107, startTime: '08:30', endTime: '10:00' }),
])[0];

assert.equal(hourlyLeavesLongThenShort.effectiveLateAfterTime, '10:00');
assert.equal(hourlyLeavesShortThenLong.effectiveLateAfterTime, '10:00');
assert.equal(hourlyLeavesLongThenShort.isLate, false);
assert.equal(hourlyLeavesShortThenLong.isLate, false);

const fullDayThenHourly = applyAttendanceLeaveAdjustments([
    day('09:30', { checkOut: null }),
], [
    leave({ id: 109, isHourly: false, timeSlot: 'FULL_DAY', startTime: null, endTime: null }),
    leave({ id: 110, startTime: '08:30', endTime: '09:00' }),
])[0];

const hourlyThenFullDay = applyAttendanceLeaveAdjustments([
    day('09:30', { checkOut: null }),
], [
    leave({ id: 110, startTime: '08:30', endTime: '09:00' }),
    leave({ id: 109, isHourly: false, timeSlot: 'FULL_DAY', startTime: null, endTime: null }),
])[0];

for (const adjustedDay of [fullDayThenHourly, hourlyThenFullDay]) {
    assert.equal(adjustedDay.isLate, false);
    assert.equal(adjustedDay.isIncomplete, false);
    assert.equal(adjustedDay.missingCheckIn, false);
    assert.equal(adjustedDay.missingCheckOut, false);
}

const halfMorningThenHourly = applyAttendanceLeaveAdjustments([
    day('09:30', { checkOut: '17:30', rawIsIncomplete: false, isIncomplete: false, missingCheckOut: false }),
], [
    leave({ id: 111, isHourly: false, timeSlot: 'HALF_MORNING', startTime: null, endTime: null }),
    leave({ id: 112, startTime: '08:30', endTime: '09:00' }),
])[0];

const hourlyThenHalfMorning = applyAttendanceLeaveAdjustments([
    day('09:30', { checkOut: '17:30', rawIsIncomplete: false, isIncomplete: false, missingCheckOut: false }),
], [
    leave({ id: 112, startTime: '08:30', endTime: '09:00' }),
    leave({ id: 111, isHourly: false, timeSlot: 'HALF_MORNING', startTime: null, endTime: null }),
])[0];

assert.equal(halfMorningThenHourly.isLate, false);
assert.equal(hourlyThenHalfMorning.isLate, false);

assert.deepEqual(
    listLeaveDates([
        leave({ id: 201, startDate: '2026-06-20', endDate: '2026-06-22', timeSlot: 'FULL_DAY', isHourly: false }),
        leave({ id: 202, startDate: '2026-06-19', endDate: '2026-06-19', timeSlot: 'FULL_DAY', isHourly: false }),
        leave({ id: 203, status: 'PENDING', startDate: '2026-06-18', endDate: '2026-06-18' }),
        leave({ id: 204, startDate: '2026-06-21', endDate: '2026-06-21', timeSlot: 'FULL_DAY', isHourly: false }),
    ]),
    ['2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22']
);

assert.deepEqual(
    listLeaveDatesForRange([
        leave({
            id: 205,
            startDate: '2026-06-18',
            endDate: '2026-06-22',
            timeSlot: 'FULL_DAY',
            isHourly: false,
        }),
    ], '2026-06-21', '2026-07-20'),
    ['2026-06-21', '2026-06-22']
);
console.log('attendance leave adjustment tests passed');
