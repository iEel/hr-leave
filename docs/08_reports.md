# Reports

## HR Reports Page

Route:

- `/hr/reports`

The page has two major report tabs:

- `รายงานการลา`
- `เวลาเข้า-ออก`

## Leave Report

API:

- `/api/hr/reports/monthly`

Supports:

- Monthly leave summary
- Employee-level leave details
- CSV export

## Attendance Report

API:

- `/api/hr/reports/attendance`

Supports:

- Attendance rows by calculated period
- Status filters
- Summary metrics
- CSV export
- Clickable leave request references
- Protected leave detail modal

## Attendance Status Filters

| Filter | Meaning |
| --- | --- |
| `ALL` | All rows |
| `LATE` | Final status is late |
| `ADJUSTED_BY_LEAVE` | Late/incomplete adjusted by approved leave |
| `INCOMPLETE` | Final status is incomplete |
| `NO_HIP_DATA` | No HIP scans and no approved leave adjustment |

No-HIP rows must not be counted as incomplete rows.

## Attendance Report Period

Attendance report period uses `ATTENDANCE_PERIOD_START_DAY`.

Default:

```text
21 previous month through 20 selected month
```

## CSV Export

Attendance CSV export:

- Uses UTF-8 BOM for Thai compatibility.
- Served by `/api/hr/reports/attendance?format=csv`.
- Must use the same filtered row set as the UI.

## Leave Detail Links

Attendance rows can show leave request chips like:

```text
LR-2026-000123
```

Clicking a chip calls:

```text
/api/leave/detail/[leaveId]
```

The detail endpoint must enforce owner, HR/Admin/isHRStaff, direct manager, and active delegate permissions.

## UI Behavior

- Changing attendance status filter should refresh the attendance report automatically.
- Export should use the currently selected period/status filter.
- Loading states should avoid stale rows when a new request starts.
- Abort/request-id guards should prevent older responses from replacing newer data.
