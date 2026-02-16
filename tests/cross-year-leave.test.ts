/**
 * Cross-Year Leave E2E Test Script
 * 
 * Tests the cross-year leave functionality including:
 * - splitLeaveByYear utility function
 * - Balance deduction across years
 * - Cancellation refund across years
 * - Year-end processing with auto-created records
 * - Overlap detection with cross-year leaves
 * 
 * Run: npx tsx tests/cross-year-leave.test.ts
 * Requires: Database access (reads from .env)
 */

import dotenv from 'dotenv';
dotenv.config();

import sql from 'mssql';
import { splitLeaveByYear, isDateRangeOverlap } from '../src/lib/date-utils';
import { TimeSlot } from '../src/types';

// =============================================
// Test Infrastructure
// =============================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        console.log(`  ✅ ${message}`);
        passed++;
    } else {
        console.log(`  ❌ ${message}`);
        failed++;
    }
}

function assertClose(actual: number, expected: number, message: string, tolerance = 0.01) {
    assert(Math.abs(actual - expected) < tolerance, `${message} (expected: ${expected}, got: ${actual})`);
}

function section(name: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 ${name}`);
    console.log('='.repeat(60));
}

// =============================================
// Database Connection
// =============================================

const sqlConfig: sql.config = {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_NAME || 'HRLeave',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    },
};

// Test data IDs (will be cleaned up)
const TEST_PREFIX = '__CROSSYEAR_TEST__';
let pool: sql.ConnectionPool;

// =============================================
// Test 1: splitLeaveByYear utility
// =============================================

function test1_splitLeaveByYear() {
    section('Test 1: splitLeaveByYear Utility Function');

    // Case 1: Same-year leave (Mon 28 Oct 2026 - Fri 31 Oct 2026)
    const result1 = splitLeaveByYear(
        new Date(2026, 9, 28), // Oct 28 (Wed)
        new Date(2026, 9, 31), // Oct 31 (Sat)
        [], // no holidays
        TimeSlot.FULL_DAY,
    );
    // Wed, Thu, Fri = 3 days (Sat excluded - not working)
    assertClose(result1.get(2026) || 0, 3, 'Same-year leave: Oct 28-31 = 3 working days in 2026');
    assert(result1.size === 1, 'Same-year leave: only 1 year in result');

    // Case 2: Cross-year leave (Mon 29 Dec 2025 - Fri 2 Jan 2026)
    const result2 = splitLeaveByYear(
        new Date(2025, 11, 29), // Dec 29 (Mon)
        new Date(2026, 0, 2),   // Jan 2 (Fri)
        [], // no holidays
        TimeSlot.FULL_DAY,
    );
    // 2025: Mon 29, Tue 30, Wed 31 = 3 days
    // 2026: Thu 1, Fri 2 = 2 days
    assertClose(result2.get(2025) || 0, 3, 'Cross-year: Dec 29-31 = 3 days in 2025');
    assertClose(result2.get(2026) || 0, 2, 'Cross-year: Jan 1-2 = 2 days in 2026');
    assert(result2.size === 2, 'Cross-year: 2 years in result');

    // Case 3: Cross-year with holidays
    const newYearHoliday = [new Date(2026, 0, 1)]; // Jan 1 = holiday
    const result3 = splitLeaveByYear(
        new Date(2025, 11, 29), // Dec 29 (Mon)
        new Date(2026, 0, 2),   // Jan 2 (Fri)
        newYearHoliday,
        TimeSlot.FULL_DAY,
    );
    // 2025: Mon 29, Tue 30, Wed 31 = 3 days
    // 2026: Jan 1 holiday, Fri 2 = 1 day
    assertClose(result3.get(2025) || 0, 3, 'Cross-year with holiday: 3 days in 2025');
    assertClose(result3.get(2026) || 0, 1, 'Cross-year with holiday: 1 day in 2026 (Jan 1 excluded)');

    // Case 4: Single day leave
    const result4 = splitLeaveByYear(
        new Date(2026, 0, 5), // Jan 5 (Mon)
        new Date(2026, 0, 5), // Jan 5 (Mon)
        [],
        TimeSlot.FULL_DAY,
    );
    assertClose(result4.get(2026) || 0, 1, 'Single day: 1 day in 2026');
    assert(result4.size === 1, 'Single day: only 1 year');

    // Case 5: Half-day leave
    const result5 = splitLeaveByYear(
        new Date(2026, 0, 5), // Jan 5 (Mon)
        new Date(2026, 0, 5), // Jan 5 (Mon)
        [],
        TimeSlot.HALF_MORNING,
    );
    assertClose(result5.get(2026) || 0, 0.5, 'Half day: 0.5 days in 2026');
}

// =============================================
// Test 2: Balance Deduction Across Years (DB)
// =============================================

async function test2_balanceDeduction() {
    section('Test 2: Balance Deduction Across Years (DB)');

    // Setup: Create a test user
    const testUserId = await setupTestUser();
    if (!testUserId) {
        console.log('  ⚠️ Skipping DB tests (could not create test user)');
        return testUserId;
    }

    // Create balances for 2025 and 2026
    await pool.request()
        .input('userId', testUserId)
        .query(`
            INSERT INTO LeaveBalances (userId, leaveType, year, entitlement, used, remaining, carryOver, isAutoCreated)
            VALUES 
                (@userId, 'VACATION', 2025, 10, 0, 10, 0, 0),
                (@userId, 'VACATION', 2026, 10, 0, 10, 0, 1)
        `);

    // Simulate cross-year deduction: 3 days from 2025, 2 days from 2026
    const yearSplits = [
        { year: 2025, usage: 3 },
        { year: 2026, usage: 2 }
    ];

    for (const split of yearSplits) {
        await pool.request()
            .input('userId', testUserId)
            .input('year', split.year)
            .input('usage', split.usage)
            .query(`
                UPDATE LeaveBalances
                SET used = used + @usage, remaining = remaining - @usage
                WHERE userId = @userId AND leaveType = 'VACATION' AND year = @year
            `);
    }

    // Verify balances
    const balances = await pool.request()
        .input('userId', testUserId)
        .query(`
            SELECT year, used, remaining 
            FROM LeaveBalances 
            WHERE userId = @userId AND leaveType = 'VACATION' 
            ORDER BY year
        `);

    const bal2025 = balances.recordset.find((b: any) => b.year === 2025);
    const bal2026 = balances.recordset.find((b: any) => b.year === 2026);

    assertClose(bal2025?.used, 3, 'Balance 2025: used = 3');
    assertClose(bal2025?.remaining, 7, 'Balance 2025: remaining = 7');
    assertClose(bal2026?.used, 2, 'Balance 2026: used = 2');
    assertClose(bal2026?.remaining, 8, 'Balance 2026: remaining = 8');

    return testUserId;
}

// =============================================
// Test 3: Cancellation Refund Across Years (DB)
// =============================================

async function test3_cancellationRefund(testUserId: number) {
    section('Test 3: Cancellation Refund Across Years (DB)');

    if (!testUserId) {
        console.log('  ⚠️ Skipping (no test user)');
        return;
    }

    // Create a mock leave request
    const leaveResult = await pool.request()
        .input('userId', testUserId)
        .query(`
            INSERT INTO LeaveRequests (userId, leaveType, startDatetime, endDatetime, timeSlot, usageAmount, reason, status)
            OUTPUT INSERTED.id
            VALUES (@userId, 'VACATION', '2025-12-29', '2026-01-02', 'FULL_DAY', 5, '${TEST_PREFIX}', 'APPROVED')
        `);

    const leaveId = leaveResult.recordset[0].id;

    // Insert year-split data
    await pool.request()
        .input('leaveId', leaveId)
        .query(`
            INSERT INTO LeaveRequestYearSplit (leaveRequestId, year, usageAmount)
            VALUES (@leaveId, 2025, 3), (@leaveId, 2026, 2)
        `);

    // Simulate cancellation refund using split data
    const splitResult = await pool.request()
        .input('leaveId', leaveId)
        .query(`SELECT year, usageAmount FROM LeaveRequestYearSplit WHERE leaveRequestId = @leaveId`);

    for (const split of splitResult.recordset) {
        await pool.request()
            .input('userId', testUserId)
            .input('year', split.year)
            .input('amount', split.usageAmount)
            .query(`
                UPDATE LeaveBalances
                SET used = used - @amount, remaining = remaining + @amount
                WHERE userId = @userId AND leaveType = 'VACATION' AND year = @year
            `);
    }

    // Verify balances are restored
    const balances = await pool.request()
        .input('userId', testUserId)
        .query(`
            SELECT year, used, remaining 
            FROM LeaveBalances 
            WHERE userId = @userId AND leaveType = 'VACATION' 
            ORDER BY year
        `);

    const bal2025 = balances.recordset.find((b: any) => b.year === 2025);
    const bal2026 = balances.recordset.find((b: any) => b.year === 2026);

    assertClose(bal2025?.used, 0, 'After refund 2025: used = 0');
    assertClose(bal2025?.remaining, 10, 'After refund 2025: remaining = 10');
    assertClose(bal2026?.used, 0, 'After refund 2026: used = 0');
    assertClose(bal2026?.remaining, 10, 'After refund 2026: remaining = 10');
}

// =============================================
// Test 4: Year-End Overwrite Preserves Used (DB)
// =============================================

async function test4_yearEndOverwrite(testUserId: number) {
    section('Test 4: Year-End Auto-Overwrite Preserves Used Days (DB)');

    if (!testUserId) {
        console.log('  ⚠️ Skipping (no test user)');
        return;
    }

    // Simulate: User took cross-year leave, 2 days used in 2026 (auto-created balance)
    await pool.request()
        .input('userId', testUserId)
        .query(`
            UPDATE LeaveBalances 
            SET used = 2, remaining = 8, isAutoCreated = 1 
            WHERE userId = @userId AND leaveType = 'VACATION' AND year = 2026
        `);

    // Verify auto-created status
    const before = await pool.request()
        .input('userId', testUserId)
        .query(`
            SELECT isAutoCreated, used, remaining 
            FROM LeaveBalances 
            WHERE userId = @userId AND leaveType = 'VACATION' AND year = 2026
        `);

    assert(before.recordset[0]?.isAutoCreated === true, 'Before overwrite: isAutoCreated = 1');
    assertClose(before.recordset[0]?.used, 2, 'Before overwrite: used = 2');

    // Simulate Year-End processing logic:
    // 1. Snapshot used amounts
    const snapshot = await pool.request()
        .input('userId', testUserId)
        .query(`
            SELECT leaveType, used 
            FROM LeaveBalances 
            WHERE userId = @userId AND year = 2026 AND used > 0
        `);

    const usedMap: Record<string, number> = {};
    for (const row of snapshot.recordset) {
        usedMap[row.leaveType] = row.used;
    }

    // 2. Delete auto-created records
    await pool.request()
        .input('userId', testUserId)
        .query(`
            DELETE FROM LeaveBalances 
            WHERE userId = @userId AND year = 2026 AND isAutoCreated = 1
        `);

    // 3. Re-insert with carry-over and preserved used
    const priorUsed = usedMap['VACATION'] || 0;
    const entitlement = 10;
    const carryOver = 3; // Simulated carry-over
    const remaining = entitlement + carryOver - priorUsed;

    await pool.request()
        .input('userId', testUserId)
        .input('entitlement', entitlement)
        .input('carryOver', carryOver)
        .input('used', priorUsed)
        .input('remaining', remaining)
        .query(`
            INSERT INTO LeaveBalances (userId, leaveType, year, entitlement, used, remaining, carryOver, isAutoCreated)
            VALUES (@userId, 'VACATION', 2026, @entitlement, @used, @remaining, @carryOver, 0)
        `);

    // Verify
    const after = await pool.request()
        .input('userId', testUserId)
        .query(`
            SELECT isAutoCreated, used, remaining, entitlement, carryOver
            FROM LeaveBalances 
            WHERE userId = @userId AND leaveType = 'VACATION' AND year = 2026
        `);

    const finalBalance = after.recordset[0];
    assert(finalBalance?.isAutoCreated === false, 'After overwrite: isAutoCreated = 0');
    assertClose(finalBalance?.used, 2, 'After overwrite: used preserved = 2');
    assertClose(finalBalance?.entitlement, 10, 'After overwrite: entitlement = 10');
    assertClose(finalBalance?.carryOver, 3, 'After overwrite: carryOver = 3');
    assertClose(finalBalance?.remaining, 11, 'After overwrite: remaining = 10 + 3 - 2 = 11');
}

// =============================================
// Test 5: Overlap Detection with Cross-Year
// =============================================

function test5_overlapDetection() {
    section('Test 5: Overlap Detection with Cross-Year Leaves');

    // Case 1: Cross-year leave overlaps with same-year leave
    assert(
        isDateRangeOverlap(
            new Date(2025, 11, 28), new Date(2026, 0, 3),  // Dec 28 - Jan 3
            new Date(2025, 11, 30), new Date(2025, 11, 30)  // Dec 30
        ),
        'Cross-year vs Dec 30 → overlap'
    );

    // Case 2: Cross-year leave overlaps with next year leave
    assert(
        isDateRangeOverlap(
            new Date(2025, 11, 28), new Date(2026, 0, 3),  // Dec 28 - Jan 3
            new Date(2026, 0, 2), new Date(2026, 0, 5)      // Jan 2-5
        ),
        'Cross-year vs Jan 2-5 → overlap'
    );

    // Case 3: No overlap - before cross-year
    assert(
        !isDateRangeOverlap(
            new Date(2025, 11, 28), new Date(2026, 0, 3),  // Dec 28 - Jan 3
            new Date(2025, 11, 25), new Date(2025, 11, 26)  // Dec 25-26
        ),
        'Cross-year vs Dec 25-26 → no overlap'
    );

    // Case 4: No overlap - after cross-year
    assert(
        !isDateRangeOverlap(
            new Date(2025, 11, 28), new Date(2026, 0, 3),  // Dec 28 - Jan 3
            new Date(2026, 0, 5), new Date(2026, 0, 10)     // Jan 5-10
        ),
        'Cross-year vs Jan 5-10 → no overlap'
    );

    // Case 5: Two cross-year leaves overlap
    assert(
        isDateRangeOverlap(
            new Date(2025, 11, 28), new Date(2026, 0, 3),  // Dec 28 - Jan 3
            new Date(2025, 11, 31), new Date(2026, 0, 5)    // Dec 31 - Jan 5
        ),
        'Two cross-year leaves → overlap'
    );

    // Case 6: Adjacent but not overlapping
    assert(
        !isDateRangeOverlap(
            new Date(2025, 11, 28), new Date(2025, 11, 30),  // Dec 28-30
            new Date(2025, 11, 31), new Date(2026, 0, 2)      // Dec 31 - Jan 2
        ),
        'Adjacent ranges (Dec 28-30 vs Dec 31 - Jan 2) → no overlap'
    );
}

// =============================================
// Helper Functions
// =============================================

async function setupTestUser(): Promise<number | null> {
    try {
        // Check if test user already exists and clean up
        await cleanupTestData();

        const result = await pool.request()
            .query(`
                INSERT INTO Users (employeeId, email, password, firstName, lastName, role, company, department, gender, startDate, isActive)
                OUTPUT INSERTED.id
                VALUES ('${TEST_PREFIX}', '${TEST_PREFIX}@test.com', 'test', 'Test', 'CrossYear', 'EMPLOYEE', 'SONIC', 'IT', 'M', '2020-01-01', 1)
            `);

        return result.recordset[0]?.id;
    } catch (err: any) {
        console.error('  ⚠️ Could not create test user:', err.message);
        return null;
    }
}

async function cleanupTestData() {
    try {
        // Clean up in reverse dependency order
        const testUser = await pool.request()
            .query(`SELECT id FROM Users WHERE employeeId = '${TEST_PREFIX}'`);

        if (testUser.recordset.length > 0) {
            const userId = testUser.recordset[0].id;

            // Delete year splits for test leaves
            await pool.request()
                .input('userId', userId)
                .query(`
                    DELETE FROM LeaveRequestYearSplit 
                    WHERE leaveRequestId IN (SELECT id FROM LeaveRequests WHERE userId = @userId)
                `);

            // Delete test leaves
            await pool.request()
                .input('userId', userId)
                .query(`DELETE FROM LeaveRequests WHERE userId = @userId`);

            // Delete test balances
            await pool.request()
                .input('userId', userId)
                .query(`DELETE FROM LeaveBalances WHERE userId = @userId`);

            // Delete test user
            await pool.request()
                .query(`DELETE FROM Users WHERE employeeId = '${TEST_PREFIX}'`);
        }
    } catch (err: any) {
        console.error('  ⚠️ Cleanup error:', err.message);
    }
}

// =============================================
// Main Runner
// =============================================

async function main() {
    console.log('🧪 Cross-Year Leave E2E Tests');
    console.log(`📅 ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
    console.log('');

    // Test 1: Pure utility (no DB needed)
    test1_splitLeaveByYear();

    // Test 5: Pure utility (no DB needed)
    test5_overlapDetection();

    // DB-dependent tests
    let testUserId: number | null = null;
    try {
        pool = await sql.connect(sqlConfig);
        console.log('\n🔗 Connected to database');

        testUserId = await test2_balanceDeduction();
        if (testUserId) {
            await test3_cancellationRefund(testUserId);
            await test4_yearEndOverwrite(testUserId);
        }
    } catch (err: any) {
        console.error(`\n⚠️ Database connection failed: ${err.message}`);
        console.log('   Skipping DB-dependent tests (2, 3, 4)');
    } finally {
        // Cleanup
        if (pool) {
            await cleanupTestData();
            await pool.close();
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log('='.repeat(60));

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
