'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
    CalendarPlus,
    Calendar,
    Clock,
    FileText,
    Upload,
    AlertCircle,
    CheckCircle,
    Loader2,
    Info,
    Briefcase,
    Heart,
    User,
    Baby,
    Shield,
    Church,
    Scissors,
    GraduationCap,
    HelpCircle,
    Coffee,
} from 'lucide-react';
import {
    calculateHourlyDuration,
    formatLeaveDays,
    generateTimeOptions,
    validateTimeRange,
    hoursToDays,
} from '@/lib/leave-utils';

// Leave type options
const leaveTypes = [
    { value: 'VACATION', label: 'ลาพักร้อน', icon: Briefcase, color: 'blue', requiresDoc: false },
    { value: 'SICK', label: 'ลาป่วย', icon: Heart, color: 'red', requiresDoc: true }, // docThreshold set dynamically
    { value: 'PERSONAL', label: 'ลากิจ', icon: User, color: 'purple', requiresDoc: false },
    { value: 'MATERNITY', label: 'ลาคลอด', icon: Baby, color: 'pink', requiresDoc: true },
    { value: 'MILITARY', label: 'เกณฑ์ทหาร', icon: Shield, color: 'green', requiresDoc: true },
    { value: 'ORDINATION', label: 'ลาบวช', icon: Church, color: 'yellow', requiresDoc: false },
    { value: 'STERILIZATION', label: 'ลาทำหมัน', icon: Scissors, color: 'teal', requiresDoc: true },
    { value: 'TRAINING', label: 'ลาฝึกอบรม', icon: GraduationCap, color: 'indigo', requiresDoc: false },
    { value: 'OTHER', label: 'อื่นๆ', icon: HelpCircle, color: 'gray', requiresDoc: false },
];

// Time slot options for day/half-day
const dayTimeSlots = [
    { value: 'FULL_DAY', label: 'เต็มวัน', desc: '1 วัน' },
    { value: 'HALF_MORNING', label: 'ครึ่งวันเช้า', desc: '0.5 วัน' },
    { value: 'HALF_AFTERNOON', label: 'ครึ่งวันบ่าย', desc: '0.5 วัน' },
];

// Generate time options (08:00 - 18:00, 30 min intervals)
const timeOptions = generateTimeOptions();

export default function LeaveRequestPage() {
    const { data: session } = useSession();
    const router = useRouter();

    // Form state
    const [leaveType, setLeaveType] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isHourlyMode, setIsHourlyMode] = useState(false);
    const [timeSlot, setTimeSlot] = useState('FULL_DAY');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('11:00');
    const [reason, setReason] = useState('');
    const [hasMedicalCert, setHasMedicalCert] = useState(false);
    const [medicalCertFile, setMedicalCertFile] = useState<File | null>(null);

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [calculatedDays, setCalculatedDays] = useState(0);
    const [hourlyInfo, setHourlyInfo] = useState<{
        netHours: number;
        lunchDeducted: boolean;
    } | null>(null);

    // Dynamic Rules State
    const [leaveRules, setLeaveRules] = useState({
        advanceNoticeDays: 3,
        sickCertThreshold: 3
    });

    // Working Saturdays State
    interface WorkingSaturdayData {
        date: string;
        startTime: string;
        endTime: string;
        workHours: number;
    }
    const [workingSaturdays, setWorkingSaturdays] = useState<WorkingSaturdayData[]>([]);
    const [workHoursPerDay, setWorkHoursPerDay] = useState(7.5);
    const [workSchedule, setWorkSchedule] = useState({
        workStartTime: '08:30',
        workEndTime: '17:00',
        breakStartTime: '12:00',
        breakEndTime: '13:00',
    });
    const [publicHolidays, setPublicHolidays] = useState<{ date: string }[]>([]);

    // Fetch rules on mount
    useEffect(() => {
        const fetchRules = async () => {
            try {
                const res = await fetch('/api/settings/rules');
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        setLeaveRules(data.rules);
                    }
                }

                // Fetch work schedule settings
                const scheduleRes = await fetch('/api/hr/work-schedule');
                if (scheduleRes.ok) {
                    const scheduleData = await scheduleRes.json();
                    if (scheduleData.success) {
                        setWorkHoursPerDay(scheduleData.settings.workHoursPerDay || 7.5);
                        setWorkSchedule({
                            workStartTime: scheduleData.settings.workStartTime || '08:30',
                            workEndTime: scheduleData.settings.workEndTime || '17:00',
                            breakStartTime: scheduleData.settings.breakStartTime || '12:00',
                            breakEndTime: scheduleData.settings.breakEndTime || '13:00',
                        });
                    }
                }
            } catch (error) {
                console.error('Failed to fetch leave rules', error);
            }
        };
        fetchRules();
    }, []);

    // Fetch working saturdays when dates change
    useEffect(() => {
        const fetchWorkingSaturdays = async () => {
            if (!startDate || !endDate) {
                setWorkingSaturdays([]);
                return;
            }
            try {
                const res = await fetch(`/api/working-saturdays/range?startDate=${startDate}&endDate=${endDate}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        setWorkingSaturdays(data.workingSaturdays || []);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch working saturdays', error);
            }
        };
        fetchWorkingSaturdays();
    }, [startDate, endDate]);

    // Fetch public holidays when dates change
    useEffect(() => {
        const fetchPublicHolidays = async () => {
            if (!startDate || !endDate) {
                setPublicHolidays([]);
                return;
            }
            try {
                const res = await fetch(`/api/holidays?startDate=${startDate}&endDate=${endDate}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        setPublicHolidays(data.holidays || []);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch public holidays', error);
            }
        };
        fetchPublicHolidays();
    }, [startDate, endDate]);

    // Calculate leave days when dates/times change
    useEffect(() => {
        if (isHourlyMode) {
            // Hourly mode calculation
            if (startDate && startTime && endTime) {
                const validation = validateTimeRange(startTime, endTime);
                if (validation.isValid) {
                    const result = calculateHourlyDuration(startTime, endTime);
                    const days = hoursToDays(result.netHours, workHoursPerDay);
                    setCalculatedDays(days);
                    setHourlyInfo({
                        netHours: result.netHours,
                        lunchDeducted: result.lunchDeducted,
                    });
                } else {
                    setCalculatedDays(0);
                    setHourlyInfo(null);
                }
            } else {
                setCalculatedDays(0);
                setHourlyInfo(null);
            }
        } else {
            // Day/Half-day mode calculation with working Saturdays and Public Holidays support
            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);

                if (end >= start) {
                    let days = 0;
                    const current = new Date(start);

                    // Create a map of working saturdays for quick lookup
                    const workingSatMap = new Map<string, number>();
                    for (const ws of workingSaturdays) {
                        workingSatMap.set(ws.date, ws.workHours);
                    }

                    // Create a set of public holidays for quick lookup
                    const holidaySet = new Set<string>();
                    for (const h of publicHolidays) {
                        holidaySet.add(h.date);
                    }

                    while (current <= end) {
                        const dayOfWeek = current.getDay();
                        // Use local date format to avoid UTC timezone shift
                        const year = current.getFullYear();
                        const month = String(current.getMonth() + 1).padStart(2, '0');
                        const day = String(current.getDate()).padStart(2, '0');
                        const dateStr = `${year}-${month}-${day}`;

                        // Public Holiday - always skip
                        if (holidaySet.has(dateStr)) {
                            current.setDate(current.getDate() + 1);
                            continue;
                        }

                        // Sunday - always skip
                        if (dayOfWeek === 0) {
                            current.setDate(current.getDate() + 1);
                            continue;
                        }

                        // Saturday - check if working Saturday
                        if (dayOfWeek === 6) {
                            const satWorkHours = workingSatMap.get(dateStr);
                            if (satWorkHours) {
                                // Calculate partial day based on Saturday work hours
                                days += satWorkHours / workHoursPerDay;
                            }
                            current.setDate(current.getDate() + 1);
                            continue;
                        }

                        // Regular weekday (Mon-Fri)
                        days++;
                        current.setDate(current.getDate() + 1);
                    }

                    // Adjust for half day using actual work schedule times
                    if (timeSlot === 'HALF_MORNING' || timeSlot === 'HALF_AFTERNOON') {
                        // Calculate morning/afternoon fractions from work schedule
                        const toMins = (t: string) => {
                            const [h, m] = t.split(':').map(Number);
                            return h * 60 + m;
                        };
                        const morningMins = toMins(workSchedule.breakStartTime) - toMins(workSchedule.workStartTime);
                        const afternoonMins = toMins(workSchedule.workEndTime) - toMins(workSchedule.breakEndTime);
                        const totalWorkMins = morningMins + afternoonMins;

                        if (timeSlot === 'HALF_MORNING') {
                            // Morning fraction of the day
                            const morningFraction = totalWorkMins > 0 ? morningMins / totalWorkMins : 0.5;
                            days = days > 0 ? days * morningFraction : 0;
                        } else {
                            // Afternoon fraction of the day
                            const afternoonFraction = totalWorkMins > 0 ? afternoonMins / totalWorkMins : 0.5;
                            days = days > 0 ? days * afternoonFraction : 0;
                        }
                    }

                    // Round to 4 decimal places for precision
                    setCalculatedDays(Math.round(days * 10000) / 10000);
                } else {
                    setCalculatedDays(0);
                }
            } else {
                setCalculatedDays(0);
            }
            setHourlyInfo(null);
        }
    }, [startDate, endDate, timeSlot, isHourlyMode, startTime, endTime, workingSaturdays, publicHolidays, workHoursPerDay, workSchedule]);

    // Sync endDate with startDate for hourly mode (same day only)
    useEffect(() => {
        if (isHourlyMode && startDate) {
            setEndDate(startDate);
        }
    }, [isHourlyMode, startDate]);

    // Check if leave is Saturday-only (to disable half-day options)
    const isSaturdayOnlyLeave = (() => {
        if (!startDate || !endDate) return false;
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Check if all days in range are Saturdays
        const current = new Date(start);
        while (current <= end) {
            if (current.getDay() !== 6) return false; // Not Saturday
            current.setDate(current.getDate() + 1);
        }
        return true;
    })();

    // Reset to FULL_DAY if Saturday-only and half-day was selected
    useEffect(() => {
        if (isSaturdayOnlyLeave && (timeSlot === 'HALF_MORNING' || timeSlot === 'HALF_AFTERNOON')) {
            setTimeSlot('FULL_DAY');
        }
    }, [isSaturdayOnlyLeave, timeSlot]);

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Check if medical cert is required
    const selectedType = leaveTypes.find(t => t.value === leaveType);

    // Dynamic Doc Threshold Check
    // Dynamic Doc Threshold Check
    const requiresMedicalCert = selectedType?.requiresDoc &&
        (leaveType === 'SICK'
            ? calculatedDays >= leaveRules.sickCertThreshold
            : calculatedDays >= ('docThreshold' in (selectedType || {}) ? (selectedType as any).docThreshold : 1));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            // Validation
            if (!leaveType) {
                throw new Error('กรุณาเลือกประเภทการลา');
            }
            if (!startDate) {
                throw new Error('กรุณาเลือกวันที่');
            }
            if (!isHourlyMode && !endDate) {
                throw new Error('กรุณาเลือกวันที่สิ้นสุด');
            }
            if (!isHourlyMode && new Date(endDate) < new Date(startDate)) {
                throw new Error('วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น');
            }
            if (isHourlyMode) {
                const validation = validateTimeRange(startTime, endTime);
                if (!validation.isValid) {
                    throw new Error(validation.error || 'เวลาไม่ถูกต้อง');
                }
            }
            if (!reason.trim()) {
                throw new Error('กรุณาระบุเหตุผลการลา');
            }
            if (requiresMedicalCert && !hasMedicalCert) {
                const threshold = leaveType === 'SICK'
                    ? leaveRules.sickCertThreshold
                    : ('docThreshold' in (selectedType || {}) ? (selectedType as any).docThreshold : 1);
                throw new Error(`ลาป่วยตั้งแต่ ${threshold} วันขึ้นไป ต้องมีใบรับรองแพทย์`);
            }

            // Upload medical certificate file if exists
            let medicalCertificateFileUrl = null;
            if (medicalCertFile && hasMedicalCert) {
                const uploadFormData = new FormData();
                uploadFormData.append('file', medicalCertFile);

                const uploadResponse = await fetch('/api/upload/medical', {
                    method: 'POST',
                    body: uploadFormData,
                });

                if (!uploadResponse.ok) {
                    const uploadError = await uploadResponse.json();
                    throw new Error(uploadError.error || 'ไม่สามารถอัปโหลดไฟล์ได้');
                }

                const uploadResult = await uploadResponse.json();
                medicalCertificateFileUrl = uploadResult.data.url;
            }

            // Build form data
            const formData = {
                leaveType,
                startDate,
                endDate: isHourlyMode ? startDate : endDate,
                isHourly: isHourlyMode,
                timeSlot: isHourlyMode ? 'HOURLY' : timeSlot,
                startTime: isHourlyMode ? startTime : null,
                endTime: isHourlyMode ? endTime : null,
                reason,
                hasMedicalCert,
                medicalCertificateFile: medicalCertificateFileUrl,
                usageAmount: calculatedDays,
            };

            console.log('Submitting:', formData);

            // Call real API
            const response = await fetch('/api/leave/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'เกิดข้อผิดพลาดในการส่งคำขอ');
            }

            setSuccess(true);
            setTimeout(() => {
                router.push('/leave/history');
            }, 2000);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center animate-fade-in">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        ส่งคำขอลาสำเร็จ!
                    </h2>
                    <p className="text-gray-500">กำลังพาไปหน้าประวัติการลา...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                        <CalendarPlus className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            ขอลางาน
                        </h1>
                        <p className="text-gray-500">กรอกข้อมูลเพื่อยื่นคำขอลา</p>
                    </div>
                </div>
            </div>

            {/* Manager Warning Banner - Show if user has no manager assigned */}
            {!session?.user?.departmentHeadId && (
                <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                            ยังไม่ได้กำหนดหัวหน้างาน
                        </h3>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            คุณยังไม่สามารถขอลาได้ เนื่องจากยังไม่มีการกำหนดหัวหน้างานในระบบ
                            กรุณาติดต่อฝ่าย HR เพื่อดำเนินการ
                        </p>
                    </div>
                </div>
            )}

            {/* Error Alert */}
            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Leave Type Selection */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                        ประเภทการลา <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {leaveTypes.map((type) => {
                            const Icon = type.icon;
                            const isSelected = leaveType === type.value;
                            return (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => setLeaveType(type.value)}
                                    className={`p-4 rounded-xl border-2 transition-all ${isSelected
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <Icon className={`w-6 h-6 mx-auto mb-2 ${isSelected ? 'text-blue-600' : 'text-gray-400'
                                        }`} />
                                    <span className={`block text-sm font-medium ${isSelected ? 'text-blue-600' : 'text-gray-600 dark:text-gray-400'
                                        }`}>
                                        {type.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Date & Time Selection */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    {/* Mode Toggle */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                            <Clock className="w-4 h-4 inline mr-2" />
                            รูปแบบเวลา
                        </label>
                        <div className="flex rounded-xl bg-gray-100 dark:bg-gray-900 p-1">
                            <button
                                type="button"
                                onClick={() => setIsHourlyMode(false)}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${!isHourlyMode
                                    ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                เต็มวัน / ครึ่งวัน
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsHourlyMode(true)}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${isHourlyMode
                                    ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                ระบุชั่วโมง
                            </button>
                        </div>
                    </div>

                    {/* Date Selection */}
                    <div className={`grid gap-6 ${isHourlyMode ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                        {/* Start Date */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                <Calendar className="w-4 h-4 inline mr-2" />
                                {isHourlyMode ? 'วันที่' : 'วันที่เริ่มต้น'} <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        {/* End Date (only for day mode) */}
                        {!isHourlyMode && (
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    <Calendar className="w-4 h-4 inline mr-2" />
                                    วันที่สิ้นสุด <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    min={startDate}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                        )}
                    </div>

                    {/* Time Slot (Day Mode) */}
                    {!isHourlyMode && (
                        <div className="mt-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                ช่วงเวลา
                            </label>
                            <div className="flex gap-3">
                                {dayTimeSlots.map((slot) => {
                                    const isHalfDay = slot.value === 'HALF_MORNING' || slot.value === 'HALF_AFTERNOON';
                                    const isDisabled = isHalfDay && isSaturdayOnlyLeave;

                                    return (
                                        <button
                                            key={slot.value}
                                            type="button"
                                            onClick={() => !isDisabled && setTimeSlot(slot.value)}
                                            disabled={isDisabled}
                                            className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all ${isDisabled
                                                ? 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                                                : timeSlot === slot.value
                                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                    : 'border-gray-200 dark:border-gray-700'
                                                }`}
                                        >
                                            <span className={`block font-medium ${isDisabled
                                                ? 'text-gray-400'
                                                : timeSlot === slot.value
                                                    ? 'text-blue-600'
                                                    : 'text-gray-600 dark:text-gray-400'
                                                }`}>
                                                {slot.label}
                                            </span>
                                            <span className="text-xs text-gray-400">{slot.desc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {isSaturdayOnlyLeave && (
                                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                                    ⚠️ วันเสาร์ไม่รองรับครึ่งวัน กรุณาใช้ "ระบุชั่วโมง" แทน
                                </p>
                            )}
                        </div>
                    )}

                    {/* Time Selection (Hourly Mode) */}
                    {isHourlyMode && (
                        <div className="mt-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                เวลา <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">ตั้งแต่</label>
                                    <select
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                                    >
                                        {timeOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">ถึง</label>
                                    <select
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                                    >
                                        {timeOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Calculated Summary */}
                    {calculatedDays > 0 && (
                        <div className="mt-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-3">
                                <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                <div>
                                    <p className="text-blue-700 dark:text-blue-300 font-medium">
                                        จำนวนที่ลา: <strong>{formatLeaveDays(calculatedDays, workHoursPerDay)}</strong>
                                        {hourlyInfo && (
                                            <span className="text-sm font-normal ml-2">
                                                ({hourlyInfo.netHours} ชั่วโมง)
                                            </span>
                                        )}
                                    </p>
                                    {hourlyInfo?.lunchDeducted && (
                                        <p className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-1">
                                            <Coffee className="w-4 h-4" />
                                            หักเวลาพักเที่ยง (12:00-13:00) แล้ว
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Reason */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        <FileText className="w-4 h-4 inline mr-2" />
                        เหตุผลการลา <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="ระบุเหตุผลการลา..."
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                </div>

                {/* Medical Certificate */}
                {(leaveType === 'SICK' || requiresMedicalCert) && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hasMedicalCert}
                                onChange={(e) => setHasMedicalCert(e.target.checked)}
                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                ฉันมีใบรับรองแพทย์
                            </span>
                            {requiresMedicalCert && (
                                <span className="text-xs text-red-500">(จำเป็น)</span>
                            )}
                        </label>

                        {hasMedicalCert && (
                            <div className="mt-4">
                                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    อัปโหลดใบรับรองแพทย์ (ถ้ามี)
                                </label>
                                <label
                                    htmlFor="medicalCertInput"
                                    className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center block cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                >
                                    <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                                    {medicalCertFile ? (
                                        <p className="text-sm text-green-600 font-medium">
                                            ✓ {medicalCertFile.name}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-gray-500">
                                            ลากไฟล์มาวางหรือคลิกเพื่อเลือกไฟล์
                                        </p>
                                    )}
                                    <input
                                        id="medicalCertInput"
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={(e) => setMedicalCertFile(e.target.files?.[0] || null)}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                )}

                {/* Info Box */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-4 text-white">
                    <div className="flex items-start gap-3">
                        <HelpCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium mb-1">โปรดทราบ</p>
                            <ul className="text-blue-100 space-y-1">
                                <li>• คำขอจะถูกส่งไปยังหัวหน้างานของคุณเพื่อพิจารณา</li>
                                <li>• ลาป่วย {leaveRules.sickCertThreshold} วันขึ้นไปต้องมีใบรับรองแพทย์</li>
                                <li>• สามารถยกเลิกได้เฉพาะเมื่อสถานะยังเป็น &quot;รออนุมัติ&quot;</li>
                                {isHourlyMode && (
                                    <li>• ลาเป็นชั่วโมงจะหักพักเที่ยง (12:00-13:00) อัตโนมัติ</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="flex-1 py-3.5 px-6 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        ยกเลิก
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting || !session?.user?.departmentHeadId}
                        className="flex-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg hover:shadow-xl hover:from-blue-500 hover:to-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                กำลังส่ง...
                            </>
                        ) : (
                            <>
                                <CalendarPlus className="w-5 h-5" />
                                ส่งคำขอลา
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
