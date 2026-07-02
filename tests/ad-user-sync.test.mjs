import assert from 'node:assert/strict';

import {
    buildArchivedAdUsername,
    buildArchivedEmail,
    decideAdUserSyncAction,
} from '../src/lib/auth/ad-user-sync.ts';

const inactiveOldEmployee = {
    id: 165,
    employeeId: '1001',
    email: 'uearuedee.p@glinkthai.com',
    adUsername: 'uearuedee.p',
    isActive: false,
    adStatus: 'AD_DELETED',
};

const incomingRehire = {
    employeeId: '8304',
    email: 'uearuedee.p@glinkthai.com',
    adUsername: 'uearuedee.p',
};

const rehireDecision = decideAdUserSyncAction(incomingRehire, [inactiveOldEmployee]);

assert.equal(rehireDecision.action, 'insert');
assert.deepEqual(
    rehireDecision.conflictsToRelease.map((user) => user.employeeId),
    ['1001']
);
assert.deepEqual(rehireDecision.blockedConflicts, []);
assert.equal(buildArchivedEmail(inactiveOldEmployee), 'archived-1001-165@local.invalid');
assert.equal(buildArchivedAdUsername(inactiveOldEmployee), 'uearuedee.p#archived#1001#165');

const exactActiveEmployee = {
    id: 301,
    employeeId: '8304',
    email: 'uearuedee.p@glinkthai.com',
    adUsername: 'uearuedee.p',
    isActive: true,
    adStatus: 'ACTIVE',
};

const updateDecision = decideAdUserSyncAction(incomingRehire, [exactActiveEmployee]);

assert.equal(updateDecision.action, 'update');
assert.equal(updateDecision.user?.employeeId, '8304');
assert.deepEqual(updateDecision.conflictsToRelease, []);

const activeDifferentEmployee = {
    id: 200,
    employeeId: '9000',
    email: 'uearuedee.p@glinkthai.com',
    adUsername: 'someone.active',
    isActive: true,
    adStatus: 'ACTIVE',
};

const blockedDecision = decideAdUserSyncAction(incomingRehire, [activeDifferentEmployee]);

assert.equal(blockedDecision.action, 'blocked');
assert.deepEqual(
    blockedDecision.blockedConflicts.map((user) => user.employeeId),
    ['9000']
);

console.log('ad user sync tests passed');
