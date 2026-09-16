import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processEmailOutbox } from '@/lib/email-worker';

export async function POST(request: NextRequest) {
    const expected = process.env.CRON_SECRET;
    const provided = request.headers.get('x-cron-secret') || '';
    if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(provided) ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        return NextResponse.json({ success: true, results: await processEmailOutbox() });
    } catch {
        console.error(JSON.stringify({ event: 'EMAIL_WORKER_ERROR', timestamp: new Date().toISOString() }));
        return NextResponse.json({ error: 'Email worker failed' }, { status: 500 });
    }
}
