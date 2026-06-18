import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { logAudit } from '@/lib/audit';
import {
    getAttendanceDeviceConfig,
    listAttendanceDevices,
    upsertAttendanceDevice,
    type AttendanceDeviceConfigRecord,
    type UpsertAttendanceDeviceInput,
} from '@/lib/attendance/repository';

const SYNC_FREQUENCIES = new Set([15, 30, 60, 120]);

interface DeviceRequestBody {
    id?: unknown;
    name?: unknown;
    branchName?: unknown;
    ipAddress?: unknown;
    host?: unknown;
    port?: unknown;
    passCode?: unknown;
    isActive?: unknown;
    syncEnabled?: unknown;
    syncFrequencyMinutes?: unknown;
    timeoutMs?: unknown;
    retryCount?: unknown;
}

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const devices = await listAttendanceDevices();

        return NextResponse.json({ success: true, devices });
    } catch (error) {
        console.error('Error fetching attendance devices:', error);
        return NextResponse.json({ error: 'Failed to fetch attendance devices' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const bodyResult = await readDeviceRequestBody(request);
        if ('error' in bodyResult) {
            return NextResponse.json({ error: bodyResult.error }, { status: 400 });
        }

        const body = bodyResult.body;
        const validation = parseDeviceInput(body);

        if ('error' in validation) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const existingDevice = validation.input.id == null
            ? null
            : await getAttendanceDeviceConfig(validation.input.id);
        const device = await upsertAttendanceDevice(validation.input);
        const action = existingDevice ? 'UPDATE_ATTENDANCE_DEVICE' : 'CREATE_ATTENDANCE_DEVICE';

        await logAudit({
            userId: Number(session.user.id),
            action,
            targetTable: 'AttendanceDevices',
            targetId: device.id,
            oldValue: existingDevice ? sanitizeDeviceForAudit(existingDevice) : null,
            newValue: sanitizeDeviceForAudit(device),
        });

        return NextResponse.json({
            success: true,
            device: sanitizeDeviceForResponse(device),
        });
    } catch (error) {
        console.error('Error saving attendance device:', error);
        return NextResponse.json({ error: 'Failed to save attendance device' }, { status: 500 });
    }
}

async function readDeviceRequestBody(request: NextRequest): Promise<{ body: DeviceRequestBody } | { error: string }> {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return { error: 'Invalid JSON body' };
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Request body must be an object' };
    }

    return { body: body as DeviceRequestBody };
}

function parseDeviceInput(body: DeviceRequestBody): { input: UpsertAttendanceDeviceInput } | { error: string } {
    const id = normalizeOptionalId(body.id);
    const name = parseRequiredString(body.name);
    if (!name) {
        return { error: 'name is required' };
    }

    const host = parseRequiredString(body.ipAddress ?? body.host);
    if (!host) {
        return { error: 'ipAddress is required' };
    }

    const port = parseNumberInRange(body.port, 5005, 1, 65535, 'port');
    if ('error' in port) {
        return port;
    }

    const syncFrequencyMinutes = parseAllowedNumber(
        body.syncFrequencyMinutes,
        60,
        SYNC_FREQUENCIES,
        'syncFrequencyMinutes'
    );
    if ('error' in syncFrequencyMinutes) {
        return syncFrequencyMinutes;
    }

    const timeoutMs = parseNumberInRange(body.timeoutMs, 10000, 1000, 60000, 'timeoutMs');
    if ('error' in timeoutMs) {
        return timeoutMs;
    }

    const retryCount = parseNumberInRange(body.retryCount, 2, 0, 5, 'retryCount');
    if ('error' in retryCount) {
        return retryCount;
    }

    const passCode = parsePassCode(body.passCode, id == null);
    if ('error' in passCode) {
        return passCode;
    }

    return {
        input: {
            id,
            name,
            branchName: parseOptionalString(body.branchName),
            host,
            port: port.value,
            passCode: passCode.value,
            isActive: parseBoolean(body.isActive, true),
            syncEnabled: parseBoolean(body.syncEnabled, false),
            syncFrequencyMinutes: syncFrequencyMinutes.value,
            timeoutMs: timeoutMs.value,
            retryCount: retryCount.value,
        },
    };
}

function parseRequiredString(value: unknown): string | null {
    const parsed = parseOptionalString(value);
    return parsed && parsed.length > 0 ? parsed : null;
}

function parseOptionalString(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }

    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalId(value: unknown): number | string | null {
    if (value == null || value === '') {
        return null;
    }

    return typeof value === 'number' ? value : String(value);
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
            return false;
        }
    }

    return defaultValue;
}

function parseNumberInRange(
    value: unknown,
    defaultValue: number,
    min: number,
    max: number,
    fieldName: string
): { value: number } | { error: string } {
    const parsed = value == null || value === '' ? defaultValue : Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        return { error: `${fieldName} must be between ${min} and ${max}` };
    }

    return { value: parsed };
}

function parsePassCode(value: unknown, isCreate: boolean): { value: string | null } | { error: string } {
    const parsed = parseOptionalString(value);
    if (parsed == null) {
        return { value: isCreate ? '0' : null };
    }

    if (!/^\d+$/.test(parsed)) {
        return { error: 'passCode must be a numeric HIP pass value' };
    }

    const numeric = Number(parsed);
    if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > 0xffffffff) {
        return { error: 'passCode must be between 0 and 4294967295' };
    }

    return { value: parsed };
}

function parseAllowedNumber(
    value: unknown,
    defaultValue: number,
    allowedValues: Set<number>,
    fieldName: string
): { value: number } | { error: string } {
    const parsed = value == null || value === '' ? defaultValue : Number(value);
    if (!Number.isInteger(parsed) || !allowedValues.has(parsed)) {
        return { error: `${fieldName} must be one of ${Array.from(allowedValues).join(', ')}` };
    }

    return { value: parsed };
}

function sanitizeDeviceForResponse(device: AttendanceDeviceConfigRecord) {
    const { passCode, config, ...safeDevice } = device;
    void passCode;
    void config;
    return safeDevice;
}

function sanitizeDeviceForAudit(device: AttendanceDeviceConfigRecord) {
    return {
        ...sanitizeDeviceForResponse(device),
        passCode: '[hidden]',
    };
}
