'use client';

import { useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
    Upload,
    FileSpreadsheet,
    Download,
    Loader2,
    CheckCircle,
    XCircle,
    AlertCircle,
    ArrowLeft,
    Trash2,
    Play,
    Info,
} from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';

const VALID_LEAVE_TYPES = [
    'VACATION', 'SICK', 'PERSONAL', 'MATERNITY', 'MILITARY',
    'ORDINATION', 'STERILIZATION', 'TRAINING', 'OTHER'
];

const LEAVE_TYPE_LABELS: Record<string, string> = {
    VACATION: 'พักร้อน',
    SICK: 'ลาป่วย',
    PERSONAL: 'ลากิจ',
    MATERNITY: 'ลาคลอด',
    MILITARY: 'เกณฑ์ทหาร',
    ORDINATION: 'ลาบวช',
    STERILIZATION: 'ลาทำหมัน',
    TRAINING: 'ลาฝึกอบรม',
    OTHER: 'อื่นๆ',
};

interface ImportRow {
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
    startTime: string;
    endTime: string;
    valid: boolean;
    error?: string;
}

export default function LeaveImportPage() {
    const { data: session } = useSession();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [rows, setRows] = useState<ImportRow[]>([]);
    const [fileName, setFileName] = useState('');
    const [importing, setImporting] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [result, setResult] = useState<{
        success: boolean;
        stats: { total: number; success: number; errors: number; skipped: number };
        errorDetails: { row: number; employeeId: string; message: string }[];
    } | null>(null);

    // Process Excel file
    const processFile = (file: File) => {
        setFileName(file.name);
        setResult(null);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

                const parsed: ImportRow[] = jsonData.map((row: any) => {
                    const employeeId = String(row['รหัสพนักงาน'] || row['employeeId'] || '').trim();
                    const leaveType = String(row['ประเภทลา'] || row['leaveType'] || '').trim().toUpperCase();
                    const startDateRaw = row['วันที่เริ่ม'] || row['startDate'] || '';
                    const endDateRaw = row['วันที่สิ้นสุด'] || row['endDate'] || '';
                    const days = Number(row['จำนวนวัน'] || row['days'] || 0);
                    const reason = String(row['เหตุผล'] || row['reason'] || '');
                    const startTime = String(row['เวลาเริ่ม'] || row['startTime'] || '').trim();
                    const endTime = String(row['เวลาสิ้นสุด'] || row['endTime'] || '').trim();

                    // Parse dates (handle Excel serial numbers and string formats)
                    const startDate = parseExcelDate(startDateRaw);
                    const endDate = parseExcelDate(endDateRaw);

                    // Validate
                    let valid = true;
                    let error = '';

                    if (!employeeId) {
                        valid = false;
                        error = 'ไม่มีรหัสพนักงาน';
                    } else if (!VALID_LEAVE_TYPES.includes(leaveType)) {
                        valid = false;
                        error = `ประเภทลาไม่ถูกต้อง: ${leaveType || '(ว่าง)'}`;
                    } else if (!startDate || !endDate) {
                        valid = false;
                        error = 'วันที่ไม่ถูกต้อง';
                    } else if (new Date(endDate) < new Date(startDate)) {
                        valid = false;
                        error = 'วันสิ้นสุดน้อยกว่าวันเริ่มต้น';
                    } else if (!days || days <= 0) {
                        valid = false;
                        error = 'จำนวนวันต้องมากกว่า 0';
                    }

                    return { employeeId, leaveType, startDate, endDate, days, reason, startTime, endTime, valid, error };
                });

                setRows(parsed);
            } catch {
                alert('ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // Handle file input change
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        processFile(file);
    };

    // Handle drag & drop
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
            processFile(file);
        } else {
            alert('กรุณาใช้ไฟล์ .xlsx หรือ .xls เท่านั้น');
        }
    };

    // Parse Excel date (serial number or string)
    function parseExcelDate(value: any): string {
        if (!value) return '';
        // Excel serial number
        if (typeof value === 'number') {
            const date = XLSX.SSF.parse_date_code(value);
            if (date) {
                return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
            }
        }
        // String date
        const str = String(value).trim();
        // Try ISO format yyyy-mm-dd
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            return str;
        }
        // Try dd/mm/yyyy
        const parts = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (parts) {
            return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
        // Try yyyy/mm/dd
        const parts2 = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
        if (parts2) {
            return `${parts2[1]}-${parts2[2].padStart(2, '0')}-${parts2[3].padStart(2, '0')}`;
        }
        return '';
    }

    // Download template
    const downloadTemplate = () => {
        const templateData = [
            { 'รหัสพนักงาน': 'EMP001', 'ประเภทลา': 'VACATION', 'วันที่เริ่ม': '2026-01-15', 'วันที่สิ้นสุด': '2026-01-16', 'จำนวนวัน': 1, 'เวลาเริ่ม': '', 'เวลาสิ้นสุด': '', 'เหตุผล': 'พักร้อน' },
            { 'รหัสพนักงาน': 'EMP002', 'ประเภทลา': 'SICK', 'วันที่เริ่ม': '2026-01-20', 'วันที่สิ้นสุด': '2026-01-20', 'จำนวนวัน': 1, 'เวลาเริ่ม': '', 'เวลาสิ้นสุด': '', 'เหตุผล': 'ป่วย' },
            { 'รหัสพนักงาน': 'EMP003', 'ประเภทลา': 'PERSONAL', 'วันที่เริ่ม': '2026-01-22', 'วันที่สิ้นสุด': '2026-01-22', 'จำนวนวัน': 0.25, 'เวลาเริ่ม': '09:00', 'เวลาสิ้นสุด': '11:00', 'เหตุผล': 'ธุระส่วนตัว' },
        ];
        const ws = XLSX.utils.json_to_sheet(templateData);
        ws['!cols'] = [
            { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 25 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'LeaveImport');
        XLSX.writeFile(wb, 'leave_import_template.xlsx');
    };

    // Import
    const handleImport = async () => {
        const validRows = rows.filter(r => r.valid);
        if (validRows.length === 0) {
            alert('ไม่มีรายการที่ถูกต้องให้นำเข้า');
            return;
        }

        setImporting(true);
        try {
            const res = await fetch('/api/hr/leave-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: validRows.map(r => ({
                        employeeId: r.employeeId,
                        leaveType: r.leaveType,
                        startDate: r.startDate,
                        endDate: r.endDate,
                        days: r.days,
                        reason: r.reason,
                        startTime: r.startTime || undefined,
                        endTime: r.endTime || undefined,
                    }))
                }),
            });
            const data = await res.json();
            if (data.success) {
                setResult(data);
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch {
            alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setImporting(false);
        }
    };

    // Clear
    const handleClear = () => {
        setRows([]);
        setFileName('');
        setResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const validCount = rows.filter(r => r.valid).length;
    const invalidCount = rows.filter(r => !r.valid).length;

    return (
        <div className="animate-fade-in max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <Link href="/hr/leaves" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <ArrowLeft className="w-5 h-5 text-gray-500" />
                    </Link>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        <FileSpreadsheet className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">นำเข้าวันลา</h1>
                        <p className="text-gray-500">Import จากไฟล์ Excel (.xlsx)</p>
                    </div>
                </div>
                <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-md hover:shadow-lg hover:from-emerald-400 hover:to-teal-500 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                    <Download className="w-5 h-5" />
                    ดาวน์โหลด Template
                </button>
            </div>

            {/* Info */}
            <div className="mb-6 space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                        <p className="font-medium mb-2">ขั้นตอนการใช้งาน</p>
                        <ol className="space-y-1 text-blue-600 dark:text-blue-400 list-decimal list-inside">
                            <li>กดปุ่ม <strong>&quot;ดาวน์โหลด Template&quot;</strong> เพื่อดาวน์โหลดไฟล์ตัวอย่าง Excel</li>
                            <li>เปิดไฟล์ Template แล้วกรอกข้อมูลวันลาตามคอลัมน์ที่กำหนด</li>
                            <li>อัพโหลดไฟล์ Excel โดย <strong>ลากไฟล์มาวาง</strong> หรือ <strong>คลิกเพื่อเลือก</strong></li>
                            <li>ตรวจสอบข้อมูลในตาราง Preview — แถวที่ ✅ ถูกต้อง / ❌ มีข้อผิดพลาด</li>
                            <li>กดปุ่ม <strong>&quot;นำเข้า&quot;</strong> เพื่อบันทึกข้อมูล (เฉพาะแถวที่ถูกต้องเท่านั้น)</li>
                        </ol>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">📋 คอลัมน์ใน Excel</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-600">
                                    <th className="py-1.5 px-2 text-left text-gray-500 font-semibold">คอลัมน์</th>
                                    <th className="py-1.5 px-2 text-left text-gray-500 font-semibold">จำเป็น</th>
                                    <th className="py-1.5 px-2 text-left text-gray-500 font-semibold">คำอธิบาย</th>
                                    <th className="py-1.5 px-2 text-left text-gray-500 font-semibold">ตัวอย่าง</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600 dark:text-gray-400">
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-1.5 px-2 font-medium text-gray-800 dark:text-gray-200">รหัสพนักงาน</td>
                                    <td className="py-1.5 px-2"><span className="text-red-500">✱</span></td>
                                    <td className="py-1.5 px-2">Employee ID ที่มีอยู่ในระบบ</td>
                                    <td className="py-1.5 px-2 font-mono">EMP001</td>
                                </tr>
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-1.5 px-2 font-medium text-gray-800 dark:text-gray-200">ประเภทลา</td>
                                    <td className="py-1.5 px-2"><span className="text-red-500">✱</span></td>
                                    <td className="py-1.5 px-2">รหัสประเภทลา (ภาษาอังกฤษ ตัวพิมพ์ใหญ่)</td>
                                    <td className="py-1.5 px-2 font-mono">VACATION</td>
                                </tr>
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-1.5 px-2 font-medium text-gray-800 dark:text-gray-200">วันที่เริ่ม</td>
                                    <td className="py-1.5 px-2"><span className="text-red-500">✱</span></td>
                                    <td className="py-1.5 px-2">รูปแบบ YYYY-MM-DD หรือ DD/MM/YYYY</td>
                                    <td className="py-1.5 px-2 font-mono">2026-01-15</td>
                                </tr>
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-1.5 px-2 font-medium text-gray-800 dark:text-gray-200">วันที่สิ้นสุด</td>
                                    <td className="py-1.5 px-2"><span className="text-red-500">✱</span></td>
                                    <td className="py-1.5 px-2">ต้องมากกว่าหรือเท่ากับวันที่เริ่ม</td>
                                    <td className="py-1.5 px-2 font-mono">2026-01-16</td>
                                </tr>
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-1.5 px-2 font-medium text-gray-800 dark:text-gray-200">จำนวนวัน</td>
                                    <td className="py-1.5 px-2"><span className="text-red-500">✱</span></td>
                                    <td className="py-1.5 px-2">จำนวนวันลา (รองรับทศนิยม เช่น 0.5, 0.25)</td>
                                    <td className="py-1.5 px-2 font-mono">1</td>
                                </tr>
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-1.5 px-2 font-medium text-gray-800 dark:text-gray-200">เวลาเริ่ม</td>
                                    <td className="py-1.5 px-2 text-gray-400">—</td>
                                    <td className="py-1.5 px-2">เฉพาะลาเป็นชั่วโมง รูปแบบ HH:MM</td>
                                    <td className="py-1.5 px-2 font-mono">09:00</td>
                                </tr>
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-1.5 px-2 font-medium text-gray-800 dark:text-gray-200">เวลาสิ้นสุด</td>
                                    <td className="py-1.5 px-2 text-gray-400">—</td>
                                    <td className="py-1.5 px-2">เฉพาะลาเป็นชั่วโมง รูปแบบ HH:MM</td>
                                    <td className="py-1.5 px-2 font-mono">11:00</td>
                                </tr>
                                <tr>
                                    <td className="py-1.5 px-2 font-medium text-gray-800 dark:text-gray-200">เหตุผล</td>
                                    <td className="py-1.5 px-2 text-gray-400">—</td>
                                    <td className="py-1.5 px-2">ระบุเหตุผลการลา (ถ้าไม่กรอกจะใส่ &quot;นำเข้าจากระบบเดิม&quot;)</td>
                                    <td className="py-1.5 px-2">พักร้อนประจำปี</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-2">📌 ประเภทลาที่รองรับ</p>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                            {Object.entries(LEAVE_TYPE_LABELS).map(([key, label]) => (
                                <div key={key} className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                    <span className="font-mono bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">{key}</span>
                                    <span className="text-gray-500">= {label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">⚠️ หมายเหตุสำคัญ</p>
                        <ul className="space-y-1 text-xs text-amber-600 dark:text-amber-400">
                            <li>• ใบลาจะถูกบันทึกเป็นสถานะ <strong>อนุมัติแล้ว</strong> โดยอัตโนมัติ</li>
                            <li>• จำนวนวันจะถูก <strong>หักจากวันลาคงเหลือ</strong> ทันที (ยกเว้นประเภท OTHER)</li>
                            <li>• ถ้า <strong>กรอกเวลาเริ่ม-สิ้นสุด</strong> ระบบจะบันทึกเป็นลาระดับชั่วโมง</li>
                            <li>• ถ้า <strong>ไม่กรอกเวลา</strong> ระบบจะบันทึกเป็นลาเต็มวัน</li>
                            <li>• ระบบจะตรวจสอบ <strong>ใบลาซ้ำ</strong> โดยอัตโนมัติ (ข้ามแถวที่ซ้ำ)</li>
                            <li>• นำเข้าได้สูงสุด <strong>500 รายการ</strong> ต่อครั้ง</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Upload Area */}
            {rows.length === 0 && !result && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-12">
                    <label
                        htmlFor="excelUpload"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`block border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${dragging
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                            : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10'
                            }`}
                    >
                        <Upload className={`w-16 h-16 mx-auto mb-4 ${dragging ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-600'}`} />
                        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            {dragging ? 'ปล่อยไฟล์ที่นี่' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}
                        </p>
                        <p className="text-sm text-gray-400">
                            รองรับไฟล์ .xlsx (Excel) สูงสุด 500 รายการ
                        </p>
                        <input
                            id="excelUpload"
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                    </label>
                </div>
            )}

            {/* Preview Table */}
            {rows.length > 0 && !result && (
                <div className="space-y-4">
                    {/* Summary Bar */}
                    <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            📁 {fileName}
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                            ทั้งหมด {rows.length} รายการ
                        </span>
                        {validCount > 0 && (
                            <span className="flex items-center gap-1 text-sm text-green-600">
                                <CheckCircle className="w-4 h-4" /> ถูกต้อง {validCount}
                            </span>
                        )}
                        {invalidCount > 0 && (
                            <span className="flex items-center gap-1 text-sm text-red-600">
                                <XCircle className="w-4 h-4" /> ผิดพลาด {invalidCount}
                            </span>
                        )}
                        <div className="flex-1" />
                        <button
                            onClick={handleClear}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-4 h-4" /> ล้าง
                        </button>
                    </div>

                    {/* Table */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-10">#</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">สถานะ</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">รหัสพนักงาน</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">ประเภท</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">วันที่เริ่ม</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">วันที่สิ้นสุด</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">จำนวนวัน</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">เวลา</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">เหตุผล</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {rows.map((row, idx) => (
                                        <tr
                                            key={idx}
                                            className={`${row.valid
                                                ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                                : 'bg-red-50/50 dark:bg-red-900/10'
                                                }`}
                                        >
                                            <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                                {row.valid ? (
                                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                                        <span className="text-xs text-red-600 dark:text-red-400">{row.error}</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{row.employeeId}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                                {LEAVE_TYPE_LABELS[row.leaveType] || row.leaveType}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{row.startDate}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{row.endDate}</td>
                                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-medium">{row.days}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                                {row.startTime && row.endTime ? `${row.startTime}-${row.endTime}` : <span className="text-gray-300">เต็มวัน</span>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">{row.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Import Button */}
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={handleClear}
                            className="px-6 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            ยกเลิก
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={importing || validCount === 0}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg hover:shadow-xl hover:from-emerald-400 hover:to-teal-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {importing ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    กำลังนำเข้า...
                                </>
                            ) : (
                                <>
                                    <Play className="w-5 h-5" />
                                    นำเข้า {validCount} รายการ
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Result */}
            {result && (
                <div className="space-y-4">
                    <div className={`rounded-2xl p-8 text-center ${result.stats.errors === 0 && result.stats.skipped === 0
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                        : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                        }`}>
                        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${result.stats.errors === 0 && result.stats.skipped === 0
                            ? 'bg-green-100 dark:bg-green-900/40'
                            : 'bg-amber-100 dark:bg-amber-900/40'
                            }`}>
                            {result.stats.errors === 0 && result.stats.skipped === 0 ? (
                                <CheckCircle className="w-8 h-8 text-green-600" />
                            ) : (
                                <AlertCircle className="w-8 h-8 text-amber-600" />
                            )}
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                            นำเข้าเสร็จสิ้น
                        </h2>
                        <div className="flex justify-center gap-6 mt-4">
                            <div className="text-center">
                                <p className="text-3xl font-bold text-green-600">{result.stats.success}</p>
                                <p className="text-sm text-gray-500">สำเร็จ</p>
                            </div>
                            {result.stats.errors > 0 && (
                                <div className="text-center">
                                    <p className="text-3xl font-bold text-red-600">{result.stats.errors}</p>
                                    <p className="text-sm text-gray-500">ผิดพลาด</p>
                                </div>
                            )}
                            {result.stats.skipped > 0 && (
                                <div className="text-center">
                                    <p className="text-3xl font-bold text-amber-600">{result.stats.skipped}</p>
                                    <p className="text-sm text-gray-500">ซ้ำ (ข้าม)</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Error Details */}
                    {result.errorDetails.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                                รายละเอียดข้อผิดพลาด
                            </h3>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {result.errorDetails.map((err, idx) => (
                                    <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-red-50 dark:bg-red-900/10 rounded-lg text-sm">
                                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                        <span className="text-gray-600 dark:text-gray-400">แถว {err.row}</span>
                                        <span className="font-medium text-gray-900 dark:text-white">{err.employeeId}</span>
                                        <span className="text-red-600 dark:text-red-400">{err.message}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action */}
                    <div className="flex justify-center gap-3">
                        <button
                            onClick={handleClear}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
                        >
                            <Upload className="w-5 h-5" />
                            นำเข้าเพิ่มเติม
                        </button>
                        <Link
                            href="/hr/leaves"
                            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            ดูการลาทั้งหมด
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
