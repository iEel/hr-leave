/* eslint-disable @typescript-eslint/no-require-imports -- Operational CLI runs on Node 20 with jiti. */
// Default is read-only. --send authorizes exactly one pending leave/manager email.
process.env.NODE_ENV = 'production';
require('@next/env').loadEnvConfig(process.cwd());
const { createJiti } = require('jiti');
const jiti = createJiti(__filename, { alias: { '@': require('node:path').join(process.cwd(), 'src') } });

(async () => {
    const id = Number(process.argv[2]);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Usage: node scripts/recover-leave-email.cjs <leave-id> [--send]');
    const { getPool, closeConnection, sql } = await jiti.import('../src/lib/db.ts');
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let committed = false;
    let jobId;
    try {
        const rows = await new sql.Request(transaction).input('id', sql.Int, id).query(`
            SELECT l.id,l.leaveType,l.reason,l.usageAmount,l.timeSlot,l.isHourly,l.startTime,l.endTime,
                CONVERT(varchar(10),l.startDatetime,23) AS startDate,
                CONVERT(varchar(10),l.endDatetime,23) AS endDate,
                l.status,u.employeeId,u.firstName+' '+u.lastName AS employeeName,
                m.id AS managerId,m.firstName+' '+m.lastName AS managerName,m.email AS managerEmail
            FROM LeaveRequests l WITH (UPDLOCK,HOLDLOCK)
            JOIN Users u ON u.id=l.userId LEFT JOIN Users m ON m.id=u.departmentHeadId AND m.isActive=1
            WHERE l.id=@id;
        `);
        const leave = rows.recordset[0];
        if (!leave || leave.status !== 'PENDING') throw new Error('Leave is missing or no longer pending');
        if (!leave.managerId || !leave.managerEmail) throw new Error('No active manager with an email address');
        console.log(JSON.stringify({ leaveId: id, employeeId: leave.employeeId, status: leave.status,
            recipient: leave.managerEmail, startDate: leave.startDate, send: process.argv.includes('--send') }));
        if (process.argv.includes('--send')) {
            const { sendLeaveRequestEmail } = await jiti.import('../src/lib/email.ts');
            jobId = await sendLeaveRequestEmail(leave.managerEmail, leave.managerName, leave.employeeName, {
                id, type: leave.leaveType, startDate: leave.startDate, endDate: leave.endDate,
                reason: leave.reason, days: leave.usageAmount, timeSlot: leave.timeSlot,
                isHourly: leave.isHourly, startTime: leave.startTime, endTime: leave.endTime,
            }, leave.managerId, transaction, 'recovery-2026-09-16');
            await transaction.commit();
            committed = true;
        }
    } finally {
        if (!committed) await transaction.rollback();
    }
    if (jobId) {
        const { processEmailOutbox } = await jiti.import('../src/lib/email-worker.ts');
        console.log(JSON.stringify({ jobId, results: await processEmailOutbox(jobId) }));
        const result = await pool.request().input('id', sql.Int, jobId).query(
            'SELECT id,leaveId,status,attemptCount,messageId,smtpResponse,lastError,acceptedAt FROM dbo.EmailOutbox WHERE id=@id');
        console.log(JSON.stringify(result.recordset));
        if (result.recordset[0]?.status !== 'SMTP_ACCEPTED') process.exitCode = 2;
    }
    await closeConnection();
})().catch(error => {
    console.error(error.code || error.message);
    process.exitCode = 1;
});
