import assert from 'node:assert/strict';

import { summarizeDailyAttendanceRows } from '../src/lib/attendance/repository.ts';

assert.deepEqual(
    summarizeDailyAttendanceRows([
        { attendanceDate: '2026-06-18', recordTime: '15:53:54' },
        { attendanceDate: '2026-06-18', recordTime: '08:31:12' },
    ]),
    [{ date: '2026-06-18', checkIn: '08:31', checkOut: '15:53' }]
);

assert.deepEqual(
    summarizeDailyAttendanceRows([
        { attendanceDate: '2026-06-19', recordTime: '08:44:01' },
    ]),
    [{ date: '2026-06-19', checkIn: '08:44', checkOut: null }]
);

assert.deepEqual(summarizeDailyAttendanceRows([]), []);

console.log('attendance summary tests passed');
