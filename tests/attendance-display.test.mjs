import assert from 'node:assert/strict';

import { getAttendanceRowDisplay } from '../src/lib/attendance/display.ts';

assert.deepEqual(
    getAttendanceRowDisplay({
        checkIn: '08:59',
        checkOut: '17:17',
        isLate: true,
        lateAfterTime: '08:45',
        effectiveLateAfterTime: '08:45',
        missingCheckIn: false,
        missingCheckOut: false,
        adjustedByApprovedLeave: false,
    }),
    {
        checkInText: '08:59',
        checkOutText: '17:17',
        checkInTone: 'late',
        checkOutTone: 'normal',
        lateMinutes: 14,
        statusLabel: 'สาย',
    }
);

assert.deepEqual(
    getAttendanceRowDisplay({
        checkIn: null,
        checkOut: '18:35',
        isLate: false,
        lateAfterTime: '08:45',
        effectiveLateAfterTime: '08:45',
        missingCheckIn: true,
        missingCheckOut: false,
        adjustedByApprovedLeave: false,
    }),
    {
        checkInText: 'ไม่ได้บันทึกเข้า',
        checkOutText: '18:35',
        checkInTone: 'missing',
        checkOutTone: 'normal',
        lateMinutes: null,
        statusLabel: null,
    }
);

assert.deepEqual(
    getAttendanceRowDisplay({
        checkIn: '08:43',
        checkOut: null,
        isLate: false,
        lateAfterTime: '08:45',
        effectiveLateAfterTime: '08:45',
        missingCheckIn: false,
        missingCheckOut: true,
        adjustedByApprovedLeave: false,
    }),
    {
        checkInText: '08:43',
        checkOutText: 'ไม่ได้บันทึกออก',
        checkInTone: 'normal',
        checkOutTone: 'missing',
        lateMinutes: null,
        statusLabel: null,
    }
);

assert.deepEqual(
    getAttendanceRowDisplay({
        checkIn: '08:45',
        checkOut: '18:00',
        isLate: false,
        lateAfterTime: '08:45',
        effectiveLateAfterTime: '08:45',
        missingCheckIn: false,
        missingCheckOut: false,
        adjustedByApprovedLeave: false,
    }),
    {
        checkInText: '08:45',
        checkOutText: '18:00',
        checkInTone: 'normal',
        checkOutTone: 'normal',
        lateMinutes: null,
        statusLabel: null,
    }
);

assert.deepEqual(
    getAttendanceRowDisplay({
        checkIn: '09:01',
        checkOut: '17:00',
        isLate: true,
        lateAfterTime: '08:45',
        effectiveLateAfterTime: '09:00',
        missingCheckIn: false,
        missingCheckOut: false,
        adjustedByApprovedLeave: false,
    }),
    {
        checkInText: '09:01',
        checkOutText: '17:00',
        checkInTone: 'late',
        checkOutTone: 'normal',
        lateMinutes: 1,
        statusLabel: 'สาย',
    }
);

console.log('attendance display tests passed');
