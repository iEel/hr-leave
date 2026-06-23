# Overview

## Product

HR Leave Management System is a leave, approval, attendance, and HR operations application for:

- Sonic Interfreight
- Grandlink Logistics
- Sonic Autologis

The system supports Thai HR workflows, Active Directory-backed login, manager approvals, leave balance tracking, year-end processing, and HIP CMiF68S attendance data.

## Primary Roles

| Role | Main Capabilities |
| --- | --- |
| Employee | Login, view dashboard, request leave, view leave history, cancel pending leave, view own attendance |
| Manager | Approve/reject leave, view team, view team calendar, use delegate approval flow |
| HR | Manage employees, leaves, holidays, settings, work schedule, year-end, analytics, reports |
| Admin | System settings, auth mode, rate limits, audit logs, AD lifecycle, attendance devices |
| HR Staff Flag | `isHRStaff = 1` can grant HR/Admin menu access even when role is not `HR` |

## Current Feature Map

- Username login using AD username or employee ID
- Local password login fallback
- AD/LDAP and Azure AD/Entra integration
- WebAuthn/passkey support
- Leave request and approval flow
- Delegate approver flow
- Bulk leave import
- Cross-year leave split and year-end balance processing
- Vacation eligibility based on probation completion and configurable years after probation
- Work schedule and working Saturday settings
- HIP CMiF68S attendance sync and employee attendance history
- Attendance status adjustment from approved leave
- HR reports and CSV export
- PWA support
- Audit logs and rate limiting

## Important Routes

| Area | Routes |
| --- | --- |
| Employee | `/dashboard`, `/leave/request`, `/leave/history`, `/attendance`, `/profile` |
| Manager | `/approvals`, `/manager/overview`, `/manager/team`, `/manager/calendar`, `/manager/delegates` |
| HR | `/hr/overview`, `/hr/employees`, `/hr/leaves`, `/hr/settings`, `/hr/work-schedule`, `/hr/year-end`, `/hr/reports` |
| Admin | `/admin/attendance-devices`, `/admin/auth-settings`, `/admin/rate-limit`, `/admin/audit-logs`, `/admin/user-lifecycle` |

## Canonical References

- Technical entry point: [`../DEVELOPER_HANDOFF.md`](../DEVELOPER_HANDOFF.md)
- Deployment runbook: [`../DEPLOYMENT.md`](../DEPLOYMENT.md)
- User guide: [`../USER_GUIDE.md`](../USER_GUIDE.md)
- Product principles: [`../PRODUCT.md`](../PRODUCT.md)
