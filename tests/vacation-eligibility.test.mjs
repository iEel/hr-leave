import assert from 'node:assert/strict';
import {
    calculateProbationEndDate,
    calculateVacationEligibleDate,
    daysUntilVacationEligible,
    getFiscalYearRange,
    isVacationEligibleOnDate,
    isVacationEntitledInFiscalYear,
} from '../src/lib/vacation-eligibility.ts';

const base = {
    startDate: '2026-01-01',
    probationDays: 90,
    probationExtensionDays: 0,
    probationOverrideDate: null,
    vacationDelayYears: 1,
};

function toDateText(date) {
    return date.toISOString().slice(0, 10);
}

assert.equal(
    toDateText(calculateProbationEndDate(base)),
    '2026-04-01',
    'standard probation end is start date + 90 days'
);

assert.equal(
    toDateText(calculateProbationEndDate({ ...base, startDate: new Date(2026, 0, 1) })),
    '2026-04-01',
    'Date object input preserves the local business date'
);

assert.equal(
    toDateText(calculateProbationEndDate({ ...base, startDate: '2026-01-01T15:30:00+07:00' })),
    '2026-04-01',
    'ISO string input with time uses the date component'
);

assert.equal(
    toDateText(calculateProbationEndDate({ ...base, probationExtensionDays: 30 })),
    '2026-05-01',
    'extension days push actual probation end date'
);

assert.equal(
    toDateText(calculateProbationEndDate({
        ...base,
        probationExtensionDays: 30,
        probationOverrideDate: '2026-02-15',
    })),
    '2026-02-15',
    'override date wins over calculated probation end'
);

assert.equal(
    toDateText(calculateVacationEligibleDate({ ...base, probationExtensionDays: 30 })),
    '2027-05-01',
    'vacation eligible date is actual probation end plus configured years'
);

assert.equal(
    isVacationEligibleOnDate({ ...base, probationExtensionDays: 30 }, '2027-04-30'),
    false,
    'leave before eligible date is blocked'
);

assert.equal(
    isVacationEligibleOnDate({ ...base, probationExtensionDays: 30 }, '2027-05-01'),
    true,
    'leave on eligible date is allowed'
);

assert.deepEqual(
    Object.fromEntries(
        Object.entries(getFiscalYearRange(2027, '04-01')).map(([key, value]) => [key, toDateText(value)])
    ),
    { start: '2027-04-01', end: '2028-03-31' },
    'fiscal year range respects MM-DD start setting'
);

assert.equal(
    isVacationEntitledInFiscalYear({ ...base, probationExtensionDays: 30 }, 2027, '04-01'),
    true,
    'full vacation entitlement is granted when eligibility falls inside the target fiscal year'
);

assert.equal(
    isVacationEntitledInFiscalYear({ ...base, probationExtensionDays: 30 }, 2026, '04-01'),
    false,
    'vacation entitlement is not created before the eligible fiscal year'
);

assert.equal(
    isVacationEntitledInFiscalYear({ ...base, probationExtensionDays: 30 }, 2028, '01-01'),
    true,
    'vacation entitlement remains available in fiscal years after the eligible date'
);

assert.equal(
    daysUntilVacationEligible({ ...base, probationExtensionDays: 30 }, '2027-04-30'),
    1,
    'days until eligible counts whole date-only days'
);

assert.equal(
    daysUntilVacationEligible({ ...base, probationExtensionDays: 30 }, '2027-05-01'),
    0,
    'days until eligible is zero on the eligible date'
);

console.log('vacation eligibility tests passed');
