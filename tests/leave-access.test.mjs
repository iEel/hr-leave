import assert from 'node:assert/strict';

import { canViewLeaveDetail } from '../src/lib/leave-access.ts';

const owner = { userId: 10, managerId: 20 };

assert.equal(canViewLeaveDetail({ userId: 10, role: 'EMPLOYEE' }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 30, role: 'HR' }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 31, role: 'ADMIN' }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 32, role: 'EMPLOYEE', isHRStaff: true }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 20, role: 'MANAGER' }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 40, role: 'EMPLOYEE', delegatingManagerIds: [20] }, owner), true);
assert.equal(canViewLeaveDetail({ userId: 50, role: 'MANAGER', delegatingManagerIds: [99] }, owner), false);
assert.equal(canViewLeaveDetail({ userId: 60, role: 'EMPLOYEE' }, owner), false);

console.log('leave access tests passed');
