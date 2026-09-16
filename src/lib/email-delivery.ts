import type Mail from 'nodemailer/lib/mailer';

export type DeliveryStatus = 'PENDING' | 'SMTP_ACCEPTED' | 'FAILED' | 'UNCERTAIN' | 'SKIPPED';
export interface DeliveryOutcome {
    status: DeliveryStatus;
    retryMinutes?: number;
    error?: string;
    response?: string;
}
export interface DeliveryJob {
    id: number;
    leaveId: number;
    kind: 'REQUEST' | 'RESULT';
    recipient: string;
    subject: string;
    html: string;
    messageId: string;
    attemptCount: number;
    eligible: boolean;
    expired: boolean;
}

// Do not log arbitrary error objects: they may include credentials or message HTML.
function errorSummary(error: unknown): string {
    const e = error as { code?: string; command?: string; responseCode?: number } | null;
    return JSON.stringify({ code: e?.code || 'UNKNOWN', command: e?.command, responseCode: e?.responseCode }).slice(0, 500);
}

export function classifyDeliveryError(error: unknown, attempt: number): DeliveryOutcome {
    const e = (error || {}) as { code?: string; command?: string; responseCode?: number };
    const summary = errorSummary(error);
    const retry = (): DeliveryOutcome => attempt >= 5
        ? { status: 'FAILED', error: summary }
        : { status: 'PENDING', retryMinutes: [1, 5, 15, 60][attempt - 1] || 60, error: summary };

    if (e.responseCode && e.responseCode >= 500) return { status: 'FAILED', error: summary };
    // An explicit negative SMTP reply confirms the message was not accepted.
    if (e.responseCode && e.responseCode >= 400) return retry();
    if (['EAUTH', 'EENVELOPE', 'EMESSAGE', 'ETLS', 'ESMTP_CONFIG'].includes(e.code || '')) {
        return { status: 'FAILED', error: summary };
    }
    if (['EDNS', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED'].includes(e.code || '') ||
        ['CONN', 'EHLO', 'HELO', 'AUTH', 'STARTTLS', 'MAIL FROM', 'RCPT TO'].includes(e.command || '')) {
        return retry();
    }
    // Socket loss during DATA (or with an unknown phase) can follow acceptance.
    return { status: 'UNCERTAIN', error: summary };
}

type Send = (message: Mail.Options, attempt: number) => Promise<{
    accepted: unknown[]; rejected?: unknown[]; messageId?: string; response?: string;
}>;

export async function deliverEmailJob(job: DeliveryJob, send: Send): Promise<DeliveryOutcome> {
    if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(job.recipient)) {
        return { status: 'FAILED', error: 'INVALID_OR_MISSING_RECIPIENT' };
    }
    if (!job.eligible) return { status: 'SKIPPED', error: 'LEAVE_STATUS_OR_RECIPIENT_CHANGED' };
    if (job.expired) return { status: 'FAILED', error: 'QUEUED_MESSAGE_EXPIRED' };
    try {
        const info = await send({
            from: `"HR Leave System" <${process.env.SMTP_USER}>`,
            to: job.recipient,
            subject: job.subject,
            html: job.html,
            messageId: job.messageId,
        }, job.attemptCount);
        if (!info.accepted.some(recipient => String(recipient).toLowerCase() === job.recipient.toLowerCase())) {
            return { status: 'FAILED', error: 'RECIPIENT_NOT_ACCEPTED', response: info.response?.slice(0, 1000) };
        }
        return { status: 'SMTP_ACCEPTED', response: info.response?.slice(0, 1000) };
    } catch (error) {
        return classifyDeliveryError(error, job.attemptCount);
    }
}
