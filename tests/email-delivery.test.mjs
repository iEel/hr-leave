import assert from 'node:assert/strict';
import { classifyDeliveryError, deliverEmailJob } from '../src/lib/email-delivery.ts';

const job = { id: 1, leaveId: 3239, kind: 'REQUEST', recipient: 'manager@example.com', subject: 'Request', html: '<p>Request</p>', messageId: '<job-1@example.com>', attemptCount: 1, eligible: true, expired: false };
const network = Object.assign(new Error('Network unreachable'), { code: 'ESOCKET', command: 'CONN' });
assert.equal(classifyDeliveryError(network, 1).status, 'PENDING');
assert.equal(classifyDeliveryError(network, 1).retryMinutes, 1);
assert.equal(classifyDeliveryError(network, 5).status, 'FAILED');
assert.equal(classifyDeliveryError({ responseCode: 451, command: 'DATA' }, 2).retryMinutes, 5);
assert.equal(classifyDeliveryError({ responseCode: 550, command: 'RCPT TO' }, 1).status, 'FAILED');
assert.equal(classifyDeliveryError({ code: 'EAUTH', responseCode: 535 }, 1).status, 'FAILED');
assert.equal(classifyDeliveryError({ code: 'ETIMEDOUT', command: 'DATA' }, 1).status, 'UNCERTAIN');
assert.equal(classifyDeliveryError({ code: 'ESOCKET' }, 1).status, 'UNCERTAIN');

let sent = 0;
const send = async message => { sent++; assert.equal(message.messageId, '<job-1@example.com>'); return { accepted: ['manager@example.com'], rejected: [], messageId: message.messageId, response: '250 queued' }; };
assert.equal((await deliverEmailJob(job, send)).status, 'SMTP_ACCEPTED');
assert.equal(sent, 1);
assert.equal((await deliverEmailJob({ ...job, eligible: false }, send)).status, 'SKIPPED');
assert.equal((await deliverEmailJob({ ...job, expired: true }, send)).status, 'FAILED');
assert.equal((await deliverEmailJob({ ...job, recipient: 'one@example.com,two@example.com' }, send)).status, 'FAILED');
assert.equal(sent, 1, 'stale/expired/invalid jobs must never reach SMTP');
assert.equal((await deliverEmailJob(job, async () => { throw network; })).status, 'PENDING');
assert.equal((await deliverEmailJob(job, async () => ({ accepted: [], rejected: ['manager@example.com'], response: '550 rejected' }))).status, 'FAILED');
console.log('Email delivery policy and worker behavior tests passed');
