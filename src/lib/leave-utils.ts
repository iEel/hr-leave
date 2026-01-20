/**
 * Leave Utility Functions
 * สำหรับการคำนวณวันลาและการแสดงผล
 */

const STANDARD_WORK_HOURS = 8; // ชั่วโมงทำงานต่อวัน
const LUNCH_START = '12:00';
const LUNCH_END = '13:00';

/**
 * แปลงเวลา 'HH:mm' เป็นนาที
 */
export function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * แปลงนาทีเป็นเวลา 'HH:mm'
 */
export function minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * คำนวณจำนวนชั่วโมงจากเวลาเริ่ม-สิ้นสุด
 * หัก Lunch Break (12:00-13:00) อัตโนมัติหากคาบเกี่ยว
 */
export function calculateHourlyDuration(startTime: string, endTime: string): {
    totalMinutes: number;
    lunchDeducted: boolean;
    netMinutes: number;
    netHours: number;
} {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const lunchStartMinutes = timeToMinutes(LUNCH_START);
    const lunchEndMinutes = timeToMinutes(LUNCH_END);

    const totalMinutes = endMinutes - startMinutes;

    // คำนวณว่าเวลาลาคาบเกี่ยวกับพักเที่ยงหรือไม่
    let lunchDeducted = false;
    let deductMinutes = 0;

    // ถ้า start < 13:00 และ end > 12:00 (คาบเกี่ยวพักเที่ยง)
    if (startMinutes < lunchEndMinutes && endMinutes > lunchStartMinutes) {
        // คำนวณว่าซ้อนทับช่วงพักเที่ยงกี่นาที
        const overlapStart = Math.max(startMinutes, lunchStartMinutes);
        const overlapEnd = Math.min(endMinutes, lunchEndMinutes);
        deductMinutes = Math.max(0, overlapEnd - overlapStart);

        if (deductMinutes > 0) {
            lunchDeducted = true;
        }
    }

    const netMinutes = totalMinutes - deductMinutes;
    const netHours = netMinutes / 60;

    return {
        totalMinutes,
        lunchDeducted,
        netMinutes,
        netHours,
    };
}

/**
 * แปลงชั่วโมงเป็นวัน (หาร 8)
 */
export function hoursToDays(hours: number): number {
    return hours / STANDARD_WORK_HOURS;
}

/**
 * แปลงทศนิยมวันเป็นรูปแบบ "X วัน Y ชั่วโมง" หรือ "X วัน Y ชม. Z นาที"
 * เช่น 5.75 -> "5 วัน 6 ชั่วโมง"
 * เช่น 5.125 -> "5 วัน 1 ชั่วโมง"
 * เช่น 0.0625 -> "30 นาที"
 */
export function formatLeaveDays(days: number): string {
    if (days === 0) return '0 วัน';

    const wholeDays = Math.floor(days);
    const fractionalDays = days - wholeDays;

    // แปลงเศษส่วนวันเป็นชั่วโมง
    const hours = fractionalDays * STANDARD_WORK_HOURS;
    const wholeHours = Math.floor(hours);
    const fractionalHours = hours - wholeHours;

    // แปลงเศษส่วนชั่วโมงเป็นนาที
    const minutes = Math.round(fractionalHours * 60);

    const parts: string[] = [];

    if (wholeDays > 0) {
        parts.push(`${wholeDays} วัน`);
    }

    if (wholeHours > 0) {
        parts.push(`${wholeHours} ชม.`);
    }

    if (minutes > 0) {
        parts.push(`${minutes} นาที`);
    }

    return parts.length > 0 ? parts.join(' ') : '0 วัน';
}

/**
 * แสดงผลเวลาแบบ Range "09:30 - 11:30"
 */
export function formatTimeRange(startTime: string, endTime: string): string {
    return `${startTime} - ${endTime}`;
}

/**
 * สร้างตัวเลือกเวลาทีละ 30 นาที
 * เริ่มจาก 08:00 ถึง 18:00
 */
export function generateTimeOptions(): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];

    for (let hour = 8; hour <= 18; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
            if (hour === 18 && minute > 0) break; // ไม่เกิน 18:00

            const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            options.push({ value: time, label: time });
        }
    }

    return options;
}

/**
 * Validate เวลาเริ่ม-สิ้นสุด
 */
export function validateTimeRange(startTime: string, endTime: string): {
    isValid: boolean;
    error?: string;
} {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    if (endMinutes <= startMinutes) {
        return { isValid: false, error: 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น' };
    }

    const duration = endMinutes - startMinutes;
    if (duration < 30) {
        return { isValid: false, error: 'ระยะเวลาลาขั้นต่ำ 30 นาที' };
    }

    return { isValid: true };
}
