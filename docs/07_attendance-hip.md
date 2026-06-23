# Attendance HIP CMiF68S

## Scope

The system integrates HIP CMiF68S attendance devices through a custom TCP protocol. This device does not use standard ZKTeco protocol, so `node-zklib` must not be used.

## Device Configuration

Configured under:

- UI: `/admin/attendance-devices`
- API: `/api/admin/attendance/devices`
- DB: `AttendanceDevices`

Default known device:

| Field | Value |
| --- | --- |
| IP | `192.168.108.201` |
| Port | `5005` |
| Pass | `0` |
| Protocol | `HIP_CMIF68S` |

## Frame Format

Request frame length is 16 bytes:

| Field | Format |
| --- | --- |
| magic | `55 aa` |
| version | `01` |
| cmd | 1 byte |
| field4 | uint32 little-endian |
| field8 | uint32 little-endian |
| length | uint16 little-endian |
| seq | uint16 little-endian |

Implemented in:

- `src/lib/attendance/hip-protocol.ts`
- `src/lib/attendance/hip-client.ts`

## Attendance Read Flow

### Incremental Count

- Command: `0xB4`
- `field4 = 6`
- `field8 = 0xFFFF0000`
- Response count is `newCount`.

### Small Incremental Read

When `newCount <= 50`:

- Command: `0xA1`
- Reads `newCount * 20` bytes.

### Large Incremental Fallback

When `newCount > 50`, use full-table fallback because large `A1` reads can timeout:

1. Open attendance table with `B4 field4=8`.
2. Compute total pages as `ceil(total_records * 20 / 1024)`.
3. Read pages with `0xA4`.
4. Concatenate page payloads first.
5. Decode every 20 bytes after concatenation.
6. Choose latest records matching `newCount`.

### Full Backfill

Backfill reads the entire table through `B4 field4=8` and `A4` page loop.

Backfill is for:

- First production setup
- Filling missing history
- Recovery after suspected sync issues

## Decode Rules

Attendance record length: 20 bytes.

| Bytes | Meaning |
| --- | --- |
| `0:4` | `user_key` little-endian |
| `7` | second |
| `8:12` | time bitfield little-endian |
| `12:16` | marker `00 00 00 01` |
| `16:20` | verify code big-endian |

Verify code:

- `0x10` = `FP`
- `0x40` = `FACE`
- `0x30` = `UNKNOWN_0x30`

Year calibration currently uses `decodedYear = yearCode + 1521`, with current-year cap when decoded year is ahead of server current year.

## No-Confirm Behavior

Current production behavior does not send `A2` confirm/clear commands after sync.

Reason:

- Avoid mutating device state during normal reads.
- Allow retry by reading again when a run fails.
- Rely on database dedupe to prevent duplicate rows.

Expected consequence:

- Device `newCount` may not decrease after sync.
- Repeated reads are expected.
- DB dedupe prevents duplicate `AttendanceLogs`.

## Locking

Sync/backfill must not overlap for the same device.

Lock fields:

- `AttendanceDevices.syncLockOwner`
- `AttendanceDevices.syncLockUntil`

Helpers:

- `tryAcquireDeviceSyncLock`
- `releaseDeviceSyncLock`

Any future device time-setting feature must reuse this lock so time setting cannot run during attendance log sync/backfill.

## Employee Mapping

Current mapping assumes:

```text
HIP user_key = Users.employeeId
```

Before production go-live, verify the HIP device user keys match HR employee IDs. If not, add a mapping table/UI before relying on employee attendance views.

## Production Notes

- Use server-side TCP only.
- Keep cron scheduler single-owner per environment.
- Use `CRON_SECRET` for scheduled sync route.
- Use backfill once during initial setup.
- Monitor `AttendanceSyncRuns` for failed runs.
- Keep `confirmedCount = 0` as expected unless a future decision changes no-confirm behavior.
