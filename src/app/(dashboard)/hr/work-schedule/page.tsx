'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
    Calendar,
    Clock,
    Coffee,
    Save,
    Loader2,
    CheckCircle,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Plus,
    Trash2,
    Settings,
} from 'lucide-react';

interface WorkSchedule {
    workStartTime: string;
    workEndTime: string;
    breakStartTime: string;
    breakEndTime: string;
    workHoursPerDay: number;
    satWorkStartTime: string;
    satWorkEndTime: string;
    satWorkHours: number;
}

interface WorkingSaturday {
    id: number;
    date: string;
    startTime: string;
    endTime: string;
    workHours: number;
    description: string | null;
    createdByName: string;
}

export default function WorkSchedulePage() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    // Settings state
    const [schedule, setSchedule] = useState<WorkSchedule>({
        workStartTime: '08:30',
        workEndTime: '17:00',
        breakStartTime: '12:00',
        breakEndTime: '13:00',
        workHoursPerDay: 7.5,
        satWorkStartTime: '09:00',
        satWorkEndTime: '12:00',
        satWorkHours: 3,
    });

    // Calendar state
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [workingSaturdays, setWorkingSaturdays] = useState<WorkingSaturday[]>([]);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState('');
    const [modalStartTime, setModalStartTime] = useState('09:00');
    const [modalEndTime, setModalEndTime] = useState('12:00');
    const [modalDescription, setModalDescription] = useState('');

    // Fetch settings
    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/hr/work-schedule');
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setSchedule(data.settings);
                }
            }
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        }
    }, []);

    // Fetch working saturdays
    const fetchWorkingSaturdays = useCallback(async () => {
        try {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth() + 1;
            const res = await fetch(`/api/hr/working-saturdays?year=${year}&month=${month}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setWorkingSaturdays(data.workingSaturdays);
                }
            }
        } catch (err) {
            console.error('Failed to fetch working saturdays:', err);
        }
    }, [currentMonth]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchSettings(), fetchWorkingSaturdays()]);
            setLoading(false);
        };
        loadData();
    }, [fetchSettings, fetchWorkingSaturdays]);

    // Save settings
    const handleSaveSettings = async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const res = await fetch('/api/hr/work-schedule', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(schedule),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setSuccess(data.message);
                setSchedule(prev => ({
                    ...prev,
                    workHoursPerDay: data.calculatedHours.workHoursPerDay,
                    satWorkHours: data.calculatedHours.satWorkHours,
                }));
            } else {
                setError(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch (err) {
            setError('ไม่สามารถบันทึกการตั้งค่าได้');
        } finally {
            setSaving(false);
        }
    };

    // Add working saturday
    const handleAddSaturday = async () => {
        setError('');
        try {
            const res = await fetch('/api/hr/working-saturdays', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: selectedDate,
                    startTime: modalStartTime,
                    endTime: modalEndTime,
                    description: modalDescription,
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setShowModal(false);
                fetchWorkingSaturdays();
                setSuccess(data.message);
            } else {
                setError(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch (err) {
            setError('ไม่สามารถเพิ่มวันเสาร์ทำงานได้');
        }
    };

    // Delete working saturday
    const handleDeleteSaturday = async (id: number) => {
        if (!confirm('ต้องการลบวันเสาร์ทำงานนี้?')) return;
        try {
            const res = await fetch(`/api/hr/working-saturdays?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok && data.success) {
                fetchWorkingSaturdays();
                setSuccess(data.message);
            }
        } catch (err) {
            setError('ไม่สามารถลบได้');
        }
    };

    // Get Saturdays in current month
    const getSaturdaysInMonth = () => {
        const saturdays: Date[] = [];
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
            if (d.getDay() === 6) {
                saturdays.push(new Date(d));
            }
        }
        return saturdays;
    };

    const saturdays = getSaturdaysInMonth();
    const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

    // Format date as yyyy-MM-dd in local timezone (avoid UTC shift)
    const formatLocalDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const isWorkingSaturday = (date: Date) => {
        const dateStr = formatLocalDate(date);
        return workingSaturdays.find(ws => ws.date === dateStr);
    };

    const openAddModal = (date: Date) => {
        setSelectedDate(formatLocalDate(date));
        setModalStartTime(schedule.satWorkStartTime);
        setModalEndTime(schedule.satWorkEndTime);
        setModalDescription('');
        setShowModal(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                    <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        ตั้งค่าเวลาทำงาน
                    </h1>
                    <p className="text-gray-500">กำหนดเวลาทำงานและวันเสาร์ทำงาน</p>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <p className="text-red-700">{error}</p>
                </div>
            )}
            {success && (
                <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="text-green-700">{success}</p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Work Schedule Settings */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                        เวลาทำงานปกติ (จันทร์-ศุกร์)
                    </h2>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">เริ่มงาน</label>
                                <input
                                    type="time"
                                    value={schedule.workStartTime}
                                    onChange={(e) => setSchedule(prev => ({ ...prev, workStartTime: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">เลิกงาน</label>
                                <input
                                    type="time"
                                    value={schedule.workEndTime}
                                    onChange={(e) => setSchedule(prev => ({ ...prev, workEndTime: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                            <Coffee className="w-4 h-4" />
                            <span>เวลาพักกลางวัน</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">เริ่มพัก</label>
                                <input
                                    type="time"
                                    value={schedule.breakStartTime}
                                    onChange={(e) => setSchedule(prev => ({ ...prev, breakStartTime: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">สิ้นสุดพัก</label>
                                <input
                                    type="time"
                                    value={schedule.breakEndTime}
                                    onChange={(e) => setSchedule(prev => ({ ...prev, breakEndTime: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                                />
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                            <p className="text-sm text-blue-700">
                                ⏱️ ชั่วโมงทำงานต่อวัน: <strong>{schedule.workHoursPerDay} ชั่วโมง</strong>
                            </p>
                        </div>
                    </div>

                    <hr className="my-6 border-gray-200 dark:border-gray-700" />

                    {/* Saturday Default */}
                    <h3 className="text-md font-semibold mb-3 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-orange-600" />
                        เวลาทำงานวันเสาร์ (ค่าเริ่มต้น)
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">เริ่มงาน</label>
                            <input
                                type="time"
                                value={schedule.satWorkStartTime}
                                onChange={(e) => setSchedule(prev => ({ ...prev, satWorkStartTime: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">เลิกงาน</label>
                            <input
                                type="time"
                                value={schedule.satWorkEndTime}
                                onChange={(e) => setSchedule(prev => ({ ...prev, satWorkEndTime: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                            />
                        </div>
                    </div>

                    <div className="mt-4 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                        <p className="text-sm text-orange-700">
                            ⏱️ ชั่วโมงทำงานวันเสาร์: <strong>{schedule.satWorkHours} ชั่วโมง</strong>
                        </p>
                    </div>

                    <button
                        onClick={handleSaveSettings}
                        disabled={saving}
                        className="mt-6 w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold flex items-center justify-center gap-2 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        บันทึกการตั้งค่า
                    </button>
                </div>

                {/* Working Saturdays Calendar */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-orange-600" />
                            วันเสาร์ทำงาน
                        </h2>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="font-medium min-w-[140px] text-center">
                                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear() + 543}
                            </span>
                            <button
                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {saturdays.map((sat) => {
                            const working = isWorkingSaturday(sat);
                            return (
                                <div
                                    key={sat.toISOString()}
                                    className={`p-4 rounded-xl border-2 transition-all ${working
                                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-semibold">
                                                เสาร์ที่ {sat.getDate()} {monthNames[sat.getMonth()]}
                                            </div>
                                            {working ? (
                                                <div className="text-sm text-orange-600 mt-1">
                                                    🕐 {working.startTime} - {working.endTime} ({working.workHours} ชม.)
                                                    {working.description && (
                                                        <span className="text-gray-500 ml-2">• {working.description}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-sm text-gray-400 mt-1">ไม่ทำงาน</div>
                                            )}
                                        </div>
                                        <div>
                                            {working ? (
                                                <button
                                                    onClick={() => handleDeleteSaturday(working.id)}
                                                    className="p-2 rounded-lg text-red-600 hover:bg-red-100"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => openAddModal(sat)}
                                                    className="p-2 rounded-lg text-green-600 hover:bg-green-100"
                                                >
                                                    <Plus className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Add Saturday Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold mb-4">เพิ่มวันเสาร์ทำงาน</h3>
                        <p className="text-gray-500 mb-4">{selectedDate}</p>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">เริ่มงาน</label>
                                    <input
                                        type="time"
                                        value={modalStartTime}
                                        onChange={(e) => setModalStartTime(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">เลิกงาน</label>
                                    <input
                                        type="time"
                                        value={modalEndTime}
                                        onChange={(e) => setModalEndTime(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">หมายเหตุ (ถ้ามี)</label>
                                <input
                                    type="text"
                                    value={modalDescription}
                                    onChange={(e) => setModalDescription(e.target.value)}
                                    placeholder="เช่น ทำงานชดเชย"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleAddSaturday}
                                className="flex-1 py-2 rounded-xl bg-orange-600 text-white font-semibold"
                            >
                                เพิ่ม
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
