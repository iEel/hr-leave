import assert from 'node:assert/strict';
import { canViewMedicalCertificateFile } from '../src/lib/medical-file-access.ts';

const owner = { userId: 10, managerId: 20 };

assert.equal(
    canViewMedicalCertificateFile({ userId: 10, role: 'EMPLOYEE', isHRStaff: false }, owner),
    true,
    'the leave owner can view their own medical file'
);

assert.equal(
    canViewMedicalCertificateFile({ userId: 20, role: 'MANAGER', isHRStaff: false }, owner),
    true,
    'the direct manager can view a subordinate medical file'
);

assert.equal(
    canViewMedicalCertificateFile({ userId: 30, role: 'HR', isHRStaff: false }, owner),
    true,
    'HR can view medical files'
);

assert.equal(
    canViewMedicalCertificateFile({ userId: 31, role: 'ADMIN', isHRStaff: false }, owner),
    true,
    'Admin can view medical files'
);

assert.equal(
    canViewMedicalCertificateFile({ userId: 32, role: 'EMPLOYEE', isHRStaff: true }, owner),
    true,
    'HR staff can view medical files'
);

assert.equal(
    canViewMedicalCertificateFile({ userId: 40, role: 'EMPLOYEE', isHRStaff: false, delegatingManagerIds: [20] }, owner),
    true,
    'an active delegate for the direct manager can view medical files'
);

assert.equal(
    canViewMedicalCertificateFile({ userId: 50, role: 'MANAGER', isHRStaff: false }, owner),
    false,
    'an unrelated manager cannot view medical files'
);

assert.equal(
    canViewMedicalCertificateFile({ userId: 51, role: 'EMPLOYEE', isHRStaff: false, delegatingManagerIds: [99] }, owner),
    false,
    'a delegate for another manager cannot view medical files'
);

console.log('medical file access tests passed');
