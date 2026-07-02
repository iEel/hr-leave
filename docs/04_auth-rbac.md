# Auth And RBAC

## Authentication Modes

The system supports multiple login paths:

- Local DB username/password
- AD/LDAP username/password
- Azure AD / Microsoft Entra integration
- WebAuthn/passkey where enabled

The login label should remain generic enough for both AD usernames and employee IDs:

- Label: `ชื่อผู้ใช้`
- Placeholder/help: `กรอกชื่อ AD หรือรหัสพนักงาน`

## Key Files

| File | Purpose |
| --- | --- |
| `src/auth.ts` | NextAuth configuration and credentials provider |
| `src/lib/ldap.ts` | LDAP bind/search helper |
| `src/lib/azure-graph.ts` | Azure AD Graph/Entra integration |
| `src/lib/auth/settings.ts` | Auth mode setting cache |
| `src/lib/auth/jit-user.ts` | Just-in-time AD user provisioning |
| `src/lib/auth/ad-user-sync.ts` | Shared AD sync/JIT identity conflict rules |
| `src/lib/auth/login-errors.ts` | User-facing login error mapping |
| `src/proxy.ts` | Route protection and coarse RBAC |

## Session And Roles

Primary roles:

- `EMPLOYEE`
- `MANAGER`
- `HR`
- `ADMIN`

`isHRStaff = true` can grant access to HR/Admin workflows where implemented.

## Route Protection

`src/proxy.ts` protects authenticated routes and role route groups.

Current coarse route mapping:

| Route Prefix | Allowed |
| --- | --- |
| `/hr` | `HR`, `ADMIN`, or `isHRStaff` |
| `/department` | `MANAGER`, `HR`, `ADMIN` |
| `/admin` | `ADMIN` |

API routes still need their own authorization checks. UI hiding is not authorization.

## AD Rehire Identity Rules

When an employee leaves and later returns with a new employee code, the returned employee must become a new `Users` row.

- The new AD `employeeID` becomes the new `Users.employeeId`.
- Leave history and leave balances stay attached to the old `Users.id`.
- If an inactive/`AD_DELETED` old user has the same email or AD username, sync releases those identity fields on the old row before inserting the new row.
- Active users with the same email or AD username are treated as blocking conflicts and are skipped.

This keeps leave quota calculations separate between the old employment period and the new employment period.

## Delegate Access

Delegate approvers can act for a manager in approval-related workflows.

Use shared helpers where available:

- `src/lib/delegate.ts`
- `src/lib/leave-access.ts`
- `src/lib/medical-file-access.ts`

## Medical Attachment Access

Medical certificate files are stored under `public/uploads/medical`, but direct legacy URLs under `/uploads/medical/...` are rewritten by `src/proxy.ts` to `/api/files/medical/...`.

Permission checks happen in:

- `src/app/api/files/medical/[filename]/route.ts`
- `src/lib/medical-file-access.ts`

Do not expose static medical file URLs directly in new code.

## Security Notes

- Keep `NEXTAUTH_SECRET` strong and environment-specific.
- Do not leak whether a protected leave ID exists to unauthorized users.
- Keep detailed permission decisions server-side.
- Audit security-sensitive changes where practical.
