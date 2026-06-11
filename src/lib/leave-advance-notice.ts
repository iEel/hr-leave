const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnly(value: string | Date): Date {
    if (value instanceof Date) {
        return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    }

    const [datePart] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

export function parseAdvanceNoticeDays(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDateOnlyDifferenceInDays(from: string | Date, to: string | Date): number {
    return Math.floor((toDateOnly(to).getTime() - toDateOnly(from).getTime()) / DAY_MS);
}

export function isLeaveDateAllowedByAdvanceNotice(
    leaveStartDate: string | Date,
    asOf: string | Date,
    advanceNoticeDays: number
): boolean {
    return getDateOnlyDifferenceInDays(asOf, leaveStartDate) >= advanceNoticeDays;
}

export function formatAdvanceNoticeRule(advanceNoticeDays: number): string {
    if (advanceNoticeDays < 0) {
        return `ย้อนหลังได้ไม่เกิน ${Math.abs(advanceNoticeDays)} วัน`;
    }

    if (advanceNoticeDays === 0) {
        return 'ขอวันเดียวกับวันที่ลาได้';
    }

    return `ต้องแจ้งล่วงหน้าอย่างน้อย ${advanceNoticeDays} วัน`;
}

export function formatVacationAdvanceNoticeError(advanceNoticeDays: number): string {
    if (advanceNoticeDays < 0) {
        return `การลาพักร้อนย้อนหลังได้ไม่เกิน ${Math.abs(advanceNoticeDays)} วัน`;
    }

    if (advanceNoticeDays === 0) {
        return 'การลาพักร้อนย้อนหลังไม่ได้';
    }

    return `การลาพักร้อนต้องแจ้งล่วงหน้าอย่างน้อย ${advanceNoticeDays} วัน`;
}
