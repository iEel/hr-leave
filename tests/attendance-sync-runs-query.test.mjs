import assert from 'node:assert/strict';

import { parseSyncRunsQuery } from '../src/lib/attendance/sync-runs-query.ts';

{
    const query = parseSyncRunsQuery(new URLSearchParams());

    assert.equal(query.page, 1);
    assert.equal(query.limit, 20);
    assert.equal(query.offset, 0);
    assert.equal(query.deviceId, null);
    assert.equal(query.mode, null);
    assert.equal(query.status, null);
    assert.equal(query.periodDays, null);
}

{
    const query = parseSyncRunsQuery(new URLSearchParams({
        page: '3',
        limit: '50',
        deviceId: '12',
        mode: 'BACKFILL',
        status: 'FAILED',
        periodDays: '30',
    }));

    assert.equal(query.page, 3);
    assert.equal(query.limit, 50);
    assert.equal(query.offset, 100);
    assert.equal(query.deviceId, 12);
    assert.equal(query.mode, 'BACKFILL');
    assert.equal(query.status, 'FAILED');
    assert.equal(query.periodDays, 30);
}

{
    const query = parseSyncRunsQuery(new URLSearchParams({
        page: '-8',
        limit: '500',
        deviceId: 'not-a-device',
        mode: 'DROP TABLE AttendanceSyncRuns',
        status: 'UNKNOWN',
        periodDays: '3650',
    }));

    assert.equal(query.page, 1);
    assert.equal(query.limit, 20);
    assert.equal(query.offset, 0);
    assert.equal(query.deviceId, null);
    assert.equal(query.mode, null);
    assert.equal(query.status, null);
    assert.equal(query.periodDays, null);
}

console.log('attendance sync runs query tests passed');
