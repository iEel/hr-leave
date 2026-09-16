# Reliable leave email delivery implementation plan

> Execute in this session using subagent-driven-development for the independent transport and review work. The user approved the design, production deployment, and resending leave 3239 in the conversation.

**Goal:** Prevent IPv6 SMTP failures, persist request emails with the leave transaction, retry safe transient failures, and trace every delivery by leave ID.

**Architecture:** SQL Server outbox plus attempt history; a secret-protected cron worker claims jobs atomically. Resolve A records at connection time while retaining the SMTP hostname for TLS validation. SMTP acceptance is distinct from inbox delivery. Ambiguous DATA failures or abandoned in-flight jobs require manual review instead of automatic duplicate sends.

**Tech stack:** Existing Next.js, mssql, Nodemailer, Node DNS; no new dependencies.

**Spec:** Approved four-step design in this conversation; this document records implementation decisions.

## Constraints and decisions

- Keep production package-lock and data uploads untouched; stage/build a release before restart, retain rollback build.
- Existing pending leaves are not bulk replayed. Only 3239 is explicitly authorized for recovery.
- New request emails and their recipients are persisted in the leave transaction, including delegates. Notification bells remain separate.
- Result emails also use durable delivery when their existing call sites invoke the email helper.
- Stable Message-ID per job, unique dedupe key per event/recipient, row claims prevent concurrent sending.
- Five attempts total; delays 1, 5, 15, 60 minutes for safe transient failures. Terminal failures alert active admins in the application.
- Skip request mail when leave no longer pending or approver no longer authorized. Expire queued links after six days.
- Retain delivery metadata; clear HTML on terminal status to remove embedded approval tokens.

## Task 1: SMTP transport
- [ ] Add failing behavior tests for IPv4 selection, TLS server name, and DNS failures.
- [ ] Implement `sendSmtpEmail(message, attempt)` and `verifySmtpConnection()` in `src/lib/email-transport.ts`.
- [ ] Run transport tests and review implementation.

## Task 2: Durable delivery and integration
- [ ] Add failing policy/worker tests for acceptance, retry, permanent failure, uncertain outcome, stale recipient, and invalid address.
- [ ] Add idempotent `database/migrations/add_email_outbox.sql`, repository, delivery policy, worker, and authenticated cron route.
- [ ] Update email template helpers to enqueue; enqueue request recipients inside the existing SQL transaction.
- [ ] Add recovery CLI with dry-run default, explicit leave ID and stable recovery key; it must reject non-pending leaves.
- [ ] Verify SQL rollback, dedupe and concurrent claims in a transaction without sending mail.

## Task 3: Verify and deploy
- [ ] Run focused tests, existing test suite, targeted lint, and production build.
- [ ] Independently review full change and resolve actionable findings.
- [ ] Back up production files/build; apply additive migration, deploy built release, restart only hr-leave.
- [ ] Install once-per-minute worker schedule with credentials read from environment files, never in cron arguments.
- [ ] Verify SMTP authentication/STARTTLS without sending; check app health and cron authorization.
- [ ] Recheck pending leave 3239, enqueue one authorized recovery email, verify SMTP acceptance and persisted attempt.
- [ ] Document evidence, rollback path, and distinction between SMTP acceptance and inbox delivery.
