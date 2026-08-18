import assert from 'node:assert/strict';

import {
    getLeaveAttachmentPresentation,
    hasStoredLeaveAttachment,
} from '../src/lib/leave-attachments.ts';

const personalAttachment = getLeaveAttachmentPresentation('PERSONAL', false);
assert.deepEqual(personalAttachment, {
    isVisible: true,
    isRequired: false,
    needsConfirmation: false,
    sectionTitle: 'เอกสารประกอบการลา',
    uploadLabel: 'แนบเอกสารประกอบการลา (ไม่บังคับ)',
    viewLabel: 'ดูเอกสารประกอบการลา',
});

const optionalSickCertificate = getLeaveAttachmentPresentation('SICK', false);
assert.equal(optionalSickCertificate.isVisible, true);
assert.equal(optionalSickCertificate.isRequired, false);
assert.equal(optionalSickCertificate.needsConfirmation, true);
assert.equal(optionalSickCertificate.sectionTitle, 'ใบรับรองแพทย์');
assert.equal(optionalSickCertificate.viewLabel, 'ดูใบรับรองแพทย์');

const requiredSickCertificate = getLeaveAttachmentPresentation('SICK', true);
assert.equal(requiredSickCertificate.isRequired, true);
assert.equal(requiredSickCertificate.sectionTitle, 'ใบรับรองแพทย์');

const vacationAttachment = getLeaveAttachmentPresentation('VACATION', false);
assert.equal(vacationAttachment.isVisible, false);

assert.equal(hasStoredLeaveAttachment(false, null), false);
assert.equal(hasStoredLeaveAttachment(false, '/api/files/medical/personal.pdf'), true);
assert.equal(hasStoredLeaveAttachment(true, null), true);

console.log('leave attachment tests passed');
