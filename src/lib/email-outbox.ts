import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { getPool } from './db';
import type { DeliveryJob, DeliveryOutcome } from './email-delivery';

export interface QueuedEmail {
    dedupeKey: string;
    leaveId: number;
    kind: 'REQUEST' | 'RESULT';
    expectedLeaveStatus: string;
    recipient: string;
    approverId?: number;
    subject: string;
    html: string;
}

export async function enqueueEmail(email: QueuedEmail, transaction?: sql.Transaction): Promise<number> {
    const request = transaction ? new sql.Request(transaction) : (await getPool()).request();
    const result = await request
        .input('key', sql.NVarChar(250), email.dedupeKey)
        .input('leaveId', sql.Int, email.leaveId)
        .input('kind', sql.VarChar(10), email.kind)
        .input('expectedStatus', sql.VarChar(20), email.expectedLeaveStatus)
        .input('recipient', sql.NVarChar(320), email.recipient.trim())
        .input('approverId', sql.Int, email.approverId || null)
        .input('subject', sql.NVarChar(500), email.subject)
        .input('html', sql.NVarChar(sql.MAX), email.html)
        .input('messageId', sql.NVarChar(250), `<${randomUUID()}@hr-leave.local>`)
        .query(`
            SET XACT_ABORT ON;
            DECLARE @existing INT;
            BEGIN TRANSACTION;
            SELECT @existing = id FROM dbo.EmailOutbox WITH (UPDLOCK, HOLDLOCK) WHERE dedupeKey = @key;
            IF @existing IS NULL
            BEGIN
                INSERT INTO dbo.EmailOutbox(dedupeKey,leaveId,kind,expectedLeaveStatus,recipient,approverId,subject,html,messageId)
                VALUES(@key,@leaveId,@kind,@expectedStatus,@recipient,@approverId,@subject,@html,@messageId);
                SET @existing = SCOPE_IDENTITY();
            END;
            COMMIT TRANSACTION;
            SELECT @existing AS id;
        `);
    return result.recordset[0].id;
}

export interface ClaimedEmail extends DeliveryJob { claimToken: string }

export async function claimEmail(id?: number): Promise<ClaimedEmail | null> {
    const result = await (await getPool()).request()
        .input('id', sql.Int, id || null)
        .query(`
            ;WITH nextJob AS (
                SELECT TOP (1) * FROM dbo.EmailOutbox WITH (UPDLOCK, READPAST, ROWLOCK)
                WHERE status = 'PENDING' AND nextAttemptAt <= SYSUTCDATETIME()
                  AND (@id IS NULL OR id = @id)
                ORDER BY nextAttemptAt, id
            )
            UPDATE nextJob SET status='SENDING', attemptCount=attemptCount+1,
                claimToken=NEWID(), claimedAt=SYSUTCDATETIME(), updatedAt=SYSUTCDATETIME()
            OUTPUT INSERTED.*;
        `);
    const row = result.recordset[0];
    if (!row) return null;
    // Check current authorization and leave state immediately before SMTP.
    const check = await (await getPool()).request().input('id', sql.Int, row.id).query(`
        SELECT CASE WHEN l.status = o.expectedLeaveStatus AND (
            (o.kind = 'RESULT' AND LOWER(LTRIM(RTRIM(u.email))) = LOWER(o.recipient)) OR
            (o.kind = 'REQUEST' AND a.isActive = 1 AND LOWER(LTRIM(RTRIM(a.email))) = LOWER(o.recipient) AND (
                u.departmentHeadId = o.approverId OR (o.approverId <> u.id AND EXISTS (
                    SELECT 1 FROM DelegateApprovers d WHERE d.managerId = u.departmentHeadId
                    AND d.delegateUserId = o.approverId AND d.isActive=1
                    AND CAST(GETDATE() AS DATE) BETWEEN d.startDate AND d.endDate
                ))
            ))
        ) THEN 1 ELSE 0 END AS eligible,
        CASE WHEN o.createdAt < DATEADD(day,-6,SYSUTCDATETIME()) THEN 1 ELSE 0 END AS expired
        FROM dbo.EmailOutbox o JOIN LeaveRequests l ON l.id=o.leaveId
        JOIN Users u ON u.id=l.userId LEFT JOIN Users a ON a.id=o.approverId WHERE o.id=@id;
    `);
    return { ...row, eligible: !!check.recordset[0]?.eligible, expired: !!check.recordset[0]?.expired };
}

export async function finishEmail(job: Pick<ClaimedEmail, 'id' | 'claimToken' | 'attemptCount'>, outcome: DeliveryOutcome): Promise<void> {
    await (await getPool()).request()
        .input('id', sql.Int, job.id)
        .input('claim', sql.UniqueIdentifier, job.claimToken)
        .input('status', sql.VarChar(20), outcome.status)
        .input('attempt', sql.Int, job.attemptCount)
        .input('delay', sql.Int, outcome.retryMinutes || 0)
        .input('error', sql.NVarChar(1000), outcome.error || null)
        .input('response', sql.NVarChar(1000), outcome.response || null)
        .query(`
            SET XACT_ABORT ON;
            BEGIN TRANSACTION;
            UPDATE dbo.EmailOutbox SET status=@status, lastError=@error, smtpResponse=@response,
                nextAttemptAt=DATEADD(minute,@delay,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME(),
                acceptedAt=CASE WHEN @status='SMTP_ACCEPTED' THEN SYSUTCDATETIME() ELSE acceptedAt END,
                html=CASE WHEN @status='PENDING' THEN html ELSE NULL END,
                claimToken=NULL, claimedAt=NULL
            WHERE id=@id AND claimToken=@claim AND status='SENDING';
            IF @@ROWCOUNT = 1
            BEGIN
                INSERT INTO dbo.EmailDeliveryAttempts(outboxId,attemptNumber,status,error,smtpResponse)
                VALUES(@id,@attempt,@status,@error,@response);
                IF @status IN ('FAILED','UNCERTAIN')
                    INSERT INTO Notifications(userId,title,message,link,isRead)
                    SELECT u.id,N'ส่งอีเมลใบลาไม่สำเร็จ',
                        CONCAT(N'ใบลา ID ',o.leaveId,N' / Email job ',o.id,N': ',@status,N' — ',@error),
                        '/approvals',0
                    FROM Users u CROSS JOIN dbo.EmailOutbox o
                    WHERE u.role='ADMIN' AND u.isActive=1 AND o.id=@id;
            END;
            COMMIT TRANSACTION;
        `);
}

export async function recoverAbandonedEmails(): Promise<void> {
    const result = await (await getPool()).request().query(`
        SELECT id,claimToken,attemptCount FROM dbo.EmailOutbox
        WHERE status='SENDING' AND claimedAt < DATEADD(minute,-10,SYSUTCDATETIME());
    `);
    for (const row of result.recordset) {
        await finishEmail(row, { status: 'UNCERTAIN', error: 'WORKER_INTERRUPTED_REVIEW_BEFORE_RESEND' });
    }
}
