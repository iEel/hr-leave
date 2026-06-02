export interface VacationEligibilityInput {
    startDate: string | Date;
    probationDays?: number | null;
    probationExtensionDays?: number | null;
    probationOverrideDate?: string | Date | null;
    vacationDelayYears?: number | null;
}

const DEFAULT_PROBATION_DAYS = 90;
const DEFAULT_PROBATION_EXTENSION_DAYS = 0;
const DEFAULT_VACATION_DELAY_YEARS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnly(value: string | Date): Date {
    if (value instanceof Date) {
        return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }

    const [datePart] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function addYears(date: Date, years: number): Date {
    const result = new Date(date);
    result.setUTCFullYear(result.getUTCFullYear() + years);
    return result;
}

function resolveNumber(value: number | null | undefined, fallback: number): number {
    return Number(value ?? fallback);
}

export function calculateProbationEndDate(input: VacationEligibilityInput): Date {
    if (input.probationOverrideDate) {
        return toDateOnly(input.probationOverrideDate);
    }

    const probationDays = resolveNumber(input.probationDays, DEFAULT_PROBATION_DAYS);
    const extensionDays = resolveNumber(input.probationExtensionDays, DEFAULT_PROBATION_EXTENSION_DAYS);
    return addDays(toDateOnly(input.startDate), probationDays + extensionDays);
}

export function calculateVacationEligibleDate(input: VacationEligibilityInput): Date {
    const vacationDelayYears = resolveNumber(input.vacationDelayYears, DEFAULT_VACATION_DELAY_YEARS);
    return addYears(calculateProbationEndDate(input), vacationDelayYears);
}

export function getFiscalYearRange(year: number, fiscalYearStart: string): { start: Date; end: Date } {
    const [month, day] = fiscalYearStart.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day));
    const end = addDays(new Date(Date.UTC(year + 1, month - 1, day)), -1);

    return { start, end };
}

export function isVacationEligibleOnDate(
    input: VacationEligibilityInput,
    leaveStartDate: string | Date
): boolean {
    return toDateOnly(leaveStartDate) >= calculateVacationEligibleDate(input);
}

export function isVacationEntitledInFiscalYear(
    input: VacationEligibilityInput,
    fiscalYear: number,
    fiscalYearStart: string
): boolean {
    const eligibleDate = calculateVacationEligibleDate(input);
    const range = getFiscalYearRange(fiscalYear, fiscalYearStart);

    return eligibleDate <= range.end;
}

export function daysUntilVacationEligible(
    input: VacationEligibilityInput,
    asOf: string | Date = new Date()
): number {
    const eligibleDate = calculateVacationEligibleDate(input);
    const date = toDateOnly(asOf);

    if (date >= eligibleDate) {
        return 0;
    }

    return Math.ceil((eligibleDate.getTime() - date.getTime()) / DAY_MS);
}
