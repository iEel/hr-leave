import assert from 'node:assert/strict';

import { runAttendanceIncrementalSync } from '../src/lib/attendance/sync-service.ts';

function makeRecord(index) {
    return {
        userKey: 8000 + index,
        employeeId: String(8000 + index),
        verifyType: 'FACE',
        verifyCode: 0x40,
        yearCode: 505,
        rawRecordTime: `2026-06-18 08:3${index}:00`,
        recordTime: `2026-06-18 08:3${index}:00`,
        recordHex: `record-${index}`,
        sourceCommand: 'A1',
    };
}

function createHarness({ commitFails = false } = {}) {
    const calls = [];
    const finishCalls = [];
    const updateCalls = [];
    const confirmCalls = [];
    const transaction = {
        async begin() {
            calls.push('begin');
        },
        async commit() {
            calls.push('commit');
            if (commitFails) {
                throw new Error('commit failed');
            }
        },
        async rollback() {
            calls.push('rollback');
        },
    };

    const client = {
        async testConnection() {
            calls.push('testConnection');
        },
        async getNewCount() {
            calls.push('getNewCount');
            return 2;
        },
        async readNewRecords(newCount) {
            calls.push(`readNewRecords:${newCount}`);
            return [makeRecord(1), makeRecord(2)];
        },
        async confirmRead(newCount) {
            calls.push(`confirmRead:${newCount}`);
            confirmCalls.push(newCount);
        },
    };

    const dependencies = {
        async getDeviceConfig() {
            return {
                id: 10,
                name: 'HIP Rama 3',
                branchName: 'Rama 3',
                protocol: 'HIP_CMIF68S',
                host: '192.168.108.201',
                port: 5005,
                hasPass: true,
                passCode: '0',
                isActive: true,
                syncEnabled: true,
                syncFrequencyMinutes: 60,
                timeoutMs: 10000,
                retryCount: 2,
                lastSyncAt: null,
                lastSuccessfulSyncAt: null,
                nextSyncAt: null,
                lastSyncStatus: null,
                lastError: null,
                lastNewCount: null,
                lastInsertedCount: null,
                config: {
                    protocol: 'HIP_CMIF68S',
                    host: '192.168.108.201',
                    port: 5005,
                    timeoutMs: 10000,
                },
            };
        },
        async tryAcquireLock() {
            calls.push('tryAcquireLock');
            return true;
        },
        async releaseLock() {
            calls.push('releaseLock');
            return true;
        },
        async createRun() {
            calls.push('createRun');
            return 77;
        },
        async finishRun(input) {
            calls.push(`finishRun:${input.status}`);
            finishCalls.push(input);
            return true;
        },
        async updateDeviceStatus(_deviceId, input) {
            calls.push(`updateDeviceStatus:${input.status}`);
            updateCalls.push(input);
            return true;
        },
        async createTransaction() {
            calls.push('createTransaction');
            return transaction;
        },
        async insertRecords(_transaction, _deviceId, records) {
            calls.push(`insertRecords:${records.length}`);
            return { insertedCount: records.length, duplicateCount: 0 };
        },
        createClient() {
            throw new Error('test should use injected client');
        },
    };

    return { calls, client, confirmCalls, dependencies, finishCalls, updateCalls };
}

{
    const harness = createHarness();
    const result = await runAttendanceIncrementalSync(
        { deviceId: 10, triggerType: 'MANUAL', client: harness.client },
        harness.dependencies
    );

    assert.equal(result.status, 'SUCCESS');
    assert.deepEqual(harness.confirmCalls, [2], 'A2 confirm should run after successful DB commit');
    assert.ok(
        harness.calls.indexOf('commit') < harness.calls.indexOf('confirmRead:2'),
        'DB commit should happen before A2 confirm'
    );
}

{
    const harness = createHarness({ commitFails: true });
    const result = await runAttendanceIncrementalSync(
        { deviceId: 10, triggerType: 'MANUAL', client: harness.client },
        harness.dependencies
    );

    assert.equal(result.status, 'FAILED');
    assert.deepEqual(harness.confirmCalls, [], 'A2 confirm must not run when DB commit fails');
    assert.ok(harness.calls.includes('rollback'), 'failed DB transaction should be rolled back');
    assert.equal(harness.finishCalls.at(-1)?.status, 'FAILED');
    assert.equal(harness.updateCalls.at(-1)?.status, 'FAILED');
}

console.log('sync service tests passed');
