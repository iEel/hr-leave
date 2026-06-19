import assert from 'node:assert/strict';

import { findCompletedBackfillRun } from '../src/lib/attendance/admin-ui.ts';

const requestStartedAt = new Date('2026-06-19T10:00:00');

const runs = [
    {
        id: 90,
        deviceId: 2,
        mode: 'BACKFILL',
        status: 'SUCCESS',
        startedAt: '2026-06-19T10:03:00',
        errorMessage: null,
    },
    {
        id: 89,
        deviceId: 1,
        mode: 'BACKFILL',
        status: 'SUCCESS',
        startedAt: '2026-06-19T09:00:00',
        errorMessage: null,
    },
    {
        id: 88,
        deviceId: 1,
        mode: 'INCREMENTAL',
        status: 'SUCCESS',
        startedAt: '2026-06-19T10:01:00',
        errorMessage: null,
    },
    {
        id: 87,
        deviceId: 1,
        mode: 'BACKFILL',
        status: 'SUCCESS',
        startedAt: '2026-06-19T10:02:00',
        errorMessage: null,
    },
];

assert.equal(
    findCompletedBackfillRun(runs, 1, requestStartedAt)?.id,
    87,
    'should recover from a failed HTTP response when a new completed BACKFILL run exists'
);

assert.equal(
    findCompletedBackfillRun([
        {
            id: 91,
            deviceId: 1,
            mode: 'BACKFILL',
            status: 'RUNNING',
            startedAt: '2026-06-19T10:02:00',
            errorMessage: null,
        },
    ], 1, requestStartedAt),
    null,
    'running backfill should keep polling instead of reporting success'
);

assert.equal(
    findCompletedBackfillRun(runs, 1, new Date('2026-06-19T10:03:00')),
    null,
    'old completed backfill should not mask a new failed/timeout request'
);

console.log('attendance backfill UI recovery tests passed');
