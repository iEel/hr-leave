import assert from 'node:assert/strict';
import net from 'node:net';

import { HipCmif68sClient } from '../src/lib/attendance/hip-client.ts';

function buildResponse(seq, count = 0) {
    const response = Buffer.alloc(10);
    response.writeUInt16LE(0x55aa, 0);
    response.writeUInt8(1, 2);
    response.writeUInt8(1, 3);
    response.writeUInt32LE(count, 4);
    response.writeUInt16LE(seq, 8);
    return response;
}

function sampleRecord() {
    return Buffer.from('ce1f000001000036f961f2d50000000100000040', 'hex');
}

function parseFrames(buffer) {
    const frames = [];
    for (let offset = 0; offset + 16 <= buffer.length; offset += 16) {
        frames.push(buffer.subarray(offset, offset + 16));
    }
    return frames;
}

async function createFakeHipServer() {
    const connections = [];
    const frames = [];
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
                frames.push(cmd);

                if (cmd === 0x80) {
                    socket.write(buildResponse(seq));
                } else if (cmd === 0xb4) {
                    socket.write(buildResponse(seq, frames.filter((value) => value === 0xb4).length === 1 ? 1 : 0));
                } else if (cmd === 0xa1) {
                    socket.write(Buffer.concat([
                        buildResponse(seq),
                        Buffer.from('55aa', 'hex'),
                        sampleRecord(),
                        Buffer.alloc(4),
                    ]));
                } else if (cmd === 0xa2) {
                    socket.write(buildResponse(seq));
                }
            }
        });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    return {
        port: address.port,
        frames,
        connections,
        async close() {
            for (const socket of connections) {
                socket.destroy();
            }
            await new Promise((resolve) => server.close(resolve));
        },
    };
}

const server = await createFakeHipServer();

try {
    const client = new HipCmif68sClient({
        ipAddress: '127.0.0.1',
        port: server.port,
        timeoutMs: 1000,
        passCode: '0',
        retryCount: 0,
    });

    assert.equal(await client.getNewCount(), 1);
    const records = await client.readNewRecords(1);
    assert.equal(records.length, 1);
    await client.confirmRead(1);
    assert.equal(await client.getNewCount(), 0);

    assert.deepEqual(
        server.frames,
        [0x80, 0xb4, 0xa1, 0xa2, 0xb4],
        'HIP client should keep B4/A1/A2 in one authenticated TCP session'
    );
    assert.equal(server.connections.length, 1, 'HIP client should reuse one TCP connection for a sync session');
} finally {
    await server.close();
}

console.log('hip client session tests passed');
