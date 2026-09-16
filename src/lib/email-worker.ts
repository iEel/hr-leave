import { claimEmail, finishEmail, recoverAbandonedEmails } from './email-outbox';
import { deliverEmailJob } from './email-delivery';
import { sendSmtpEmail } from './email-transport';

export async function processEmailOutbox(id?: number) {
    await recoverAbandonedEmails();
    const results: { id: number; leaveId: number; status: string }[] = [];
    const started = Date.now();
    for (let i = 0; i < (id ? 1 : 5) && Date.now() - started < 40_000; i++) {
        const job = await claimEmail(id);
        if (!job) break;
        const outcome = await deliverEmailJob(job, sendSmtpEmail);
        await finishEmail(job, outcome);
        const entry = { id: job.id, leaveId: job.leaveId, status: outcome.status };
        console.log(JSON.stringify({ event: 'EMAIL_DELIVERY', timestamp: new Date().toISOString(), ...entry,
            recipient: job.recipient, attempt: job.attemptCount, messageId: job.messageId, error: outcome.error }));
        results.push(entry);
    }
    return results;
}
