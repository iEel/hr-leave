import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app/(dashboard)/hr/reports/page.tsx', 'utf8');

assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(activeTab !== 'ATTENDANCE'\) return;\s*fetchAttendanceReport\(\);\s*\}, \[activeTab, fetchAttendanceReport\]\);/s,
    'attendance report should automatically reload when the active attendance filters change'
);

console.log('HR reports attendance filter UI guard passed');
