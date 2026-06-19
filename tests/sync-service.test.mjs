import assert from 'node:assert/strict';

import { runAttendanceBackfill, runAttendanceIncrementalSync } from '../src/lib/attendance/sync-service.ts';

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

function createHarness({ commitFails = false, newCounts = [2] } = {}) {
    const calls = [];
    const createRunCalls = [];
    const finishCalls = [];
    const updateCalls = [];
    const confirmCalls = [];
    const readCounts = [];
    const latestReadCounts = [];
    const allReadCalls = [];
    const getNewCountResults = [...newCounts];
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
            return getNewCountResults.length > 0 ? getNewCountResults.shift() : 0;
        },
        async readNewRecords(newCount) {
            calls.push(`readNewRecords:${newCount}`);
            readCounts.push(newCount);
            return Array.from({ length: newCount }, (_value, index) => makeRecord(index + 1));
        },
        async readLatestRecords(recordCount) {
            calls.push(`readLatestRecords:${recordCount}`);
            latestReadCounts.push(recordCount);
            return Array.from({ length: recordCount }, (_value, index) => makeRecord(index + 1));
        },
        async readAllRecords() {
            calls.push('readAllRecords');
            allReadCalls.push(true);
            return Array.from({ length: 3 }, (_value, index) => ({
                ...makeRecord(index + 1),
                sourceCommand: 'A4',
            }));
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
        async createRun(input) {
            calls.push('createRun');
            createRunCalls.push(input);
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

    return { allReadCalls, calls, client, confirmCalls, createRunCalls, dependencies, finishCalls, latestReadCounts, readCounts, updateCalls };
}

{
    const harness = createHarness();
    const result = await runAttendanceIncrementalSync(
        { deviceId: 10, triggerType: 'MANUAL', client: harness.client },
        harness.dependencies
    );

    assert.equal(result.status, 'SUCCESS');
    assert.deepEqual(harness.confirmCalls, [], 'incremental sync should not send A2 confirm');
    assert.equal(result.confirmedCount, 0, 'confirmedCount should stay 0 when A2 is disabled');
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

{
    const harness = createHarness({ newCounts: [138] });
    const result = await runAttendanceIncrementalSync(
        { deviceId: 10, triggerType: 'MANUAL', client: harness.client },
        harness.dependencies
    );

    assert.equal(result.status, 'SUCCESS');
    assert.deepEqual(harness.readCounts, [], 'A1 should not be used when the device has more than 50 pending records');
    assert.deepEqual(harness.latestReadCounts, [138], 'large pending queues should be read from the attendance table tail');
    assert.deepEqual(harness.confirmCalls, [], 'large pending queues should still avoid A2 confirm');
    assert.equal(result.newCount, 138);
    assert.equal(result.receivedCount, 138);
    assert.equal(result.confirmedCount, 0);
}

{
    const harness = createHarness({ newCounts: [138, 138] });
    const result = await runAttendanceIncrementalSync(
        { deviceId: 10, triggerType: 'MANUAL', client: harness.client },
        harness.dependencies
    );

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.receivedCount, 138);
    assert.equal(result.insertedCount, 138);
    assert.equal(result.confirmedCount, 0);
    assert.equal(result.errorMessage, null);
    assert.equal(harness.finishCalls.at(-1)?.status, 'SUCCESS');
    assert.equal(harness.updateCalls.at(-1)?.status, 'SUCCESS');
    assert.equal(harness.updateCalls.at(-1)?.lastError, null);
    assert.deepEqual(harness.confirmCalls, [], 'no-confirm sync should not become PARTIAL because the device queue remains');
}

{
    const harness = createHarness();
    const result = await runAttendanceBackfill(
        { deviceId: 10, triggerType: 'MANUAL', client: harness.client },
        harness.dependencies
    );

    assert.equal(result.status, 'SUCCESS');
    assert.equal(harness.createRunCalls.at(-1)?.mode, 'BACKFILL');
    assert.deepEqual(harness.allReadCalls, [true], 'backfill should read the full attendance table');
    assert.deepEqual(harness.confirmCalls, [], 'backfill must not send A2 confirm');
    assert.equal(result.newCount, 3);
    assert.equal(result.receivedCount, 3);
    assert.equal(result.insertedCount, 3);
    assert.equal(result.confirmedCount, 0);
}

console.log('sync service tests passed');
