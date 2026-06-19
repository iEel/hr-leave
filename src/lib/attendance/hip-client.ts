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
    readLatestRecords(recordCount: number): Promise<AttendanceRecordInsertInput[]>;
    readAllRecords(): Promise<AttendanceRecordInsertInput[]>;
    confirmRead(newCount: number): Promise<void>;
    close?(): Promise<void>;
}

type HipCommandInput = Omit<Parameters<typeof buildHipFrame>[0], 'seq'>;

const HIP_RECORD_LENGTH = 20;
const HIP_A4_PAGE_PAYLOAD_BYTES = 1024;
const HIP_A4_RESPONSE_BYTES = 10 + 2 + HIP_A4_PAGE_PAYLOAD_BYTES + 4;

export class HipCmif68sClient implements HipIncrementalClient {
    private sequence = 0;
    private readonly passCode: number;
    private readonly retryCount: number;
    private socket: net.Socket | null = null;

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
                16 + newCount * 20
            ),
            'read new attendance records'
        );

        return splitA1Records(response, newCount).map((record) => ({
            ...decodeHipRecord(record),
            recordHex: record.toString('hex'),
            sourceCommand: 'A1',
        }));
    }

    async readLatestRecords(recordCount: number): Promise<AttendanceRecordInsertInput[]> {
        if (recordCount < 1) {
            return [];
        }

        const records = await this.readAllRecords();
        return records.sort(compareAttendanceRecords).slice(-recordCount);
    }

    async readAllRecords(): Promise<AttendanceRecordInsertInput[]> {
        const totalRecords = await this.getAttendanceTableCount();

        const totalBytes = totalRecords * HIP_RECORD_LENGTH;
        if (totalBytes < 1) {
            return [];
        }

        const endPage = Math.ceil(totalBytes / HIP_A4_PAGE_PAYLOAD_BYTES) - 1;
        const pagePayloads: Buffer[] = [];

        for (let pageIndex = 0; pageIndex <= endPage; pageIndex += 1) {
            pagePayloads.push(await this.readAttendanceTablePage(pageIndex, totalRecords));
        }

        const tableBytes = Buffer.concat(pagePayloads).subarray(0, totalBytes);
        const records: AttendanceRecordInsertInput[] = [];

        for (let offset = 0; offset + HIP_RECORD_LENGTH <= tableBytes.length; offset += HIP_RECORD_LENGTH) {
            const record = tableBytes.subarray(offset, offset + HIP_RECORD_LENGTH);
            records.push({
                ...decodeHipRecord(record),
                recordHex: record.toString('hex'),
                sourceCommand: 'A4',
            });
        }

        return records;
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
        await this.ensureConnected(handshakeFrame);
        const response = await this.writeAndRead(commandFrame, minimumBytes, `HIP command 0x${frameInput.cmd.toString(16)}`);

        return { response, seq: commandSeq };
    }

    private async getAttendanceTableCount(): Promise<number> {
        const { response, seq } = await this.withRetries(
            () => this.sendCommand(
                {
                    cmd: 0xb4,
                    field4: 8,
                    field8: 0xffff0000,
                    length: 0,
                },
                10
            ),
            'open attendance table'
        );

        return parseNewCountResponse(response, seq);
    }

    private async readAttendanceTablePage(pageIndex: number, totalRecords: number): Promise<Buffer> {
        const field8 = pageIndex === 0 ? totalRecords & 0xffff : pageIndex * 0x10000;
        const { response } = await this.withRetries(
            () => this.sendCommand(
                {
                    cmd: 0xa4,
                    field4: 0,
                    field8,
                    length: HIP_A4_PAGE_PAYLOAD_BYTES,
                },
                HIP_A4_RESPONSE_BYTES
            ),
            `read attendance table page ${pageIndex}`
        );

        return extractAttendanceTablePagePayload(response);
    }

    private async withRetries<T>(operation: () => Promise<T>, action: string): Promise<T> {
        const attempts = this.retryCount + 1;
        let lastError: unknown;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                await this.close();
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

    private async ensureConnected(handshakeFrame: Buffer): Promise<void> {
        if (this.socket && !this.socket.destroyed) {
            return;
        }

        this.socket = await new Promise<net.Socket>((resolve, reject) => {
            const socket = net.createConnection({
                host: this.config.ipAddress,
                port: this.config.port,
            });
            const timeout = setTimeout(() => {
                socket.destroy();
                reject(new Error(`HIP TCP connect timed out after ${this.config.timeoutMs}ms`));
            }, this.config.timeoutMs);

            socket.once('connect', () => {
                clearTimeout(timeout);
                resolve(socket);
            });
            socket.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });

        await this.writeAndRead(handshakeFrame, 10, 'HIP handshake');
    }

    private writeAndRead(frame: Buffer, minimumBytes: number, label: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const socket = this.socket;
            if (!socket || socket.destroyed) {
                reject(new Error('HIP TCP socket is not connected'));
                return;
            }

            const chunks: Buffer[] = [];
            let settled = false;

            const settle = (callback: () => void) => {
                if (settled) {
                    return;
                }
                settled = true;
                socket.off('data', onData);
                socket.off('error', onError);
                socket.off('close', onClose);
                callback();
            };

            const timeout = setTimeout(() => {
                settle(() => {
                    this.destroySocket();
                    reject(new Error(`${label} timed out after ${this.config.timeoutMs}ms`));
                });
            }, this.config.timeoutMs);

            const onData = (chunk: Buffer) => {
                chunks.push(chunk);
                const response = Buffer.concat(chunks);

                if (response.length >= minimumBytes) {
                    settle(() => {
                        clearTimeout(timeout);
                        resolve(response);
                    });
                }
            };

            const onError = (error: Error) => {
                settle(() => {
                    clearTimeout(timeout);
                    this.destroySocket();
                    reject(error);
                });
            };

            const onClose = () => {
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
                    this.socket = null;
                    reject(
                        new Error(
                            `${label} socket closed after ${response.length} byte(s); expected ${minimumBytes}`
                        )
                    );
                });
            };

            socket.on('data', onData);
            socket.once('error', onError);
            socket.once('close', onClose);
            socket.write(frame);
        });
    }

    async close(): Promise<void> {
        if (!this.socket) {
            return;
        }

        const socket = this.socket;
        this.socket = null;

        if (socket.destroyed) {
            return;
        }

        await new Promise<void>((resolve) => {
            socket.once('close', () => resolve());
            socket.end();
            setTimeout(() => {
                if (!socket.destroyed) {
                    socket.destroy();
                }
                resolve();
            }, 250);
        });
    }

    private destroySocket(): void {
        if (this.socket && !this.socket.destroyed) {
            this.socket.destroy();
        }
        this.socket = null;
    }
}

function extractAttendanceTablePagePayload(response: Buffer): Buffer {
    const payloadMagicOffset = response.indexOf(Buffer.from([0x55, 0xaa]), 10);
    if (payloadMagicOffset === -1) {
        throw new Error('HIP A4 response payload magic not found');
    }

    const payloadStart = payloadMagicOffset + 2;
    const payloadEnd = Math.min(payloadStart + HIP_A4_PAGE_PAYLOAD_BYTES, response.length - 4);
    if (payloadEnd - payloadStart < HIP_A4_PAGE_PAYLOAD_BYTES) {
        throw new Error(
            `HIP A4 response is too short: expected ${HIP_A4_PAGE_PAYLOAD_BYTES} payload bytes, received ${payloadEnd - payloadStart}`
        );
    }

    return response.subarray(payloadStart, payloadEnd);
}

function compareAttendanceRecords(
    left: AttendanceRecordInsertInput,
    right: AttendanceRecordInsertInput
): number {
    return left.recordTime.localeCompare(right.recordTime)
        || left.rawRecordTime.localeCompare(right.rawRecordTime)
        || left.userKey - right.userKey
        || left.verifyType.localeCompare(right.verifyType)
        || left.recordHex.localeCompare(right.recordHex);
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
