import { resolve4 } from 'node:dns/promises';
import { isIP } from 'node:net';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

type ResolveIPv4 = (hostname: string) => Promise<string[]>;

function smtpError(message: string, code: 'ESMTP_CONFIG' | 'EDNS') {
    return Object.assign(new Error(message), { code, command: 'CONN' });
}

/** Resolve only A records; retain the original hostname for TLS certificate validation. */
export async function buildSmtpTransportOptions(
    env: NodeJS.ProcessEnv = process.env,
    attempt = 1,
    resolver: ResolveIPv4 = resolve4,
): Promise<SMTPTransport.Options> {
    const hostname = env.SMTP_HOST?.trim();
    if (!hostname) throw smtpError('SMTP_HOST is required', 'ESMTP_CONFIG');
    const port = Number(env.SMTP_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw smtpError('Invalid SMTP port', 'ESMTP_CONFIG');
    if (!env.SMTP_USER) throw smtpError('SMTP_USER is required', 'ESMTP_CONFIG');
    if (!env.SMTP_PASS) throw smtpError('SMTP_PASS is required', 'ESMTP_CONFIG');
    if (isIP(hostname) === 6 || hostname.includes(':')) throw smtpError('SMTP requires an IPv4 host', 'ESMTP_CONFIG');

    let addresses: string[];
    if (isIP(hostname) === 4) {
        addresses = [hostname];
    } else {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            addresses = await Promise.race([
                Promise.resolve().then(() => resolver(hostname)).catch(() => {
                    throw smtpError('SMTP DNS lookup failed', 'EDNS');
                }),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(smtpError('SMTP DNS lookup timed out', 'EDNS')), 5_000);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
        addresses = addresses.filter((address) => isIP(address) === 4);
    }
    if (!addresses.length) throw smtpError('SMTP DNS returned no IPv4 addresses', 'EDNS');
    const index = Number.isSafeInteger(attempt) && attempt > 0 ? (attempt - 1) % addresses.length : 0;
    return {
        host: addresses[index],
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        tls: { servername: hostname, rejectUnauthorized: true },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
    };
}

export async function sendSmtpEmail(
    message: nodemailer.SendMailOptions,
    attempt = 1,
): Promise<SMTPTransport.SentMessageInfo> {
    const transport = nodemailer.createTransport(await buildSmtpTransportOptions(process.env, attempt));
    try {
        return await transport.sendMail(message);
    } finally {
        transport.close();
    }
}

export async function verifySmtpConnection(): Promise<true> {
    const transport = nodemailer.createTransport(await buildSmtpTransportOptions());
    try {
        return await transport.verify();
    } finally {
        transport.close();
    }
}
