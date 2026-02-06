import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { createEmployeeTour, createManagerTour } from '@/lib/tour/driver-config';

export function useTour() {
    const { data: session } = useSession();
    const [tourCompleted, setTourCompleted] = useState(true);

    useEffect(() => {
        if (!session?.user) return;

        const role = session.user.role;
        const storageKey = role === 'MANAGER' ? 'tour-manager-completed' : 'tour-employee-completed';
        const completed = localStorage.getItem(storageKey) === 'true';
        setTourCompleted(completed);

        // Auto-start tour for first-time users
        if (!completed) {
            const timer = setTimeout(() => {
                startTour();
            }, 1000); // Delay 1s เพื่อให้ page โหลดเสร็จก่อน

            return () => clearTimeout(timer);
        }
    }, [session]);

    const startTour = () => {
        const role = session?.user?.role;

        if (role === 'MANAGER' || role === 'HR' || role === 'ADMIN') {
            const tour = createManagerTour();
            tour.drive();
        } else {
            const tour = createEmployeeTour();
            tour.drive();
        }
    };

    const resetTour = () => {
        const role = session?.user?.role;
        const storageKey = role === 'MANAGER' ? 'tour-manager-completed' : 'tour-employee-completed';
        localStorage.removeItem(storageKey);
        setTourCompleted(false);
        startTour();
    };

    return {
        tourCompleted,
        startTour,
        resetTour,
    };
}
