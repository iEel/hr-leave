'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    CalendarClock,
    RefreshCw,
    Play,
    AlertTriangle,
    CheckCircle,
    Users,
    ArrowRight,
    Loader2,
    ChevronDown,
    ChevronUp,
    Info
} from 'lucide-react';

interface EmployeeBalance {
    leaveType: string;
    currentRemaining: number;
    currentUsed: number;
    currentEntitlement: number;
    carryOver: number;
    newEntitlement: number;
    newTotal: number;
    vacationEligibleDate?: string | null;
    vacationEligibleInFromYear?: boolean;
    vacationEligibleInToYear?: boolean;
    vacationEligibilityStatus?: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'MISSING_START_DATE';
    vacationEligibilityReason?: string;
    vacationCarryOverBlockedByEligibility?: boolean;
}

interface EmployeePreview {
    userId: number;
    employeeId: string;
    firstName: string;
    lastName: string;
    department: string;
    company: string;
    balances: EmployeeBalance[];
}

interface PreviewData {
    fromYear: number;
    toYear: number;
    nextYearExists: boolean;
    nextYearAutoCreatedCount: number;
    nextYearAllAutoCreated: boolean;
    employees: EmployeePreview[];
    summary: {
        totalEmployees: number;
        carryOverByType: Record<string, number>;
    };
    quotaSettings: Record<string, { defaultDays: number; allowCarryOver: boolean; maxCarryOverDays: number }>;
}

type YearEndStats = {
    fromYear: number;
    toYear: number;
    totalEmployees: number;
    success: number;
    errors: number;
};

const leaveTypeNames: Record<string, string> = {
    'VACATION': 'พักร้อน',
    'SICK': 'ลาป่วย',
    'PERSONAL': 'ลากิจ',
    'MATERNITY': 'ลาคลอด',
    'MILITARY': 'เกณฑ์ทหาร',
    'ORDINATION': 'ลาบวช',
    'STERILIZATION': 'ทำหมัน',
    'TRAINING': 'ฝึกอบรม',
    'OTHER': 'อื่นๆ'
};

function formatDateLabel(date?: string | null): string {
    if (!date) {
        return '-';
    }

    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
}

export default function YearEndProcessingPage() {
    const currentYear = new Date().getFullYear();

    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [loading, setLoading] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [forceOverwrite, setForceOverwrite] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string; stats?: YearEndStats } | null>(null);
    const [expandedEmployees, setExpandedEmployees] = useState<Set<number>>(new Set());

    const fetchPreview = useCallback(async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch(`/api/hr/year-end/preview?fromYear=${selectedYear}`);
            const data = await res.json();
            if (data.success) {
                setPreviewData(data.data);
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            console.error('Preview error:', error);
            alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    const executeYearEnd = async () => {
        if (!previewData) return;

        const confirmMsg = previewData.nextYearExists && forceOverwrite
            ? `⚠️ ข้อมูลปี ${previewData.toYear} จะถูกเขียนทับ!\n\nยืนยันการประมวลผลสิ้นปี ${selectedYear} → ${previewData.toYear}?`
            : `ยืนยันการประมวลผลสิ้นปี ${selectedYear} → ${previewData.toYear}?\n\nพนักงาน ${previewData.summary.totalEmployees} คนจะได้รับวันลาใหม่`;

        if (!confirm(confirmMsg)) return;

        setExecuting(true);
        try {
            const res = await fetch('/api/hr/year-end/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromYear: selectedYear, forceOverwrite })
            });
            const data = await res.json();

            if (data.success) {
                setResult({ success: true, message: data.message, stats: data.stats });
                fetchPreview(); // Refresh
            } else {
                setResult({ success: false, message: data.error });
            }
        } catch (error) {
            console.error('Execute error:', error);
            setResult({ success: false, message: 'เกิดข้อผิดพลาดในการประมวลผล' });
        } finally {
            setExecuting(false);
        }
    };

    const toggleEmployeeExpand = (userId: number) => {
        const newSet = new Set(expandedEmployees);
        if (newSet.has(userId)) {
            newSet.delete(userId);
        } else {
            newSet.add(userId);
        }
        setExpandedEmployees(newSet);
    };

    useEffect(() => {
        fetchPreview();
    }, [fetchPreview]);

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                        <CalendarClock className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            ประมวลผลสิ้นปี
                        </h1>
                        <p className="text-gray-500">รีเซ็ตและยกยอดวันลาประจำปี</p>
                    </div>
                </div>

                {/* Year Selector */}
                <div className="flex items-center gap-3">
                    <label className="text-gray-600 dark:text-gray-400">จากปี:</label>
                    <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(parseInt(e.target.value))}
                        className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500"
                    >
                        {[currentYear - 1, currentYear, currentYear + 1].map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                    <span className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-xl font-semibold">
                        {selectedYear + 1}
                    </span>
                    <button
                        onClick={fetchPreview}
                        disabled={loading}
                        className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    >
                        <RefreshCw className={`w-5 h-5 text-gray-600 dark:text-gray-300 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Result Banner */}
            {result && (
                <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${result.success
                    ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800'
                    }`}>
                    {result.success ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                    )}
                    <span className={result.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                        {result.message}
                        {result.stats && ` (สำเร็จ ${result.stats.success} คน)`}
                    </span>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                </div>
            ) : previewData ? (
                <>
                    {/* Warning if next year exists */}
                    {previewData.nextYearExists && (
                        <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 ${previewData.nextYearAllAutoCreated
                                ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                                : 'bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800'
                            }`}>
                            {previewData.nextYearAllAutoCreated ? (
                                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                            ) : (
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                            )}
                            <div>
                                {previewData.nextYearAllAutoCreated ? (
                                    <>
                                        <p className="text-blue-700 dark:text-blue-300 font-medium">
                                            ℹ️ พบ {previewData.nextYearAutoCreatedCount} รายการที่สร้างอัตโนมัติ (จากการลาข้ามปี)
                                        </p>
                                        <p className="text-sm text-blue-600 dark:text-blue-400">
                                            ระบบจะเขียนทับข้อมูลเหล่านี้อัตโนมัติ โดยเก็บยอดวันลาที่ใช้ไปแล้วไว้
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-amber-700 dark:text-amber-300 font-medium">
                                            ⚠️ ข้อมูลปี {previewData.toYear} มีอยู่แล้วในระบบ
                                            {previewData.nextYearAutoCreatedCount > 0 && (
                                                <span className="ml-1 text-sm font-normal">
                                                    (รวม {previewData.nextYearAutoCreatedCount} รายการสร้างอัตโนมัติ)
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-sm text-amber-600 dark:text-amber-400">
                                            หากต้องการประมวลผลใหม่ กรุณาเลือก &quot;เขียนทับข้อมูลเดิม&quot; ด้านล่าง
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">พนักงานที่จะประมวลผล</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {previewData.summary.totalEmployees} คน
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <ArrowRight className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">ยอดยกไปรวม (พักร้อน)</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {previewData.summary.carryOverByType['VACATION'] || 0} วัน
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                    <Info className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">สถานะปี {previewData.toYear}</p>
                                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                                        {previewData.nextYearExists
                                            ? (previewData.nextYearAllAutoCreated ? '🔄 สร้างอัตโนมัติ' : '📋 มีข้อมูลแล้ว')
                                            : '⏳ ยังไม่มีข้อมูล'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Employee Preview Table */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden mb-6">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Preview: ข้อมูลที่จะเปลี่ยนแปลง
                            </h2>
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                                    <tr>
                                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">พนักงาน</th>
                                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">แผนก</th>
                                        <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">รายละเอียด</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {previewData.employees.slice(0, 50).map(emp => (
                                        <React.Fragment key={emp.userId}>
                                            <tr
                                                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                                                onClick={() => toggleEmployeeExpand(emp.userId)}
                                            >
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        {expandedEmployees.has(emp.userId) ? (
                                                            <ChevronUp className="w-4 h-4 text-gray-400" />
                                                        ) : (
                                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                                        )}
                                                        <div>
                                                            <p className="font-medium text-gray-900 dark:text-white">{emp.firstName} {emp.lastName}</p>
                                                            <p className="text-xs text-gray-500">{emp.employeeId}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                                                    {emp.department}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className="text-xs text-gray-500">
                                                        {emp.balances.length} ประเภท
                                                    </span>
                                                </td>
                                            </tr>
                                            {expandedEmployees.has(emp.userId) && (
                                                <tr>
                                                    <td colSpan={3} className="bg-gray-50 dark:bg-gray-900 px-8 py-3">
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="text-gray-500 text-xs">
                                                                    <th className="text-left py-1">ประเภท</th>
                                                                    <th className="text-right py-1">คงเหลือ {selectedYear}</th>
                                                                    <th className="text-right py-1">ยกไป</th>
                                                                    <th className="text-right py-1">สิทธิ์ใหม่</th>
                                                                    <th className="text-right py-1 text-green-600">รวม {previewData.toYear}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {emp.balances.map(bal => {
                                                                    const isVacation = bal.leaveType === 'VACATION';

                                                                    return (
                                                                        <tr key={bal.leaveType} className="border-t border-gray-200 dark:border-gray-700">
                                                                            <td className="py-2 align-top">
                                                                                <div>{leaveTypeNames[bal.leaveType] || bal.leaveType}</div>
                                                                                {isVacation && (
                                                                                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] leading-4">
                                                                                        <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-gray-600 dark:text-gray-300">
                                                                                            เริ่ม {formatDateLabel(bal.vacationEligibleDate)}
                                                                                        </span>
                                                                                        <span className={`rounded px-1.5 py-0.5 ${bal.vacationEligibleInToYear
                                                                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                                                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                                                                            }`}>
                                                                                            {bal.vacationEligibleInToYear
                                                                                                ? `มีสิทธิ์ปี ${previewData.toYear}`
                                                                                                : `ยังไม่มีสิทธิ์ปี ${previewData.toYear}`}
                                                                                        </span>
                                                                                        {bal.vacationCarryOverBlockedByEligibility && (
                                                                                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                                                                                ไม่ยกยอดจากปี {previewData.fromYear}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                            <td className="text-right py-2 align-top">{bal.currentRemaining}</td>
                                                                            <td className="text-right py-2 align-top text-orange-600">+{bal.carryOver}</td>
                                                                            <td className="text-right py-2 align-top">{bal.newEntitlement}</td>
                                                                            <td className="text-right py-2 align-top font-semibold text-green-600">{bal.newTotal}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Execute Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            ดำเนินการ
                        </h2>

                        {previewData.nextYearExists && !previewData.nextYearAllAutoCreated && (
                            <label className="flex items-center gap-2 mb-4">
                                <input
                                    type="checkbox"
                                    checked={forceOverwrite}
                                    onChange={e => setForceOverwrite(e.target.checked)}
                                    className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
                                />
                                <span className="text-gray-700 dark:text-gray-300">เขียนทับข้อมูลเดิมของปี {previewData.toYear}</span>
                            </label>
                        )}

                        <button
                            onClick={executeYearEnd}
                            disabled={executing || (previewData.nextYearExists && !previewData.nextYearAllAutoCreated && !forceOverwrite)}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-xl shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {executing ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    กำลังประมวลผล...
                                </>
                            ) : (
                                <>
                                    <Play className="w-5 h-5" />
                                    ประมวลผลสิ้นปี {selectedYear} → {previewData.toYear}
                                </>
                            )}
                        </button>
                    </div>
                </>
            ) : (
                <div className="text-center py-20 text-gray-500">
                    ไม่พบข้อมูล กรุณาลองใหม่อีกครั้ง
                </div>
            )}
        </div>
    );
}
