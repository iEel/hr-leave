import { getPool } from '@/lib/db';

/**
 * Unified user profile interface for JIT provisioning
 * Works with both LDAP and Azure AD
 */
export interface UserProfile {
    username: string;      // sAMAccountName or email prefix
    email: string;
    firstName: string;
    lastName: string;
    authProvider: 'LDAP' | 'AZURE';
    employeeId?: string;   // Optional: from AD employeeID attribute
}

/**
 * Find existing user by AD username or email, or create a new one (JIT Provisioning)
 */
export async function findOrCreateUser(profile: UserProfile) {
    const pool = await getPool();

    // 1. Try to find existing user by adUsername or email
    const existingUser = await pool.request()
        .input('adUsername', profile.username)
        .input('email', profile.email)
        .query(`
            SELECT * FROM Users 
            WHERE adUsername = @adUsername OR email = @email
        `);

    if (existingUser.recordset.length > 0) {
        const user = existingUser.recordset[0];
        console.log(`[JIT] Found existing user: ${user.employeeId}`);
        return user;
    }

    // 2. Create new user (JIT Provisioning)
    console.log(`[JIT] Creating new user: ${profile.username}`);

    // Use employeeId from AD if available, otherwise use username
    const employeeId = profile.employeeId || profile.username;

    // Generate a placeholder password (user won't use this since they're AD user)
    const placeholderPassword = 'EXTERNAL_AUTH_' + Date.now();

    await pool.request()
        .input('employeeId', employeeId)
        .input('email', profile.email)
        .input('password', placeholderPassword)
        .input('firstName', profile.firstName)
        .input('lastName', profile.lastName)
        .input('isADUser', true)
        .input('adUsername', profile.username)
        .input('authProvider', profile.authProvider)
        .query(`
            INSERT INTO Users (
                employeeId, email, password, firstName, lastName, 
                role, company, department, gender, startDate,
                isADUser, adUsername, authProvider
            ) VALUES (
                @employeeId, @email, @password, @firstName, @lastName,
                'USER', 'UNASSIGNED', 'UNASSIGNED', 'M', GETDATE(),
                @isADUser, @adUsername, @authProvider
            )
        `);

    // 3. Fetch the newly created user
    const newUser = await pool.request()
        .input('adUsername', profile.username)
        .query(`SELECT * FROM Users WHERE adUsername = @adUsername`);

    return newUser.recordset[0];
}

/**
 * Get user by AD username
 */
export async function getUserByADUsername(username: string) {
    const pool = await getPool();
    const result = await pool.request()
        .input('adUsername', username)
        .query(`SELECT * FROM Users WHERE adUsername = @adUsername`);

    return result.recordset[0] || null;
}
