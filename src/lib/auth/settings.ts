import { getPool } from '@/lib/db';

export type AuthMode = 'LOCAL' | 'LDAP' | 'AZURE' | 'HYBRID';

export interface AuthSettings {
    authMode: AuthMode;
    ldapUrl: string;
    ldapDomain: string;
    ldapBaseDN: string;
    ldapBindDN: string;
    azureAdEnabled: boolean;
    azureAdTenantId: string;
    azureAdClientId: string;
}

/**
 * Get authentication settings from database
 */
export async function getAuthSettings(): Promise<AuthSettings> {
    const pool = await getPool();

    const result = await pool.request()
        .query(`SELECT [settingKey] as [key], [settingValue] as [value] FROM SystemSettings`);

    const settings: Record<string, string> = {};
    result.recordset.forEach((row: { key: string; value: string }) => {
        settings[row.key] = row.value;
    });

    return {
        authMode: (settings['AUTH_MODE'] || 'LOCAL') as AuthMode,
        ldapUrl: settings['LDAP_URL'] || '',
        ldapDomain: settings['LDAP_DOMAIN'] || '',
        ldapBaseDN: settings['LDAP_BASE_DN'] || '',
        ldapBindDN: settings['LDAP_BIND_DN'] || '',
        azureAdEnabled: settings['AZURE_AD_ENABLED'] === 'true',
        azureAdTenantId: settings['AZURE_AD_TENANT_ID'] || '',
        azureAdClientId: settings['AZURE_AD_CLIENT_ID'] || '',
    };
}

/**
 * Update authentication settings in database
 */
export async function updateAuthSettings(settings: Partial<AuthSettings>): Promise<void> {
    const pool = await getPool();

    const keyMap: Record<keyof AuthSettings, string> = {
        authMode: 'AUTH_MODE',
        ldapUrl: 'LDAP_URL',
        ldapDomain: 'LDAP_DOMAIN',
        ldapBaseDN: 'LDAP_BASE_DN',
        ldapBindDN: 'LDAP_BIND_DN',
        azureAdEnabled: 'AZURE_AD_ENABLED',
        azureAdTenantId: 'AZURE_AD_TENANT_ID',
        azureAdClientId: 'AZURE_AD_CLIENT_ID',
    };

    for (const [key, value] of Object.entries(settings)) {
        const dbKey = keyMap[key as keyof AuthSettings];
        if (dbKey) {
            const dbValue = typeof value === 'boolean' ? value.toString() : value;
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
}

/**
 * Get current auth mode (quick helper)
 */
export async function getCurrentAuthMode(): Promise<AuthMode> {
    const settings = await getAuthSettings();
    return settings.authMode;
}
