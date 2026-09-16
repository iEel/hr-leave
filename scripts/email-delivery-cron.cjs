/* eslint-disable @typescript-eslint/no-require-imports -- Operational CLI runs on Node 20 without a TS loader. */
// Run once a minute from the app directory; never put CRON_SECRET in crontab.
process.env.NODE_ENV = 'production';
require('@next/env').loadEnvConfig(process.cwd());
(async () => {
    if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET is not configured');
    const response = await fetch('http://127.0.0.1:3002/api/cron/email-delivery', {
        method: 'POST',
        headers: { 'x-cron-secret': process.env.CRON_SECRET },
        signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Email worker HTTP ${response.status}`);
    const result = await response.json();
    if (result.results?.length) console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...result }));
})().catch(error => {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: error.message }));
    process.exitCode = 1;
});
