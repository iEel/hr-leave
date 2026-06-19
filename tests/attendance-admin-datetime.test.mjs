import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const syncRunsRoute = await readFile('src/app/api/admin/attendance/sync-runs/route.ts', 'utf8');
const attendanceRepository = await readFile('src/lib/attendance/repository.ts', 'utf8');

assert.match(
    syncRunsRoute,
    /CONVERT\(varchar\(19\),\s*sr\.startedAt,\s*126\)\s+AS\s+startedAt/,
    'sync run startedAt must be returned as a SQL local datetime string, not a UTC Date object'
);

assert.match(
    syncRunsRoute,
    /CONVERT\(varchar\(19\),\s*sr\.finishedAt,\s*126\)\s+AS\s+finishedAt/,
    'sync run finishedAt must be returned as a SQL local datetime string, not a UTC Date object'
);

assert.match(
    attendanceRepository,
    /CONVERT\(varchar\(19\),\s*lastSyncAt,\s*126\)\s+AS\s+lastSyncAt/,
    'attendance device lastSyncAt must be returned as a SQL local datetime string'
);

assert.match(
    attendanceRepository,
    /CONVERT\(varchar\(19\),\s*nextSyncAt,\s*126\)\s+AS\s+nextSyncAt/,
    'attendance device nextSyncAt must be returned as a SQL local datetime string'
);

console.log('attendance admin datetime tests passed');
