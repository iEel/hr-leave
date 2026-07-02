export type AdUserIdentity = {
    employeeId: string;
    email: string;
    adUsername: string;
};

export type ExistingAdUser = {
    id: number;
    employeeId: string;
    email: string | null;
    adUsername: string | null;
    isActive: boolean | number;
    adStatus: string | null;
};

export type AdUserSyncDecision = {
    action: 'insert' | 'update' | 'blocked';
    user?: ExistingAdUser;
    conflictsToRelease: ExistingAdUser[];
    blockedConflicts: ExistingAdUser[];
};

function normalize(value: string | null | undefined): string {
    return String(value || '').trim().toUpperCase();
}

function normalizeEmail(value: string | null | undefined): string {
    return String(value || '').trim().toLowerCase();
}

function isActiveUser(user: ExistingAdUser): boolean {
    return user.isActive === true || user.isActive === 1;
}

function hasSameEmployeeId(incoming: AdUserIdentity, user: ExistingAdUser): boolean {
    return normalize(incoming.employeeId) === normalize(user.employeeId);
}

function hasIdentityConflict(incoming: AdUserIdentity, user: ExistingAdUser): boolean {
    const sameEmail = normalizeEmail(incoming.email) !== ''
        && normalizeEmail(incoming.email) === normalizeEmail(user.email);
    const sameAdUsername = normalize(incoming.adUsername) !== ''
        && normalize(incoming.adUsername) === normalize(user.adUsername);

    return !hasSameEmployeeId(incoming, user) && (sameEmail || sameAdUsername);
}

function canReleaseIdentityForRehire(incoming: AdUserIdentity, user: ExistingAdUser): boolean {
    return hasIdentityConflict(incoming, user) && !isActiveUser(user);
}

export function buildArchivedEmail(user: ExistingAdUser): string {
    const employeeId = normalize(user.employeeId).replace(/[^A-Z0-9_-]/g, '') || 'UNKNOWN';
    return `archived-${employeeId}-${user.id}@local.invalid`.toLowerCase();
}

export function buildArchivedAdUsername(user: ExistingAdUser): string | null {
    if (!user.adUsername) {
        return null;
    }

    const employeeId = normalize(user.employeeId).replace(/[^A-Z0-9_-]/g, '') || 'UNKNOWN';
    const base = String(user.adUsername).trim();
    return `${base}#archived#${employeeId}#${user.id}`.slice(0, 100);
}

export function decideAdUserSyncAction(
    incoming: AdUserIdentity,
    existingUsers: ExistingAdUser[]
): AdUserSyncDecision {
    const exactUser = existingUsers.find((user) => hasSameEmployeeId(incoming, user));
    const identityConflicts = existingUsers.filter((user) => hasIdentityConflict(incoming, user));
    const conflictsToRelease = identityConflicts.filter((user) => canReleaseIdentityForRehire(incoming, user));
    const blockedConflicts = identityConflicts.filter((user) => !canReleaseIdentityForRehire(incoming, user));

    if (blockedConflicts.length > 0) {
        return {
            action: 'blocked',
            user: exactUser,
            conflictsToRelease,
            blockedConflicts,
        };
    }

    return {
        action: exactUser ? 'update' : 'insert',
        user: exactUser,
        conflictsToRelease,
        blockedConflicts,
    };
}

export async function findExistingAdUsersForSync(identity: AdUserIdentity): Promise<ExistingAdUser[]> {
    const { query } = await import('@/lib/db');

    return query<ExistingAdUser>(
        `
            SELECT id, employeeId, email, adUsername, isActive, adStatus
            FROM Users
            WHERE employeeId = @employeeId
               OR email = @email
               OR (@adUsername <> '' AND adUsername = @adUsername)
        `,
        {
            employeeId: identity.employeeId,
            email: identity.email,
            adUsername: identity.adUsername,
        }
    );
}

export async function releaseInactiveAdIdentityConflicts(conflicts: ExistingAdUser[]): Promise<number> {
    const { execute } = await import('@/lib/db');
    let releasedCount = 0;

    for (const conflict of conflicts) {
        releasedCount += await execute(
            `
                UPDATE Users
                SET email = @archivedEmail,
                    adUsername = @archivedAdUsername,
                    updatedAt = GETDATE()
                WHERE id = @id
                  AND isActive = 0
            `,
            {
                id: conflict.id,
                archivedEmail: buildArchivedEmail(conflict),
                archivedAdUsername: buildArchivedAdUsername(conflict),
            }
        );
    }

    return releasedCount;
}
