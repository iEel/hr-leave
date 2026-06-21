export interface LeaveRequestNumberInput {
    id: number | string;
    createdAt?: string | Date | null;
}

function getYearFromDateString(createdAt: string): string | null {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(createdAt);
    if (!dateMatch) return null;

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year) return null;
    if (parsed.getUTCMonth() !== month - 1) return null;
    if (parsed.getUTCDate() !== day) return null;

    return String(year);
}

function getYear(createdAt: string | Date | null | undefined): string {
    if (!createdAt) return '0000';
    if (createdAt instanceof Date && !Number.isNaN(createdAt.getTime())) return String(createdAt.getFullYear());

    if (typeof createdAt === 'string') {
        return getYearFromDateString(createdAt) ?? '0000';
    }

    return '0000';
}

export function formatLeaveRequestNo(input: LeaveRequestNumberInput): string {
    const numericId = Number(input.id);
    const normalizedId = Number.isFinite(numericId) && numericId > 0 ? Math.trunc(numericId) : 0;
    return `LR-${getYear(input.createdAt)}-${String(normalizedId).padStart(6, '0')}`;
}
