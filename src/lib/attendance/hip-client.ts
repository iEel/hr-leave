import net from 'node:net';
import {
    buildHipFrame,
    buildHipHandshakeFrame,
    decodeHipRecord,
    parseNewCountResponse,
    splitA1Records,
} from './hip-protocol';
import type { AttendanceRecordInsertInput } from './repository';

export interface HipClientConfig {
    ipAddress: string;
    port: number;
    timeoutMs: number;
    passCode?: string | number | null;
    retryCount?: number;
}

export interface HipIncrementalClient {
    testConnection(): Promise<void>;
    getNewCount(): Promise<number>;
    readNewRecords(newCount: number): Promise<AttendanceRecordInsertInput[]>;
    confirmRead(newCount: number): Promise<void>;
}

type HipCommandInput = Omit<Parameters<typeof buildHipFrame>[0], 'seq'>;

export class HipCmif68sClient implements HipIncrementalClient {
    private sequence = 0;
    private readonly passCode: number;
    private readonly retryCount: number;

    constructor(private readonly config: HipClientConfig) {
        this.passCode = normalizePassCode(config.passCode);
        this.retryCount = normalizeRetryCount(config.retryCount);
    }

    async testConnection(): Promise<void> {
        await this.getNewCount();
    }

    async getNewCount(): Promise<number> {
        const { response, seq } = await this.withRetries(
            () => this.sendCommand(
                {
                    cmd: 0xb4,
                    field4: 6,
                    field8: 0xffff0000,
                    length: 0,
                },
                10
            ),
            'get new attendance count'
        );

        return parseNewCountResponse(response, seq);
    }

    async readNewRecords(newCount: number): Promise<AttendanceRecordInsertInput[]> {
        if (newCount < 1) {
            return [];
        }

        const { response } = await this.withRetries(
            () => this.sendCommand(
                {
                    cmd: 0xa1,
                    field4: 0,
                    field8: newCount,
                    length: newCount * 20,
                },
                12 + newCount * 20
            ),
            'read new attendance records'
        );

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

        // Do not retry A2 blindly: the command advances the device cursor if the device received it.
        await this.sendCommand(
            {
                cmd: 0xa2,
                field4: newCount,
                field8: 0xffff0000,
                length: 0,
            },
            10
        );
    }

    private async sendCommand(
        frameInput: HipCommandInput,
        minimumBytes: number
    ): Promise<{ response: Buffer; seq: number }> {
        const handshakeSeq = this.nextSequence();
        const commandSeq = this.nextSequence();
        const handshakeFrame = buildHipHandshakeFrame(this.passCode, handshakeSeq);
        const commandFrame = buildHipFrame({
            ...frameInput,
            seq: commandSeq,
        });
        const response = await this.sendFrame(handshakeFrame, commandFrame, minimumBytes);

        return { response, seq: commandSeq };
    }

    private async withRetries<T>(operation: () => Promise<T>, action: string): Promise<T> {
        const attempts = this.retryCount + 1;
        let lastError: unknown;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (attempt === attempts) {
                    break;
                }
            }
        }

        const message = lastError instanceof Error ? lastError.message : String(lastError);
        throw new Error(`HIP ${action} failed after ${attempts} attempt(s): ${message}`);
    }

    private nextSequence(): number {
        this.sequence = this.sequence >= 0xffff ? 1 : this.sequence + 1;
        return this.sequence;
    }

    private sendFrame(handshakeFrame: Buffer, commandFrame: Buffer, minimumBytes: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            let phase: 'handshake' | 'command' = 'handshake';
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
                socket.write(handshakeFrame);
            });

            socket.on('data', (chunk) => {
                chunks.push(chunk);
                const response = Buffer.concat(chunks);

                if (phase === 'handshake' && response.length >= 10) {
                    chunks.length = 0;
                    phase = 'command';
                    socket.write(commandFrame);
                    return;
                }

                if (phase === 'command' && response.length >= minimumBytes) {
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
                if (phase === 'command' && response.length >= minimumBytes) {
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
                            `HIP TCP socket closed during ${phase} after ${response.length} byte(s); expected ${phase === 'handshake' ? 10 : minimumBytes}`
                        )
                    );
                });
            });
        });
    }
}

function normalizePassCode(passCode: string | number | null | undefined): number {
    const normalized = passCode == null || passCode === '' ? 0 : Number(passCode);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > 0xffffffff) {
        throw new Error('HIP pass code must be an unsigned 32-bit integer');
    }

    return normalized;
}

function normalizeRetryCount(retryCount: number | null | undefined): number {
    if (retryCount == null) {
        return 0;
    }

    if (!Number.isInteger(retryCount) || retryCount < 0 || retryCount > 5) {
        throw new Error('HIP retry count must be an integer between 0 and 5');
    }

    return retryCount;
}
