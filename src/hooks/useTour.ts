import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { createEmployeeTour, createManagerTour } from '@/lib/tour/driver-config';

// Mobile detection
const isMobile = () => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || window.innerWidth < 768;
};

export function useTour() {
    const { data: session } = useSession();
    const [tourCompleted, setTourCompleted] = useState(true);
    const hasStartedRef = useRef(false);

    const role = session?.user?.role;

    const startTour = useCallback(() => {
        if (role === 'MANAGER' || role === 'HR' || role === 'ADMIN') {
            const tour = createManagerTour();
            tour.drive();
        } else {
            const tour = createEmployeeTour();
            tour.drive();
        }
    }, [role]);

    useEffect(() => {
        if (!role) return;

        const storageKey = role === 'MANAGER' ? 'tour-manager-completed' : 'tour-employee-completed';

        // Skip tour on mobile devices
        if (isMobile()) {
            localStorage.setItem(storageKey, 'true');
            setTourCompleted(true);
            return;
        }

        const completed = localStorage.getItem(storageKey) === 'true';
        setTourCompleted(completed);

        // Auto-start tour for first-time users (only once)
        if (!completed && !hasStartedRef.current) {
            hasStartedRef.current = true;
            const timer = setTimeout(() => {
                startTour();
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [role, startTour]);

    const resetTour = () => {
        const storageKey = role === 'MANAGER' ? 'tour-manager-completed' : 'tour-employee-completed';
        if (storageKey) {
            localStorage.removeItem(storageKey);
        }
        hasStartedRef.current = false;
        setTourCompleted(false);
        startTour();
    };

    return {
        tourCompleted,
        startTour,
        resetTour,
    };
}
