'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    Building2,
    Plus,
    Edit2,
    Trash2,
    Loader2,
    X,
    CheckCircle,
    AlertCircle,
    Palette
} from 'lucide-react';

interface Company {
    id: number;
    code: string;
    name: string;
    shortName: string | null;
    color: string;
    isActive: boolean;
}

const COLOR_OPTIONS = [
    { value: '#3B82F6', label: '🟦 น้ำเงิน' },
    { value: '#22C55E', label: '🟩 เขียว' },
    { value: '#EF4444', label: '🟥 แดง' },
    { value: '#F59E0B', label: '🟨 เหลือง' },
    { value: '#8B5CF6', label: '🟪 ม่วง' },
    { value: '#EC4899', label: '🌸 ชมพู' },
    { value: '#14B8A6', label: '🔷 เทอร์ควอยซ์' },
    { value: '#F97316', label: '🟧 ส้ม' },
];

export default function HRCompaniesPage() {
    const { data: session } = useSession();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

    // Form states
    const [formCode, setFormCode] = useState('');
    const [formName, setFormName] = useState('');
    const [formShortName, setFormShortName] = useState('');
    const [formColor, setFormColor] = useState('#3B82F6');
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    // Fetch companies
    const fetchCompanies = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/hr/companies?activeOnly=false');
            const data = await res.json();
            if (data.success) {
                setCompanies(data.data);
            }
        } catch (error) {
            console.error('Error fetching companies:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCompanies();
    }, []);

    // Open add modal
    const handleAdd = () => {
        setIsEditing(false);
        setFormCode('');
        setFormName('');
        setFormShortName('');
        setFormColor('#3B82F6');
        setFormError('');
        setShowModal(true);
    };

    // Open edit modal
    const handleEdit = (company: Company) => {
        setIsEditing(true);
        setSelectedCompany(company);
        setFormCode(company.code);
        setFormName(company.name);
        setFormShortName(company.shortName || '');
        setFormColor(company.color);
        setFormError('');
        setShowModal(true);
    };

    // Open delete confirm
    const handleDeleteClick = (company: Company) => {
        setSelectedCompany(company);
        setShowDeleteConfirm(true);
    };

    // Save company
    const handleSave = async () => {
        if (!formCode.trim() || !formName.trim()) {
            setFormError('กรุณากรอกรหัสบริษัทและชื่อบริษัท');
            return;
        }

        setIsSaving(true);
        setFormError('');

        try {
            const url = '/api/hr/companies';
            const method = isEditing ? 'PUT' : 'POST';
            const body = isEditing
                ? { id: selectedCompany?.id, name: formName, shortName: formShortName, color: formColor }
                : { code: formCode, name: formName, shortName: formShortName, color: formColor };

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const result = await res.json();

            if (result.success) {
                setShowModal(false);
                setFormSuccess(isEditing ? 'แก้ไขบริษัทสำเร็จ' : 'เพิ่มบริษัทสำเร็จ');
                setTimeout(() => setFormSuccess(''), 3000);
                fetchCompanies();
            } else {
                setFormError(result.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            setFormError('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setIsSaving(false);
        }
    };

    // Delete company
    const handleDelete = async () => {
        if (!selectedCompany) return;

        setIsSaving(true);
        try {
            const res = await fetch(`/api/hr/companies?id=${selectedCompany.id}`, {
                method: 'DELETE',
            });

            const result = await res.json();

            if (result.success) {
                setShowDeleteConfirm(false);
                setSelectedCompany(null);
                setFormSuccess('ลบบริษัทสำเร็จ');
                setTimeout(() => setFormSuccess(''), 3000);
                fetchCompanies();
            } else {
                setFormError(result.error);
                setShowDeleteConfirm(false);
            }
        } catch (error) {
            console.error('Error deleting company:', error);
        } finally {
            setIsSaving(false);
        }
    };

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

                {/* Error Toast */}
                {formError && !showModal && (
                    <div className="fixed top-4 right-4 z-50 animate-fade-in">
                        <div className="px-4 py-3 bg-red-500 text-white rounded-xl shadow-lg flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            {formError}
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                จัดการบริษัท
                            </h1>
                            <p className="text-gray-500">เพิ่ม แก้ไข ลบ บริษัทในระบบ</p>
                        </div>
                    </div>
                    <button
                        onClick={handleAdd}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        เพิ่มบริษัท
                    </button>
                </div>

                {/* Companies Grid */}
                {isLoading ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-4" />
                        <p className="text-gray-500">กำลังโหลดข้อมูล...</p>
                    </div>
                ) : companies.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">ยังไม่มีบริษัทในระบบ</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {companies.map((company) => (
                            <div
                                key={company.id}
                                className={`bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all ${!company.isActive ? 'opacity-50' : ''}`}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                                            style={{ backgroundColor: company.color }}
                                        >
                                            {company.code.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">
                                                {company.code}
                                            </h3>
                                            <p className="text-sm text-gray-500">
                                                {company.shortName || '-'}
                                            </p>
                                        </div>
                                    </div>
                                    {!company.isActive && (
                                        <span className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded-full">
                                            ไม่ใช้งาน
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                                    {company.name}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleEdit(company)}
                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                        แก้ไข
                                    </button>
                                    <button
                                        onClick={() => handleDeleteClick(company)}
                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        ลบ
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl">
                        <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-pink-600 rounded-t-2xl">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-white">
                                    {isEditing ? 'แก้ไขบริษัท' : 'เพิ่มบริษัทใหม่'}
                                </h3>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-2 hover:bg-white/20 rounded-lg text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            {formError && (
                                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    {formError}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        รหัสบริษัท <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formCode}
                                        onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                                        placeholder="เช่น NEWCOMPANY"
                                        disabled={isEditing}
                                        className={`w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-purple-500 ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    />
                                    {isEditing && (
                                        <p className="text-xs text-gray-500 mt-1">รหัสบริษัทไม่สามารถแก้ไขได้</p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        ชื่อบริษัท (เต็ม) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        placeholder="เช่น บริษัท ตัวอย่าง จำกัด"
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        ชื่อย่อ
                                    </label>
                                    <input
                                        type="text"
                                        value={formShortName}
                                        onChange={(e) => setFormShortName(e.target.value)}
                                        placeholder="เช่น Example"
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        <Palette className="w-4 h-4 inline mr-1" />
                                        สี
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {COLOR_OPTIONS.map((colorOpt) => (
                                            <button
                                                key={colorOpt.value}
                                                type="button"
                                                onClick={() => setFormColor(colorOpt.value)}
                                                className={`px-3 py-2 rounded-lg border-2 transition-all ${formColor === colorOpt.value
                                                    ? 'border-gray-900 dark:border-white scale-105'
                                                    : 'border-transparent hover:border-gray-300'
                                                    }`}
                                                style={{ backgroundColor: colorOpt.value + '20' }}
                                            >
                                                <span style={{ color: colorOpt.value }}>{colorOpt.label}</span>
                                            </button>
                                        ))}
                                    </div>
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
                                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                    บันทึก
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && selectedCompany && (
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
                                คุณต้องการลบบริษัท <strong>{selectedCompany.name}</strong> ใช่หรือไม่?
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
