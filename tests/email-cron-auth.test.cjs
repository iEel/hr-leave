/* eslint-disable @typescript-eslint/no-require-imports -- Node CLI test. */
const assert = require('node:assert/strict');
const path = require('node:path');
const jiti = require('jiti').createJiti(__filename, { alias: { '@': path.join(__dirname, '../src') } });
(async () => {
    const { POST } = await jiti.import('../src/app/api/cron/email-delivery/route.ts');
    const previous = process.env.CRON_SECRET;
    try {
        for (const [configured, provided] of [[undefined, ''], ['secret', ''], ['secret', 'wrong!'], ['secret', 'longer-secret'], ['secret', '秘密']]) {
            if (configured === undefined) delete process.env.CRON_SECRET;
            else process.env.CRON_SECRET = configured;
            const response = await POST({ headers: { get: () => provided } });
            assert.equal(response.status, 401);
        }
    } finally {
        if (previous === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = previous;
    }
    console.log('Email cron rejects missing, wrong, and malformed secrets');
})().catch(error => { console.error(error); process.exitCode = 1; });
