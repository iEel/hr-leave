// Leave Types Enum
export enum LeaveType {
    VACATION = 'VACATION',       // พักร้อน
    SICK = 'SICK',               // ลาป่วย
    PERSONAL = 'PERSONAL',       // ลากิจ
    MATERNITY = 'MATERNITY',     // ลาคลอด
    MILITARY = 'MILITARY',       // เกณฑ์ทหาร
    ORDINATION = 'ORDINATION',   // ลาบวช
    STERILIZATION = 'STERILIZATION', // ทำหมัน
    TRAINING = 'TRAINING',       // ฝึกอบรม
    OTHER = 'OTHER',             // อื่นๆ
}

// Leave Request Status
export enum LeaveStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
}

// Time Slot for Half-day Logic
export enum TimeSlot {
    FULL_DAY = 'FULL_DAY',
    HALF_MORNING = 'HALF_MORNING',
    HALF_AFTERNOON = 'HALF_AFTERNOON',
    HOURLY = 'HOURLY', // ลาเป็นชั่วโมง
}

// User Roles
export enum UserRole {
    EMPLOYEE = 'EMPLOYEE',
    MANAGER = 'MANAGER',       // หัวหน้าแผนก
    HR = 'HR',
    ADMIN = 'ADMIN',           // Super Admin
}

// Company Enum
export enum Company {
    SONIC = 'SONIC',           // บริษัท โซนิค อินเตอร์เฟรท จำกัด
    GRANDLINK = 'GRANDLINK',   // บริษัท แกรนด์ลิงค์ ลอจิสติคส์ จำกัด
}

// Holiday Type
export enum HolidayType {
    PUBLIC = 'PUBLIC',         // วันหยุดประเพณี
    SPECIAL = 'SPECIAL',       // วันหยุดพิเศษบริษัท
}

// User Interface
export interface User {
    id: number;
    employeeId: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    company: Company;
    department: string;
    gender: 'M' | 'F';
    startDate: Date;
    departmentHeadId: number | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// Leave Request Interface
export interface LeaveRequest {
    id: number;
    userId: number;
    leaveType: LeaveType;
    startDatetime: Date;
    endDatetime: Date;
    isHourly: boolean;           // true = ลาเป็นชั่วโมง
    startTime: string | null;    // HH:mm (e.g. '09:30')
    endTime: string | null;      // HH:mm (e.g. '11:30')
    timeSlot: TimeSlot;
    usageAmount: number;         // จำนวนวันสุทธิ (หลังหักวันหยุด)
    reason: string;
    status: LeaveStatus;
    rejectionReason: string | null;
    hasMedicalCertificate: boolean;
    medicalCertificateFile: string | null;
    approverId: number | null;
    approvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

// Leave Balance Interface
export interface LeaveBalance {
    id: number;
    userId: number;
    leaveType: LeaveType;
    year: number;
    entitlement: number;       // สิทธิ์ที่ได้รับ
    used: number;              // ใช้ไปแล้ว
    remaining: number;         // คงเหลือ
    carryOver: number;         // ยกยอดจากปีก่อน
}

// Public Holiday Interface
export interface PublicHoliday {
    id: number;
    date: Date;
    name: string;
    type: HolidayType;
    company: Company | null;   // null = ทุกบริษัท
    createdAt: Date;
}

// Notification Interface
export interface Notification {
    id: number;
    userId: number;
    title: string;
    message: string;
    link: string | null;
    isRead: boolean;
    createdAt: Date;
}

// Audit Log Interface
export interface AuditLog {
    id: number;
    userId: number;
    action: string;
    targetTable: string;
    targetId: number | null;
    oldValue: string | null;
    newValue: string | null;
    ipAddress: string | null;
    createdAt: Date;
}

// Leave Quota Settings Interface
export interface LeaveQuotaSetting {
    id: number;
    leaveType: LeaveType;
    defaultDays: number;
    minTenureYears: number;    // อายุงานขั้นต่ำ (ปี)
    requiresMedicalCert: boolean;
    medicalCertDaysThreshold: number;
    isPaid: boolean;
    maxPaidDays: number | null;
    allowCarryOver: boolean;
    maxCarryOverDays: number;
    updatedAt: Date;
}

// Delegate (Acting) Approver Interface
export interface DelegateApprover {
    id: number;
    managerId: number;         // หัวหน้าตัวจริง
    delegateUserId: number;    // ผู้รักษาการแทน
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    createdAt: Date;
}
