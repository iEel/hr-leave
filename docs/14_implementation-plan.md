# Implementation Plan

This file summarizes planning sources and roadmap direction. Detailed feature plans live under `docs/superpowers/plans/`.

## Existing Planning Sources

| File | Purpose |
| --- | --- |
| [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) | Legacy high-level roadmap |
| [`superpowers/plans/2026-06-02-vacation-probation-eligibility.md`](superpowers/plans/2026-06-02-vacation-probation-eligibility.md) | Vacation eligibility implementation |
| [`superpowers/plans/2026-06-18-hip-attendance-incremental.md`](superpowers/plans/2026-06-18-hip-attendance-incremental.md) | HIP attendance sync implementation |
| [`superpowers/plans/2026-06-19-attendance-employee-ux-settings.md`](superpowers/plans/2026-06-19-attendance-employee-ux-settings.md) | Employee attendance UX/settings implementation |
| [`superpowers/plans/2026-06-21-attendance-leave-adjustment-hr-report.md`](superpowers/plans/2026-06-21-attendance-leave-adjustment-hr-report.md) | Attendance leave adjustment and HR report implementation |

## Planning Rule

For new medium/large work:

1. Capture requirements and design in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
2. Capture implementation tasks in `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`.
3. Add lasting decisions to [Decision Log](12_decision-log.md).
4. Add release-level changes to [Changelog](13_changelog.md).
5. Update the relevant domain doc, not only `DEVELOPER_HANDOFF.md`.

## Current Roadmap Themes

### Attendance

- HIP device time read/set through custom protocol.
- Optional mapping table if HIP `user_key` differs from `Users.employeeId`.
- Runtime monitoring for repeated sync failures.
- Production UAT for backfill and cron behavior.

### Leave And HR

- Continue hardening cross-year and year-end workflows.
- Expand UAT coverage for leave edge cases.
- Keep leave adjustment rules synchronized between employee and HR report views.

### Documentation

- Keep the numbered docs current.
- Avoid appending all new feature notes to `DEVELOPER_HANDOFF.md`.
- Keep deployment commands centralized in `DEPLOYMENT.md` unless the deployment doc is formally migrated.

## Completed Major Phases

- Core app setup
- Authentication and AD integration
- Leave request and approval
- HR/Admin operations
- Delegate approver
- Bulk leave import
- Cross-year leave
- Vacation probation eligibility
- HIP attendance sync
- Attendance UX and reports
