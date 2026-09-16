/* eslint-disable @typescript-eslint/no-require-imports -- Opt-in SQL integration check. */
// No SMTP calls. Temporary integration rows are removed in finally.
if (process.env.EMAIL_OUTBOX_SQL_TEST !== '1') throw new Error('Set EMAIL_OUTBOX_SQL_TEST=1 explicitly');
process.env.NODE_ENV = 'production';
require('@next/env').loadEnvConfig(process.cwd());
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const jiti = require('jiti').createJiti(__filename);
(async () => {
    const { getPool, closeConnection, sql } = await jiti.import('../src/lib/db.ts');
    const { enqueueEmail, claimEmail, finishEmail } = await jiti.import('../src/lib/email-outbox.ts');
    const pool = await getPool();
    const fixture = (await pool.request().query('SELECT TOP (1) id FROM LeaveRequests ORDER BY id DESC')).recordset[0];
    assert.ok(fixture, 'requires one existing leave to exercise eligibility checks');
    const key = `integration:${randomUUID()}`;
    const mail = { dedupeKey: key, leaveId: fixture.id, kind: 'REQUEST', expectedLeaveStatus: 'PENDING',
        recipient: 'integration@invalid.example', subject: 'SQL integration fixture - never sent', html: 'not a real message' };
    try {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const first = await enqueueEmail(mail, tx);
            assert.equal(await enqueueEmail(mail, tx), first, 'dedupe is stable inside leave transaction');
            const state = await new sql.Request(tx).query('SELECT @@TRANCOUNT AS count');
            assert.equal(state.recordset[0].count, 1, 'enqueue must not commit the outer leave transaction');
        } finally { await tx.rollback(); }
        const after = await pool.request().input('key', key).query('SELECT id FROM EmailOutbox WHERE dedupeKey=@key');
        assert.equal(after.recordset.length, 0, 'rolling back leave also removes queued mail');

        const ids = await Promise.all([enqueueEmail(mail), enqueueEmail(mail)]);
        assert.equal(ids[0], ids[1], 'concurrent enqueue creates only one job');
        const claimed = await Promise.all([claimEmail(ids[0]), claimEmail(ids[0])]);
        const jobs = claimed.filter(Boolean);
        assert.equal(jobs.length, 1, 'only one worker can claim a due job');
        assert.equal(jobs[0].eligible, false, 'unmapped recipient cannot receive a leave link');
        await finishEmail(jobs[0], { status: 'PENDING', retryMinutes: 1, error: 'INTEGRATION_RETRY' });
        assert.equal(await claimEmail(ids[0]), null, 'future retry cannot be claimed yet');
        await pool.request().input('id', ids[0]).query('UPDATE EmailOutbox SET nextAttemptAt=SYSUTCDATETIME() WHERE id=@id');
        const second = await claimEmail(ids[0]);
        assert.equal(second.attemptCount, 2);
        await finishEmail(jobs[0], { status: 'SMTP_ACCEPTED' });
        const beforeFinish = await pool.request().input('id', ids[0]).query('SELECT status FROM EmailOutbox WHERE id=@id');
        assert.equal(beforeFinish.recordset[0].status, 'SENDING', 'stale claim token cannot finalize another worker job');
        await finishEmail(second, { status: 'SKIPPED', error: 'INTEGRATION_COMPLETE' });
        const final = await pool.request().input('id', ids[0]).query('SELECT status,html FROM EmailOutbox WHERE id=@id; SELECT attemptNumber,status FROM EmailDeliveryAttempts WHERE outboxId=@id ORDER BY attemptNumber');
        assert.equal(final.recordsets[0][0].status, 'SKIPPED');
        assert.equal(final.recordsets[0][0].html, null, 'terminal jobs remove embedded link content');
        assert.deepEqual(final.recordsets[1], [{ attemptNumber: 1, status: 'PENDING' }, { attemptNumber: 2, status: 'SKIPPED' }]);
        console.log('SQL outbox integration passed: rollback, dedupe, concurrency, eligibility, backoff, claims, history, token cleanup');
    } finally {
        await pool.request().input('key', key).query(`
            DELETE a FROM EmailDeliveryAttempts a JOIN EmailOutbox o ON o.id=a.outboxId WHERE o.dedupeKey=@key;
            DELETE FROM EmailOutbox WHERE dedupeKey=@key;
        `);
        await closeConnection();
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
