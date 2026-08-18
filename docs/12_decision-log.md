# Decision Log

This file records decisions that should survive beyond an individual implementation plan.

## 2026-08-18: Personal Leave Reuses Protected Attachment Storage

Decision:

- Personal leave (`PERSONAL`) may include one optional PDF/JPG/PNG supporting document up to 5 MB.
- Sick leave retains medical-certificate wording and its configured required-document threshold.
- Reuse `LeaveRequests.hasMedicalCertificate`, `LeaveRequests.medicalCertificateFile`, `/api/upload/medical`, and `/api/files/medical/[filename]` for compatibility.
- Present generic or type-specific wording in the UI through `src/lib/leave-attachments.ts`.

Rationale:

- Existing storage, normalization, and authorization already protect employee leave files.
- Reuse avoids a production database migration for a single optional attachment.
- Keeping wording type-specific prevents personal-leave documents from being mislabeled as medical certificates.

## 2026-07-02: Rehire With New Employee Code Creates New User

Decision:

- When AD returns a new `employeeID` for a previously inactive employee, create a new `Users` row.
- Do not update the old employee row to the new employee code.
- Release email/AD username only from inactive or `AD_DELETED` conflicting users before inserting the new row.
- Skip the sync if the conflicting email/AD username belongs to an active user.

Rationale:

- `LeaveRequests` and `LeaveBalances` are linked by `Users.id`.
- Reusing the old row would mix old leave quota/history with the new employment period.
- Releasing only inactive identity conflicts preserves historical records while allowing AD to reuse the same username/email.

## 2026-06-23: Split Developer Handoff Into Numbered Docs

Decision:

- Keep `DEVELOPER_HANDOFF.md` as a short landing page.
- Move canonical technical content to numbered files under `docs/`.

Rationale:

- The original handoff had grown large and mixed overview, architecture, database, workflows, deployment, and changelog content.
- Numbered docs give new developers a stable reading order.
- Smaller files reduce merge conflicts and documentation drift.

## 2026-06-21: Leave Request Numbers Are Derived

Decision:

- Do not add a persisted `leaveRequestNo` column.
- Derive display number from `LeaveRequests.createdAt` year and `LeaveRequests.id`.

Rationale:

- Avoids a DB migration.
- Keeps IDs deterministic.
- Satisfies report/detail UI needs.

## 2026-06-21: Approved Leave Can Adjust Attendance Status

Decision:

- Attendance status has raw HIP/schedule status and final status after approved leave adjustment.
- Only `APPROVED` leave affects attendance.
- All leave types, including `OTHER`, can affect attendance when the time range covers the attendance window.

Rationale:

- The company uses multiple leave types to justify lateness or partial absence.
- Raw scan data remains auditable.

## 2026-06-18: HIP Sync Uses No-Confirm Mode

Decision:

- Do not send `A2` confirm after normal sync/backfill.
- Rely on DB dedupe for repeated reads.

Rationale:

- Reduces risk of mutating device state.
- Allows retry after application failure.
- Protects against accidental data loss from marking records read too early.

## 2026-06-18: HIP CMiF68S Uses Custom Protocol

Decision:

- Do not use `node-zklib`.
- Use custom TCP protocol implementation based on verified frames.

Rationale:

- Device does not speak standard ZKTeco protocol.
- Verified custom frames can handshake and read records.

## 2026-06-19: Attendance Period Starts On Configurable Day

Decision:

- Attendance period start day is stored in `ATTENDANCE_PERIOD_START_DAY`.
- Default is day 21, meaning 21 previous month through 20 selected month.

Rationale:

- Matches company calculation cycle.
- Keeps attendance reports aligned with payroll/HR review period.

## 2026-06-19: Working Saturdays Have No Late Grace

Decision:

- Normal workdays use `WORKDAY_LATE_GRACE_MINUTES`.
- Working Saturdays use their configured start time directly, with no grace.

Rationale:

- Matches company policy supplied during attendance UX design.

## 2026-06-02: Vacation Eligibility Uses Probation Completion

Decision:

- Vacation eligibility starts from actual probation completion plus `VACATION_AFTER_PROBATION_YEARS`.
- Probation extension is stored as number of extension days.

Rationale:

- Supports extended probation without hardcoding a 1-year rule.
- Keeps HR data entry simple.
