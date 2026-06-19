# HR Leave Management System - Developer Handoff Documentation

> 📅 เอกสารนี้สร้างเมื่อ: 21 มกราคม 2026  
> 📅 อัปเดตล่าสุด: 18 มิถุนายน 2026 (HIP CMiF68S Attendance Sync + Admin Time Display Fix)
> 📁 Project Path: `d:\Antigravity\hr-leave`

---

## 📋 สารบัญ

1. [ภาพรวมโปรเจกต์](#1-ภาพรวมโปรเจกต์)
2. [Technology Stack](#2-technology-stack)
3. [โครงสร้างโปรเจกต์](#3-โครงสร้างโปรเจกต์)
4. [วิธีการติดตั้ง](#4-วิธีการติดตั้ง)
5. [Database Schema](#5-database-schema)
6. [Authentication Flow](#6-authentication-flow)
7. [สิ่งที่ทำเสร็จแล้ว](#7-สิ่งที่ทำเสร็จแล้ว)
8. [สิ่งที่ยังต้องทำ](#8-สิ่งที่ยังต้องทำ)
9. [ไฟล์สำคัญ](#9-ไฟล์สำคัญ)
10. [Business Rules](#10-business-rules)
11. [Developer Guidelines](#11-developer-guidelines)

---

## 1. ภาพรวมโปรเจกต์

**ระบบจัดการการลางาน (HR Leave Management System)** สำหรับ:
- บริษัท โซนิค อินเตอร์เฟรท จำกัด (SONIC)
- บริษัท แกรนด์ลิงค์ ลอจิสติคส์ จำกัด (GRANDLINK)
- บริษัท โซนิค ออโต้โลจิส จำกัด (SONIC-AUTOLOGIS)

### Features หลัก:
- ✅ Login ด้วยชื่อผู้ใช้ (AD username หรือรหัสพนักงาน) + Biometric (WebAuthn/Passkey)
- ✅ Dashboard แสดงยอดวันลาคงเหลือ
- ✅ ยื่นคำขอลา (9 ประเภท รวม OTHER)
- ✅ นำเข้าวันลาจำนวนมาก (Bulk Leave Import)
- ✅ ดูประวัติการลา + ยกเลิกใบลา
- ✅ หัวหน้าอนุมัติ/ไม่อนุมัติ (UI + Magic Link Email)
- ✅ มอบหมายผู้อนุมัติแทน (Delegate Approver)
- ✅ HR จัดการพนักงาน
- ✅ จัดการวันหยุด + วันเสาร์ทำงาน
- ✅ System Security (Rate Limiting, Audit Logs)
- ✅ เครื่องบันทึกเวลา HIP CMiF68S: ตั้งค่าอุปกรณ์, ดึงเวลาเข้า-ออกแบบ incremental, พนักงานดูประวัติของตัวเอง
- ✅ Reports & Analytics
- ✅ PWA Support (ติดตั้งเป็น App บน Mobile)

---

## 2. Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | MS SQL Server 2025 |
| DB Driver | `mssql` (native, ไม่ใช้ ORM) |
| Auth | NextAuth.js v5 (Beta) |
| Password Hash | bcryptjs |
| Biometric Auth | @simplewebauthn/server, @simplewebauthn/browser |
| Icons | Lucide React |
| Date Utils | date-fns, date-fns-tz |
| User Guide | driver.js (Interactive Tour) |
| Charts | Recharts |
| Excel | xlsx (Bulk Leave Import, Template Download) |

---

## 3. โครงสร้างโปรเจกต์

```
hr-leave/
├── database/
│   ├── schema.sql                    # SQL Script สร้าง Tables
│   └── migrations/                   # SQL Migration scripts
│       ├── add_ad_auth_support.sql
│       ├── add_ad_lifecycle_support.sql
│       ├── add_companies_table.sql
│       ├── add_cross_year_leave_support.sql
│       ├── add_attendance_tables.sql
│       ├── add_ishrstaff_column.sql
│       ├── add_work_schedule.sql
│       └── increase_decimal_precision.sql
├── scripts/                          # Utility scripts
│   ├── seed-db.ts                    # Seed database
│   ├── migrate-ad-auth.ts            # AD Auth migration
│   ├── migrate-ad-lifecycle.ts       # AD Lifecycle migration
│   ├── scheduled-ad-sync.ts          # Cron script for AD Sync
│   └── update-prod.ts               # Production update script
├── tests/                            # E2E/utility test scripts
│   ├── cross-year-leave.test.ts      # Cross-year leave tests (31 cases)
│   ├── login-error-message.test.mjs  # Login error mapping tests
│   ├── medical-file-access.test.mjs  # Medical file permission tests
│   └── medical-file-url.test.mjs     # Medical file URL normalization tests
├── src/
│   ├── app/
│   │   ├── (dashboard)/              # Group สำหรับหน้าที่ต้อง Login
│   │   │   ├── layout.tsx            # Layout มี Sidebar + Topbar
│   │   │   ├── dashboard/page.tsx    # Dashboard หลัก
│   │   │   ├── leave/
│   │   │   │   ├── request/page.tsx   # ฟอร์มขอลา
│   │   │   │   └── history/page.tsx   # ประวัติการลา
│   │   │   ├── approvals/page.tsx     # หน้าอนุมัติ (Manager)
│   │   │   ├── holidays/page.tsx      # ดูวันหยุด (Employee)
│   │   │   ├── attendance/page.tsx    # เวลาเข้า-ออกของพนักงาน
│   │   │   ├── notifications/page.tsx # การแจ้งเตือน
│   │   │   ├── profile/page.tsx       # โปรไฟล์
│   │   │   ├── manager/              # หน้าสำหรับ Manager
│   │   │   │   ├── overview/page.tsx  # ภาพรวมทีม
│   │   │   │   ├── calendar/page.tsx  # ปฏิทินวันลาทีม
│   │   │   │   ├── team/page.tsx      # รายชื่อสมาชิกทีม
│   │   │   │   └── delegates/page.tsx # มอบหมายผู้อนุมัติแทน
│   │   │   ├── hr/                    # หน้าสำหรับ HR
│   │   │   │   ├── overview/page.tsx  # ภาพรวม HR
│   │   │   │   ├── employees/page.tsx # จัดการพนักงาน
│   │   │   │   ├── leaves/page.tsx    # จัดการใบลาทั้งหมด
│   │   │   │   ├── holidays/page.tsx  # จัดการวันหยุด
│   │   │   │   ├── companies/page.tsx # จัดการบริษัท
│   │   │   │   ├── settings/page.tsx  # ตั้งค่าโควตาวันลา
│   │   │   │   ├── work-schedule/     # จัดการตารางเวลาทำงาน
│   │   │   │   ├── year-end/page.tsx  # ประมวลผลสิ้นปี
│   │   │   │   ├── analytics/page.tsx # กราฟวิเคราะห์สถิติ
│   │   │   │   ├── reports/page.tsx   # รายงาน
│   │   │   │   └── leave-import/page.tsx # นำเข้าวันลา (Bulk Import)
│   │   │   └── admin/                 # หน้าสำหรับ Admin
│   │   │       ├── audit-logs/page.tsx     # Audit Logs
│   │   │       ├── attendance-devices/page.tsx # ตั้งค่าเครื่องบันทึกเวลา
│   │   │       ├── auth-settings/page.tsx  # ตั้งค่า Auth Mode
│   │   │       ├── rate-limit/page.tsx     # Rate Limiting
│   │   │       └── user-lifecycle/page.tsx # AD User Lifecycle
│   │   ├── api/                      # API Routes
│   │   │   ├── auth/                  # Authentication
│   │   │   │   ├── [...nextauth]/route.ts
│   │   │   │   ├── verify/route.ts
│   │   │   │   ├── mode/route.ts      # Auth mode API
│   │   │   │   ├── delegate-check/route.ts # Delegate status check
│   │   │   │   └── log/route.ts       # Auth logging
│   │   │   ├── leave/                 # Leave APIs
│   │   │   ├── hr/                    # HR APIs (21 routes)
│   │   │   ├── admin/                 # Admin APIs
│   │   │   │   └── attendance/        # ตั้งค่า/ทดสอบ/ซิงก์เครื่องบันทึกเวลา
│   │   │   ├── attendance/            # API เวลาเข้า-ออกของพนักงาน
│   │   │   ├── manager/               # Manager APIs
│   │   │   ├── email/                 # Email action (Magic Link)
│   │   │   ├── cron/                  # Scheduled tasks
│   │   │   ├── files/medical/[filename]/ # Serve ไฟล์ใบรับรองแพทย์ (API)
│   │   │   ├── upload/                # File upload
│   │   │   └── working-saturdays/     # Working Saturday API
│   │   ├── action/[action]/page.tsx   # Magic Link Landing
│   │   ├── login/page.tsx
│   │   ├── layout.tsx                 # Root layout (PWA)
│   │   ├── page.tsx                   # Home (redirect)
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx            # เมนูด้านข้าง (Role-based)
│   │   │   └── topbar.tsx             # ส่วนบน + กระดิ่ง + Sound
│   │   ├── ui/                        # Reusable UI Components
│   │   │   ├── Modal.tsx              # Global Modal
│   │   │   ├── Toast.tsx              # Toast Notifications
│   │   │   ├── Skeleton.tsx           # Loading skeleton
│   │   │   ├── ThemeToggle.tsx         # Dark/Light toggle
│   │   │   ├── CompanySelect.tsx       # Company dropdown
│   │   │   ├── DepartmentCombobox.tsx  # Department search
│   │   │   ├── ManagerSearchSelect.tsx # Manager search
│   │   │   └── SearchableSelect.tsx    # Generic searchable select
│   │   └── providers.tsx              # SessionProvider
│   ├── hooks/
│   │   ├── useNotificationSound.ts    # Web Audio API
│   │   └── useTour.ts                 # Interactive tour hook
│   ├── lib/
│   │   ├── db.ts                      # Database connection (Singleton)
│   │   ├── attendance/                # HIP protocol, TCP client, repository, sync service
│   │   ├── date-utils.ts              # Timezone, Working days calc
│   │   ├── leave-utils.ts             # Leave duration formatting + formatHourlyDuration
│   │   ├── audit.ts                   # Audit logging helper
│   │   ├── delegate.ts                # Delegate approver helpers
│   │   ├── email.ts                   # Email sending (SMTP)
│   │   ├── tokens.ts                  # JWT token for Magic Link
│   │   ├── notifications.ts           # Notification helper
│   │   ├── rate-limiter.ts            # Rate Limiting Logic
│   │   ├── ldap.ts                    # LDAP/AD connection
│   │   ├── azure-graph.ts             # Azure AD Graph API
│   │   ├── utils.ts                   # General utilities
│   │   ├── auth/                      # Auth helpers
│   │   │   ├── settings.ts            # Auth settings cache
│   │   │   ├── jit-user.ts            # JIT user provisioning
│   │   │   └── login-errors.ts        # NextAuth login error copy mapping
│   │   ├── medical-file-access.ts     # Permission rules for medical attachments
│   │   ├── medical-files.ts           # Normalize medical certificate file URLs
│   │   └── tour/
│   │       └── driver-config.ts       # Tour step configuration
│   ├── types/
│   │   └── index.ts                   # TypeScript types & enums
│   ├── auth.ts                        # NextAuth configuration
│   └── proxy.ts                      # Auth + RBAC protection (renamed from middleware.ts)
├── public/
│   ├── manifest.json                  # PWA Manifest
│   ├── sw.js                          # Service Worker
│   └── icons/                         # PWA Icons
├── .env                               # Environment variables
├── DEVELOPER_HANDOFF.md               # เอกสารนี้
├── IMPLEMENTATION_PLAN.md             # แผนการพัฒนา
├── USER_GUIDE.md                      # คู่มือการใช้งาน
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## 4. วิธีการติดตั้ง

### 4.1 Prerequisites
- Node.js 18+
- MS SQL Server 2025
- SSMS (SQL Server Management Studio)

### 4.2 Clone & Install
```bash
cd d:\Antigravity\hr-leave
npm install
```

### 4.3 Database Setup
1. เปิด SSMS และเชื่อมต่อไปที่ `192.168.110.106`
2. สร้าง Database: `CREATE DATABASE HRLeave`
3. รัน Script: `database/schema.sql`
4. ถ้าเป็นฐานข้อมูลเดิม ให้รัน migration ที่ยังไม่ได้ลงตามลำดับ โดยฟีเจอร์เครื่องบันทึกเวลาใช้ `database/migrations/add_attendance_tables.sql`
5. อัปเดต Password Admin:
```sql
UPDATE Users 
SET password = '$2b$10$SzYMuUujRokPSvpiekAVy.WtdlUebE.uMBDehf5BDXkdll8mBQQvU.' 
WHERE employeeId = 'ADMIN001';
```

### 4.4 Environment Variables
ไฟล์ `.env` มีค่าต่อไปนี้:
```env
PORT=3002
DB_SERVER=192.168.110.106
DB_PORT=1433
DB_NAME=HRLeave
DB_USER=sa
DB_PASSWORD=Sonic@rama3
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
NEXTAUTH_SECRET=your-super-secret-key-change-in-production-please-32-chars-min
NEXTAUTH_URL=http://localhost:3002
UPLOAD_DIR=./public/uploads
TZ=Asia/Bangkok
SESSION_TIMEOUT_MINUTES=15
CRON_SECRET=change-this-for-production
```

### 4.5 Run Development
```bash
npm run dev
```
เปิด: `http://localhost:3002`

> ℹ️ บน Windows หาก `next dev` แบบ Turbopack เจอ permission/junction error จาก `mssql`, ใช้ Webpack dev server แทนได้:
> ```powershell
> .\node_modules\.bin\next.cmd dev --webpack -p 3002
> ```

### 4.6 Test Accounts
| รหัสพนักงาน | รหัสผ่าน | Role |
|-------------|----------|------|
| ADMIN001 | admin123 | Admin |

> ⚠️ ตอนนี้มี Demo Mode (hardcoded users) เป็น fallback ถ้า DB ไม่ตอบ

---

## 5. Database Schema

### Tables ที่สร้างแล้ว:

| Table | คำอธิบาย |
|-------|----------|
| `Users` | ข้อมูลพนักงาน (employeeId, password, role, company, department) |
| `LeaveRequests` | ใบคำขอลา (leaveType, startDatetime, endDatetime, status) |
| `LeaveRequestYearSplit` | แยกจำนวนวันลาตามปี (สำหรับใบลาข้ามปี) |
| `LeaveBalances` | ยอดวันลาคงเหลือต่อปี (มี `isAutoCreated` flag) |
| `PublicHolidays` | วันหยุดประเพณี/พิเศษ |
| `Notifications` | การแจ้งเตือน |
| `AuditLogs` | บันทึกกิจกรรม |
| `LeaveQuotaSettings` | ตั้งค่าโควตาวันลา |
| `DelegateApprovers` | ผู้รักษาการแทน |
| `SystemSettings` | ตั้งค่าระบบ (เช่น Rate Limits, Auth Mode, Work Hours) |
| `UsersArchive` | เก็บข้อมูลพนักงานที่ถูก Archive (AD Lifecycle) |
| `LeaveBalancesArchive` | เก็บยอดวันลาของพนักงานที่ถูก Archive |
| `LeaveRequestsArchive` | เก็บใบลาของพนักงานที่ถูก Archive |
| `Companies` | ข้อมูลบริษัท (Dynamic CRUD, Color picker) |
| `WorkingSaturdays` | วันเสาร์ทำงาน (date, startTime, endTime, workHours) |
| `AttendanceDevices` | ตั้งค่าเครื่องบันทึกเวลาแต่ละสาขา/อุปกรณ์ |
| `AttendanceLogs` | บันทึกเวลาเข้า-ออกที่ดึงจากเครื่อง HIP พร้อม raw hex สำหรับ audit |
| `AttendanceSyncRuns` | ประวัติการ sync, จำนวน record, สถานะ, error message |

### Key Columns ใน Users (AD Lifecycle):
- `isADUser`: BIT - ระบุว่าเป็น AD User หรือไม่
- `adUsername`: NVARCHAR - Username ใน AD
- `authProvider`: VARCHAR - LOCAL, AD, AZURE
- `adStatus`: NVARCHAR - ACTIVE, DISABLED, AD_DELETED, ARCHIVED
- `deletedAt`: DATETIME2 - Timestamp เมื่อถูกลบจาก AD
- `isHRStaff`: BIT - Flag แยกสิทธิ์ HR (1=เข้าถึงเมนู HR/Admin, 0=ตาม Role ปกติ)

### Key Columns ใน LeaveRequests:
- `timeSlot`: FULL_DAY, HALF_MORNING, HALF_AFTERNOON, HOURLY
- `isHourly`: BIT - ลาระดับชั่วโมง (1=ชั่วโมง, 0=เต็มวัน)
- `startTime`: VARCHAR - เวลาเริ่ม (HH:MM) สำหรับลารายชั่วโมง
- `endTime`: VARCHAR - เวลาสิ้นสุด (HH:MM) สำหรับลารายชั่วโมง
- `usageAmount`: DECIMAL(8,4) - จำนวนวันสุทธิ (หลังหักวันหยุด)
- `status`: PENDING, APPROVED, REJECTED, CANCELLED
- `rejectionReason`: เหตุผลที่ไม่อนุมัติ

### Key Columns ใน LeaveBalances:
- `isAutoCreated`: BIT - ระบุว่า Balance ถูกสร้างอัตโนมัติ (1) หรือจาก Year-End processing (0)
- `entitlement`: DECIMAL(8,4) - สิทธิ์วันลาทั้งหมด
- `used`: DECIMAL(8,4) - จำนวนที่ใช้ไปแล้ว
- `remaining`: DECIMAL(8,4) - คงเหลือ (entitlement + carryOver - used)
- `carryOver`: DECIMAL(8,4) - ยอดยกมาจากปีก่อน

### Key Columns ใน Users สำหรับทดลองงาน/สิทธิ์พักร้อน:
- `probationDays`: INT - จำนวนวันทดลองงานมาตรฐานของพนักงาน (default จาก `PROBATION_STANDARD_DAYS`)
- `probationExtensionDays`: INT - จำนวนวันที่ต่อทดลองงานเพิ่ม
- `probationOverrideDate`: DATE NULL - วันที่ผ่านทดลองงานจริงกรณีผ่านก่อน/ยกเว้น/แก้ย้อนหลัง
- `probationEndDate`: DATE NULL - วันที่ผ่านทดลองงานที่คำนวณหรือ override แล้ว
- `probationNote`: NVARCHAR(500) NULL - หมายเหตุการปรับทดลองงาน

### Key Columns ใน LeaveRequestYearSplit:
- `leaveRequestId`: INT FK → LeaveRequests - ใบลาที่เกี่ยวข้อง
- `year`: INT - ปีงบประมาณที่หักยอด (`LEAVE_YEAR_START`)
- `usageAmount`: DECIMAL(8,4) - จำนวนวันที่หักในปีนั้น

### Key Columns ใน AttendanceDevices / AttendanceLogs:
- `AttendanceDevices.branchName`: NVARCHAR - ชื่อสาขา/พื้นที่ติดตั้งเครื่อง
- `AttendanceDevices.ipAddress`, `port`, `pass`: ข้อมูลเชื่อมต่อ HIP CMiF68S ผ่าน TCP (`pass` ค่า default ของรุ่นนี้คือ `0`)
- `AttendanceDevices.syncFrequencyMinutes`: ความถี่ sync อัตโนมัติ
- `AttendanceDevices.lastSyncAt`, `nextSyncAt`, `syncLockUntil`: ใช้ควบคุม incremental sync และกัน sync ซ้อน
- `AttendanceLogs.deviceId`: FK → AttendanceDevices
- `AttendanceLogs.userKey`: เลขพนักงานจากเครื่อง HIP
- `AttendanceLogs.employeeId`: ค่า `userKey` ที่แปลงเป็น string เพื่อผูกกับ `Users.employeeId`
- `AttendanceLogs.recordTime`: เวลาที่ระบบใช้แสดงผล หลัง apply calibration
- `AttendanceLogs.rawRecordTime`: เวลา raw ที่ decode ได้ก่อนปรับปี
- `AttendanceLogs.verifyType`, `verifyCode`: FP/FACE/UNKNOWN_0x30 และ code จากเครื่อง
- `AttendanceLogs.recordHex`: raw 20-byte record hex สำหรับ audit
- `AttendanceLogs.dedupeKey`: unique key ป้องกันบันทึกซ้ำ (`deviceId + userKey + recordTime + verifyType + recordHex`)

---

## 6. Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Login Page
    participant NextAuth
    participant /api/auth/verify
    participant Database

    User->>Login Page: Enter AD username/employeeId + password
    Login Page->>NextAuth: signIn('credentials', {...})
    NextAuth->>NextAuth: authorize() callback
    NextAuth-->/api/auth/verify: POST {employeeId, password}
    /api/auth/verify->>Database: Query Users WHERE employeeId/adUsername = @id
    Database-->/api/auth/verify: User record
    /api/auth/verify->>bcrypt: compare(password, hash)
    /api/auth/verify-->>NextAuth: User object (if valid)
    NextAuth-->>Login Page: Session created
    Login Page-->>User: Redirect to /dashboard
```

### Session Config:
- Strategy: JWT
- Max Age: 15 นาที (Auto Logout)
- Secret: `NEXTAUTH_SECRET` in .env

### Dynamic Authentication Settings:
- **Storage**: `SystemSettings` table in Database (Key: `AUTH_MODE`, `LDAP_URL`, etc.).
- **Logic**: `src/auth.ts` and `src/lib/ldap.ts` fetch settings from DB at runtime.
- **Priority**: Database Settings > .env Setup (Fallback).
- **Benefit**: Change Auth Mode (Local/LDAP/Hybrid) via UI without restarting server.

### Login UX & Error Handling (2 มิ.ย. 2026):
- หน้า Login ใช้ label `ชื่อผู้ใช้` และ placeholder `กรอกชื่อ AD หรือรหัสพนักงาน`
- เหตุผล: ผู้ใช้ที่ sync จาก AD ใช้ AD username ส่วนผู้ใช้ที่ Admin สร้างเองใช้รหัสพนักงาน
- `src/lib/auth/login-errors.ts` map NextAuth error codes เช่น `Configuration`, `CredentialsSignin`, `AccessDenied` เป็นข้อความไทยที่ผู้ใช้เข้าใจง่าย
- Credentials login ที่ตรวจสอบไม่ผ่านจะ return `null` เพื่อให้ NextAuth แสดง credential error แทน configuration error

### AD User Authentication Security (24 ม.ค. 2026):
**ปัญหาที่แก้ไข**: AD Users ที่ Sync เข้ามาเคยมีรหัสผ่าน `password123` และสามารถ bypass LDAP ได้

**การแก้ไข**:
1. **Block Local Password for AD Users** (`api/auth/verify/route.ts`)
   - ถ้า `authProvider = 'LDAP'` หรือ `'AZURE'` → return 403, บังคับ login ผ่าน AD เท่านั้น
2. **Random Password for AD Sync** (`api/cron/ad-sync/route.ts`, `api/hr/employees/sync/route.ts`)
   - ใช้ `crypto.randomBytes(32)` แทน hardcoded `password123`
3. **SQL Injection Fix** - เปลี่ยน string interpolation เป็น parameterized query (`@provider`)

### AD User Lifecycle Management:
| สถานะใน AD | isActive | adStatus | deletedAt |
|------------|----------|----------|-----------|
| Enabled | 1 | `ACTIVE` | NULL |
| Disabled | 0 | `DISABLED` | NULL |
| Deleted | 0 | `AD_DELETED` | timestamp |

**Data Retention Policy:**
- 0-1 ปี: เก็บเป็น `AD_DELETED`
- 1-3 ปี: Archive ไปตาราง Archive
- > 3 ปี: Purge ลบถาวร

### RBAC (proxy.ts):
| Route | Allowed Roles |
|-------|---------------|
| `/hr/*` | HR, ADMIN, isHRStaff |
| `/approvals/*` | All authenticated (API checks delegate authority) |
| `/department/*` | MANAGER, HR, ADMIN |
| `/admin/*` | ADMIN only |

### HR Staff Permission Logic (`isHRStaff`):
ระบบมีการแยกสิทธิ์ HR ออกจาก Role หลัก เพื่อให้พนักงานทั่วไป (Role: EMPLOYEE/MANAGER) สามารถช่วยงาน HR ได้โดยไม่ต้องเปลี่ยน Role หลัก
1. **Database**: Column `isHRStaff` (BIT) ในตาราง `Users`
2. **Frontend**: มี toggle "HR Staff" ในหน้าจัดการพนักงาน
3. **Middleware**: Bypass role check สำหรับ route `/hr/*` ถ้ามี flag `isHRStaff`
4. **API**: ทุก API ของ HR (`/api/hr/*`) จะตรวจสอบทั้ง Role และ flag `isHRStaff`

---

## 7. สิ่งที่ทำเสร็จแล้ว

### ✅ Phase 1: Project Setup
- [x] Next.js 16 + TypeScript + Tailwind v4
- [x] Dependencies ทั้งหมด
- [x] `.env` configuration
- [x] Database Schema (SQL Script)
- [x] `lib/db.ts` - Parameterized Queries (ป้องกัน SQL Injection)
- [x] `types/index.ts` - Enums & Interfaces

### ✅ Phase 2: Authentication
- [x] NextAuth v5 configuration
- [x] Login Page (Glassmorphism design)
- [x] Middleware (RBAC)
- [x] Session Provider

### ✅ Phase 2.5: Security
- [x] Rate Limiting (Token Bucket Algorithm)
- [x] Admin Settings UI (`/admin/rate-limit`)
- [x] Login Protection
- [x] **AD User Auth Security** - บล็อก AD Users ไม่ให้ login ด้วย local password
- [x] **Random Password for AD Sync** - ป้องกัน brute force
- [x] **SQL Injection Fix** - Parameterized queries ใน AD Sync routes
- [x] **AD Start Date Timezone Fix** - แปลง whenCreated (UTC) → local timezone ก่อนบันทึก

### ✅ Phase 2.7: Work Schedule & Working Saturdays
- [x] **Work Schedule Settings UI** (`/hr/work-schedule`)
  - ตั้งค่าเวลาทำงานปกติ (08:30-17:00)
  - ตั้งค่าเวลาพักกลางวัน (12:00-13:00)
  - ตั้งค่าเวลาวันเสาร์เริ่มต้น (09:00-12:00)
- [x] **Working Saturdays Management**
  - เพิ่ม/ลบวันเสาร์ทำงานได้ตามต้องการ
  - กำหนดเวลาทำงานแยกแต่ละวันเสาร์
- [x] **Leave Calculation Integration**
  - คำนวณวันลารวมวันเสาร์ทำงาน (สัดส่วนชั่วโมง)
  - Disable ครึ่งเช้า/บ่ายสำหรับวันเสาร์
- [x] **API Endpoints**
  - `GET/PUT /api/hr/work-schedule` - ตั้งค่าเวลาทำงาน
  - `GET/POST/DELETE /api/hr/working-saturdays` - จัดการวันเสาร์
  - `GET /api/working-saturdays/range` - ดึงวันเสาร์ตามช่วงวันที่

### ✅ Phase 3: Core Pages
- [x] Dashboard - แสดงยอดวันลา, ประวัติล่าสุด, วันหยุด
- [x] Leave Request Form - เลือกประเภท, วันที่, Half-day, เหตุผล
- [x] Leave History - Filter, Search, Cancel Modal
- [x] Profile - แสดงข้อมูลจาก Session
- [x] Approvals - Approve/Reject พร้อมใส่เหตุผล

### ✅ UI/UX
- [x] Sidebar - Role-based menu, expandable sections
- [x] Topbar - Notification bell (hardcoded), User info
- [x] Thai language throughout
- [x] Responsive design (Mobile sidebar toggle)
- [x] Loading states, Animations
- [x] Toast Notifications (Real-time feedback)

### ✅ Phase 4.5: AD Integration
- [x] Local AD Sync (LDAP)
- [x] Azure AD Sync (Graph API)
- [x] AD User Lifecycle Management
- [x] AD Status Tracking (Active/Disabled/Deleted)
- [x] Archive API (`/api/admin/archive-users`)
- [x] Purge API (`/api/admin/purge-archived`)
- [x] Email Notifications (Leave request → Manager)

---

## 8. สิ่งที่ยังต้องทำ

### ✅ Phase 4: HR Features (DONE)
- [x] **HR Staff Role Separation** - แยกสิทธิ์ HR ให้พนักงานทั่วไปได้ (`isHRStaff` flag)
- [x] `/hr/employees` - จัดการพนักงาน (CRUD, Import/Export Excel, LDAP Sync, Edit Gender/StartDate, กรองตามแผนก/บริษัท)
- [x] `/hr/companies` - จัดการบริษัท (Dynamic CRUD, Color picker)
- [x] `/hr/holidays` - จัดการวันหยุด (Public, Special per company)
- [x] `/hr/settings` - ตั้งค่าโควตาวันลา (Auto-sync to active balances)
- [x] `/hr/year-end` - ประมวลผลสิ้นปี (Preview, Execute, Carry-over)
- [x] `/hr/analytics` - Charts, Company comparison
- [x] `/hr/reports` - ออกรายงาน
- [x] `/hr/overview` - ภาพรวม HR
- [x] `/hr/leaves` - จัดการใบลาทั้งหมด (HR Revoke)

### ✅ Phase 5: API Integration (DONE)
- [x] POST `/api/leave/request` - สร้างใบลา
- [x] GET `/api/leave/history` - ดึงประวัติจาก DB
- [x] POST `/api/leave/approve` - อนุมัติ
- [x] POST `/api/leave/reject` - ไม่อนุมัติ
- [x] POST `/api/leave/cancel` - ยกเลิกใบลา
- [x] Overlap Check - ตรวจสอบวันซ้ำ
- [x] Working Days Calculation - หักวันหยุดอัตโนมัติ
- [x] Role Filter Parameter - กรองพนักงานตาม role (สำหรับ Manager dropdown)
- [x] Manager Dropdown Server-side Search - ค้นหา Manager ผ่าน API พร้อม debounce
- [x] LDAP Sync Attribute Mapping:
  - `whenCreated` → วันที่เริ่มงาน (startDate) - อัปเดตทั้ง INSERT และ UPDATE
  - `department` → แผนก
  - `company` → บริษัท (Sonic→SONIC, Grandlink→GRANDLINK, Sonic-Autologis→SONIC-AUTOLOGIS)

### ✅ Phase 6: Advanced Features (DONE)
- [x] File Upload (ใบรับรองแพทย์) - `/api/upload/medical` → เก็บที่ `public/uploads/medical/`
- [x] File Serving (ใบรับรองแพทย์) - `/api/files/medical/[filename]` (serve ผ่าน API แทน static, แก้ 404 หลัง deploy)
- [x] Email Notifications - ส่งอีเมลแจ้ง Manager + พนักงาน
- [x] **PWA Support** - ติดตั้งเป็น App บน Mobile ได้ (manifest.json, Service Worker)
- [x] **Audit Logs UI** - `/admin/audit-logs` (ADMIN only) ดู logs กิจกรรมทั้งหมด
- [x] **Auth Settings UI** - `/admin/auth-settings` (ADMIN only) เปลี่ยน Auth Mode

### ✅ Phase 7: User Experience & Validation (6 ก.พ. 2026)
- [x] **Interactive User Guide** (driver.js)
  - Tour สำหรับพนักงาน (4 steps: Balance, Request, History, Holidays)
  - Tour สำหรับ Manager (4 steps: Balance, Approvals, Pending, Team)
  - Auto-start สำหรับ first-time users
  - Help button ใน Sidebar (ดูคู่มือแนะนำ)
  - LocalStorage tracking (tour-employee-completed, tour-manager-completed)
  - **Mobile Fix**: Auto-skip tour on mobile devices (< 768px)
- [x] **USER_GUIDE.md** - คู่มือการใช้งานภาษาไทย
- [x] **Weekend Validation for Hourly Leave**
  - บล็อกการลาวันอาทิตย์ (วันหยุด)
  - ตรวจสอบวันเสาร์กับตาราง WorkingSaturdays
  - แก้ไข column name bug (`saturdayDate` → `date`)
- [x] **Complete Holiday Validation**
  - **Hourly**: บล็อกทุกวันหยุด (อาทิตย์, เสาร์ไม่ทำงาน, วันหยุดนักขัตฤกษ์)
  - **Full-day/Half-day 1 วัน**: บล็อกถ้าเป็นวันหยุด + แสดงชื่อวันหยุด
  - **Full-day/Half-day หลายวัน**: อนุญาต แต่หักวันหยุดออกจากการคำนวณ
  - API: เพิ่ม date range support ใน `/api/holidays`

### ✅ Phase 8: Delegate Approver (9 ก.พ. 2026)
- [x] **Delegate Helper** (`lib/delegate.ts`) - 4 helpers (getActiveDelegates, getDelegatingManagers, isDelegateOf, hasActiveDelegateRole)
- [x] **Delegate CRUD API** (`/api/manager/delegates`) - GET/POST/DELETE + validation + audit
- [x] **Delegate Search API** (`/api/manager/delegates/search`) - ค้นหา user สำหรับมอบหมาย
- [x] **Delegate Check API** (`/api/auth/delegate-check`) - เช็ค delegate status สำหรับ sidebar
- [x] **Pending Route** - Delegate เห็นใบลาทีมที่ได้รับมอบหมาย + badge `isDelegated`
- [x] **Approve Route** - บล็อก self-approval + ตรวจ delegate authority
- [x] **Request Route** - แจ้ง delegate เมื่อมีใบลาใหม่ (notification + Magic Link)
- [x] **Delegates Page** (`/manager/delegates`) - สร้าง/ดู/ยกเลิก delegate + history
- [x] **Sidebar** - เมนู "มอบหมายผู้แทน" (Manager) + dynamic "อนุมัติ (แทน)" (EMPLOYEE delegate)
- [x] **Approvals Badge** - แสดง "แทน ManagerName" สีแอมเบอร์

### ✅ Phase 9: Bulk Leave Import (12-23 ก.พ. 2026)
- [x] **API** (`/api/hr/leave-import`) - POST นำเข้าวันลาจำนวนมาก
  - Validate: employeeId, leaveType, dates
  - **Auto-Calculate Days** (23 ก.พ.) - คำนวณจำนวนวันลาอัตโนมัติจากวันที่เริ่ม-สิ้นสุด
    - ใช้ `calculateNetWorkingDays()` จาก `date-utils.ts` (หักวันหยุด, อาทิตย์, รวมเสาร์ทำงาน)
    - Fetch PublicHolidays, WorkingSaturdays, WORK_HOURS_PER_DAY setting จาก DB
    - ลาชั่วโมง (excelDays < 1 + มีเวลา): คำนวณจาก `calculateHourlyDuration()` หักพักเที่ยงอัตโนมัติ
    - ไม่ใช้คอลัมน์ "จำนวนวัน" จาก Excel — ระบบคำนวณเองทั้งหมด
  - **Auto-Create LeaveBalances** (23 ก.พ.) - สร้างยอดวันลาอัตโนมัติจาก `LeaveQuotaSettings` ถ้าไม่มี
  - ตรวจใบลาซ้ำ (skip ถ้าซ้ำ)
  - ตรวจ Balance ก่อน import (ป้องกันวันลาติดลบ)
  - Insert เป็น APPROVED + หัก LeaveBalances (ยกเว้น OTHER)
  - **Hourly Detection Logic** (23 ก.พ.) - เฉพาะ excelDays < 1 + มี startTime/endTime เท่านั้น ถึงถือเป็นลาชั่วโมง (ป้องกัน MATERNITY 60 วันถูกบันทึกเป็น 7 ชม.)
- [x] **Frontend** (`/hr/leave-import`)
  - Drag & Drop + Click-to-select upload (.xlsx/.xls)
  - Client-side parsing ด้วย xlsx library
  - Preview table พร้อม validation status (✅/❌)
  - Template download พร้อมตัวอย่างข้อมูล (รวมลาชั่วโมง)
  - คำแนะนำการใช้งานละเอียด (ขั้นตอน, ตารางคอลัมน์, ประเภทลา, หมายเหตุ)
  - Import summary (สำเร็จ/ข้อผิดพลาด/ข้าม)
- [x] **Sidebar** - เมนู "นำเข้าวันลา" (FileSpreadsheet icon) ใน HR section
- [x] **Access Control** - HR/ADMIN/isHRStaff (middleware + API)

### ✅ Phase 10: Cross-Year Leave Support (16 ก.พ. 2026)
- [x] **Split-Year Usage** - ใบลาที่ข้ามปี (เช่น 28 ธ.ค. - 4 ม.ค.) จะถูกแยกหักยอดแต่ละปีอัตโนมัติ
- [x] **LeaveRequestYearSplit Table** - ตารางใหม่เก็บจำนวนวันแยกตามปี
- [x] **Auto-Create Balance** - สร้างยอดวันลาปีใหม่อัตโนมัติ (ก่อน Year-End) พร้อม flag `isAutoCreated`
- [x] **Year-End Auto-Overwrite** - ประมวลผลสิ้นปี overwrite ยอดที่ auto-create ได้โดยไม่ต้อง "เขียนทับ" + Snapshot `used` ก่อนลบ
- [x] **Cross-Year Refund** - ยกเลิก/ปฏิเสธใบลาข้ามปี คืนยอดถูกปีทุกกรณี
- [x] **splitLeaveByYear()** - utility function ใน `date-utils.ts`
- [x] **Migration Script** - `database/migrations/add_cross_year_leave_support.sql`
- [x] **Year-End Preview Indicator** - แสดงจำนวน auto-created records + อนุญาต execute โดยไม่ต้องกดเขียนทับ
- [x] **E2E Test Script** - `tests/cross-year-leave.test.ts` (31 test cases ครอบคลุม 5 scenarios)

### ✅ Phase 11: Data Integrity & Audit (16 ก.พ. 2026)
- [x] **SQL Transactions** - ครอบ mutation block ด้วย `sql.Transaction` + `begin/commit/rollback`
  - `api/leave/request` — auto-create balance, INSERT leave, UPDATE balance, INSERT year-split, audit
  - `api/leave/cancel` — UPDATE status, refund balance, audit
  - `api/leave/approve` — UPDATE status, refund balance (reject), audit
  - `api/email/action` — UPDATE status, refund balance (reject), audit
  - `api/hr/year-end/execute` — DELETE + INSERT ทั้ง batch เป็น atomic
- [x] **`logAudit` Transaction Support** - เพิ่ม optional `transaction` param ให้ audit log เข้าร่วม transaction เดียวกัน
- [x] **Year-End Audit Enhancement** - เพิ่ม `oldValue` (overwritten records, auto-created count, usage preserved) และ `newValue` ที่ detail มากขึ้น (carry-over summary, leave types processed, total employees)
- [x] **Notification Isolation** — Notifications/Email อยู่นอก transaction เสมอ (ป้องกัน rollback จาก email failure)
- [x] **Optimistic Locking** — ป้องกัน race condition ด้วย `AND status = 'PENDING'` ใน UPDATE WHERE clause + เช็ค `rowsAffected` → return 409 Conflict
  - `cancel` — `AND status NOT IN ('CANCELLED','REJECTED')`
  - `approve` — `AND status = 'PENDING'`
  - `email/action` — `AND status = 'PENDING'`
- [x] **Performance Indexes** — เพิ่ม 8 composite indexes จากการวิเคราะห์ query patterns
  - `LeaveRequests(userId, status) INCLUDE (startDatetime, endDatetime)` — overlap check
  - `LeaveRequests(userId, createdAt DESC)` — history/pending list
  - `LeaveRequests(id, status)` — optimistic lock
  - `Notifications(userId, isRead, createdAt DESC)` — unread count (ทุก page load)
  - `Users(isActive, company) INCLUDE (department, departmentHeadId)` — HR overview
  - `DelegateApprovers(managerId, isActive) INCLUDE (delegateUserId, startDate, endDate)` — delegate lookup
  - `AuditLogs(action, createdAt DESC)` — audit filter
  - `PublicHolidays(date, company)` — holiday exclusion
  - Migration: `database/migrations/add_performance_indexes.sql`

### ✅ Bug Fixes (12-16 ก.พ. 2026)
- [x] **Interactive User Guide Loop** - แก้ useTour hook ที่ tour รันซ้ำตลอด
  - สาเหตุ: useEffect dependency `[session]` เปลี่ยน reference ทุก re-render
  - แก้ไข: ใช้ `session?.user?.role` + `hasStartedRef` + `useCallback`
- [x] **Cancellation Reason แสดง Numeric ID** - เหตุผลยกเลิกแสดง "Cancelled by 5" แทนที่จะเป็น employeeId
  - แก้ไข: ใช้ subquery `(SELECT employeeId FROM Users WHERE id = @cancelledBy)` ใน UPDATE statement
  - อัพเดทข้อมูลเก่าใน DB ด้วย (9 rows)
- [x] **Carry-Over Limit ไม่ Sync** - เปลี่ยน `ยกยอดข้ามปีได้สูงสุด` จากหน้าตั้งค่า ไม่ sync ไป `LeaveQuotaSettings.maxCarryOverDays`
  - สาเหตุ: `PUT /api/hr/settings` จัดการแค่ `LEAVE_QUOTA_*` → `defaultDays` ไม่มี handler สำหรับ `LEAVE_CARRYOVER_LIMIT`
  - แก้ไข: เพิ่ม sync `LEAVE_CARRYOVER_LIMIT` → `LeaveQuotaSettings` (maxCarryOverDays + allowCarryOver) สำหรับ VACATION
- [x] **Vacation Probation Eligibility** - ลาพักร้อนเริ่มใช้สิทธิ์จากวันที่ผ่านทดลองงานจริง + จำนวนปีที่ตั้งค่า
  - HR ตั้งค่า `PROBATION_STANDARD_DAYS`, `VACATION_AFTER_PROBATION_YEARS`, `LEAVE_ADVANCE_DAYS` ใน `/hr/settings` กลุ่ม `กฏการลา`
  - `LEAVE_ADVANCE_DAYS` เป็น signed integer: `3` = ต้องขอล่วงหน้า 3 วัน, `0` = ขอวันเดียวกันได้, `-30` = ลาย้อนหลังได้ไม่เกิน 30 วัน
  - HR กรอก `probationExtensionDays`, `probationOverrideDate`, `probationNote` ได้ที่ `/hr/employees`
  - ถ้า eligible date อยู่ภายในปีงบประมาณ ให้สิทธิ์พักร้อนเต็มปี ไม่มี prorate
  - การสร้าง balance, request, bulk import และ year-end ใช้ปีงบประมาณจาก `LEAVE_YEAR_START`
- [x] **CSV Export ประเภทการลาไม่ครบ** - Export CSV หน้ารายงานแสดงแค่ 3 ประเภท (พักร้อน, ลาป่วย, ลากิจ)
  - แก้ไข: เพิ่มทุกประเภทใน SQL query + CSV header (ลาคลอด, เกณฑ์ทหาร, ลาบวช, ทำหมัน, ฝึกอบรม, อื่นๆ)
- [x] **Audit Log แสดง Numeric ID** - คอลัมน์รายละเอียดแสดง `Users#1` แทน employeeId
  - แก้ไข: เพิ่ม `targetLabel` CASE expression ใน SQL ครอบคลุมทุก targetTable (Users→employeeId, LeaveRequests→employeeId, PublicHolidays→ชื่อวันหยุด, Companies→ชื่อบริษัท)
- [x] **Sidebar Scroll Position Reset** - เมนูด้านข้างเลื่อน scroll กลับไปบนสุดทุกครั้งที่คลิกเมนู/ผ่านไปสักพัก
  - สาเหตุ 1: `SidebarContent` ประกาศเป็น component function ภายใน `Sidebar` → แก้เป็น JSX variable
  - สาเหตุ 2: `NavLink` ประกาศเป็น nested component → React สร้าง type ใหม่ทุก re-render → unmount/remount ทุก link
  - แก้ไข: ย้าย `NavLink` เป็น top-level component, ส่ง `pathname` + `onClick` เป็น props
- [x] **AuditLogs Performance Indexes** - เพิ่ม 4 indexes สำหรับ AuditLogs table
  - `IX_AuditLogs_CreatedAt` (createdAt DESC)
  - `IX_AuditLogs_Action_CreatedAt` (action, createdAt DESC)
  - `IX_AuditLogs_UserId_CreatedAt` (userId, createdAt DESC)
  - `IX_AuditLogs_TargetTable_TargetId` (targetTable, targetId)
  - Migration: `database/migrations/add_audit_logs_indexes.sql`
- [x] **AuditLogs Retention Policy** - ลบ Audit Logs เก่ากว่า 12 เดือนอัตโนมัติ
  - Cron endpoint: `POST /api/cron/audit-cleanup` (ใช้ `x-cron-secret` header)
  - ลบแบบ batch (5,000 rows/batch) เพื่อหลีกเลี่ยง lock timeout
  - ตั้ง Task Scheduler: รันทุกเดือนวันที่ 1 เวลา 02:00
- [x] **Hourly Leave Duration Display Fix** - ลา 1 ชม. (08:30-09:30) แสดง "59 นาที" ในหน้าประวัติ/อนุมัติ
  - สาเหตุ: `DECIMAL(5,2)` ตัดทศนิยม `1/7.5 = 0.13333` → `0.13` → `0.13 × 7.5 × 60 = 58.5 ≈ 59 นาที`
  - แก้ไข 1: เพิ่ม `formatHourlyDuration()` ใน `leave-utils.ts` คำนวณจาก startTime/endTime โดยตรง
  - แก้ไข 2: เปลี่ยน DECIMAL(5,2) → DECIMAL(8,4) ทุกคอลัมน์ที่เกี่ยวข้อง
  - อัพเดท: `history/page.tsx`, `hr/leaves/page.tsx`, `approvals/page.tsx`
  - Migration: `database/migrations/increase_decimal_precision.sql`
- [x] **HR Staff Leave Cancellation** - HR Staff (isHRStaff=true) ไม่สามารถยกเลิกใบลาได้
  - แก้ไข: เพิ่ม `isHRStaff` check ใน `api/leave/cancel/route.ts`
- [x] **Next.js Middleware → Proxy Migration** - เปลี่ยนชื่อ `middleware.ts` → `proxy.ts` ตาม Next.js convention ใหม่
  - เปลี่ยน exported function จาก `middleware` → `proxy`
  - เพิ่ม exclusion สำหรับ static files ใน matcher
- [x] **Hourly Leave Overlap Check** - ลาชั่วโมงคนละช่วงเวลาในวันเดียวกัน (8:30-9:30 และ 13:00-14:00) ถูกบล็อกว่าซ้ำ
  - สาเหตุ: Overlap check เดิมเทียบแค่วันที่ ไม่ได้เช็คช่วงเวลา
  - แก้ไข: เพิ่ม time range intersection check สำหรับลารายชั่วโมงใน `api/leave/request/route.ts`
- [x] **Holidays Calendar Duration Format** - หน้าปฏิทินวันหยุดแสดง "0.1333 วัน" แทนที่จะเป็น "1 ชม."
  - แก้ไข: เพิ่ม `formatHourlyDuration` + `formatLeaveDays` ใน `holidays/page.tsx`
- [x] **Employee Balance Modal Duration Format** - หน้าจัดการพนักงาน > ดูวันลา แสดง "0.1333 วัน" สำหรับลาชั่วโมง
  - แก้ไข: เพิ่ม `isHourly`/`startTime`/`endTime` ใน `employee-balance/[userId]/route.ts` + ใช้ `formatHourlyDuration` ใน `employees/page.tsx`
- [x] **Unlimited Leave Type Display** - ลาประเภท "อื่นๆ" (entitlement=0) แสดง "6 นาที" แทนที่จะเป็น "ไม่จำกัด"
  - สาเหตุ: `formatLeaveDays()` แปลง remaining (ค่าลบ) เป็นชั่วโมง/นาที อย่างไม่ถูกต้อง
  - แก้ไข: เพิ่มเงื่อนไข `entitlement === 0` แสดง "ไม่จำกัด" ใน `dashboard/page.tsx`, `manager/team/page.tsx`, `hr/employees/page.tsx`
- [x] **Used Amount Precision Fix** - "ใช้ 7 ชม. 24 นาที" แสดงไม่ตรงกับการลาจริง
  - สาเหตุ: `used` ใน `LeaveBalances` สะสมจาก `usageAmount` ทศนิยม (1ชม.=0.1333วัน) ทำให้คลาดเคลื่อน
  - แก้ไข: คำนวณ `actualUsedMinutes` จาก `LeaveRequests` ด้วย SQL `DATEDIFF` + หักพักเที่ยง
  - เพิ่ม `formatMinutesToDisplay()` ใน `leave-utils.ts` แปลงนาทีเป็น "X ชม. Y นาที"
  - อัพเดท `dashboard/page.tsx`, `manager/team/page.tsx`, `hr/employees/page.tsx`, `employee-balance/[userId]/route.ts`
- [x] **Half-Day Leave Work Schedule Integration** - ครึ่งวันเช้า/บ่าย แสดง "3 ชม. 45 นาที" เท่ากัน ไม่อิงเวลาทำงานจริง
  - สาเหตุ: Hardcode ครึ่งวัน = 0.5 × workHoursPerDay ไม่ได้คำนึงเวลาเช้า/บ่ายจริง
  - แก้ไข: คำนวณ fraction จากเวลาจริง (เช้า 8:30-12:00 = 3.5ชม., บ่าย 13:00-17:00 = 4ชม.) ใน `leave/request/page.tsx`

### ✅ Bug Fixes (23 ก.พ. 2026)
- [x] **Bulk Import MATERNITY → Hourly Bug** - ลาคลอด 60 วันแสดงเป็น "7 ชม. 30 นาที"
  - สาเหตุ: Import logic ใช้ `row.startTime && row.endTime` เป็นเกณฑ์ `isHourly` ไม่ว่าจำนวนวันจะเท่าไร
  - แก้ไข: เปลี่ยนเงื่อนไขเป็น `excelDays < 1 && row.startTime && row.endTime`
- [x] **Employee Balance TRY_CAST Safety** - Error "Conversion failed when converting date and/or time from character string"
  - สาเหตุ: `CAST(startTime AS TIME)` crash เมื่อ startTime มีค่าที่ไม่ใช่เวลา (เช่น ทศนิยม Excel)
  - แก้ไข: เปลี่ยนเป็น `TRY_CAST(startTime AS TIME)` ใน `employee-balance/[userId]/route.ts`
- [x] **Bulk Import Auto-Calculate Days** - ระบบไม่คำนวณวันลา ใช้คอลัมน์ Excel ตรงๆ ทำให้ผิดพลาดได้
  - แก้ไข: คำนวณอัตโนมัติจากวันที่ + holidays + working Saturdays

### ✅ Bug Fixes (12 มี.ค. 2026)
- [x] **Medical Certificate 404 หลัง Deploy** - กดดูใบรับรองแพทย์ 404 ต้อง `pm2 restart` จึงใช้ได้
  - สาเหตุ: Next.js cache static files จาก `public/` ตอน build — ไฟล์ที่ upload หลัง build ไม่ถูก serve
  - แก้ไข 1: สร้าง API route `GET /api/files/medical/[filename]` serve ไฟล์แบบ dynamic (ใช้ native `Response` + `Uint8Array`)
  - แก้ไข 2: Upload API return URL `/api/files/medical/xxx` แทน `/uploads/medical/xxx`
  - ไฟล์ยังเก็บที่ `public/uploads/medical/` เหมือนเดิม

### ✅ Updates (2 มิ.ย. 2026)
- [x] **Manager ดูไฟล์แนบใบลาได้ครบขึ้น**
  - `/manager/calendar` แสดง/เปิดเอกสารแนบใบรับรองแพทย์จากข้อมูล `medicalCertificateFile`
  - `/manager/team` ใน modal "ดูวันลา" ของลูกทีม แสดงลิงก์ `ดูเอกสารแนบ` สำหรับใบลาที่มีไฟล์แนบ
- [x] **Medical File Access Control**
  - `GET /api/files/medical/[filename]` ตรวจ DB reference ก่อน serve ไฟล์ ลดความเสี่ยงเดาชื่อไฟล์แล้วเปิดได้
  - ผู้ที่ดูได้: เจ้าของไฟล์, หัวหน้างานโดยตรง, HR, ADMIN, `isHRStaff`, และ delegate ที่ active ของหัวหน้างาน
  - เพิ่ม `src/lib/medical-file-access.ts` และ test `tests/medical-file-access.test.mjs`
- [x] **Medical File URL Normalization**
  - รวม logic normalize path เก่า/ใหม่ไว้ที่ `src/lib/medical-files.ts`
  - ใช้ร่วมใน pending/history/HR/manager calendar APIs เพื่อรองรับทั้ง `/uploads/medical/...`, `/api/files/medical/...`, absolute URL และ filename เดี่ยว
- [x] **Login Copy + NextAuth Configuration Error UX**
  - เปลี่ยน copy หน้า login เป็น `ชื่อผู้ใช้` / `กรอกชื่อ AD หรือรหัสพนักงาน`
  - เพิ่ม error mapping เพื่อไม่ให้ผู้ใช้เห็น error ดิบแบบ `ConfigurationConfiguration`

### ✅ Phase 12: HIP CMiF68S Attendance Sync (18 มิ.ย. 2026)
- [x] **Database Migration** - เพิ่ม `AttendanceDevices`, `AttendanceLogs`, `AttendanceSyncRuns` ใน `database/migrations/add_attendance_tables.sql`
- [x] **HIP Custom Protocol** - ดึงข้อมูลจากเครื่อง HIP CMiF68S ผ่าน TCP โดยตรง ไม่ใช้ `node-zklib`
  - เช็คจำนวนใหม่ด้วย `cmd 0xB4 / field4=6`
  - ถ้าจำนวนใหม่ไม่เกิน 50 records ใช้ `cmd 0xA1`
  - ถ้าจำนวนใหม่เกิน 50 records ใช้ `cmd 0xB4 / field4=8` เปิด attendance table แล้ววน `cmd 0xA4` ทุก page, concat `blob[2:-4]` ทุก page ก่อน decode ทีละ 20 bytes เพื่อรองรับ record ที่คร่อม page
  - ไม่ส่ง `cmd 0xA2` ใน incremental/backfill ปัจจุบัน; ระบบใช้ unique key ใน DB เพื่อ dedupe records ที่อ่านซ้ำ
  - Decode เป็น `recordTime`, `rawRecordTime`, `userKey`, `verifyType`, `verifyCode`, `yearCode`, `recordHex`
- [x] **Incremental Sync Service** - sync เฉพาะ record ใหม่, มี lock กัน sync ซ้อน, timeout/retry, transaction + dedupe ใน DB และไม่ confirm เครื่อง (`confirmedCount=0` โดยตั้งใจ)
- [x] **Backfill Attendance History** - เพิ่ม `BACKFILL` mode สำหรับดึงประวัติทั้งหมดจากเครื่องด้วย `A4` ทุก page, insert แบบ dedupe batch, และไม่ส่ง `A2`
- [x] **System Admin UI** (`/admin/attendance-devices`) - เพิ่ม/แก้ไขเครื่อง, ตั้งสาขา, IP, port, pass, ความถี่ sync, test connection, sync now, ดูประวัติ sync
- [x] **Cron Endpoint** - `POST /api/cron/attendance-sync` ใช้ `x-cron-secret` header และเลือกเฉพาะเครื่องที่ถึงรอบ sync
- [x] **Employee UI** (`/attendance`) - พนักงานดูเวลาเข้า/ออกของตัวเองเป็นเดือนหรือช่วงวันที่ และ filter เวลาเข้าเกินค่าที่ระบุ เช่น `08:45`
- [x] **Dashboard Card** - เพิ่ม compact status strip เวลาเข้า-ออกวันนี้ โดยแสดงเฉพาะ `เวลาเข้า` และ `เวลาออก` เพื่อไม่กินพื้นที่ first screen
- [x] **Admin Datetime Display Fix** - หน้า `/admin/attendance-devices` แสดง `Started`, `lastSyncAt`, `nextSyncAt` เป็น local datetime string จาก SQL (`CONVERT(varchar(19), ..., 126)`) เพื่อป้องกัน browser แปลง `DATETIME2` เป็น UTC แล้วบวกเวลา +7 ชั่วโมงซ้ำ
- [x] **Deployment Docs** - อัปเดต `DEPLOYMENT.md` ให้ตรงกับ port `3002`, env Azure AD ชุด `AZURE_AD_*`, migration attendance, cron attendance sync, และ no-confirm/read-only behavior
- [x] **Tests** - `tests/hip-protocol.test.mjs`, `tests/attendance-summary.test.mjs`, `tests/attendance-schedule-rules.test.mjs`, `tests/sync-service.test.mjs`

### 🔲 สิ่งที่ยังรอ (Remaining)
- [ ] LINE Notify Integration (optional)
- [ ] Calendar iCal Export (optional)
- [ ] Final End-to-End Testing
- [ ] Production Deployment

---

## 9. ไฟล์สำคัญ

### 🔑 Core Configuration

| File | Purpose |
|------|---------|
| `src/auth.ts` | NextAuth config, AD/LDAP integration |
| `src/proxy.ts` | Auth guard + RBAC (renamed from middleware.ts) |
| `src/lib/db.ts` | Database connection (Singleton), exports `sql` for transactions |
| `src/lib/ldap.ts` | LDAP/AD connection helper |
| `src/lib/azure-graph.ts` | Azure AD Graph API |
| `src/lib/auth/login-errors.ts` | Map NextAuth login errors เป็นข้อความไทย |
| `src/lib/medical-file-access.ts` | Permission rules สำหรับการเปิดไฟล์ใบรับรองแพทย์ |
| `src/lib/medical-files.ts` | Normalize URL/path ของไฟล์ใบรับรองแพทย์ |
| `src/types/index.ts` | All TypeScript types |
| `src/lib/rate-limiter.ts` | Rate Limiting Logic |
| `.env` | Environment variables |

### 🕒 Attendance / HIP Time Clock

| File | Purpose |
|------|---------|
| `src/lib/attendance/hip-protocol.ts` | Build/decode HIP CMiF68S frames and attendance records |
| `src/lib/attendance/hip-client.ts` | Server-side TCP client สำหรับ B4/A1/A4 commands และ A2 helper ที่ยังไม่เปิดใช้ใน sync ปัจจุบัน |
| `src/lib/attendance/repository.ts` | Database helper สำหรับ devices, logs, sync runs, employee summary |
| `src/lib/attendance/sync-service.ts` | Incremental sync/backfill orchestration: lock, pull, transaction, DB dedupe, no-confirm ต่อเครื่อง |
| `src/app/api/admin/attendance/devices/route.ts` | Admin CRUD สำหรับเครื่องบันทึกเวลา |
| `src/app/api/admin/attendance/devices/[deviceId]/test/route.ts` | Test connection/read new count |
| `src/app/api/admin/attendance/devices/[deviceId]/sync/route.ts` | Manual sync now |
| `src/app/api/admin/attendance/devices/[deviceId]/backfill/route.ts` | Manual backfill ประวัติทั้งหมดจากเครื่อง |
| `src/app/api/admin/attendance/sync-runs/route.ts` | ประวัติ sync runs; ส่ง `startedAt/finishedAt` เป็น SQL local datetime string ห้ามส่ง Date object ตรง ๆ |
| `src/app/api/cron/attendance-sync/route.ts` | Scheduled incremental sync endpoint |
| `src/app/api/attendance/me/route.ts` | Employee attendance history ของ user ปัจจุบัน |
| `src/app/(dashboard)/admin/attendance-devices/page.tsx` | System Admin UI สำหรับเครื่องบันทึกเวลา |
| `src/app/(dashboard)/dashboard/page.tsx` | Dashboard card เวลาเข้า-ออกวันนี้แบบ compact |
| `src/app/(dashboard)/attendance/page.tsx` | Employee UI เวลาเข้า-ออก |
| `database/migrations/add_attendance_tables.sql` | Migration script |
| `tests/hip-protocol.test.mjs` | Protocol/frame/decode tests |
| `tests/attendance-summary.test.mjs` | Attendance summary/filter tests |
| `tests/attendance-schedule-rules.test.mjs` | Schedule-aware period, weekday grace, working Saturday, and non-workday rules |
| `tests/sync-service.test.mjs` | Incremental/backfill orchestration tests รวม no-confirm behavior |

### 🔐 AD Lifecycle Management

| File | Purpose |
|------|---------|
| `api/hr/employees/sync/route.ts` | AD Sync (Local + Azure) |
| `api/admin/archive-users/route.ts` | Archive deleted users > 1 year |
| `api/admin/purge-archived/route.ts` | Permanent delete > 3 years |
| `api/cron/ad-sync/route.ts` | Cron endpoint for scheduled sync |
| `scripts/migrate-ad-lifecycle.ts` | Migration script |
| `scripts/scheduled-ad-sync.ts` | Cron script for Task Scheduler |

### 📊 Year-End Processing

| File | Purpose |
|------|---------|
| `api/hr/year-end/preview/route.ts` | Preview + ตรวจ `isAutoCreated` records |
| `api/hr/year-end/execute/route.ts` | Execute + Carry-over + Snapshot `used` + **SQL Transaction** + enhanced audit log |
| `app/(dashboard)/hr/year-end/page.tsx` | UI + auto-created indicator (banner สีฟ้า) |

### 🔀 Cross-Year Leave

| File | Purpose |
|------|---------|
| `lib/date-utils.ts` | `splitLeaveByYear()` - แยกจำนวนวันลาตามปี |
| `api/leave/request/route.ts` | เช็ค/หักยอดแยกตามปี + auto-create balance + **SQL Transaction** |
| `api/leave/cancel/route.ts` | คืนยอดจาก `LeaveRequestYearSplit` + **SQL Transaction** |
| `api/leave/approve/route.ts` | คืนยอดตอน reject จาก split data + **SQL Transaction** |
| `api/email/action/route.ts` | คืนยอดตอน reject (Magic Link) จาก split data + **SQL Transaction** |
| `database/migrations/add_cross_year_leave_support.sql` | Migration script |

### 🧪 E2E Tests

| File | Purpose |
|------|---------|
| `tests/cross-year-leave.test.ts` | 31 test cases: splitByYear, balance deduction, refund, year-end overwrite, overlap |
| `tests/login-error-message.test.mjs` | ตรวจการ map NextAuth login error เป็นข้อความไทย |
| `tests/medical-file-access.test.mjs` | ตรวจสิทธิ์ owner/manager/HR/Admin/delegate ในการดูไฟล์แนบ |
| `tests/medical-file-url.test.mjs` | ตรวจการ normalize medical certificate URL/path |

### 📥 Bulk Leave Import

| File | Purpose |
|------|---------|
| `api/hr/leave-import/route.ts` | API นำเข้าวันลาจำนวนมาก (validate, balance check, insert) |
| `app/(dashboard)/hr/leave-import/page.tsx` | UI อัพโหลด Excel, Preview, Import |

### 📧 Email Approval System

| File | Purpose |
|------|---------|
| `lib/email.ts` | `sendLeaveRequestEmail()` แจ้ง Manager, `sendLeaveApprovalEmail()` แจ้งพนักงาน |
| `lib/tokens.ts` | สร้าง/ตรวจสอบ JWT Token (7 วัน) |
| `api/email/action/route.ts` | Magic Link Approve/Reject API |
| `app/action/[action]/page.tsx` | UI หน้า Approve/Reject |

**Magic Link Flow:**
1. พนักงานขอลา → ส่งอีเมลหา Manager + Delegate (Magic Link)
2. Manager/Delegate กดปุ่ม Approve/Reject ในอีเมล
3. ระบบตรวจสอบ token และอัพเดทสถานะ
4. **ส่งอีเมลแจ้งพนักงานผลการอนุมัติ** (✅ แสดงสถานะสีเขียว/แดง + เหตุผลถ้าปฏิเสธ)

### 👥 Delegate Approver System

| File | Purpose |
|------|---------|
| `lib/delegate.ts` | Helper functions (4 ฟังก์ชัน) |
| `api/manager/delegates/route.ts` | CRUD API (GET/POST/DELETE) + validation + audit |
| `api/manager/delegates/search/route.ts` | ค้นหา user สำหรับมอบหมาย |
| `api/auth/delegate-check/route.ts` | เช็ค delegate status สำหรับ dynamic sidebar |
| `app/(dashboard)/manager/delegates/page.tsx` | UI จัดการผู้แทน |

**Delegate Flow:**
1. Manager สร้าง delegate → กำหนดคนแทน + ช่วงวันที่
2. พนักงานขอลา → แจ้ง Manager + Delegate ทั้งคู่
3. Delegate เห็นใบลาในหน้า Approvals พร้อม badge "แทน ManagerName"
4. Delegate อนุมัติ/ไม่อนุมัติได้ (ยกเว้นใบลาตัวเอง)

**Environment Variables:**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `JWT_SECRET` (สำหรับ Magic Link Token)

### 📱 PWA (Progressive Web App)

| File | Purpose |
|------|---------|
| `public/manifest.json` | ข้อมูล App (ชื่อ, ไอคอน, สี theme) |
| `public/sw.js` | Service Worker (caching, offline support) |
| `public/icons/icon-192x192.png` | App icon 192x192 |
| `public/icons/icon-512x512.png` | App icon 512x512 |
| `src/app/layout.tsx` | PWA meta tags + SW registration |

**การติดตั้ง:**
- **Android**: Chrome → Menu → "ติดตั้งแอป"
- **iOS**: Safari → Share → "Add to Home Screen"

**⚠️ Middleware Configuration (24 ม.ค. 2026):**
เพื่อให้ PWA ทำงานได้ถูกต้อง ต้อง exclude paths ต่อไปนี้จาก auth middleware:
- `/icons` - PWA Icons
- `/manifest.json` - PWA Manifest
- `/sw.js` - Service Worker

> ⚠️ **หมายเหตุ (12 มี.ค. 2026)**: ไฟล์ใบรับรองแพทย์ยังเก็บที่ `public/uploads/medical/` เหมือนเดิม แต่ serve ผ่าน API route `/api/files/medical/[filename]` แทน static path เพื่อแก้ปัญหา 404 หลัง deploy

ดู config ใน `src/proxy.ts` → `matcher` array

### 📄 Key Components

| File | Purpose |
|------|---------|
| `src/components/layout/sidebar.tsx` | เมนูหลัก (Role-based) |
| `src/components/layout/topbar.tsx` | Header + Notifications + Sound Toggle |
| `src/components/providers.tsx` | SessionProvider wrapper |
| `src/components/ui/Modal.tsx` | Global Modal Component |
| `src/components/ui/Toast.tsx` | Toast Notification Component |
| `src/components/ui/Skeleton.tsx` | Loading Skeleton Component |
| `src/components/ui/ThemeToggle.tsx` | Dark/Light Mode Toggle |
| `src/components/ui/CompanySelect.tsx` | Company Dropdown |
| `src/components/ui/DepartmentCombobox.tsx` | Department Search Combobox |
| `src/components/ui/ManagerSearchSelect.tsx` | Manager Search Select |
| `src/components/ui/SearchableSelect.tsx` | Generic Searchable Select |
| `src/hooks/useNotificationSound.ts` | เสียงแจ้งเตือน (Web Audio API) |
| `src/hooks/useTour.ts` | Interactive Tour Hook (driver.js) |

### 📃 Pages

| Route | File | Description |
|-------|------|-------------|
| `/login` | `app/login/page.tsx` | หน้า Login (+ Biometric) |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Dashboard หลัก |
| `/leave/request` | `app/(dashboard)/leave/request/page.tsx` | ฟอร์มขอลา |
| `/leave/history` | `app/(dashboard)/leave/history/page.tsx` | ประวัติการลา |
| `/holidays` | `app/(dashboard)/holidays/page.tsx` | ดูวันหยุด (Employee) |
| `/attendance` | `app/(dashboard)/attendance/page.tsx` | เวลาเข้า-ออกของพนักงาน |
| `/notifications` | `app/(dashboard)/notifications/page.tsx` | การแจ้งเตือน |
| `/profile` | `app/(dashboard)/profile/page.tsx` | โปรไฟล์ |
| `/approvals` | `app/(dashboard)/approvals/page.tsx` | หน้าอนุมัติ |
| `/manager/overview` | `app/(dashboard)/manager/overview/page.tsx` | ภาพรวมทีม |
| `/manager/calendar` | `app/(dashboard)/manager/calendar/page.tsx` | ปฏิทินวันลาทีม |
| `/manager/team` | `app/(dashboard)/manager/team/page.tsx` | รายชื่อสมาชิกทีม |
| `/hr/overview` | `app/(dashboard)/hr/overview/page.tsx` | ภาพรวม HR |
| `/hr/employees` | `app/(dashboard)/hr/employees/page.tsx` | จัดการพนักงาน |
| `/hr/leaves` | `app/(dashboard)/hr/leaves/page.tsx` | จัดการใบลา (HR) |
| `/hr/holidays` | `app/(dashboard)/hr/holidays/page.tsx` | จัดการวันหยุด |
| `/hr/companies` | `app/(dashboard)/hr/companies/page.tsx` | จัดการบริษัท |
| `/hr/settings` | `app/(dashboard)/hr/settings/page.tsx` | ตั้งค่าโควตาวันลา |
| `/hr/work-schedule` | `app/(dashboard)/hr/work-schedule/page.tsx` | ตารางเวลาทำงาน |
| `/hr/year-end` | `app/(dashboard)/hr/year-end/page.tsx` | ประมวลผลสิ้นปี |
| `/hr/analytics` | `app/(dashboard)/hr/analytics/page.tsx` | วิเคราะห์สถิติ |
| `/hr/reports` | `app/(dashboard)/hr/reports/page.tsx` | รายงาน |
| `/hr/leave-import` | `app/(dashboard)/hr/leave-import/page.tsx` | นำเข้าวันลา (Bulk Import) |
| `/admin/audit-logs` | `app/(dashboard)/admin/audit-logs/page.tsx` | Audit Logs |
| `/admin/attendance-devices` | `app/(dashboard)/admin/attendance-devices/page.tsx` | เครื่องบันทึกเวลา |
| `/admin/auth-settings` | `app/(dashboard)/admin/auth-settings/page.tsx` | ตั้งค่า Auth Mode |
| `/admin/rate-limit` | `app/(dashboard)/admin/rate-limit/page.tsx` | Rate Limiting |
| `/admin/user-lifecycle` | `app/(dashboard)/admin/user-lifecycle/page.tsx` | Archive/Purge AD Users |

---

## 10. Business Rules

### ประเภทการลา (9 ประเภท):
| Type | ชื่อ | สิทธิ์/ปี | เงื่อนไข |
|------|------|----------|----------|
| VACATION | พักร้อน | 6 วัน | ผ่านทดลองงานจริง + `VACATION_AFTER_PROBATION_YEARS`, `LEAVE_ADVANCE_DAYS` รองรับค่าติดลบเพื่ออนุญาตย้อนหลัง |
| SICK | ลาป่วย | 30 วัน | >= 3 วัน ต้องมีใบแพทย์ |
| PERSONAL | ลากิจ | 10 วัน | - |
| MATERNITY | ลาคลอด | 120 วัน | ผู้หญิงเท่านั้น |
| MILITARY | เกณฑ์ทหาร | 60 วัน | ผู้ชายเท่านั้น |
| ORDINATION | ลาบวช | 30 วัน | ทำงานครบ 2 ปีขึ้นไป |
| STERILIZATION | ทำหมัน | 30 วัน | ต้องมีใบแพทย์ |
| TRAINING | ฝึกอบรม | 30 วัน | - |
| OTHER | อื่นๆ | ไม่จำกัด | ไม่หักโควตา |

### Approval Flow:
1. พนักงานยื่นใบลา → สถานะ `PENDING`
2. หัวหน้าตรงอนุมัติ → สถานะ `APPROVED`
3. หัวหน้าไม่อนุมัติ → สถานะ `REJECTED` + เหตุผล
4. พนักงานยกเลิกเอง → สถานะ `CANCELLED` (เฉพาะ PENDING)

### Working Days Calculation:
- หักวันเสาร์-อาทิตย์อัตโนมัติ
- หักวันหยุดนักขัตฤกษ์ (จาก PublicHolidays table)
- Half-day = 0.5 วัน

### Cross-Year Leave (ลาข้ามปี):
- ใบลาที่ข้ามปีงบประมาณ (`LEAVE_YEAR_START`) จะถูกแยกหักยอดแต่ละปีอัตโนมัติ
- ตัวอย่างถ้าปีงบเริ่ม 01-01: ลา 28 ธ.ค. 2026 - 4 ม.ค. 2027 → หัก 2 วันจากปี 2026, หัก 2 วันจากปี 2027
- ตัวอย่างถ้าปีงบเริ่ม 04-01: ลา 30 มี.ค. 2026 - 3 เม.ย. 2026 → แยกหักปีงบ 2025/2026 ตามวันทำงานจริง
- ถ้ายอดปีใหม่ยังไม่มี ระบบ auto-create ให้ (flag `isAutoCreated = 1`)
- เมื่อ Year-End processing ทำ → auto-overwrite ยอดที่ auto-create + เก็บ `used` เดิมไว้
- ยกเลิก/ปฏิเสธใบลาข้ามปี → คืนยอดถูกปีทุกกรณี (จาก `LeaveRequestYearSplit`)

### Vacation Carry-Over:
- ตั้งค่าได้ที่ `/hr/settings` กลุ่ม `ปีงบประมาณ` ผ่าน `LEAVE_CARRYOVER_LIMIT`
- ยกยอดพักร้อนได้เฉพาะเมื่อพนักงานมีสิทธิ์พักร้อนในปีงบต้นทาง
- ปีงบปลายทางจะได้สิทธิ์พักร้อนเต็ม `LEAVE_QUOTA_VACATION` เมื่อ eligible date อยู่ในปีงบนั้น ไม่มี prorate

### Attendance / HIP CMiF68S:
- เมนูตั้งค่าอยู่ที่ System Admin → `เครื่องบันทึกเวลา` (`/admin/attendance-devices`)
- ระบบเชื่อมต่อเครื่องจาก server-side เท่านั้น ผ่าน TCP/IP; ห้ามใช้ `node-zklib` กับรุ่น HIP CMiF68S นี้
- Incremental sync ใช้ flow หลักแบบ no-confirm/read-only ต่อเครื่อง: `B4 field4=6` เช็คจำนวนใหม่ → อ่าน records → บันทึก DB ใน transaction พร้อม dedupe → จบ sync โดยไม่ส่ง `A2`
- ถ้า `newCount <= 50` อ่านด้วย `A1`; ถ้า `newCount > 50` อ่านด้วย full-table fallback (`B4 field4=8` + วน `A4` ทุก page) เพราะ `A1` จำนวนมาก timeout และ `A4` 1 page มีได้ประมาณ 50 records เท่านั้น
- สำหรับ `A4`: ต้อง concat payload ของทุก page (`blob[2:-4]`) ก่อน decode ทีละ 20 bytes ห้าม decode แยก page เพราะ record อาจคร่อม page
- `confirmedCount=0` เป็นพฤติกรรมปกติของ sync ปัจจุบัน เพราะระบบไม่ mark/clear queue บนเครื่อง
- เมื่อไม่ส่ง `A2` ค่า `B4 field4=6` บนเครื่องอาจคงเดิมหรือเพิ่มขึ้นตาม log ใหม่; รอบถัดไปจะอ่านซ้ำได้ แต่ `AttendanceLogs` มี unique dedupe key ป้องกัน DB ซ้ำ
- Backfill ใช้ `BACKFILL` mode เพื่ออ่าน log ทั้งหมด (`B4 field4=8` + `A4` ทุก page) และไม่ส่ง `A2`; ใช้สำหรับรอบแรกหรือเมื่อต้องการเติมประวัติย้อนหลังทั้งหมด
- `AttendanceLogs` มี unique dedupe key ป้องกันข้อมูลซ้ำเมื่อ retry
- หน้า Employee (`/attendance`) แสดงเฉพาะ `วันที่`, `เวลาเข้า`, `เวลาออก` ของตัวเอง พร้อม filter เดือน/ช่วงวันที่/เวลาเข้าเกินค่าที่ระบุ
- หน้า Dashboard (`/dashboard`) แสดงเวลาเข้า-ออกวันนี้เป็น compact status strip เพื่อลดพื้นที่บน first screen
- หน้า System Admin → `เครื่องบันทึกเวลา` ต้องแสดงเวลา sync (`Started`, `lastSyncAt`, `nextSyncAt`) จาก local datetime string (`YYYY-MM-DDTHH:mm:ss`) ไม่ใช่ ISO string ที่ลงท้าย `Z`
- เวอร์ชันนี้ใช้ `HIP user_key = Users.employeeId` เป็นเงื่อนไข mapping พนักงาน; ก่อนเปิดใช้จริงต้องตรวจว่าเลขบนเครื่อง HIP ตรงกับรหัสพนักงานในระบบ หากไม่ตรงให้เพิ่ม mapping table/UI เป็นงานถัดไปก่อน sync production
- เวอร์ชันนี้ยังไม่คำนวณกะ, ชั่วโมงทำงาน, สาย, ออกก่อน หรือสถานะทำงาน เพื่อไม่กระทบ module อื่น

### Attendance UI Schedule Rules

- Employee `/attendance` reads workday timing from HR/Admin -> `ตั้งค่าเวลาทำงาน`.
- Normal workdays use `WORK_START_TIME + WORKDAY_LATE_GRACE_MINUTES` for late highlighting.
- Working Saturdays come from `WorkingSaturdays`; Saturday has no late grace and uses that row's `startTime` directly.
- Non-working Saturdays and Sundays can display HIP scans but are not counted as late or incomplete workday problems.
- Attendance calculation periods use `ATTENDANCE_PERIOD_START_DAY`, default `21`, so the normal monthly period is previous-month day 21 through selected-month day 20.

### Timezone:
- ระบบใช้ `Asia/Bangkok (UTC+7)`
- แสดงเวลาแบบ 24 ชั่วโมง
- ค่าจาก SQL Server ที่เป็น `DATETIME2` และบันทึกด้วย `GETDATE()` เป็น local server time; API สำหรับหน้า admin attendance ต้อง `CONVERT(varchar(19), ..., 126)` ก่อนส่ง JSON เพื่อไม่ให้ JavaScript `Date` ตีความเป็น UTC และแสดงเวลาเพี้ยน

---

## 11. Developer Guidelines

### 🚀 Production Notes: Attendance Sync
1. Backup production database ก่อนรัน migration ทุกครั้ง
2. รัน `database/migrations/add_attendance_tables.sql` บน production database ก่อนเปิดเมนู/cron เครื่องบันทึกเวลา
3. ตั้ง `CRON_SECRET` ใน `.env` production และตั้ง Task Scheduler ให้เรียก:
   ```powershell
   Invoke-WebRequest -Method POST -Uri "https://<domain>/api/cron/attendance-sync" -Headers @{ "x-cron-secret" = "<CRON_SECRET>" }
   ```
4. เข้า System Admin → `เครื่องบันทึกเวลา` เพื่อเปิดใช้งานเครื่อง, ตั้งสาขา, IP, port, pass และความถี่ sync
5. กด `ทดสอบ` ก่อน `Sync now` ทุกครั้งหลังแก้ IP/port/pass
6. ตรวจว่า `user_key` บนเครื่อง HIP ตรงกับ `Users.employeeId` ในระบบก่อนเปิด sync; ถ้าเลขไม่ตรง ข้อมูลจะไม่แสดงในหน้า Employee จนกว่าจะมี mapping layer
7. Sync ครั้งแรกของ incremental endpoint จะดึงเฉพาะ records ที่เครื่องนับเป็น "new" ตาม protocol; หาก `newCount > 50` ระบบจะอ่าน full attendance table ผ่าน `A4` แล้วเลือก records ล่าสุดตามเวลาให้เท่ากับ `newCount`
8. ใช้ปุ่ม `Backfill ประวัติทั้งหมด` ที่ `/admin/attendance-devices` เมื่อเริ่มใช้งานครั้งแรกเพื่อดึง log ทั้งหมดจากเครื่องเข้า DB; backfill ไม่ส่ง `A2` และจะ dedupe records ที่เคยมีแล้ว
9. เนื่องจาก incremental sync ไม่ส่ง `A2`, ค่า new queue บนเครื่องอาจไม่ลดลงหลัง sync; นี่เป็น expected behavior ของเวอร์ชันนี้ และ DB dedupe จะกันข้อมูลซ้ำ แต่ควรตั้งความถี่ cron ให้เหมาะสมเพื่อลดการอ่านซ้ำจำนวนมาก
10. ไม่ควรรัน cron ซ้อนกันหลายเครื่อง scheduler; ระบบมี lock ใน DB แต่ควรตั้ง scheduler ให้มีตัวเดียวต่อ environment
11. Deployment guide หลักอยู่ที่ `DEPLOYMENT.md`; ตัวอย่าง cron ใช้ `<CRON_SECRET>` placeholder และ app production start/proxy ใช้ port `3002`

### 🛠️ Modal & Popup Positioning (Frontend)
หากพบปัญหา **Modal เด้งอยู่ข้างล่าง** หรือไม่อยู่กึ่งกลางหน้าจอ สาเหตุเกิดจาก `transform` property ใน class `animate-fade-in` ของ Parent Container ทำให้ `fixed` positioning ทำงานผิดพลาด

**วิธีแก้ไข:**
1.  **ย้าย Modal ออกนอก `animate-fade-in`**: ให้ Modal เป็น Sibling กับ Container หลัก
2.  **ใช้ Structure นี้เสมอ**:
    ```tsx
    return (
      <>
        <div className="animate-fade-in">
           {/* Page Content */}
        </div>

        {/* Modal อยู่นอกนี้ */}
        {isOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl">
                 {/* Modal Content */}
              </div>
           </div>
        )}
      </>
    )
    ```

---

## 📞 Contact

หากมีคำถามเพิ่มเติม ติดต่อ:
- **Project Owner**: [ใส่ชื่อ]
- **Backend Dev**: [ใส่ชื่อ]
- **Frontend Dev**: [ใส่ชื่อ]

---

> 📝 อัปเดตเอกสารนี้เมื่อมีการเปลี่ยนแปลงสำคัญ
