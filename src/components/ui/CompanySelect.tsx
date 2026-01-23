'use client';

import { useState, useEffect } from 'react';
import { Building2, ChevronDown, Loader2 } from 'lucide-react';

interface Company {
    id: number;
    code: string;
    name: string;
    shortName: string | null;
    color: string;
    isActive: boolean;
}

interface CompanySelectProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    showCode?: boolean; // แสดง code แทน name
}

export default function CompanySelect({
    value,
    onChange,
    placeholder = 'เลือกบริษัท',
    disabled = false,
    className = '',
    showCode = true
}: CompanySelectProps) {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCompanies();
    }, []);

    const fetchCompanies = async () => {
        try {
            const res = await fetch('/api/hr/companies');
            const data = await res.json();
            if (data.success) {
                setCompanies(data.data);
            }
        } catch (error) {
            console.error('Error fetching companies:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className={`w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 flex items-center gap-2 ${className}`}>
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                <span className="text-gray-400">กำลังโหลด...</span>
            </div>
        );
    }

    return (
        <div className={`relative ${className}`}>
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={`w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 
                    bg-gray-50 dark:bg-gray-900 appearance-none cursor-pointer
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <option value="">{placeholder}</option>
                {companies.map((company) => (
                    <option key={company.id} value={company.code}>
                        {showCode ? (
                            `${getCompanyIcon(company.color)} ${company.code}`
                        ) : (
                            company.name
                        )}
                    </option>
                ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
    );
}

// Helper function to get emoji based on color
function getCompanyIcon(color: string): string {
    const colorIcons: Record<string, string> = {
        '#3B82F6': '🟦', // Blue
        '#22C55E': '🟩', // Green
        '#EF4444': '🟥', // Red
        '#F59E0B': '🟨', // Yellow
        '#8B5CF6': '🟪', // Purple
        '#EC4899': '🌸', // Pink
        '#14B8A6': '🔷', // Teal
        '#F97316': '🟧', // Orange
    };
    return colorIcons[color] || '🏢';
}

// Export a hook for fetching companies
export function useCompanies() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/hr/companies')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setCompanies(data.data);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const getCompanyName = (code: string): string => {
        const company = companies.find(c => c.code === code);
        return company?.name || code;
    };

    const getCompanyShortName = (code: string): string => {
        const company = companies.find(c => c.code === code);
        return company?.shortName || company?.name || code;
    };

    return { companies, loading, getCompanyName, getCompanyShortName };
}
