# Architecture

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Microsoft SQL Server |
| DB Driver | `mssql` without ORM |
| Auth | NextAuth.js v5 beta |
| Password Hash | `bcryptjs` |
| Charts | Recharts |
| Excel | `xlsx` |
| Icons | Lucide React |

## Application Shape

```text
src/
  app/
    (dashboard)/       authenticated pages
    api/               server-side API routes
    action/            magic-link action landing pages
    login/             login UI
  components/
    layout/            sidebar/topbar shell
    ui/                shared UI components
  hooks/               client hooks
  lib/                 server/domain helpers
  types/               shared TypeScript types
  auth.ts              NextAuth config
  proxy.ts             route protection and RBAC
```

## Server/Client Boundary

- API routes in `src/app/api/**/route.ts` own database access and sensitive operations.
- Client pages call API routes with `fetch`; they should not embed DB or TCP logic.
- HIP TCP access happens server-side only through `src/lib/attendance/hip-client.ts`.
- Protected file access for medical attachments uses API routes, not direct static file paths.

## Important Libraries

| Module | Responsibility |
| --- | --- |
| `src/lib/db.ts` | SQL Server connection singleton |
| `src/auth.ts` | NextAuth providers and credential login |
| `src/proxy.ts` | Auth redirect, role route guard, protected medical upload rewrite |
| `src/lib/attendance/*` | HIP protocol, TCP client, repository, sync service, attendance calculations |
| `src/lib/leave-utils.ts` | Leave duration and display helpers |
| `src/lib/leave-access.ts` | Leave detail permission helper |
| `src/lib/medical-file-access.ts` | Medical certificate permission helper |
| `src/lib/delegate.ts` | Delegate approver lookup |
| `src/lib/audit.ts` | Audit logging helper |
| `src/lib/auth/*` | Auth settings, JIT user provisioning, login error mapping |

## Routing And Layout

- Authenticated screens live under `src/app/(dashboard)/`.
- Role-specific routes are grouped by `/manager`, `/hr`, and `/admin`.
- `src/components/layout/sidebar.tsx` owns visible navigation.
- `src/proxy.ts` enforces coarse route RBAC; API routes enforce detailed authorization.

## Design Constraints

- Keep HIP read/write operations inside server-side code.
- Keep attendance raw logs immutable; derive display/report status server-side.
- Keep file permissions in protected APIs, not client-only UI hiding.
- Avoid adding DB migrations unless persistent state is genuinely needed.
- Prefer pure helpers for business rules so they can be tested without database access.
