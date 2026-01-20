import { cn } from '@/lib/utils';

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700",
                className
            )}
        />
    );
}

// Common skeleton patterns
export function CardSkeleton() {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-8 w-20 mb-2" />
            <Skeleton className="h-3 w-16" />
        </div>
    );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
    return (
        <tr>
            {Array.from({ length: cols }).map((_, i) => (
                <td key={i} className="py-4 px-4">
                    <Skeleton className="h-4 w-full max-w-[120px]" />
                </td>
            ))}
        </tr>
    );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                        {Array.from({ length: cols }).map((_, i) => (
                            <th key={i} className="py-3 px-4 text-left">
                                <Skeleton className="h-4 w-20" />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {Array.from({ length: rows }).map((_, i) => (
                        <TableRowSkeleton key={i} cols={cols} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function DashboardSkeleton() {
    return (
        <div className="animate-fade-in space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div>
                    <Skeleton className="h-6 w-48 mb-2" />
                    <Skeleton className="h-4 w-32" />
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                    <Skeleton className="h-5 w-32 mb-4" />
                    <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                                <Skeleton className="w-10 h-10 rounded-full" />
                                <div className="flex-1">
                                    <Skeleton className="h-4 w-32 mb-1" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                    <Skeleton className="h-5 w-32 mb-4" />
                    <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-6 w-16" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ProfileSkeleton() {
    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-6 mb-8">
                    <Skeleton className="w-20 h-20 rounded-2xl" />
                    <div>
                        <Skeleton className="h-6 w-48 mb-2" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i}>
                            <Skeleton className="h-3 w-16 mb-2" />
                            <Skeleton className="h-5 w-32" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: items }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                    <Skeleton className="w-12 h-12 rounded-xl" />
                    <div className="flex-1">
                        <Skeleton className="h-4 w-40 mb-2" />
                        <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
            ))}
        </div>
    );
}

export function CalendarSkeleton() {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="py-3 flex justify-center">
                        <Skeleton className="h-4 w-6" />
                    </div>
                ))}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7">
                {Array.from({ length: 35 }).map((_, i) => (
                    <div key={i} className="min-h-[100px] p-2 border-b border-r border-gray-100 dark:border-gray-700">
                        <Skeleton className="w-7 h-7 rounded-full mb-2" />
                        <Skeleton className="h-4 w-full mb-1" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                ))}
            </div>
        </div>
    );
}
