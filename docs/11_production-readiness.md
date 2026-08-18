# Production Readiness

## Pre-Deployment Checklist

- Production database backup completed.
- Target commit identified.
- `.env` reviewed and production-safe.
- `NEXTAUTH_SECRET` strong and environment-specific.
- `CRON_SECRET` strong and not a default.
- SQL Server reachable from app host.
- AD/LDAP/Azure settings verified where enabled.
- SMTP settings verified where email approval is enabled.
- HIP device network reachability verified where attendance sync is enabled.

## Database Checklist

- Required migrations reviewed.
- Migrations tested on staging or copy of production.
- Rollback plan documented for each migration.
- Admin account verified.
- `SystemSettings` reviewed.
- Leave balances sampled after migration.

## Attendance Checklist

- `database/migrations/add_attendance_tables.sql` applied.
- Device configured under `/admin/attendance-devices`.
- Device connection test succeeds.
- Initial backfill plan approved.
- Cron frequency chosen to avoid unnecessary load.
- Only one scheduler per environment calls attendance sync.
- Employee ID mapping verified.
- `AttendanceSyncRuns` monitored after go-live.

## Security Checklist

- Protected routes tested by role.
- API authorization tested for sensitive resources.
- Medical and personal-leave attachments served through protected API.
- Legacy `/uploads/medical/...` rewrite verified.
- Cron endpoints require secret.
- Audit log retention configured.

## Build And Runtime Checklist

- `npm test` passes or known failures are documented.
- `npm run build` passes.
- App process starts on port `3002`.
- Reverse proxy routes to correct port.
- Health check endpoint/pages respond.
- Static assets and PWA files load.

## Rollback

Minimum rollback preparation:

- Previous commit recorded.
- Previous build artifact or deployment path available.
- Database backup available.
- Any irreversible migration risk documented.

If rollback requires DB restore, coordinate outage window first.

## Monitoring

Watch after deployment:

- App process health
- Nginx/reverse proxy errors
- SQL connection errors
- NextAuth login errors
- Cron endpoint failures
- `AttendanceSyncRuns` failures
- Audit cleanup status

## Go/No-Go

No-go if any of these are true:

- Unknown DB migration impact
- Production DB backup missing
- Login fails for Admin
- Core leave request flow fails
- HIP sync is enabled but device/network access is unverified
- Cron secret is missing/default
- Protected leave attachment files can be accessed without permission
