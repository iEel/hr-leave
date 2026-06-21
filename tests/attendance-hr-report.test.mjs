import assert from 'node:assert/strict';

import {
    filterHrAttendanceRows,
    formatHrAttendanceCsv,
} from '../src/lib/attendance/hr-report.ts';

function row(overrides = {}) {
    return {
        date: '2026-06-18',
        userId: 1,
        employeeId: 'E001',
        employeeName: 'สมชาย ใจดี',
        company: 'ACME',
        department: 'HR',
        checkIn: '08:50',
        checkOut: '17:10',
        scanCount: 2,
        scheduledStartTime: '08:30',
        scheduledEndTime: '17:00',
        lateAfterTime: '08:45',
        effectiveLateAfterTime: '08:45',
        rawIsLate: true,
        rawIsIncomplete: false,
        isLate: true,
        isIncomplete: false,
        missingCheckIn: false,
        missingCheckOut: false,
        adjustedByApprovedLeave: false,
        finalStatus: 'สาย',
        leaveRequestId: null,
        leaveRequestNo: null,
        leaveType: null,
        leaveAdjustmentLabel: null,
        relatedLeaveRequests: [],
        ...overrides,
    };
}

const rows = [
    row({ employeeId: 'E001', isLate: true, finalStatus: 'สาย' }),
    row({
        employeeId: 'E002',
        isLate: false,
        rawIsLate: true,
        adjustedByApprovedLeave: true,
        finalStatus: 'ไม่คิดสายจากใบลา',
        leaveRequestId: 123,
        leaveRequestNo: 'LR-2026-000123',
        leaveType: 'ลากิจ',
        leaveAdjustmentLabel: 'ลากิจ 2026-06-18 08:30-09:00',
    }),
    row({
        employeeId: 'E003',
        isLate: false,
        isIncomplete: true,
        rawIsLate: false,
        rawIsIncomplete: true,
        missingCheckOut: true,
        finalStatus: 'ข้อมูลไม่ครบ',
    }),
    row({
        employeeId: 'E004',
        scanCount: 0,
        checkIn: null,
        checkOut: null,
        isLate: false,
        isIncomplete: true,
        rawIsLate: false,
        rawIsIncomplete: true,
        missingCheckIn: true,
        missingCheckOut: true,
        finalStatus: 'ไม่พบข้อมูล HIP',
    }),
];

assert.deepEqual(
    filterHrAttendanceRows(rows, 'ADJUSTED_BY_LEAVE').map((filteredRow) => filteredRow.employeeId),
    ['E002']
);

assert.deepEqual(
    filterHrAttendanceRows(rows, 'LATE').map((filteredRow) => filteredRow.employeeId),
    ['E001']
);

assert.deepEqual(
    filterHrAttendanceRows(rows, 'INCOMPLETE').map((filteredRow) => filteredRow.employeeId),
    ['E003']
);

assert.deepEqual(
    filterHrAttendanceRows(rows, 'NO_HIP_DATA').map((filteredRow) => filteredRow.employeeId),
    ['E004']
);

const csv = formatHrAttendanceCsv(rows);

assert.equal(csv.startsWith('\uFEFF'), true);
assert.equal(csv.includes('leaveRequestNo'), true);
assert.equal(csv.includes('LR-2026-000123'), true);
assert.equal(csv.includes('ไม่คิดสายจากใบลา'), true);

console.log('attendance HR report tests passed');
