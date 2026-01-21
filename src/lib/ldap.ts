import { Client } from 'ldapts';

export interface LdapUserEntry {
    sAMAccountName: string;
    mail?: string;
    displayName?: string;
    givenName?: string;
    sn?: string;
    employeeID?: string;
}

/**
 * Verify user credentials against LDAP/Active Directory
 * @param username - sAMAccountName (e.g., "veerapon.l")
 * @param password - User's AD password
 * @returns LDAP user entry or null if authentication failed
 */
export async function verifyLdapCredentials(
    username: string,
    password: string
): Promise<LdapUserEntry | null> {
    // 🛑 Security Fix: ป้องกัน Unauthenticated Bind Attack
    if (!password || password.trim() === '') {
        console.warn('[LDAP] Empty password rejected');
        return null;
    }

    if (!username || username.trim() === '') {
        console.warn('[LDAP] Empty username rejected');
        return null;
    }

    const ldapUrl = process.env.LDAP_URL;
    const ldapDomain = process.env.LDAP_DOMAIN;
    const ldapBaseDN = process.env.LDAP_BASE_DN;

    if (!ldapUrl || !ldapDomain || !ldapBaseDN) {
        console.error('[LDAP] Missing LDAP configuration');
        return null;
    }

    const client = new Client({ url: ldapUrl });

    try {
        // Bind with user credentials
        const userDN = `${username}@${ldapDomain}`;
        await client.bind(userDN, password);

        // Search for user info
        const { searchEntries } = await client.search(ldapBaseDN, {
            filter: `(sAMAccountName=${username})`,
            scope: 'sub',
            attributes: [
                'sAMAccountName',
                'mail',
                'displayName',
                'givenName',
                'sn',
                'employeeID'
            ]
        });

        await client.unbind();

        if (searchEntries.length === 0) {
            console.warn(`[LDAP] User ${username} not found in directory`);
            return null;
        }

        const entry = searchEntries[0];
        return {
            sAMAccountName: entry.sAMAccountName as string,
            mail: entry.mail as string | undefined,
            displayName: entry.displayName as string | undefined,
            givenName: entry.givenName as string | undefined,
            sn: entry.sn as string | undefined,
            employeeID: entry.employeeID as string | undefined,
        };
    } catch (error) {
        console.error('[LDAP] Authentication error:', error);
        return null;
    }
}

/**
 * Search for users in LDAP/AD
 * @param filter - Optional custom filter (default: objectClass=user)
 * @returns Array of LDAP user entries
 */
export async function searchLdapUsers(customFilter?: string): Promise<LdapUserEntry[]> {
    const ldapUrl = process.env.LDAP_URL;
    const ldapDomain = process.env.LDAP_DOMAIN;
    const ldapBaseDN = process.env.LDAP_BASE_DN;
    const bindDN = process.env.LDAP_BIND_DN; // Username/DN for binding
    const bindPassword = process.env.LDAP_BIND_PASSWORD;

    if (!ldapUrl || !ldapBaseDN) {
        console.error('[LDAP] Missing LDAP configuration');
        return [];
    }

    if (!bindDN || !bindPassword) {
        // Fallback: If no service account, we can't search anonymously in most ADs.
        // Returning empty array or throwing specific error might be better.
        console.warn('[LDAP] Missing Binding Credentials (LDAP_BIND_DN/PASSWORD). Cannot perform unlimited search.');
        return [];
    }

    const client = new Client({ url: ldapUrl });

    try {
        await client.bind(bindDN, bindPassword);

        // Standard AD filter for active users
        const defaultFilter = '(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))';
        const filter = customFilter || defaultFilter;

        const { searchEntries } = await client.search(ldapBaseDN, {
            filter: filter,
            scope: 'sub',
            attributes: [
                'sAMAccountName',
                'mail',
                'displayName',
                'givenName',
                'sn',
                'employeeID'
            ],
            paged: true, // Handle large directories
            sizeLimit: 1000 // Safety limit
        });

        await client.unbind();

        return searchEntries.map(entry => ({
            sAMAccountName: entry.sAMAccountName as string,
            mail: entry.mail as string | undefined,
            displayName: entry.displayName as string | undefined,
            givenName: entry.givenName as string | undefined,
            sn: entry.sn as string | undefined,
            employeeID: entry.employeeID as string | undefined,
        }));
    } catch (error) {
        console.error('[LDAP] Search error:', error);
        return [];
    }
}
