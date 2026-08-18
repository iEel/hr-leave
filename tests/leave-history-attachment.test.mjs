import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { jsx: { runtime: 'automatic' } });
const { LeaveAttachmentLink } = await jiti.import(
    '../src/components/leave/LeaveAttachmentLink.tsx',
);

const personalMarkup = renderToStaticMarkup(
    React.createElement(LeaveAttachmentLink, {
        leaveType: 'PERSONAL',
        fileUrl: '/api/files/medical/personal-document.pdf',
    }),
);

assert.match(personalMarkup, /href="\/api\/files\/medical\/personal-document\.pdf"/);
assert.match(personalMarkup, /ดูเอกสารประกอบการลา/);
assert.match(personalMarkup, /target="_blank"/);

const sickMarkup = renderToStaticMarkup(
    React.createElement(LeaveAttachmentLink, {
        leaveType: 'SICK',
        fileUrl: '/api/files/medical/sick-certificate.pdf',
    }),
);

assert.match(sickMarkup, /ดูใบรับรองแพทย์/);

const emptyMarkup = renderToStaticMarkup(
    React.createElement(LeaveAttachmentLink, {
        leaveType: 'PERSONAL',
        fileUrl: null,
    }),
);

assert.equal(emptyMarkup, '');

console.log('leave history attachment tests passed');
