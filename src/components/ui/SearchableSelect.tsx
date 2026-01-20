'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X, User } from 'lucide-react';

interface Option {
    id: number | string;
    label: string;
    subLabel?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string | number | null;
    onChange: (value: string | number | null) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = 'เลือก...',
    disabled = false,
    className = ''
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Find selected option
    const selectedOption = options.find(opt => String(opt.id) === String(value));

    // Filter options based on search
    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase()) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(search.toLowerCase()))
    );

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus input when opening
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSelect = (option: Option) => {
        onChange(option.id);
        setIsOpen(false);
        setSearch('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(null);
        setSearch('');
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Selected value / Trigger */}
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 
                    bg-gray-50 dark:bg-gray-900 cursor-pointer flex items-center justify-between gap-2
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400'}
                    ${isOpen ? 'ring-2 ring-blue-500 border-transparent' : ''}
                    transition-all`}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    {selectedOption ? (
                        <span className="text-gray-900 dark:text-white truncate">
                            {selectedOption.label}
                        </span>
                    ) : (
                        <span className="text-gray-400">{placeholder}</span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {selectedOption && !disabled && (
                        <button
                            onClick={handleClear}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                        >
                            <X className="w-3 h-3 text-gray-400" />
                        </button>
                    )}
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden">
                    {/* Search input */}
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="ค้นหาชื่อ..."
                                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* Options list */}
                    <div className="max-h-60 overflow-y-auto">
                        {/* None option */}
                        <div
                            onClick={() => handleSelect({ id: '', label: '-- ไม่ระบุ --' })}
                            className="px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-500"
                        >
                            <span className="text-sm">-- ไม่ระบุ --</span>
                        </div>

                        {filteredOptions.length === 0 ? (
                            <div className="px-4 py-6 text-center text-gray-400 text-sm">
                                ไม่พบข้อมูล
                            </div>
                        ) : (
                            filteredOptions.map(option => (
                                <div
                                    key={option.id}
                                    onClick={() => handleSelect(option)}
                                    className={`px-4 py-2.5 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-3
                                        ${String(option.id) === String(value) ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                        {option.label.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                            {option.label}
                                        </p>
                                        {option.subLabel && (
                                            <p className="text-xs text-gray-500 truncate">
                                                {option.subLabel}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
