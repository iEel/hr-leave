import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPool } from '@/lib/db';

function parsePositiveInteger(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const pool = await getPool();
        const result = await pool.request()
            .query(`
                SELECT settingKey, settingValue 
                FROM SystemSettings 
                WHERE settingKey IN (
                    'LEAVE_ADVANCE_DAYS',
                    'LEAVE_SICK_CERT_DAYS',
                    'PROBATION_STANDARD_DAYS',
                    'VACATION_AFTER_PROBATION_YEARS',
                    'LEAVE_YEAR_START'
                )
            `);

        const rules = {
            advanceNoticeDays: 3, // Default
            sickCertThreshold: 3,  // Default
            probationStandardDays: 90,
            vacationAfterProbationYears: 1,
            fiscalYearStart: '01-01'
        };

        result.recordset.forEach(row => {
            if (row.settingKey === 'LEAVE_ADVANCE_DAYS') {
                rules.advanceNoticeDays = parseNonNegativeInteger(row.settingValue, 3);
            } else if (row.settingKey === 'LEAVE_SICK_CERT_DAYS') {
                rules.sickCertThreshold = parsePositiveInteger(row.settingValue, 3);
            } else if (row.settingKey === 'PROBATION_STANDARD_DAYS') {
                rules.probationStandardDays = parsePositiveInteger(row.settingValue, 90);
            } else if (row.settingKey === 'VACATION_AFTER_PROBATION_YEARS') {
                rules.vacationAfterProbationYears = parseNonNegativeInteger(row.settingValue, 1);
            } else if (row.settingKey === 'LEAVE_YEAR_START') {
                rules.fiscalYearStart = row.settingValue || '01-01';
            }
        });

        return NextResponse.json({ success: true, rules });
    } catch (error) {
        console.error('Error fetching leave rules:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
