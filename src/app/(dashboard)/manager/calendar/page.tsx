'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Users,
    AlertCircle,
    ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { formatLeaveDays } from '@/lib/leave-utils';

interface LeaveEvent {
    id: number;
    userId: number;
    employeeName: string;
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
    status: string;
    timeSlot: string;
}

interface Holiday {
    date: string;
    name: string;
    type: string;
}

interface TeamMember {
    id: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    department: string;
}

const LEAVE_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    VACATION: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300' },
    SICK: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-300' },
    PERSONAL: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-300' },
    MATERNITY: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-300' },
    MILITARY: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-300' },
    ORDINATION: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-300' },
    STERILIZATION: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300' },
    TRAINING: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-300' },
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
    VACATION: 'พักร้อน',
    SICK: 'ลาป่วย',
    PERSONAL: 'ลากิจ',
    MATERNITY: 'ลาคลอด',
    MILITARY: 'เกณฑ์ทหาร',
    ORDINATION: 'ลาบวช',
    STERILIZATION: 'ลาทำหมัน',
    TRAINING: 'ลาฝึกอบรม',
};

const MONTH_NAMES = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export default function TeamCalendarPage() {
    const { data: session } = useSession();
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [loading, setLoading] = useState(true);
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [leaves, setLeaves] = useState<LeaveEvent[]>([]);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    useEffect(() => {
        fetchCalendarData();
    }, [year, month]);

    const fetchCalendarData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/manager/calendar?year=${year}&month=${month}`);
            const data = await res.json();
            if (data.success) {
                setTeam(data.data.team);
                setLeaves(data.data.leaves);
                setHolidays(data.data.holidays);
            }
        } catch (error) {
            console.error('Error fetching calendar:', error);
        } finally {
            setLoading(false);
        }
    };

    const prevMonth = () => {
        if (month === 1) {
            setMonth(12);
            setYear(year - 1);
        } else {
            setMonth(month - 1);
        }
    };

    const nextMonth = () => {
        if (month === 12) {
            setMonth(1);
            setYear(year + 1);
        } else {
            setMonth(month + 1);
        }
    };

    // Generate calendar days
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const calendarDays: (number | null)[] = [];

    // Add empty cells for days before the first day
    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarDays.push(null);
    }

    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
        calendarDays.push(i);
    }

    // Get leaves for a specific date
    const getLeavesForDate = (day: number) => {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return leaves.filter(leave => {
            return dateStr >= leave.startDate && dateStr <= leave.endDate;
        });
    };

    // Check if date is a holiday
    const getHolidayForDate = (day: number) => {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return holidays.find(h => h.date === dateStr);
    };

    // Check if date is today
    const isToday = (day: number) => {
        return today.getFullYear() === year &&
            today.getMonth() + 1 === month &&
            today.getDate() === day;
    };

    // Check if date is weekend
    const isWeekend = (day: number) => {
        const date = new Date(year, month - 1, day);
        return date.getDay() === 0 || date.getDay() === 6;
    };

    if (team.length === 0 && !loading) {
        return (
            <div className="animate-fade-in">
                <div className="flex items-center gap-3 mb-8">
                    <Link href="/manager/overview" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <ArrowLeft className="w-5 h-5 text-gray-500" />
                    </Link>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                        <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ปฏิทินทีม</h1>
                        <p className="text-gray-500">แสดงวันลาของสมาชิกในทีม</p>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-700">
                    <AlertCircle className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">ไม่มีสมาชิกในทีม</h2>
                    <p className="text-gray-500">คุณยังไม่มีลูกน้องในระบบ</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <Link href="/manager/overview" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <ArrowLeft className="w-5 h-5 text-gray-500" />
                    </Link>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                        <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ปฏิทินทีม</h1>
                        <p className="text-gray-500">{team.length} สมาชิก | {session?.user?.department}</p>
                    </div>
                </div>

                {/* Month Navigation */}
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl p-2 shadow-sm border border-gray-100 dark:border-gray-700">
                    <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-semibold text-gray-900 dark:text-white min-w-[150px] text-center">
                        {MONTH_NAMES[month - 1]} {year + 543}
                    </span>
                    <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-4">
                {Object.entries(LEAVE_TYPE_LABELS).slice(0, 4).map(([type, label]) => {
                    const colors = LEAVE_TYPE_COLORS[type];
                    return (
                        <div key={type} className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${colors.bg} ${colors.text} text-xs font-medium`}>
                            <span className={`w-2 h-2 rounded-full ${colors.bg.replace('100', '500').replace('/30', '')}`} />
                            {label}
                        </div>
                    );
                })}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    {/* Day Headers */}
                    <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                        {DAY_NAMES.map((day, idx) => (
                            <div key={day} className={`py-3 text-center text-sm font-medium ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7">
                        {calendarDays.map((day, idx) => {
                            if (day === null) {
                                return <div key={`empty-${idx}`} className="min-h-[100px] bg-gray-50/50 dark:bg-gray-900/50 border-b border-r border-gray-100 dark:border-gray-700" />;
                            }

                            const dayLeaves = getLeavesForDate(day);
                            const holiday = getHolidayForDate(day);
                            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                            return (
                                <div
                                    key={day}
                                    onClick={() => setSelectedDate(selectedDate === dateStr ? null : dateStr)}
                                    className={`min-h-[100px] p-2 border-b border-r border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${isWeekend(day) ? 'bg-gray-50/50 dark:bg-gray-900/30' : ''
                                        } ${selectedDate === dateStr ? 'ring-2 ring-orange-500 ring-inset' : ''}`}
                                >
                                    {/* Date Number */}
                                    <div className={`flex items-center justify-between mb-1`}>
                                        <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium ${isToday(day) ? 'bg-orange-500 text-white' :
                                                isWeekend(day) ? (idx % 7 === 0 ? 'text-red-500' : 'text-blue-500') :
                                                    'text-gray-700 dark:text-gray-300'
                                            }`}>
                                            {day}
                                        </span>
                                        {dayLeaves.length > 0 && (
                                            <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 px-1.5 py-0.5 rounded-full">
                                                {dayLeaves.length}
                                            </span>
                                        )}
                                    </div>

                                    {/* Holiday */}
                                    {holiday && (
                                        <div className="text-xs bg-red-50 dark:bg-red-900/20 text-red-600 px-1.5 py-0.5 rounded mb-1 truncate">
                                            🎉 {holiday.name}
                                        </div>
                                    )}

                                    {/* Leave Events */}
                                    <div className="space-y-0.5">
                                        {dayLeaves.slice(0, 2).map((leave) => {
                                            const colors = LEAVE_TYPE_COLORS[leave.leaveType] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' };
                                            return (
                                                <div
                                                    key={leave.id}
                                                    className={`text-xs px-1.5 py-0.5 rounded truncate ${colors.bg} ${colors.text} ${leave.status === 'PENDING' ? 'border border-dashed ' + colors.border : ''}`}
                                                    title={`${leave.employeeName} - ${LEAVE_TYPE_LABELS[leave.leaveType]}`}
                                                >
                                                    {leave.employeeName.split(' ')[0]}
                                                </div>
                                            );
                                        })}
                                        {dayLeaves.length > 2 && (
                                            <div className="text-xs text-gray-400 px-1.5">
                                                +{dayLeaves.length - 2} อีก
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Selected Date Detail */}
            {selectedDate && (
                <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                        📅 {new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </h3>
                    {getLeavesForDate(parseInt(selectedDate.split('-')[2])).length === 0 ? (
                        <p className="text-gray-500 text-center py-4">ไม่มีใครลาในวันนี้</p>
                    ) : (
                        <div className="space-y-3">
                            {getLeavesForDate(parseInt(selectedDate.split('-')[2])).map(leave => {
                                const colors = LEAVE_TYPE_COLORS[leave.leaveType] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' };
                                return (
                                    <div key={leave.id} className={`flex items-center justify-between p-4 rounded-xl ${colors.bg}`}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center font-semibold text-gray-700 dark:text-gray-300">
                                                {leave.employeeName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className={`font-medium ${colors.text}`}>{leave.employeeName}</p>
                                                <p className="text-xs text-gray-500">
                                                    {LEAVE_TYPE_LABELS[leave.leaveType]} • {leave.startDate} - {leave.endDate}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${leave.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {leave.status === 'APPROVED' ? 'อนุมัติ' : 'รออนุมัติ'}
                                            </span>
                                            <p className="text-xs text-gray-400 mt-1">
                                                {formatLeaveDays(leave.days)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
