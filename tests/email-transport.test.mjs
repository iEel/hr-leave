import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import nodemailer from 'nodemailer';
import { buildSmtpTransportOptions, sendSmtpEmail, verifySmtpConnection } from '../src/lib/email-transport.ts';
const env = { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_USER: 'test-user', SMTP_PASS: 'test-password' };
const resolveA = async (hostname) => {
    assert.equal(hostname, 'smtp.example.test');
    return ['192.0.2.10', '192.0.2.11'];
};
const options = await buildSmtpTransportOptions(env, 1, resolveA);
assert.equal(options.host, '192.0.2.10');
assert.equal((await buildSmtpTransportOptions(env, 2, resolveA)).host, '192.0.2.11');
assert.equal((await buildSmtpTransportOptions(env, 3, resolveA)).host, '192.0.2.10');
assert.equal(options.tls.servername, 'smtp.example.test');
assert.equal(options.tls.rejectUnauthorized, true);
assert.equal(options.requireTLS, true);
assert.equal(options.secure, false);
for (const key of ['connectionTimeout', 'greetingTimeout', 'socketTimeout']) {
    assert.ok(options[key] > 0 && options[key] <= 30_000, `${key} must be bounded`);
}
const literal = await buildSmtpTransportOptions({ ...env, SMTP_HOST: '127.0.0.1' }, 1, async () => {
    assert.fail('IPv4 literals must bypass DNS');
});
assert.equal(literal.host, '127.0.0.1');
assert.equal((await buildSmtpTransportOptions({ ...env, SMTP_PORT: '465' }, 1, resolveA)).secure, true);
for (const invalidEnv of [
    { ...env, SMTP_HOST: '::1' }, { ...env, SMTP_HOST: '' },
    { ...env, SMTP_PORT: 'NaN' }, { ...env, SMTP_USER: '' }, { ...env, SMTP_PASS: '' },
]) {
    await assert.rejects(buildSmtpTransportOptions(invalidEnv), { code: 'ESMTP_CONFIG' });
}
await assert.rejects(buildSmtpTransportOptions(env, 1, async () => []), { code: 'EDNS', command: 'CONN', message: /IPv4/i });
await assert.rejects(buildSmtpTransportOptions(env, 1, async () => ['::1']), { code: 'EDNS', command: 'CONN', message: /IPv4/i });
await assert.rejects(buildSmtpTransportOptions(env, 1, async () => { throw new Error('DNS private host details'); }), (error) => {
    assert.equal(error.code, 'EDNS');
    assert.equal(error.command, 'CONN');
    assert.doesNotMatch(error.message, /private host details/);
    return true;
});
await assert.rejects(buildSmtpTransportOptions(env, 1, () => new Promise(() => {})), { code: 'EDNS', command: 'CONN', message: /DNS.*timed out/i });

// The local SMTP server gives real protocol acceptance/rejection without credentials or external mail.
const sockets = new Set();
const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('220 test SMTP\r\n');
    let buffer = '';
    let receivingData = false;
    socket.on('data', (data) => {
        buffer += data;
        let end;
        while ((end = buffer.indexOf('\r\n')) !== -1) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (receivingData) {
                if (line === '.') { receivingData = false; socket.write('250 queued for delivery\r\n'); }
            } else if (/^EHLO|^HELO/.test(line)) socket.write('250 localhost\r\n');
            else if (/^STARTTLS/.test(line)) socket.write('454 TLS unavailable\r\n');
            else if (/^RCPT TO:.*reject@/.test(line)) socket.write('550 recipient rejected\r\n');
            else if (/^DATA/.test(line)) { receivingData = true; socket.write('354 send message\r\n'); }
            else if (/^QUIT/.test(line)) socket.end('221 bye\r\n');
            else socket.write('250 OK\r\n');
        }
    });
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const originalEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
try {
    const localEnv = { ...env, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.address().port) };
    Object.assign(process.env, localEnv);
    await assert.rejects(verifySmtpConnection(), /TLS|STARTTLS/i);
    await assert.rejects(sendSmtpEmail({ from: 'sender@example.test', to: 'accepted@example.test', text: 'test' }), /TLS|STARTTLS/i);
    // Only this isolated protocol fixture opts out of TLS/auth; production entry points cannot.
    const localOptions = await buildSmtpTransportOptions(localEnv);
    const client = nodemailer.createTransport({ ...localOptions, requireTLS: false, auth: undefined });
    try {
        const sent = await client.sendMail({ from: 'sender@example.test', to: 'accepted@example.test', text: 'test' });
        assert.deepEqual(sent.accepted, ['accepted@example.test']);
        await assert.rejects(client.sendMail({ from: 'sender@example.test', to: 'reject@example.test', text: 'test' }), /550/);
    } finally { client.close(); }
} finally {
    for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
}
console.log('email transport tests passed');
