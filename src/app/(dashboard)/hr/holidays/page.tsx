'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    Calendar,
    Plus,
    Edit2,
    Trash2,
    Search,
    Loader2,
    X,
    CheckCircle,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

interface Holiday {
    id: number;
    date: string;
    name: string;
    type: string;
    company: string | null;
    createdAt: string;
}

const HOLIDAY_TYPES = [
    { value: 'PUBLIC', label: 'วันหยุดราชการ' },
    { value: 'SPECIAL', label: 'วันหยุดพิเศษ' },
];

export default function HRHolidaysPage() {
    const { data: session } = useSession();
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [year, setYear] = useState(new Date().getFullYear());
    const [searchQuery, setSearchQuery] = useState('');

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);

    // Form states
    const [formDate, setFormDate] = useState('');
    const [formName, setFormName] = useState('');
    const [formType, setFormType] = useState('PUBLIC');
    const [formError, setFormError] = useState('');

    // Fetch holidays
    const fetchHolidays = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/hr/holidays?year=${year}`);
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
        fetchHolidays();
    }, [year]);

    // Filter holidays
    const filteredHolidays = holidays.filter((h) => {
        if (searchQuery) {
            return h.name.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
    });

    // Open add modal
    const handleAdd = () => {
        setIsEditing(false);
        setFormDate('');
        setFormName('');
        setFormType('PUBLIC');
        setFormError('');
        setShowModal(true);
    };

    // Open edit modal
    const handleEdit = (holiday: Holiday) => {
        setIsEditing(true);
        setSelectedHoliday(holiday);
        setFormDate(holiday.date);
        setFormName(holiday.name);
        setFormType(holiday.type);
        setFormError('');
        setShowModal(true);
    };

    // Open delete confirm
    const handleDeleteClick = (holiday: Holiday) => {
        setSelectedHoliday(holiday);
        setShowDeleteConfirm(true);
    };

    // Save holiday (create or update)
    const handleSave = async () => {
        if (!formDate || !formName.trim()) {
            setFormError('กรุณากรอกข้อมูลให้ครบ');
            return;
        }

        setIsSaving(true);
        setFormError('');

        try {
            const url = '/api/hr/holidays';
            const method = isEditing ? 'PUT' : 'POST';
            const body = isEditing
                ? { id: selectedHoliday?.id, date: formDate, name: formName, type: formType }
                : { date: formDate, name: formName, type: formType };

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const result = await response.json();

            if (result.success) {
                setShowModal(false);
                fetchHolidays();
            } else {
                setFormError(result.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            setFormError('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setIsSaving(false);
        }
    };

    // Delete holiday
    const handleDelete = async () => {
        if (!selectedHoliday) return;

        setIsSaving(true);
        try {
            const response = await fetch(`/api/hr/holidays?id=${selectedHoliday.id}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (result.success) {
                setShowDeleteConfirm(false);
                setSelectedHoliday(null);
                fetchHolidays();
            }
        } catch (error) {
            console.error('Error deleting holiday:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className="animate-fade-in">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                จัดการวันหยุด
                            </h1>
                            <p className="text-gray-500">เพิ่ม แก้ไข ลบ วันหยุดราชการ</p>
                        </div>
                    </div>
                    <button
                        onClick={handleAdd}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        เพิ่มวันหยุด
                    </button>
                </div>

                {/* Filters */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Year Selector */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setYear(year - 1)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="font-semibold text-gray-900 dark:text-white min-w-[80px] text-center">
                                ปี {year + 543}
                            </span>
                            <button
                                onClick={() => setYear(year + 1)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อวันหยุด..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Stats */}
                        <div className="px-4 py-2 bg-orange-100 dark:bg-orange-900/20 rounded-xl">
                            <span className="text-orange-700 dark:text-orange-300 font-semibold">
                                {holidays.length} วันหยุด
                            </span>
                        </div>
                    </div>
                </div>

                {/* Holiday List */}
                {isLoading ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
                        <p className="text-gray-500">กำลังโหลดข้อมูล...</p>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">วันที่</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ชื่อวันหยุด</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ประเภท</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {filteredHolidays.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                                            <p>ไม่พบวันหยุด</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredHolidays.map((holiday) => (
                                        <tr key={holiday.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 font-bold">
                                                        {new Date(holiday.date).getDate()}
                                                    </div>
                                                    <span className="text-gray-900 dark:text-white">
                                                        {new Date(holiday.date).toLocaleDateString('th-TH', {
                                                            weekday: 'short',
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric',
                                                        })}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-medium text-gray-900 dark:text-white">
                                                    {holiday.name}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${holiday.type === 'PUBLIC'
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-purple-100 text-purple-700'
                                                    }`}>
                                                    {holiday.type === 'PUBLIC' ? 'ราชการ' : 'พิเศษ'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleEdit(holiday)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg mr-2"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(holiday)}
                                                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                {isEditing ? 'แก้ไขวันหยุด' : 'เพิ่มวันหยุด'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {formError && (
                            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {formError}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    วันที่ <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={formDate}
                                    onChange={(e) => setFormDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    ชื่อวันหยุด <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="เช่น วันขึ้นปีใหม่"
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    ประเภท
                                </label>
                                <select
                                    value={formType}
                                    onChange={(e) => setFormType(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                                >
                                    {HOLIDAY_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                บันทึก
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && selectedHoliday && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-2xl">
                        <div className="text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <Trash2 className="w-8 h-8 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                ยืนยันการลบ
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-6">
                                คุณต้องการลบวันหยุด <strong>{selectedHoliday.name}</strong> ใช่หรือไม่?
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={isSaving}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    ลบ
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
