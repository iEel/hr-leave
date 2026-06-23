# Deployment

The detailed deployment and cron runbook remains in [`../DEPLOYMENT.md`](../DEPLOYMENT.md).

This file is the short deployment map for developers.

## Runtime

- Next.js app runs on port `3002`.
- Production usually sits behind Nginx or another reverse proxy.
- SQL Server must be reachable from the app host.
- HIP device TCP access must be reachable from the app host for attendance sync.

## Required Environment

Core variables:

```env
PORT=3002
DB_SERVER=<sql-host>
DB_PORT=1433
DB_NAME=HRLeave
DB_USER=<db-user>
DB_PASSWORD=<db-password>
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
NEXTAUTH_SECRET=<strong-secret>
NEXTAUTH_URL=<app-url>
TZ=Asia/Bangkok
CRON_SECRET=<cron-secret>
```

AD/Azure and SMTP variables are documented in [`../DEPLOYMENT.md`](../DEPLOYMENT.md).

## Database Setup

For a new environment:

1. Create database.
2. Run `database/schema.sql`.
3. Run required migrations under `database/migrations/`.
4. Verify admin user.
5. Verify `SystemSettings` defaults.

For an existing environment:

1. Back up production database.
2. Review new migration scripts.
3. Run migrations in order.
4. Verify app startup and critical workflows.

## Build

```powershell
npm install
npm run build
npm run start
```

The app start script uses port `3002`.

## Cron Jobs

Cron endpoints:

- `/api/cron/ad-sync`
- `/api/cron/attendance-sync`
- `/api/cron/audit-cleanup`

Use header:

```text
x-cron-secret: <CRON_SECRET>
```

Do not use default or placeholder cron secrets in production.

## Attendance Production Setup

1. Run attendance migration.
2. Configure device in `/admin/attendance-devices`.
3. Test connection.
4. Run initial backfill if needed.
5. Enable scheduled sync.
6. Verify employee mapping (`HIP user_key = Users.employeeId`).
7. Monitor `AttendanceSyncRuns`.

## Update Workflow

Follow [`../DEPLOYMENT.md`](../DEPLOYMENT.md) for the full production update runbook.

Minimum flow:

1. Check git status and current commit.
2. Pull or deploy intended commit.
3. Install dependencies only when package files changed.
4. Run migrations only when new migration scripts exist.
5. Build.
6. Restart app process.
7. Health check.
8. Verify cron schedule.
