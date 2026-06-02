'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
    Users,
    Search,
    Plus,
    Edit,
    Trash2,
    KeyRound,
    CheckCircle,
    XCircle,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Shield,
    Briefcase,
    Mail,
    User,
    ArrowRightLeft,
    Download,
    Upload,
    FileSpreadsheet,
    CalendarDays,
    RefreshCw,
    Database,
    Cloud
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ManagerSearchSelect from '@/components/ui/ManagerSearchSelect';
import CompanySelect from '@/components/ui/CompanySelect';
import DepartmentCombobox from '@/components/ui/DepartmentCombobox';
import { formatLeaveDays, formatHourlyDuration, formatMinutesToDisplay } from '@/lib/leave-utils';
import { calculateProbationEndDate } from '@/lib/vacation-eligibility';

interface Employee {
    id: number;
    employeeId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    company: string;
    department: string;
    startDate: string;
    isActive: boolean;
    departmentHeadId?: number;
    departmentHeadName?: string;
    isHRStaff?: boolean;
    probationDays?: number | null;
    probationExtensionDays?: number | null;
    probationOverrideDate?: string | null;
    probationEndDate?: string | null;
    probationNote?: string | null;
    createdAt: string;
}

interface SettingsRulesResponse {
    success?: boolean;
    rules?: {
        probationStandardDays?: number | string | null;
    };
}

const DEFAULT_PROBATION_DAYS = '90';
const DEFAULT_PROBATION_EXTENSION_DAYS = '0';

const createDefaultFormData = (probationDays = DEFAULT_PROBATION_DAYS) => ({
    employeeId: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'EMPLOYEE',
    company: 'SONIC',
    department: '',
    gender: 'M',
    startDate: new Date().toISOString().split('T')[0],
    isActive: true,
    departmentHeadId: '',
    isHRStaff: false,
    probationDays,
    probationExtensionDays: DEFAULT_PROBATION_EXTENSION_DAYS,
    probationOverrideDate: '',
    probationEndDate: '',
    probationNote: ''
});

function parseFormNumber(value: string, fallback: number): number {
    if (value.trim() === '') {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export default function EmployeeManagementPage() {
    const { data: session } = useSession();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [managers, setManagers] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<string[]>([]); // For dropdown
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [companyFilter, setCompanyFilter] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [subordinates, setSubordinates] = useState<Employee[]>([]);
    const [transferTargetId, setTransferTargetId] = useState<string | number | null>(null);
    const [probationStandardDays, setProbationStandardDays] = useState(DEFAULT_PROBATION_DAYS);
    const [formData, setFormData] = useState(createDefaultFormData);
    const [newPassword, setNewPassword] = useState('');
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync AD State
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncConfig, setSyncConfig] = useState<{
        syncNewOnly: boolean;
        updateExisting: boolean;
        source: 'ldap' | 'azure';
    }>({
        syncNewOnly: true,
        updateExisting: false,
        source: 'ldap' // Default to LDAP
    });
    const [syncResult, setSyncResult] = useState<{ totalFound: number; added: number; updated: number; source: string } | null>(null);

    // Leave balance modal state
    const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [employeeBalance, setEmployeeBalance] = useState<{
        employee: { employeeId: string; firstName: string; lastName: string; department: string; company: string };
        year: number;
        balances: { leaveType: string; entitlement: number; used: number; remaining: number; carryOver: number; actualUsedMinutes: number }[];
        leaveHistory: { id: number; leaveType: string; status: string; days: number; isHourly: boolean; startTime: string | null; endTime: string | null; startDate: string; endDate: string; reason: string }[];
    } | null>(null);

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            let url = `/api/hr/employees?page=${page}&limit=10&search=${search}`;
            if (departmentFilter) url += `&department=${encodeURIComponent(departmentFilter)}`;
            if (companyFilter) url += `&company=${encodeURIComponent(companyFilter)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                setEmployees(data.data);
                setPagination(data.pagination);
            }
        } catch (error) {
            console.error('Error fetching employees:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch potential managers (MANAGER, HR, ADMIN roles only)
    const fetchManagers = async () => {
        try {
            // Fetch only users with managerial roles for the dropdown
            const res = await fetch(`/api/hr/employees?limit=500&role=MANAGER,HR,ADMIN`);
            const data = await res.json();
            if (data.success) {
                setManagers(data.data);
            }
        } catch (error) {
            console.error('Error fetching managers:', error);
        }
    };

    const fetchDepartments = async () => {
        try {
            const res = await fetch('/api/hr/departments');
            const data = await res.json();
            if (data.success) {
                setDepartments(data.data);
            }
        } catch (error) {
            console.error('Error fetching departments:', error);
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, [page, search, departmentFilter, companyFilter]);

    // Fetch departments on mount for filter dropdown
    useEffect(() => {
        fetchDepartments();
    }, []);

    useEffect(() => {
        const fetchProbationRules = async () => {
            try {
                const res = await fetch('/api/settings/rules');
                if (!res.ok) {
                    return;
                }

                const data: SettingsRulesResponse = await res.json();
                const configuredDays = data.rules?.probationStandardDays;
                if (!data.success || configuredDays === null || configuredDays === undefined) {
                    return;
                }

                const nextProbationDays = String(configuredDays);
                setProbationStandardDays(nextProbationDays);
                setFormData(current => {
                    const isUntouchedAddForm =
                        !current.employeeId &&
                        !current.email &&
                        !current.firstName &&
                        !current.lastName &&
                        current.probationDays === DEFAULT_PROBATION_DAYS;

                    return isUntouchedAddForm
                        ? { ...current, probationDays: nextProbationDays }
                        : current;
                });
            } catch (error) {
                console.error('Error fetching probation rules:', error);
            }
        };

        fetchProbationRules();
    }, []);

    useEffect(() => {
        if (isAddModalOpen || isEditModalOpen) {
            fetchManagers();
            fetchDepartments();
        }
    }, [isAddModalOpen, isEditModalOpen]);

    const getProbationEndDatePreview = () => {
        if (!formData.startDate) {
            return '';
        }

        try {
            return calculateProbationEndDate({
                startDate: formData.startDate,
                probationDays: parseFormNumber(formData.probationDays, Number(probationStandardDays)),
                probationExtensionDays: parseFormNumber(formData.probationExtensionDays, Number(DEFAULT_PROBATION_EXTENSION_DAYS)),
                probationOverrideDate: formData.probationOverrideDate || null
            }).toISOString().split('T')[0];
        } catch {
            return '';
        }
    };

    const probationEndDatePreview = getProbationEndDatePreview();

    const openAddModal = () => {
        setFormError('');
        setSelectedEmployee(null);
        setFormData(createDefaultFormData(probationStandardDays));
        setIsAddModalOpen(true);
    };

    const closeAddModal = () => {
        setIsAddModalOpen(false);
        setFormError('');
        setFormData(createDefaultFormData(probationStandardDays));
    };

    const closeEditModal = () => {
        setIsEditModalOpen(false);
        setFormError('');
        setSelectedEmployee(null);
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setIsSubmitting(true);

        try {
            const res = await fetch('/api/hr/employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    probationEndDate: probationEndDatePreview,
                    departmentHeadId: formData.departmentHeadId ? Number(formData.departmentHeadId) : null
                }),
            });
            const result = await res.json();
            if (result.success) {
                closeAddModal();
                fetchEmployees();
                // Show success toast briefly
                setFormSuccess('เพิ่มพนักงานสำเร็จ');
                setTimeout(() => setFormSuccess(''), 3000);
            } else {
                setFormError(result.error || 'เกิดข้อผิดพลาดในการเพิ่มพนักงาน');
            }
        } catch (error) {
            console.error('Error adding employee:', error);
            setFormError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;
        setFormError('');
        setIsSubmitting(true);

        try {
            const res = await fetch('/api/hr/employees', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    id: selectedEmployee.id,
                    probationEndDate: probationEndDatePreview,
                    departmentHeadId: formData.departmentHeadId ? Number(formData.departmentHeadId) : null
                }),
            });
            const result = await res.json();
            if (result.success) {
                closeEditModal();
                fetchEmployees();
                // Show success toast briefly
                setFormSuccess('แก้ไขข้อมูลสำเร็จ');
                setTimeout(() => setFormSuccess(''), 3000);
            } else {
                setFormError(result.error || 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
            }
        } catch (error) {
            console.error('Error updating employee:', error);
            setFormError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteEmployee = async (emp: Employee) => {
        if (!confirm(`⚠️ ยืนยันการลบพนักงาน "${emp.firstName} ${emp.lastName}"?\n\nข้อมูลทั้งหมดจะถูกลบถาวร!`)) return;

        try {
            const res = await fetch('/api/hr/employees', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: emp.id }),
            });
            const result = await res.json();
            if (result.success) {
                setFormSuccess(`ลบพนักงาน ${emp.firstName} ${emp.lastName} สำเร็จ`);
                setTimeout(() => setFormSuccess(''), 3000);
                fetchEmployees();
            } else {
                alert(result.error || 'เกิดข้อผิดพลาดในการลบพนักงาน');
            }
        } catch (error) {
            console.error('Error deleting employee:', error);
            alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        }
    };

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;
        if (!confirm(`ยืนยันการรีเซ็ตรหัสผ่านสำหรับ ${selectedEmployee.firstName}?`)) return;

        try {
            const res = await fetch('/api/hr/employees/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: selectedEmployee.id, newPassword }),
            });
            const result = await res.json();
            if (result.success) {
                alert('รีเซ็ตรหัสผ่านสำเร็จ');
                setIsPasswordModalOpen(false);
                setNewPassword('');
            } else {
                alert(result.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            console.error('Error resetting password:', error);
        }
    };

    const openEditModal = (employee: Employee) => {
        setFormError('');
        setSelectedEmployee(employee);
        setFormData({
            employeeId: employee.employeeId,
            email: employee.email,
            password: '', // Not used in update
            firstName: employee.firstName,
            lastName: employee.lastName,
            role: employee.role,
            company: employee.company,
            department: employee.department,
            gender: 'M', // Default or fetch if needed
            startDate: employee.startDate ? employee.startDate.split('T')[0] : '',
            isActive: employee.isActive,
            departmentHeadId: employee.departmentHeadId ? employee.departmentHeadId.toString() : '',
            isHRStaff: employee.isHRStaff || false,
            probationDays: String(employee.probationDays ?? probationStandardDays),
            probationExtensionDays: String(employee.probationExtensionDays ?? DEFAULT_PROBATION_EXTENSION_DAYS),
            probationOverrideDate: employee.probationOverrideDate || '',
            probationEndDate: employee.probationEndDate || '',
            probationNote: employee.probationNote || ''
        });
        setIsEditModalOpen(true);
    };

    const openPasswordModal = (employee: Employee) => {
        setSelectedEmployee(employee);
        setNewPassword('');
        setIsPasswordModalOpen(true);
    };

    const openTransferModal = async (employee: Employee) => {
        setSelectedEmployee(employee);
        setTransferTargetId(null);
        try {
            const res = await fetch(`/api/hr/employees/transfer?managerId=${employee.id}`);
            const data = await res.json();
            if (data.success) {
                setSubordinates(data.subordinates);
            }
        } catch (error) {
            console.error('Error fetching subordinates:', error);
        }
        setIsTransferModalOpen(true);
    };

    const handleTransferSubordinates = async () => {
        if (!selectedEmployee) return;
        if (!confirm(`ยืนยันการโอนลูกน้อง ${subordinates.length} คน?`)) return;

        try {
            const res = await fetch('/api/hr/employees/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromManagerId: selectedEmployee.id,
                    toManagerId: transferTargetId || null
                }),
            });
            const result = await res.json();
            if (result.success) {
                alert(result.message);
                setIsTransferModalOpen(false);
                fetchEmployees();
            } else {
                alert(result.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            console.error('Error transferring subordinates:', error);
        }
    };

    // Open balance modal and fetch employee leave data
    const openBalanceModal = async (employee: Employee) => {
        setSelectedEmployee(employee);
        setBalanceLoading(true);
        setIsBalanceModalOpen(true);
        setEmployeeBalance(null);

        try {
            const res = await fetch(`/api/hr/employee-balance/${employee.id}`);
            const data = await res.json();
            if (data.success) {
                setEmployeeBalance(data.data);
            }
        } catch (error) {
            console.error('Error fetching balance:', error);
        } finally {
            setBalanceLoading(false);
        }
    };

    // Export employees to CSV
    const handleExport = async () => {
        try {
            const response = await fetch('/api/hr/employees/export');
            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `employees_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            setFormSuccess('Export สำเร็จ');
            setTimeout(() => setFormSuccess(''), 3000);
        } catch (error) {
            console.error('Export error:', error);
            alert('เกิดข้อผิดพลาดในการ Export');
        }
    };

    // Trigger file input for import
    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    // Process CSV file for import
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);

        try {
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                alert('ไฟล์ว่างเปล่าหรือไม่มีข้อมูล');
                return;
            }

            // Parse CSV (skip header row)
            const rows = lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
                return {
                    employeeId: values[0] || '',
                    email: values[1] || '',
                    firstName: values[2] || '',
                    lastName: values[3] || '',
                    password: values[0] || '', // Default password = employeeId
                    role: values[4] || 'EMPLOYEE',
                    company: values[5] || 'SONIC',
                    department: values[6] || '',
                    gender: values[7] || 'M',
                    startDate: values[8] || new Date().toISOString().split('T')[0],
                    departmentHeadEmployeeId: values[10] || ''
                };
            }).filter(row => row.employeeId && row.email);

            if (rows.length === 0) {
                alert('ไม่พบข้อมูลที่ถูกต้องในไฟล์');
                return;
            }

            // Send to API
            const response = await fetch('/api/hr/employees/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: rows })
            });

            const result = await response.json();

            if (result.success) {
                setFormSuccess(`Import สำเร็จ ${result.stats.success}/${result.stats.total} รายการ`);
                setTimeout(() => setFormSuccess(''), 5000);
                fetchEmployees();

                if (result.errorDetails && result.errorDetails.length > 0) {
                    alert(`มีข้อผิดพลาดบางรายการ:\n${result.errorDetails.join('\n')}`);
                }
            } else {
                alert(result.error || 'Import ล้มเหลว');
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('เกิดข้อผิดพลาดในการ Import');
        } finally {
            setIsImporting(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Handle AD Sync
    const handleSyncSubmit = async () => {
        setIsSyncing(true);
        setSyncResult(null);

        try {
            const res = await fetch('/api/hr/employees/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(syncConfig)
            });
            const result = await res.json();

            if (result.success) {
                setSyncResult(result.summary);
                fetchEmployees();
                setFormSuccess('Sync Active Directory สำเร็จ');
                setTimeout(() => setFormSuccess(''), 3000);
            } else {
                alert(result.error || 'เกิดข้อผิดพลาดในการ Sync');
                setIsSyncing(false); // Only stop loading if error, otherwise keep open to show result
            }
        } catch (error) {
            console.error('Sync error:', error);
            alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
            setIsSyncing(false);
        }
    };

    const closeSyncModal = () => {
        setIsSyncModalOpen(false);
        setIsSyncing(false);
        setSyncResult(null);
    };

    // Convert managers to SearchableSelect options
    const managerOptions = managers.map(m => ({
        id: m.id,
        label: `${m.firstName} ${m.lastName}`,
        subLabel: `${m.department} - ${m.role}`
    }));

    return (
        <>
            <div className="animate-fade-in">
                {/* Success Toast */}
                {formSuccess && (
                    <div className="fixed top-4 right-4 z-50 animate-fade-in">
                        <div className="px-4 py-3 bg-green-500 text-white rounded-xl shadow-lg flex items-center gap-2">
                            <CheckCircle className="w-5 h-5" />
                            {formSuccess}
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                            <Users className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                จัดการพนักงาน
                            </h1>
                            <p className="text-gray-500">เพิ่ม, แก้ไข และจัดการสิทธิ์ผู้ใช้งาน</p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        {/* Hidden file input for import */}
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".csv"
                            className="hidden"
                        />

                        {/* Import Button */}
                        <button
                            onClick={handleImportClick}
                            disabled={isImporting}
                            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
                            title="Import จาก CSV"
                        >
                            {isImporting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Upload className="w-4 h-4" />
                            )}
                            <span className="hidden sm:inline">Import</span>
                        </button>

                        {/* Sync AD Button */}
                        <button
                            onClick={() => setIsSyncModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors shadow-sm"
                            title="Sync with Active Directory"
                        >
                            <RefreshCw className="w-4 h-4" />
                            <span className="hidden sm:inline">Sync AD</span>
                        </button>

                        {/* Add Button */}

                        {/* Export Button */}
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors shadow-sm"
                            title="Export เป็น CSV"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export</span>
                        </button>

                        {/* Add Employee Button */}
                        <button
                            onClick={openAddModal}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
                        >
                            <Plus className="w-5 h-5" />
                            เพิ่มพนักงาน
                        </button>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Search Input */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อ, รหัสพนักงาน, แผนก..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-gray-900 dark:text-white"
                            />
                        </div>

                        {/* Department Filter */}
                        <div className="w-full md:w-48">
                            <select
                                value={departmentFilter}
                                onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-gray-900 dark:text-white text-sm"
                            >
                                <option value="">ทุกแผนก</option>
                                {departments.map(dept => (
                                    <option key={dept} value={dept}>{dept}</option>
                                ))}
                            </select>
                        </div>

                        {/* Company Filter */}
                        <div className="w-full md:w-48">
                            <select
                                value={companyFilter}
                                onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }}
                                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-gray-900 dark:text-white text-sm"
                            >
                                <option value="">ทุกบริษัท</option>
                                <option value="SONIC">SONIC</option>
                                <option value="GRANDLINK">GRANDLINK</option>
                                <option value="SONIC-AUTOLOGIS">SONIC-AUTOLOGIS</option>
                            </select>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-2 text-sm text-gray-500 whitespace-nowrap">
                            <Users className="w-4 h-4" />
                            <span>ทั้งหมด {pagination.total} คน</span>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">พนักงาน</th>
                                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">บริษัท/แผนก</th>
                                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">สถานะ</th>
                                    <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-gray-500">
                                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                            กำลังโหลด...
                                        </td>
                                    </tr>
                                ) : employees.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-gray-500">
                                            ไม่พบข้อมูลพนักงาน
                                        </td>
                                    </tr>
                                ) : (
                                    employees.map((emp) => (
                                        <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold text-sm">
                                                        {emp.firstName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-gray-900 dark:text-white">{emp.firstName} {emp.lastName}</p>
                                                        <p className="text-xs text-gray-500">{emp.employeeId} | {emp.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{emp.company}</span>
                                                    <span className="text-xs text-gray-500">{emp.department}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${emp.role === 'ADMIN' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                                        emp.role === 'HR' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' :
                                                            emp.role === 'MANAGER' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                                'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                    }`}>
                                                    {emp.role}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6">
                                                {emp.isActive ? (
                                                    <span className="flex items-center gap-1 text-green-600 text-sm">
                                                        <CheckCircle className="w-4 h-4" /> Active
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-gray-400 text-sm">
                                                        <XCircle className="w-4 h-4" /> Inactive
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => openBalanceModal(emp)}
                                                        className="p-1.5 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors"
                                                        title="ดูวันลา"
                                                    >
                                                        <CalendarDays className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => openTransferModal(emp)}
                                                        className="p-1.5 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                                                        title="โอนลูกน้อง"
                                                    >
                                                        <ArrowRightLeft className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => openPasswordModal(emp)}
                                                        className="p-1.5 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 rounded-lg transition-colors"
                                                        title="รีเซ็ตรหัสผ่าน"
                                                    >
                                                        <KeyRound className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => openEditModal(emp)}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                                        title="แก้ไข"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteEmployee(emp)}
                                                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                        title="ลบ"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(page - 1)}
                            className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm text-gray-500">
                            หน้า {page} จาก {pagination.totalPages}
                        </span>
                        <button
                            disabled={page === pagination.totalPages}
                            onClick={() => setPage(page + 1)}
                            className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

            </div>

            {/* Add Modal */}
            {
                isAddModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
                            {/* Header */}
                            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 z-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-2xl">
                                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                        <User className="w-5 h-5 text-white" />
                                    </div>
                                    เพิ่มพนักงานใหม่
                                </h2>
                                <button
                                    onClick={closeAddModal}
                                    className="text-white/80 hover:text-white transition-colors"
                                >
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>

                            <form onSubmit={handleAddSubmit} className="p-6">
                                {/* Error Message */}
                                {formError && (
                                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                                        <XCircle className="w-4 h-4 flex-shrink-0" />
                                        {formError}
                                    </div>
                                )}

                                {/* Section: ข้อมูลส่วนตัว */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <User className="w-4 h-4 text-blue-600" />
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">ข้อมูลส่วนตัว</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">รหัสพนักงาน *</label>
                                            <div className="relative">
                                                <input required type="text" value={formData.employeeId} onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                    placeholder="เช่น EMP001" />
                                                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">อีเมล *</label>
                                            <div className="relative">
                                                <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                    placeholder="email@company.com" />
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">ชื่อจริง *</label>
                                            <input required type="text" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                placeholder="ชื่อจริง" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">นามสกุล *</label>
                                            <input required type="text" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                placeholder="นามสกุล" />
                                        </div>
                                    </div>
                                </div>

                                {/* Section: ข้อมูลบัญชี */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Shield className="w-4 h-4 text-purple-600" />
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">ข้อมูลบัญชี</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">รหัสผ่าน *</label>
                                            <div className="relative">
                                                <input required type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                    placeholder="••••••••" />
                                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Role *</label>
                                            <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                                                <option value="EMPLOYEE">👤 EMPLOYEE</option>
                                                <option value="MANAGER">👔 MANAGER</option>
                                                <option value="HR">📋 HR</option>
                                                <option value="ADMIN">🔐 ADMIN</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: ข้อมูลบริษัท */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Briefcase className="w-4 h-4 text-green-600" />
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">ข้อมูลบริษัท</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">บริษัท *</label>
                                            <CompanySelect
                                                value={formData.company}
                                                onChange={(val) => setFormData({ ...formData, company: val })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">แผนก *</label>
                                            <DepartmentCombobox
                                                suggestions={departments}
                                                value={formData.department}
                                                onChange={(val) => setFormData({ ...formData, department: val })}
                                                placeholder="เลือกหรือพิมพ์แผนก"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">หัวหน้างาน</label>
                                            <ManagerSearchSelect
                                                value={formData.departmentHeadId}
                                                onChange={(val) => setFormData({ ...formData, departmentHeadId: val ? String(val) : '' })}
                                                placeholder="-- ค้นหาหัวหน้างาน --"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">วันที่เริ่มงาน *</label>
                                            <input required type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                                        </div>
                                    </div>
                                </div>

                                {/* Section: ข้อมูลทดลองงานและสิทธิ์พักร้อน */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <CalendarDays className="w-4 h-4 text-teal-600" />
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">ข้อมูลทดลองงานและสิทธิ์พักร้อน</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">ระยะทดลองงานมาตรฐาน (วัน)</label>
                                            <input type="number" min="0" value={formData.probationDays} onChange={e => setFormData({ ...formData, probationDays: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">ต่อทดลองงานเพิ่ม (วัน)</label>
                                            <input type="number" min="0" value={formData.probationExtensionDays} onChange={e => setFormData({ ...formData, probationExtensionDays: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">วันที่ผ่านทดลองงานจริง (กรณีผ่านก่อน/ยกเว้น)</label>
                                            <input type="date" value={formData.probationOverrideDate} onChange={e => setFormData({ ...formData, probationOverrideDate: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">วันที่ครบกำหนดทดลองงาน (คำนวณ)</label>
                                            <input disabled type="date" value={probationEndDatePreview || formData.probationEndDate}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed" />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">เหตุผลการปรับทดลองงาน</label>
                                            <textarea value={formData.probationNote} onChange={e => setFormData({ ...formData, probationNote: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                rows={3}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={closeAddModal}
                                        className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors font-medium"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-lg shadow-blue-500/25 transition-all font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                กำลังบันทึก...
                                            </>
                                        ) : (
                                            <>
                                                <Plus className="w-4 h-4" />
                                                บันทึกข้อมูล
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Edit Modal */}
            {
                isEditModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
                            {/* Header */}
                            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 z-10 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-2xl">
                                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                        <Edit className="w-5 h-5 text-white" />
                                    </div>
                                    แก้ไขข้อมูลพนักงาน
                                </h2>
                                <button
                                    onClick={closeEditModal}
                                    className="text-white/80 hover:text-white transition-colors"
                                >
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>

                            <form onSubmit={handleEditSubmit} className="p-6">
                                {/* Error Message */}
                                {formError && (
                                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                                        <XCircle className="w-4 h-4 flex-shrink-0" />
                                        {formError}
                                    </div>
                                )}

                                {/* Section: ข้อมูลส่วนตัว */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <User className="w-4 h-4 text-indigo-600" />
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">ข้อมูลส่วนตัว</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">รหัสพนักงาน</label>
                                            <div className="relative">
                                                <input disabled type="text" value={formData.employeeId}
                                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed" />
                                                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">อีเมล</label>
                                            <div className="relative">
                                                <input disabled type="email" value={formData.email}
                                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed" />
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">ชื่อจริง *</label>
                                            <input required type="text" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">นามสกุล *</label>
                                            <input required type="text" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">เพศ *</label>
                                            <div className="flex gap-4">
                                                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-900 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 flex-1 hover:border-indigo-500 transition-colors">
                                                    <input
                                                        type="radio"
                                                        name="edit-gender"
                                                        value="M"
                                                        checked={formData.gender === 'M'}
                                                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                                        className="w-4 h-4 text-indigo-600"
                                                    />
                                                    <span className="text-gray-700 dark:text-gray-300">ชาย</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-900 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 flex-1 hover:border-indigo-500 transition-colors">
                                                    <input
                                                        type="radio"
                                                        name="edit-gender"
                                                        value="F"
                                                        checked={formData.gender === 'F'}
                                                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                                        className="w-4 h-4 text-indigo-600"
                                                    />
                                                    <span className="text-gray-700 dark:text-gray-300">หญิง</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: ข้อมูลบัญชี */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Shield className="w-4 h-4 text-purple-600" />
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">ข้อมูลบัญชี</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Role *</label>
                                            <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
                                                <option value="EMPLOYEE">👤 EMPLOYEE</option>
                                                <option value="MANAGER">👔 MANAGER</option>
                                                <option value="HR">📋 HR</option>
                                                <option value="ADMIN">🔐 ADMIN</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center pt-6">
                                            <label className="flex items-center gap-3 cursor-pointer bg-gray-50 dark:bg-gray-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 w-full">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.isActive}
                                                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                                    className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    {formData.isActive ? '✅ Active' : '❌ Inactive'}
                                                </span>
                                            </label>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">HR Staff</label>
                                            <label className="flex items-center gap-3 cursor-pointer bg-gray-50 dark:bg-gray-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 w-full">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.isHRStaff}
                                                    onChange={e => setFormData({ ...formData, isHRStaff: e.target.checked })}
                                                    className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500"
                                                />
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    {formData.isHRStaff ? '👔 เข้าถึงเมนู HR' : '❌ ไม่ใช่ HR Staff'}
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: ข้อมูลบริษัท */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Briefcase className="w-4 h-4 text-green-600" />
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">ข้อมูลบริษัท</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">บริษัท *</label>
                                            <CompanySelect
                                                value={formData.company}
                                                onChange={(val) => setFormData({ ...formData, company: val })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">แผนก *</label>
                                            <DepartmentCombobox
                                                suggestions={departments}
                                                value={formData.department}
                                                onChange={(val) => setFormData({ ...formData, department: val })}
                                                placeholder="เลือกหรือพิมพ์แผนก"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">หัวหน้างาน</label>
                                            <ManagerSearchSelect
                                                value={formData.departmentHeadId}
                                                onChange={(val) => setFormData({ ...formData, departmentHeadId: val ? String(val) : '' })}
                                                placeholder="-- ค้นหาหัวหน้างาน --"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">วันที่เริ่มงาน *</label>
                                            <input required type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                        </div>
                                    </div>
                                </div>

                                {/* Section: ข้อมูลทดลองงานและสิทธิ์พักร้อน */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <CalendarDays className="w-4 h-4 text-teal-600" />
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">ข้อมูลทดลองงานและสิทธิ์พักร้อน</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">ระยะทดลองงานมาตรฐาน (วัน)</label>
                                            <input type="number" min="0" value={formData.probationDays} onChange={e => setFormData({ ...formData, probationDays: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">ต่อทดลองงานเพิ่ม (วัน)</label>
                                            <input type="number" min="0" value={formData.probationExtensionDays} onChange={e => setFormData({ ...formData, probationExtensionDays: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">วันที่ผ่านทดลองงานจริง (กรณีผ่านก่อน/ยกเว้น)</label>
                                            <input type="date" value={formData.probationOverrideDate} onChange={e => setFormData({ ...formData, probationOverrideDate: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">วันที่ครบกำหนดทดลองงาน (คำนวณ)</label>
                                            <input disabled type="date" value={probationEndDatePreview || formData.probationEndDate}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed" />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">เหตุผลการปรับทดลองงาน</label>
                                            <textarea value={formData.probationNote} onChange={e => setFormData({ ...formData, probationNote: e.target.value })}
                                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                                rows={3}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={closeEditModal}
                                        className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors font-medium"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl shadow-lg shadow-indigo-500/25 transition-all font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                กำลังบันทึก...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="w-4 h-4" />
                                                บันทึกการแก้ไข
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Password Modal */}
            {
                isPasswordModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl">
                            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-yellow-600" />
                                    รีเซ็ตรหัสผ่าน
                                </h2>
                                <button
                                    onClick={() => setIsPasswordModalOpen(false)}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                >
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>

                            <form onSubmit={handlePasswordReset} className="p-6 space-y-4">
                                <div>
                                    <p className="text-sm text-gray-500 mb-4">
                                        กำลังเปลี่ยนรหัสผ่านสำหรับ: <span className="font-semibold text-gray-900 dark:text-white">{selectedEmployee?.firstName} {selectedEmployee?.lastName}</span>
                                    </p>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">รหัสผ่านใหม่ *</label>
                                    <input
                                        required
                                        type="text"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        className="w-full p-2 rounded-lg border dark:bg-gray-900 dark:border-gray-600 font-mono"
                                        placeholder="กรอกรหัสผ่านใหม่..."
                                    />
                                </div>

                                <div className="pt-2 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsPasswordModalOpen(false)}
                                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg shadow-sm"
                                    >
                                        ยืนยันรีเซ็ต
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Transfer Subordinates Modal */}
            {
                isTransferModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-xl">
                            {/* Header */}
                            <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-orange-500 to-amber-500 rounded-t-2xl">
                                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                        <ArrowRightLeft className="w-5 h-5 text-white" />
                                    </div>
                                    โอนย้ายลูกน้อง
                                </h2>
                                {selectedEmployee && (
                                    <p className="text-white/80 mt-1 text-sm">
                                        จาก: {selectedEmployee.firstName} {selectedEmployee.lastName}
                                    </p>
                                )}
                            </div>

                            <div className="p-6">
                                {/* Subordinates List */}
                                <div className="mb-6">
                                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
                                        รายชื่อลูกน้อง ({subordinates.length} คน)
                                    </h3>
                                    {subordinates.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400">
                                            <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                            <p>ไม่มีลูกน้องที่ต้องโอนย้าย</p>
                                        </div>
                                    ) : (
                                        <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-600 rounded-xl p-3">
                                            {subordinates.map(sub => (
                                                <div key={sub.id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                                                        {sub.firstName?.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                            {sub.firstName} {sub.lastName}
                                                        </p>
                                                        <p className="text-xs text-gray-500">{sub.department}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Target Manager Selection */}
                                {subordinates.length > 0 && (
                                    <div className="mb-6">
                                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                                            โอนไปยังหัวหน้างานใหม่
                                        </label>
                                        <ManagerSearchSelect
                                            value={transferTargetId}
                                            onChange={(val) => setTransferTargetId(val)}
                                            placeholder="-- เลือกหัวหน้างานใหม่ (หรือยกเลิกหัวหน้า) --"
                                        />
                                        <p className="text-xs text-gray-500 mt-2">
                                            💡 หากไม่เลือก ลูกน้องทั้งหมดจะไม่มีหัวหน้างาน
                                        </p>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsTransferModalOpen(false)}
                                        className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors font-medium"
                                    >
                                        ยกเลิก
                                    </button>
                                    {subordinates.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleTransferSubordinates}
                                            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl shadow-lg shadow-orange-500/25 transition-all font-medium flex items-center gap-2"
                                        >
                                            <ArrowRightLeft className="w-4 h-4" />
                                            โอนย้าย {subordinates.length} คน
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Balance Modal */}
            {
                isBalanceModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setIsBalanceModalOpen(false)}>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                            วันลาของ {employeeBalance?.employee.firstName} {employeeBalance?.employee.lastName}
                                        </h2>
                                        <p className="text-sm text-gray-500">
                                            {employeeBalance?.employee.employeeId} | {employeeBalance?.employee.department}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setIsBalanceModalOpen(false)}
                                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                    >
                                        <XCircle className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>
                            </div>

                            {balanceLoading ? (
                                <div className="p-12 flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                </div>
                            ) : employeeBalance ? (
                                <div className="p-6">
                                    {/* Balance Cards */}
                                    <h3 className="text-sm font-medium text-gray-500 uppercase mb-3">
                                        วันลาคงเหลือ ปี {employeeBalance.year}
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                                        {employeeBalance.balances.map(b => (
                                            <div key={b.leaveType} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 text-center">
                                                <p className="text-xs text-gray-500 mb-1">
                                                    {{
                                                        'VACATION': 'ลาพักร้อน',
                                                        'SICK': 'ลาป่วย',
                                                        'PERSONAL': 'ลากิจ',
                                                        'MATERNITY': 'ลาคลอด',
                                                        'MILITARY': 'เกณฑ์ทหาร',
                                                        'ORDINATION': 'ลาบวช',
                                                        'STERILIZATION': 'ลาทำหมัน',
                                                        'TRAINING': 'ลาฝึกอบรม',
                                                        'OTHER': 'อื่นๆ'
                                                    }[b.leaveType] || b.leaveType}
                                                </p>
                                                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                    {b.entitlement === 0 && b.carryOver === 0 ? 'ไม่จำกัด' : formatLeaveDays(b.remaining)}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    ใช้ {formatMinutesToDisplay(b.actualUsedMinutes)} / {b.entitlement === 0 && b.carryOver === 0 ? 'ไม่จำกัด' : formatLeaveDays(b.entitlement + b.carryOver)}
                                                </p>
                                                {b.carryOver > 0 && (
                                                    <p className="text-xs text-blue-500 mt-1">
                                                        (ยกมา {formatLeaveDays(b.carryOver)})
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Leave History */}
                                    <h3 className="text-sm font-medium text-gray-500 uppercase mb-3">
                                        ประวัติการลาปีนี้
                                    </h3>
                                    {employeeBalance.leaveHistory.length === 0 ? (
                                        <p className="text-center text-gray-400 py-4">ยังไม่มีประวัติการลา</p>
                                    ) : (
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {employeeBalance.leaveHistory.map(h => (
                                                <div key={h.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`w-2 h-2 rounded-full ${h.status === 'APPROVED' ? 'bg-green-500' :
                                                            h.status === 'PENDING' ? 'bg-yellow-500' : 'bg-red-500'
                                                            }`} />
                                                        <div>
                                                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                                {{
                                                                    'VACATION': 'ลาพักร้อน',
                                                                    'SICK': 'ลาป่วย',
                                                                    'PERSONAL': 'ลากิจ',
                                                                    'MATERNITY': 'ลาคลอด',
                                                                    'MILITARY': 'เกณฑ์ทหาร',
                                                                    'ORDINATION': 'ลาบวช',
                                                                    'STERILIZATION': 'ลาทำหมัน',
                                                                    'TRAINING': 'ลาฝึกอบรม',
                                                                    'OTHER': 'อื่นๆ'
                                                                }[h.leaveType] || h.leaveType}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                {h.startDate} - {h.endDate}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                                                            {h.isHourly && h.startTime && h.endTime
                                                                ? formatHourlyDuration(h.startTime, h.endTime)
                                                                : formatLeaveDays(h.days)}
                                                        </p>
                                                        <span className={`text-xs ${h.status === 'APPROVED' ? 'text-green-600' :
                                                            h.status === 'PENDING' ? 'text-yellow-600' : 'text-red-600'
                                                            }`}>
                                                            {h.status === 'APPROVED' ? 'อนุมัติ' :
                                                                h.status === 'PENDING' ? 'รอ' : 'ไม่อนุมัติ'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-6 text-center text-gray-500">
                                    ไม่พบข้อมูลวันลา
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Sync AD Modal */}
            <Modal
                isOpen={isSyncModalOpen}
                onClose={closeSyncModal}
                title="Sync ข้อมูลจาก Active Directory"
                maxWidth="md"
                footer={
                    !syncResult ? (
                        <>
                            <button
                                onClick={closeSyncModal}
                                disabled={isSyncing}
                                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleSyncSubmit}
                                disabled={isSyncing}
                                className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 transition-colors shadow-sm"
                            >
                                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                เริ่มการ Sync
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={closeSyncModal}
                            className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                        >
                            ปิดหน้าต่าง
                        </button>
                    )
                }
            >
                {!syncResult ? (
                    <div className="space-y-6">
                        <div className="flex items-start gap-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg shrink-0">
                                <RefreshCw className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
                                    ยืนยันการ Sync ข้อมูล?
                                </h4>
                                <p className="text-sm text-purple-700 dark:text-purple-300">
                                    ระบบจะทำการค้นหาบัญชีผู้ใช้ (Users) ทั้งหมดจาก Active Directory และนำมาเปรียบเทียบกับฐานข้อมูลปัจจุบัน
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${syncConfig.source === 'ldap' ? 'bg-purple-50 border-purple-200 ring-1 ring-purple-500' : 'border-gray-200 hover:bg-gray-50'}`}
                                    onClick={() => setSyncConfig({ ...syncConfig, source: 'ldap' })}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Database className={`w-4 h-4 ${syncConfig.source === 'ldap' ? 'text-purple-600' : 'text-gray-500'}`} />
                                        <span className={`font-medium ${syncConfig.source === 'ldap' ? 'text-purple-900' : 'text-gray-700'}`}>Local AD (LDAP)</span>
                                    </div>
                                    <p className="text-xs text-gray-500">ดึงข้อมูลจาก On-Premise AD</p>
                                </div>

                                <div
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${syncConfig.source === 'azure' ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}
                                    onClick={() => setSyncConfig({ ...syncConfig, source: 'azure' })}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Cloud className={`w-4 h-4 ${syncConfig.source === 'azure' ? 'text-blue-600' : 'text-gray-500'}`} />
                                        <span className={`font-medium ${syncConfig.source === 'azure' ? 'text-blue-900' : 'text-gray-700'}`}>Azure AD</span>
                                    </div>
                                    <p className="text-xs text-gray-500">ดึงข้อมูลจาก Microsoft Entra ID</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => setSyncConfig({ ...syncConfig, syncNewOnly: !syncConfig.syncNewOnly })}>
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${syncConfig.syncNewOnly ? 'bg-purple-600 border-purple-600' : 'border-gray-300 dark:border-gray-600'}`}>
                                    {syncConfig.syncNewOnly && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                                </div>
                                <span className="text-gray-700 dark:text-gray-300">นำเข้าพนักงานใหม่ (Insert New)</span>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => setSyncConfig({ ...syncConfig, updateExisting: !syncConfig.updateExisting })}>
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${syncConfig.updateExisting ? 'bg-purple-600 border-purple-600' : 'border-gray-300 dark:border-gray-600'}`}>
                                    {syncConfig.updateExisting && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                                </div>
                                <span className="text-gray-700 dark:text-gray-300">อัปเดตข้อมูลพนักงานเดิม (Update Existing)</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sync สำเร็จ!</h3>
                        <p className="text-gray-500 mb-6">ดำเนินการปรับปรุงข้อมูลเรียบร้อยแล้ว</p>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{syncResult.totalFound}</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Users พบทั้งหมด</div>
                            </div>
                            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{syncResult.added}</div>
                                <div className="text-xs text-green-600/80 dark:text-green-400/80 uppercase tracking-wide">เพิ่มใหม่</div>
                            </div>
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{syncResult.updated}</div>
                                <div className="text-xs text-blue-600/80 dark:text-blue-400/80 uppercase tracking-wide">อัปเดต</div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}
