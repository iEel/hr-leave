import assert from 'node:assert/strict';
import net from 'node:net';

import { HipCmif68sClient } from '../src/lib/attendance/hip-client.ts';

const RECORD_LENGTH = 20;
const PAGE_LENGTH = 1024;

function buildResponse(seq, count = 0) {
    const response = Buffer.alloc(10);
    response.writeUInt16LE(0x55aa, 0);
    response.writeUInt8(1, 2);
    response.writeUInt8(1, 3);
    response.writeUInt32LE(count, 4);
    response.writeUInt16LE(seq, 8);
    return response;
}

function sampleRecord(userKey, { yearCode = 498, month = 9, day = 5, hour = 15, minute = 7, second = 54 } = {}) {
    const record = Buffer.from('ce1f000001000036f961f2d50000000100000040', 'hex');
    const timeValue = yearCode + month * 2 ** 12 + day * 2 ** 16 + hour * 2 ** 21 + minute * 2 ** 26;
    record.writeUInt32LE(userKey, 0);
    record.writeUInt8(second, 7);
    record.writeUInt32LE(timeValue, 8);
    return record;
}

function parseFrames(buffer) {
    const frames = [];
    for (let offset = 0; offset + 16 <= buffer.length; offset += 16) {
        frames.push(buffer.subarray(offset, offset + 16));
    }
    return frames;
}

async function createFakeHipServer(records) {
    const connections = [];
    const commands = [];
    const a4Field8Values = [];
    const tableBytes = Buffer.concat(records);
    const server = net.createServer((socket) => {
        connections.push(socket);
        let pending = Buffer.alloc(0);

        socket.on('data', (chunk) => {
            pending = Buffer.concat([pending, chunk]);
            const parsed = parseFrames(pending);
            pending = pending.subarray(parsed.length * 16);

            for (const frame of parsed) {
                const cmd = frame.readUInt8(3);
                const seq = frame.readUInt16LE(14);
                const field8 = frame.readUInt32LE(8);
                commands.push(cmd);

                if (cmd === 0x80) {
                    socket.write(buildResponse(seq));
                } else if (cmd === 0xb4) {
                    socket.write(buildResponse(seq, records.length));
                } else if (cmd === 0xa4) {
                    a4Field8Values.push(field8);
                    const pageIndex = field8 === (records.length & 0xffff) ? 0 : field8 >>> 16;
                    const page = Buffer.alloc(PAGE_LENGTH);
                    tableBytes.copy(page, 0, pageIndex * PAGE_LENGTH, (pageIndex + 1) * PAGE_LENGTH);
                    socket.write(Buffer.concat([buildResponse(seq), Buffer.from('55aa', 'hex'), page, Buffer.alloc(4)]));
                }
            }
        });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    return {
        port: address.port,
        commands,
        a4Field8Values,
        connections,
        async close() {
            for (const socket of connections) {
                socket.destroy();
            }
            await new Promise((resolve) => server.close(resolve));
        },
    };
}

const records = [
    ...Array.from({ length: 10 }, (_value, index) =>
        sampleRecord(2000 + index, { yearCode: 505, month: 6, day: 18, hour: 15, minute: 50 + index, second: index })
    ),
    ...Array.from({ length: 50 }, (_value, index) => sampleRecord(1000 + index)),
];
const server = await createFakeHipServer(records);

try {
    const client = new HipCmif68sClient({
        ipAddress: '127.0.0.1',
        port: server.port,
        timeoutMs: 1000,
        passCode: '0',
        retryCount: 0,
    });

    const latestRecords = await client.readLatestRecords(10);

    assert.equal(latestRecords.length, 10);
    assert.equal(latestRecords[0].userKey, 2000);
    assert.equal(latestRecords.at(-1).userKey, 2009);
    assert.deepEqual(
        server.commands,
        [0x80, 0xb4, 0xa4, 0xa4],
        'HIP client should open the attendance table and read every page needed to rank records by time'
    );
    assert.deepEqual(
        server.a4Field8Values,
        [records.length & 0xffff, 0x00010000],
        'A4 should use the documented page-0 and subsequent-page field8 values'
    );
    assert.equal(server.connections.length, 1, 'full-table reads should reuse one TCP session');

    await client.close();
} finally {
    await server.close();
}

assert.equal(records.length * RECORD_LENGTH, 1200, 'test fixture should cross a 1024-byte A4 page boundary');

console.log('hip client full-table tests passed');
