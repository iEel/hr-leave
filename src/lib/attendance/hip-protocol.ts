import type { AttendanceVerifyType, DecodedHipAttendanceRecord } from './types';

interface HipFrameInput {
    cmd: number;
    field4: number;
    field8: number;
    length: number;
    seq: number;
}

const HIP_REQUEST_MAGIC = 0xaa55;
const HIP_RESPONSE_MAGIC = 0x55aa;
const HIP_VERSION = 0x01;
const HIP_FRAME_LENGTH = 16;
const HIP_RECORD_LENGTH = 20;

export function buildHipFrame(input: HipFrameInput): Buffer {
    const cmd = validateUnsignedInteger(input.cmd, 'cmd', 0xff, 'uint8');
    const field4 = validateUnsignedInteger(input.field4, 'field4', 0xffffffff, 'uint32');
    const field8 = validateUnsignedInteger(input.field8, 'field8', 0xffffffff, 'uint32');
    const length = validateUnsignedInteger(input.length, 'length', 0xffff, 'uint16');
    const seq = validateUnsignedInteger(input.seq, 'seq', 0xffff, 'uint16');
    const frame = Buffer.alloc(HIP_FRAME_LENGTH);

    frame.writeUInt16LE(HIP_REQUEST_MAGIC, 0);
    frame.writeUInt8(HIP_VERSION, 2);
    frame.writeUInt8(cmd, 3);
    frame.writeUInt32LE(field4, 4);
    frame.writeUInt32LE(field8, 8);
    frame.writeUInt16LE(length, 12);
    frame.writeUInt16LE(seq, 14);

    return frame;
}

export function parseNewCountResponse(response: Buffer, expectedSeq: number): number {
    if (response.length < 10) {
        throw new Error(`HIP new-count response is too short: ${response.length} bytes`);
    }

    if (response.readUInt16LE(0) !== HIP_RESPONSE_MAGIC) {
        throw new Error('HIP new-count response has invalid magic');
    }

    if (response.readUInt8(2) !== HIP_VERSION || response.readUInt8(3) !== 0x01) {
        throw new Error('HIP new-count response has invalid version or command byte');
    }

    const actualSeq = response.readUInt16LE(8);
    if (actualSeq !== expectedSeq) {
        throw new Error(`HIP new-count response sequence mismatch: expected ${expectedSeq}, received ${actualSeq}`);
    }

    return response.readUInt32LE(4);
}

export function verifyTypeFromCode(verifyCode: number): AttendanceVerifyType {
    if (verifyCode === 0x10) {
        return 'FP';
    }

    if (verifyCode === 0x40) {
        return 'FACE';
    }

    return `UNKNOWN_0x${verifyCode.toString(16).padStart(2, '0').toUpperCase()}`;
}

export function decodeHipRecord(record: Buffer, now = new Date()): DecodedHipAttendanceRecord {
    if (record.length !== HIP_RECORD_LENGTH) {
        throw new Error(`HIP attendance record must be exactly ${HIP_RECORD_LENGTH} bytes, received ${record.length}`);
    }

    const userKey = record.readUInt32LE(0);
    const second = record.readUInt8(7);
    const timeValue = record.readUInt32LE(8);
    const yearCode = timeValue & 0x0fff;
    const month = (timeValue >> 12) & 0x0f;
    const day = (timeValue >> 16) & 0x1f;
    const hour = (timeValue >> 21) & 0x1f;
    const minute = (timeValue >> 26) & 0x3f;
    const verifyCode = record.readUInt32BE(16);
    const decodedYear = yearCode + 1521;
    const currentYear = now.getFullYear();
    const recordYear = decodedYear > currentYear ? currentYear : decodedYear;

    return {
        userKey,
        employeeId: String(userKey),
        verifyType: verifyTypeFromCode(verifyCode),
        verifyCode,
        yearCode,
        rawRecordTime: formatSqlDateTime(decodedYear, month, day, hour, minute, second),
        recordTime: formatSqlDateTime(recordYear, month, day, hour, minute, second),
    };
}

export function splitA1Records(response: Buffer, expectedCount: number): Buffer[] {
    const payloadMagicOffset = response.indexOf(Buffer.from([0x55, 0xaa]), 10);
    if (payloadMagicOffset === -1) {
        throw new Error('HIP A1 response payload magic not found');
    }

    const recordsOffset = payloadMagicOffset + 2;
    const requiredLength = recordsOffset + expectedCount * HIP_RECORD_LENGTH;
    if (response.length < requiredLength) {
        throw new Error(
            `HIP A1 response is too short for ${expectedCount} records: expected at least ${requiredLength} bytes, received ${response.length}`
        );
    }

    const records: Buffer[] = [];
    for (let index = 0; index < expectedCount; index += 1) {
        const start = recordsOffset + index * HIP_RECORD_LENGTH;
        records.push(response.subarray(start, start + HIP_RECORD_LENGTH));
    }

    return records;
}

function formatSqlDateTime(year: number, month: number, day: number, hour: number, minute: number, second: number): string {
    return [
        year.toString().padStart(4, '0'),
        month.toString().padStart(2, '0'),
        day.toString().padStart(2, '0'),
    ].join('-') + ` ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
}

function validateUnsignedInteger(value: number, fieldName: string, max: number, typeName: string): number {
    if (!Number.isInteger(value) || value < 0 || value > max) {
        throw new Error(`HIP frame ${fieldName} must be a ${typeName} integer between 0 and ${max}, received ${value}`);
    }

    return value;
}
