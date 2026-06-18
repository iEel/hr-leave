import net from 'node:net';
import {
    buildHipFrame,
    decodeHipRecord,
    parseNewCountResponse,
    splitA1Records,
} from './hip-protocol';
import type { AttendanceRecordInsertInput } from './repository';

export interface HipClientConfig {
    ipAddress: string;
    port: number;
    timeoutMs: number;
}

export interface HipIncrementalClient {
    testConnection(): Promise<void>;
    getNewCount(): Promise<number>;
    readNewRecords(newCount: number): Promise<AttendanceRecordInsertInput[]>;
    confirmRead(newCount: number): Promise<void>;
}

export class HipCmif68sClient implements HipIncrementalClient {
    private sequence = 0;

    constructor(private readonly config: HipClientConfig) {}

    async testConnection(): Promise<void> {
        const seq = this.nextSequence();
        const frame = buildHipFrame({
            cmd: 0xb4,
            field4: 6,
            field8: 0xffff0000,
            length: 0,
            seq,
        });

        await this.sendFrame(frame, 10);
    }

    async getNewCount(): Promise<number> {
        const seq = this.nextSequence();
        const frame = buildHipFrame({
            cmd: 0xb4,
            field4: 6,
            field8: 0xffff0000,
            length: 0,
            seq,
        });
        const response = await this.sendFrame(frame, 10);

        return parseNewCountResponse(response, seq);
    }

    async readNewRecords(newCount: number): Promise<AttendanceRecordInsertInput[]> {
        if (newCount < 1) {
            return [];
        }

        const seq = this.nextSequence();
        const frame = buildHipFrame({
            cmd: 0xa1,
            field4: 0,
            field8: newCount,
            length: newCount * 20,
            seq,
        });
        const response = await this.sendFrame(frame, 12 + newCount * 20);

        return splitA1Records(response, newCount).map((record) => ({
            ...decodeHipRecord(record),
            recordHex: record.toString('hex'),
            sourceCommand: 'A1',
        }));
    }

    async confirmRead(newCount: number): Promise<void> {
        if (newCount < 1) {
            return;
        }

        const seq = this.nextSequence();
        const frame = buildHipFrame({
            cmd: 0xa2,
            field4: newCount,
            field8: 0xffff0000,
            length: 0,
            seq,
        });

        await this.sendFrame(frame, 10);
    }

    private nextSequence(): number {
        this.sequence = this.sequence >= 0xffff ? 1 : this.sequence + 1;
        return this.sequence;
    }

    private sendFrame(frame: Buffer, minimumBytes: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            let settled = false;
            const socket = net.createConnection({
                host: this.config.ipAddress,
                port: this.config.port,
            });

            const settle = (callback: () => void) => {
                if (settled) {
                    return;
                }
                settled = true;
                socket.removeAllListeners();
                callback();
            };

            const timeout = setTimeout(() => {
                settle(() => {
                    socket.destroy();
                    reject(new Error(`HIP TCP request timed out after ${this.config.timeoutMs}ms`));
                });
            }, this.config.timeoutMs);

            socket.once('connect', () => {
                socket.write(frame);
            });

            socket.on('data', (chunk) => {
                chunks.push(chunk);
                const response = Buffer.concat(chunks);
                if (response.length >= minimumBytes) {
                    settle(() => {
                        clearTimeout(timeout);
                        socket.end();
                        resolve(response);
                    });
                }
            });

            socket.once('error', (error) => {
                settle(() => {
                    clearTimeout(timeout);
                    socket.destroy();
                    reject(error);
                });
            });

            socket.once('close', () => {
                const response = Buffer.concat(chunks);
                if (response.length >= minimumBytes) {
                    settle(() => {
                        clearTimeout(timeout);
                        resolve(response);
                    });
                    return;
                }

                settle(() => {
                    clearTimeout(timeout);
                    reject(
                        new Error(
                            `HIP TCP socket closed before ${minimumBytes} bytes were received; received ${response.length}`
                        )
                    );
                });
            });
        });
    }
}
