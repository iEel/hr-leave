import { getPool } from '@/lib/db';

/**
 * Rate Limiter Settings Interface
 */
export interface RateLimitSettings {
    enabled: boolean;
    loginMaxAttempts: number;
    loginWindowSeconds: number;
    apiMaxRequests: number;
    apiWindowSeconds: number;
}

/**
 * Rate Limit Entry for tracking requests
 */
interface RateLimitEntry {
    count: number;
    resetTime: number;
}

/**
 * In-Memory Rate Limit Store
 * Key format: "type:identifier" (e.g., "login:192.168.1.1" or "api:user123")
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

// Default settings (used if DB fetch fails)
const DEFAULT_SETTINGS: RateLimitSettings = {
    enabled: true,
    loginMaxAttempts: 5,
    loginWindowSeconds: 300, // 5 minutes
    apiMaxRequests: 100,
    apiWindowSeconds: 60, // 1 minute
};

// Cache settings to avoid frequent DB calls
let settingsCache: RateLimitSettings | null = null;
let settingsCacheTime: number = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Get Rate Limit Settings from Database
 */
export async function getRateLimitSettings(): Promise<RateLimitSettings> {
    // Return cached settings if still valid
    if (settingsCache && Date.now() - settingsCacheTime < CACHE_TTL) {
        return settingsCache;
    }

    try {
        const pool = await getPool();
        const result = await pool.request()
            .query(`SELECT [settingKey] as [key], [settingValue] as [value] FROM SystemSettings WHERE [settingKey] LIKE 'RATE_LIMIT_%'`);

        const settings: Record<string, string> = {};
        result.recordset.forEach((row: { key: string; value: string }) => {
            settings[row.key] = row.value;
        });

        settingsCache = {
            enabled: settings['RATE_LIMIT_ENABLED'] !== 'false',
            loginMaxAttempts: parseInt(settings['RATE_LIMIT_LOGIN_MAX'] || '5'),
            loginWindowSeconds: parseInt(settings['RATE_LIMIT_LOGIN_WINDOW'] || '300'),
            apiMaxRequests: parseInt(settings['RATE_LIMIT_API_MAX'] || '100'),
            apiWindowSeconds: parseInt(settings['RATE_LIMIT_API_WINDOW'] || '60'),
        };
        settingsCacheTime = Date.now();

        return settingsCache;
    } catch (error) {
        console.error('[RateLimiter] Error fetching settings:', error);
        return DEFAULT_SETTINGS;
    }
}

/**
 * Update Rate Limit Settings in Database
 */
export async function updateRateLimitSettings(settings: Partial<RateLimitSettings>): Promise<void> {
    const pool = await getPool();

    const keyMap: Record<keyof RateLimitSettings, string> = {
        enabled: 'RATE_LIMIT_ENABLED',
        loginMaxAttempts: 'RATE_LIMIT_LOGIN_MAX',
        loginWindowSeconds: 'RATE_LIMIT_LOGIN_WINDOW',
        apiMaxRequests: 'RATE_LIMIT_API_MAX',
        apiWindowSeconds: 'RATE_LIMIT_API_WINDOW',
    };

    for (const [key, value] of Object.entries(settings)) {
        const dbKey = keyMap[key as keyof RateLimitSettings];
        if (dbKey) {
            const dbValue = String(value);
            await pool.request()
                .input('key', dbKey)
                .input('value', dbValue)
                .query(`
                    IF EXISTS (SELECT 1 FROM SystemSettings WHERE [settingKey] = @key)
                        UPDATE SystemSettings SET [settingValue] = @value, updatedAt = GETDATE() WHERE [settingKey] = @key
                    ELSE
                        INSERT INTO SystemSettings ([settingKey], [settingValue]) VALUES (@key, @value)
                `);
        }
    }

    // Invalidate cache
    settingsCache = null;
}

/**
 * Check Rate Limit Result
 */
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number; // seconds until reset
}

/**
 * Check if request is within rate limit
 * @param type - 'login' or 'api'
 * @param identifier - IP address or User ID
 */
export async function checkRateLimit(
    type: 'login' | 'api',
    identifier: string
): Promise<RateLimitResult> {
    const settings = await getRateLimitSettings();

    // If rate limiting is disabled, always allow
    if (!settings.enabled) {
        return { allowed: true, remaining: 999, resetIn: 0 };
    }

    const maxAttempts = type === 'login' ? settings.loginMaxAttempts : settings.apiMaxRequests;
    const windowMs = (type === 'login' ? settings.loginWindowSeconds : settings.apiWindowSeconds) * 1000;

    const key = `${type}:${identifier}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Clean up expired entry
    if (entry && now > entry.resetTime) {
        rateLimitStore.delete(key);
        entry = undefined;
    }

    if (!entry) {
        // First request, create new entry
        entry = {
            count: 1,
            resetTime: now + windowMs,
        };
        rateLimitStore.set(key, entry);

        return {
            allowed: true,
            remaining: maxAttempts - 1,
            resetIn: Math.ceil(windowMs / 1000),
        };
    }

    // Increment count
    entry.count++;
    rateLimitStore.set(key, entry);

    const remaining = Math.max(0, maxAttempts - entry.count);
    const resetIn = Math.ceil((entry.resetTime - now) / 1000);

    if (entry.count > maxAttempts) {
        return {
            allowed: false,
            remaining: 0,
            resetIn,
        };
    }

    return {
        allowed: true,
        remaining,
        resetIn,
    };
}

/**
 * Reset rate limit for a specific identifier
 */
export function resetRateLimit(type: 'login' | 'api', identifier: string): void {
    const key = `${type}:${identifier}`;
    rateLimitStore.delete(key);
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Clean up expired entries (call periodically)
 */
export function cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}

// Clean up every 5 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
}
