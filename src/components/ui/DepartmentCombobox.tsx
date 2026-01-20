'use client';

import { useState, useRef, useEffect } from 'react';
import { Briefcase, ChevronDown } from 'lucide-react';

interface DepartmentComboboxProps {
    suggestions: string[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    className?: string;
}

export default function DepartmentCombobox({
    suggestions,
    value,
    onChange,
    placeholder = 'เลือกหรือพิมพ์แผนก',
    required = false,
    className = ''
}: DepartmentComboboxProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync input value with prop
    useEffect(() => {
        setInputValue(value);
    }, [value]);

    // Filter suggestions based on input
    const filteredSuggestions = suggestions.filter(s =>
        s.toLowerCase().includes(inputValue.toLowerCase())
    );

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        onChange(val);
        if (!isOpen) setIsOpen(true);
    };

    const handleSelect = (suggestion: string) => {
        setInputValue(suggestion);
        onChange(suggestion);
        setIsOpen(false);
    };

    const handleFocus = () => {
        setIsOpen(true);
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    placeholder={placeholder}
                    required={required}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 
                        bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all
                        text-gray-900 dark:text-white"
                />
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                >
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Suggestions dropdown */}
            {isOpen && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                        {filteredSuggestions.map((suggestion, idx) => (
                            <div
                                key={idx}
                                onClick={() => handleSelect(suggestion)}
                                className={`px-4 py-2.5 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-2
                                    ${suggestion === value ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                            >
                                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                    {suggestion.charAt(0)}
                                </div>
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {suggestion}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Show hint when no match but typing */}
            {isOpen && inputValue && filteredSuggestions.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg p-3">
                    <p className="text-sm text-gray-500">
                        กด Enter เพื่อใช้ "<span className="font-medium text-blue-600">{inputValue}</span>"
                    </p>
                </div>
            )}
        </div>
    );
}
