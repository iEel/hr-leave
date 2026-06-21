import assert from 'node:assert/strict';

import { formatLeaveRequestNo } from '../src/lib/leave-request-number.ts';

assert.equal(formatLeaveRequestNo({ id: 123, createdAt: '2026-06-21' }), 'LR-2026-000123');
assert.equal(formatLeaveRequestNo({ id: 7, createdAt: new Date('2025-12-30T10:00:00+07:00') }), 'LR-2025-000007');
assert.equal(formatLeaveRequestNo({ id: 42, createdAt: null }), 'LR-0000-000042');
assert.equal(formatLeaveRequestNo({ id: 42, createdAt: '2026-not-a-date' }), 'LR-0000-000042');
assert.equal(formatLeaveRequestNo({ id: 42, createdAt: '2026-99-99' }), 'LR-0000-000042');
assert.equal(formatLeaveRequestNo({ id: 42, createdAt: '2026-02-30' }), 'LR-0000-000042');
assert.equal(formatLeaveRequestNo({ id: 42, createdAt: '2026-04-31' }), 'LR-0000-000042');

console.log('leave request number tests passed');
