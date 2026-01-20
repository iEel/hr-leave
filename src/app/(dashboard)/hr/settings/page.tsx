'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
    Settings,
    Save,
    Loader2,
    Calendar,
    Clock,
    AlertTriangle,
    FileText,
    RefreshCw
} from 'lucide-react';

interface SettingItem {
    value: string;
    description: string;
    updatedAt: string;
}

interface SettingsData {
    [key: string]: SettingItem;
}

const SETTING_GROUPS = [
    {
        title: 'โควต้าวันลา (วัน/ปี)',
        icon: <Calendar className="w-5 h-5" />,
        settings: [
            { key: 'LEAVE_QUOTA_VACATION', label: 'ลาพักร้อน', type: 'number' },
            { key: 'LEAVE_QUOTA_SICK', label: 'ลาป่วย', type: 'number' },
            { key: 'LEAVE_QUOTA_PERSONAL', label: 'ลากิจ', type: 'number' },
            { key: 'LEAVE_QUOTA_MATERNITY', label: 'ลาคลอด', type: 'number' },
            { key: 'LEAVE_QUOTA_MILITARY', label: 'เกณฑ์ทหาร', type: 'number' },
            { key: 'LEAVE_QUOTA_ORDINATION', label: 'ลาบวช', type: 'number' },
        ]
    },
    {
        title: 'กฏการลา',
        icon: <FileText className="w-5 h-5" />,
        settings: [
            { key: 'LEAVE_ADVANCE_DAYS', label: 'ต้องขอล่วงหน้า (วัน)', type: 'number' },
            { key: 'LEAVE_SICK_CERT_DAYS', label: 'ลาป่วยกี่วันต้องมีใบรับรองแพทย์', type: 'number' },
        ]
    },
    {
        title: 'ปีงบประมาณ',
        icon: <RefreshCw className="w-5 h-5" />,
        settings: [
            { key: 'LEAVE_YEAR_START', label: 'วันเริ่มปีงบประมาณ (MM-DD)', type: 'text' },
            { key: 'LEAVE_CARRYOVER_LIMIT', label: 'ยกยอดข้ามปีได้สูงสุด (วัน)', type: 'number' },
        ]
    }
];

export default function SystemSettingsPage() {
    const { data: session } = useSession();
    const [settings, setSettings] = useState<SettingsData>({});
    const [editedSettings, setEditedSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/hr/settings');
            const data = await res.json();
            if (data.success) {
                setSettings(data.settings);
                // Initialize edited values
                const initial: Record<string, string> = {};
                for (const key in data.settings) {
                    initial[key] = data.settings[key].value;
                }
                setEditedSettings(initial);
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleChange = (key: string, value: string) => {
        setEditedSettings(prev => ({ ...prev, [key]: value }));
        // Check if there are changes
        const originalValue = settings[key]?.value || '';
        setHasChanges(true);
    };

    const handleSave = async () => {
        if (!confirm('ยืนยันการบันทึกการตั้งค่า?')) return;
        setSaving(true);
        try {
            const res = await fetch('/api/hr/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: editedSettings }),
            });
            const result = await res.json();
            if (result.success) {
                alert('บันทึกการตั้งค่าเรียบร้อย');
                setHasChanges(false);
                fetchSettings(); // Refresh
            } else {
                alert(result.error || 'เกิดข้อผิดพลาด');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
                        <Settings className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            ตั้งค่าระบบ
                        </h1>
                        <p className="text-gray-500">กำหนดโควต้าวันลา และกฏเกณฑ์ต่างๆ</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors shadow-sm"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    บันทึกการตั้งค่า
                </button>
            </div>

            {/* Warning */}
            {hasChanges && (
                <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    <p className="text-yellow-800 dark:text-yellow-200">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</p>
                </div>
            )}

            {/* Loading */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
                </div>
            ) : (
                <div className="grid gap-6">
                    {SETTING_GROUPS.map((group, idx) => (
                        <div key={idx} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                                <div className="text-purple-600">{group.icon}</div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{group.title}</h2>
                            </div>
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {group.settings.map((setting) => (
                                    <div key={setting.key}>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            {setting.label}
                                        </label>
                                        <input
                                            type={setting.type}
                                            value={editedSettings[setting.key] || ''}
                                            onChange={(e) => handleChange(setting.key, e.target.value)}
                                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
                                        />
                                        {settings[setting.key]?.description && (
                                            <p className="mt-1 text-xs text-gray-500">{settings[setting.key].description}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
