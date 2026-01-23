'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const SOUND_ENABLED_KEY = 'notificationSoundEnabled';

export function useNotificationSound() {
    const [soundEnabled, setSoundEnabled] = useState(true);
    const audioContextRef = useRef<AudioContext | null>(null);

    // Load preference from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(SOUND_ENABLED_KEY);
        if (stored !== null) {
            setSoundEnabled(stored === 'true');
        }
    }, []);

    // Toggle sound and persist preference
    const toggleSound = useCallback(() => {
        setSoundEnabled((prev) => {
            const newValue = !prev;
            localStorage.setItem(SOUND_ENABLED_KEY, String(newValue));
            return newValue;
        });
    }, []);

    // Play notification sound using Web Audio API
    const playSound = useCallback(() => {
        if (!soundEnabled) return;

        try {
            // Create or reuse AudioContext
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
            }
            const audioContext = audioContextRef.current;

            // Resume if suspended (browser autoplay policy)
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }

            // Create a pleasant notification sound
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Two-tone notification sound (like a gentle chime)
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
            oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1); // C#6

            // Fade in and out
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.15);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.4);
        } catch (error) {
            console.error('Error playing notification sound:', error);
        }
    }, [soundEnabled]);

    return {
        soundEnabled,
        toggleSound,
        playSound,
    };
}
