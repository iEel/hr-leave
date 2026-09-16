# Email delivery operations

Apply `database/migrations/add_email_outbox.sql` before deploying the application. No existing leave is automatically replayed.

## Worker

`POST /api/cron/email-delivery` requires `x-cron-secret` matching `CRON_SECRET`, including outside production. It claims up to five jobs with row locking. New leave requests persist manager and delegate emails in the leave transaction. Existing result-email call sites enqueue durably after their approval transaction.

Production crontab (credentials are loaded by the script, not exposed in arguments):

```cron
* * * * * cd /var/www/hr-leave && /usr/bin/flock -n /var/lock/hr-leave-email.lock /usr/bin/node scripts/email-delivery-cron.cjs >> /var/log/hr-leave-email-worker.log 2>&1
```

Five attempts maximum. Retry delays: 1, 5, 15, 60 minutes. Safe connection failures and explicit temporary SMTP rejection retry. Permanent rejection or invalid routing fails immediately. Ambiguous post-DATA disconnects and jobs abandoned in SENDING for ten minutes become UNCERTAIN and require review, not automatic retry. Active ADMIN users get an in-app notification for FAILED/UNCERTAIN. A stable Message-ID is retained per job; SMTP itself cannot guarantee exactly-once delivery.

Approval emails are skipped if the leave is no longer pending, the email address changed, or the recipient is no longer the manager/current delegate. Messages older than six days expire. HTML (including magic links) is cleared on terminal status. Avoid logging or exporting queued HTML.

## Inspect a leave

All email table timestamps are UTC; existing LeaveRequests/Notifications use the database's local time.

```sql
DECLARE @leaveId int = 3239;
SELECT id,leaveId,kind,recipient,status,attemptCount,messageId,lastError,smtpResponse,
       createdAt,updatedAt,acceptedAt,nextAttemptAt
FROM dbo.EmailOutbox WHERE leaveId=@leaveId ORDER BY id;
SELECT a.* FROM dbo.EmailDeliveryAttempts a
JOIN dbo.EmailOutbox o ON o.id=a.outboxId WHERE o.leaveId=@leaveId ORDER BY a.id;
```

SMTP_ACCEPTED means the mail server accepted the message, not proof of inbox delivery. Use recipient, acceptedAt, and messageId for mail-server tracing.

## Authorized incident recovery

```bash
node scripts/recover-leave-email.cjs 3239
node scripts/recover-leave-email.cjs 3239 --send
```

The first command only inspects the current pending leave and manager. The second queues and attempts one recovery message with freshly generated links. The incident key is stable, so rerunning does not enqueue another copy. It refuses non-pending leaves. Do not reset FAILED/UNCERTAIN rows blindly: inspect server trace first. For a separate approved resend, use a distinct reviewed incident key. Never bulk resend legacy pending requests based only on their status.

## Deployment/rollback

Build an isolated release from the current production source plus this patch; preserve production's dependency lockfile and uploads. Retain previous source/build and crontab. Apply the additive migration, install the release build, restart hr-leave only, then enable the worker. Verify `/login`, unauthorized worker access (401), authenticated worker access, and SMTP TLS/authentication without mail before recovery.

To roll back, disable only the email worker cron entry, restore the backed-up changed source and `.next` build, and restart hr-leave. Keep the additive outbox tables and history. Review pending/uncertain jobs before re-enabling a later release.
