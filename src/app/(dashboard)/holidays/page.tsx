'use client';

import { useState, useEffect } from 'react';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Star,
    Loader2,
    Sun,
    Moon,
} from 'lucide-react';

interface Holiday {
    id: number;
    date: string;
    name: string;
    description: string | null;
    isRecurring: boolean;
}

const MONTH_NAMES = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
    'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
    'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export default function HolidaysPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);

    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    // Fetch holidays from API
    const fetchHolidays = async (year: number) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/holidays?year=${year}`);
            const result = await response.json();
            if (result.success) {
                setHolidays(result.data);
            }
        } catch (error) {
            console.error('Error fetching holidays:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchHolidays(currentYear);
    }, [currentYear]);

    // Navigate months
    const goToPreviousMonth = () => {
        setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    // Get calendar grid
    const getCalendarDays = () => {
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        const days: (number | null)[] = [];

        // Add empty cells for days before the first of the month
        for (let i = 0; i < startingDay; i++) {
            days.push(null);
        }

        // Add days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        return days;
    };

    // Check if a date is a holiday
    const getHolidayForDate = (day: number): Holiday | undefined => {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return holidays.find(h => h.date === dateStr);
    };

    // Check if date is today
    const isToday = (day: number): boolean => {
        const today = new Date();
        return (
            day === today.getDate() &&
            currentMonth === today.getMonth() &&
            currentYear === today.getFullYear()
        );
    };

    // Check if date is weekend
    const isWeekend = (day: number): boolean => {
        const date = new Date(currentYear, currentMonth, day);
        return date.getDay() === 0 || date.getDay() === 6;
    };

    // Get holidays for current month (for list view)
    const monthHolidays = holidays.filter(h => {
        const holidayDate = new Date(h.date);
        return holidayDate.getMonth() === currentMonth;
    });

    // Get upcoming holidays (next 5)
    const upcomingHolidays = holidays
        .filter(h => new Date(h.date) >= new Date())
        .slice(0, 5);

    const calendarDays = getCalendarDays();

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                        <CalendarIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            ปฏิทินวันหยุด
                        </h1>
                        <p className="text-gray-500">วันหยุดราชการประจำปี {currentYear + 543}</p>
                    </div>
                </div>
                <button
                    onClick={goToToday}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
                >
                    <Sun className="w-4 h-4" />
                    วันนี้
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    {/* Calendar Header */}
                    <div className="p-4 bg-gradient-to-r from-orange-500 to-red-500 text-white">
                        <div className="flex items-center justify-between">
                            <button
                                onClick={goToPreviousMonth}
                                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <h2 className="text-xl font-bold">
                                {MONTH_NAMES[currentMonth]} {currentYear + 543}
                            </h2>
                            <button
                                onClick={goToNextMonth}
                                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
                        {DAY_NAMES.map((day, index) => (
                            <div
                                key={day}
                                className={`py-3 text-center text-sm font-medium ${index === 0 ? 'text-red-500' :
                                        index === 6 ? 'text-blue-500' :
                                            'text-gray-600 dark:text-gray-400'
                                    }`}
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    {isLoading ? (
                        <div className="p-12 text-center">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
                            <p className="text-gray-500">กำลังโหลด...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-7">
                            {calendarDays.map((day, index) => {
                                const holiday = day ? getHolidayForDate(day) : null;
                                const weekend = day ? isWeekend(day) : false;
                                const today = day ? isToday(day) : false;
                                const dayOfWeek = index % 7;

                                return (
                                    <div
                                        key={index}
                                        onClick={() => holiday && setSelectedHoliday(holiday)}
                                        className={`
                                            min-h-[80px] p-2 border-b border-r border-gray-100 dark:border-gray-700
                                            ${day ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' : ''}
                                            ${holiday ? 'bg-red-50 dark:bg-red-900/20' : ''}
                                            ${today ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                                        `}
                                    >
                                        {day && (
                                            <>
                                                <span className={`
                                                    inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium
                                                    ${today ? 'bg-blue-600 text-white' : ''}
                                                    ${holiday && !today ? 'bg-red-500 text-white' : ''}
                                                    ${!today && !holiday && dayOfWeek === 0 ? 'text-red-500' : ''}
                                                    ${!today && !holiday && dayOfWeek === 6 ? 'text-blue-500' : ''}
                                                    ${!today && !holiday && dayOfWeek !== 0 && dayOfWeek !== 6 ? 'text-gray-700 dark:text-gray-300' : ''}
                                                `}>
                                                    {day}
                                                </span>
                                                {holiday && (
                                                    <p className="mt-1 text-xs text-red-600 dark:text-red-400 truncate">
                                                        {holiday.name}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Sidebar - Holiday List */}
                <div className="space-y-6">
                    {/* This Month's Holidays */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-orange-500 to-red-500">
                            <h3 className="font-semibold text-white flex items-center gap-2">
                                <Star className="w-4 h-4" />
                                วันหยุดเดือนนี้
                            </h3>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {monthHolidays.length === 0 ? (
                                <div className="p-6 text-center text-gray-500">
                                    <Moon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                    <p className="text-sm">ไม่มีวันหยุดในเดือนนี้</p>
                                </div>
                            ) : (
                                monthHolidays.map((holiday) => (
                                    <div
                                        key={holiday.id}
                                        onClick={() => setSelectedHoliday(holiday)}
                                        className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 font-bold">
                                                {new Date(holiday.date).getDate()}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-white text-sm">
                                                    {holiday.name}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(holiday.date).toLocaleDateString('th-TH', {
                                                        weekday: 'long',
                                                        day: 'numeric',
                                                        month: 'long',
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Upcoming Holidays */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                วันหยุดที่จะมาถึง
                            </h3>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {upcomingHolidays.length === 0 ? (
                                <div className="p-6 text-center text-gray-500">
                                    <p className="text-sm">ไม่มีวันหยุดที่จะมาถึง</p>
                                </div>
                            ) : (
                                upcomingHolidays.map((holiday) => (
                                    <div key={holiday.id} className="p-4">
                                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                                            {holiday.name}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {new Date(holiday.date).toLocaleDateString('th-TH', {
                                                weekday: 'long',
                                                day: 'numeric',
                                                month: 'long',
                                                year: 'numeric',
                                            })}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Holiday Detail Modal */}
            {selectedHoliday && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setSelectedHoliday(null)}
                    />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                            <div className="text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                                    <CalendarIcon className="w-8 h-8 text-red-600" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                    {selectedHoliday.name}
                                </h3>
                                <p className="text-gray-500 mb-4">
                                    {new Date(selectedHoliday.date).toLocaleDateString('th-TH', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                    })}
                                </p>
                                {selectedHoliday.description && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                        {selectedHoliday.description}
                                    </p>
                                )}
                                {selectedHoliday.isRecurring && (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                        หยุดทุกปี
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => setSelectedHoliday(null)}
                                className="w-full mt-6 py-2.5 px-4 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
