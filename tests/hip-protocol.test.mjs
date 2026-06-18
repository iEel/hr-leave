import assert from 'node:assert/strict';
import {
    buildHipFrame,
    decodeHipRecord,
    parseNewCountResponse,
    splitA1Records,
    verifyTypeFromCode,
} from '../src/lib/attendance/hip-protocol.ts';

assert.equal(
    buildHipFrame({ cmd: 0xb4, field4: 6, field8: 0xffff0000, length: 0, seq: 0x1234 }).toString('hex'),
    '55aa01b4060000000000ffff00003412',
    'B4 frame should use the documented 16-byte HIP header layout'
);

assert.equal(
    buildHipFrame({ cmd: 0xa1, field4: 0, field8: 2, length: 40, seq: 0x0007 }).toString('hex'),
    '55aa01a1000000000200000028000700',
    'A1 frame should encode field8, length, and sequence little-endian'
);

assert.throws(
    () => buildHipFrame({ cmd: 0x100, field4: 0, field8: 0, length: 0, seq: 0 }),
    /cmd.*uint8/i,
    'frame builder should reject cmd values outside uint8 range'
);

assert.throws(
    () => buildHipFrame({ cmd: 0xa1, field4: -1, field8: 0, length: 0, seq: 0 }),
    /field4.*uint32/i,
    'frame builder should reject negative uint32 field values'
);

assert.throws(
    () => buildHipFrame({ cmd: 0xa1, field4: 0, field8: 0x100000000, length: 0, seq: 0 }),
    /field8.*uint32/i,
    'frame builder should reject field8 values outside uint32 range'
);

assert.throws(
    () => buildHipFrame({ cmd: 0xa1, field4: 0, field8: 0, length: 0.5, seq: 0 }),
    /length.*uint16/i,
    'frame builder should reject non-integer length values'
);

assert.throws(
    () => buildHipFrame({ cmd: 0xa1, field4: 0, field8: 0, length: 0, seq: 0x10000 }),
    /seq.*uint16/i,
    'frame builder should reject seq values outside uint16 range'
);

assert.equal(
    parseNewCountResponse(Buffer.from('aa550101020000003412', 'hex'), 0x1234),
    2,
    'new-count response should return the little-endian count'
);

assert.throws(
    () => parseNewCountResponse(Buffer.from('aa550101020000003412', 'hex'), 0x4321),
    /sequence/i,
    'new-count response should reject a mismatched sequence'
);

assert.equal(verifyTypeFromCode(0x10), 'FP', '0x10 should map to FP');
assert.equal(verifyTypeFromCode(0x40), 'FACE', '0x40 should map to FACE');
assert.equal(verifyTypeFromCode(0x30), 'UNKNOWN_0x30', '0x30 should preserve the unknown verify code');
assert.equal(verifyTypeFromCode(0x99), 'UNKNOWN_0x99', 'unknown verify codes should include their hex value');

assert.deepEqual(
    decodeHipRecord(Buffer.from('ce1f000001000036f961f2d50000000100000040', 'hex'), new Date('2026-06-18T00:00:00')),
    {
        userKey: 8142,
        employeeId: '8142',
        verifyType: 'FACE',
        verifyCode: 0x40,
        yearCode: 505,
        rawRecordTime: '2026-06-18 15:53:54',
        recordTime: '2026-06-18 15:53:54',
    },
    'FACE sample record should decode user, verification, and timestamp fields'
);

const fpRecord = decodeHipRecord(
    Buffer.from('e10b000001000038f961f2d50000000100000010', 'hex'),
    new Date('2026-06-18T00:00:00')
);

assert.equal(fpRecord.userKey, 3041, 'FP sample should decode user key');
assert.equal(fpRecord.verifyType, 'FP', 'FP sample should decode verify type');
assert.equal(fpRecord.recordTime, '2026-06-18 15:53:56', 'FP sample should decode record time');

assert.deepEqual(
    splitA1Records(
        Buffer.concat([
            Buffer.from('aa55010102000000070055aa', 'hex'),
            Buffer.from('ce1f000001000036f961f2d50000000100000040', 'hex'),
            Buffer.from('e10b000001000038f961f2d50000000100000010', 'hex'),
        ]),
        2
    ).map((record) => record.toString('hex')),
    [
        'ce1f000001000036f961f2d50000000100000040',
        'e10b000001000038f961f2d50000000100000010',
    ],
    'A1 response splitter should skip payload magic and return fixed-width records'
);

assert.throws(
    () => splitA1Records(Buffer.from('aa550101020000000700', 'hex'), 1),
    /payload magic/i,
    'A1 response splitter should reject responses without payload magic'
);

assert.throws(
    () => splitA1Records(Buffer.from('aa55010102000000070055aa0011', 'hex'), 1),
    /too short/i,
    'A1 response splitter should reject short payloads'
);

console.log('hip protocol tests passed');
