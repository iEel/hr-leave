# HR Leave Management System - Developer Handoff Documentation

> 📅 เอกสารนี้สร้างเมื่อ: 21 มกราคม 2026  
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

### Features หลัก:
- ✅ Login ด้วยรหัสพนักงาน
- ✅ Dashboard แสดงยอดวันลาคงเหลือ
- ✅ ยื่นคำขอลา (8 ประเภท)
- ✅ ดูประวัติการลา + ยกเลิกใบลา
- ✅ หัวหน้าอนุมัติ/ไม่อนุมัติ
- ✅ HR จัดการพนักงาน
- ✅ จัดการวันหยุด
- ✅ System Security (Rate Limiting)
- 🔲 Reports & Analytics

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
| Icons | Lucide React |
| Date Utils | date-fns, date-fns-tz |
| Charts | Recharts (ติดตั้งแล้ว ยังไม่ใช้) |
| Excel | xlsx (ติดตั้งแล้ว ยังไม่ใช้) |

---

## 3. โครงสร้างโปรเจกต์

```
hr-leave/
├── database/
│   └── schema.sql              # SQL Script สร้าง Tables
├── src/
│   ├── app/
│   │   ├── (dashboard)/        # Group สำหรับหน้าที่ต้อง Login
│   │   │   ├── layout.tsx      # Layout มี Sidebar + Topbar
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── leave/
│   │   │   │   ├── request/page.tsx   # ฟอร์มขอลา
│   │   │   │   └── history/page.tsx   # ประวัติการลา
│   │   │   ├── profile/page.tsx
│   │   │   └── approvals/page.tsx     # หน้าอนุมัติ (Manager)
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── [...nextauth]/route.ts  # NextAuth handler
│   │   │   │   └── verify/route.ts         # ตรวจสอบ credentials
│   │   │   └── test-db/route.ts            # ทดสอบ DB connection
│   │   ├── login/page.tsx
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Home (redirect)
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx     # เมนูด้านข้าง (Role-based)
│   │   │   └── topbar.tsx      # ส่วนบน + กระดิ่ง
│   │   └── providers.tsx       # SessionProvider
│   ├── lib/
│   │   ├── db.ts               # Database connection helper
│   │   └── date-utils.ts       # Timezone, Working days calc
│   ├── types/
│   │   └── index.ts            # TypeScript types & enums
│   ├── auth.ts                 # NextAuth configuration
│   └── middleware.ts           # Auth + RBAC protection
├── .env                        # Environment variables
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
4. อัปเดต Password Admin:
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
```

### 4.5 Run Development
```bash
npm run dev
```
เปิด: `http://localhost:3002`

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
| `LeaveBalances` | ยอดวันลาคงเหลือต่อปี |
| `PublicHolidays` | วันหยุดประเพณี/พิเศษ |
| `Notifications` | การแจ้งเตือน |
| `AuditLogs` | บันทึกกิจกรรม |
| `LeaveQuotaSettings` | ตั้งค่าโควตาวันลา |
| `DelegateApprovers` | ผู้รักษาการแทน |
| `SystemSettings` | ตั้งค่าระบบ (เช่น Rate Limits) |

### Key Columns ใน LeaveRequests:
- `timeSlot`: FULL_DAY, HALF_MORNING, HALF_AFTERNOON
- `usageAmount`: จำนวนวันสุทธิ (หลังหักวันหยุด)
- `status`: PENDING, APPROVED, REJECTED, CANCELLED
- `rejectionReason`: เหตุผลที่ไม่อนุมัติ

---

## 6. Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Login Page
    participant NextAuth
    participant /api/auth/verify
    participant Database

    User->>Login Page: Enter employeeId + password
    Login Page->>NextAuth: signIn('credentials', {...})
    NextAuth->>NextAuth: authorize() callback
    NextAuth-->/api/auth/verify: POST {employeeId, password}
    /api/auth/verify->>Database: Query Users WHERE employeeId = @id
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

### RBAC (middleware.ts):
| Route | Allowed Roles |
|-------|---------------|
| `/hr/*` | HR, ADMIN |
| `/approvals/*` | MANAGER, HR, ADMIN |
| `/department/*` | MANAGER, HR, ADMIN |

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

---

## 8. สิ่งที่ยังต้องทำ

### 🔲 Phase 4: HR Features
- [x] `/hr/employees` - จัดการพนักงาน (CRUD, Import/Export Excel, LDAP Sync, Edit Gender/StartDate)
- [x] `/hr/holidays` - จัดการวันหยุด (Public, Special per company)
- [x] `/hr/settings` - ตั้งค่าโควตาวันลา (Auto-sync to active balances)
- [ ] `/hr/year-end` - ประมวลผลสิ้นปี (Reset/Carry-over)
- [ ] `/hr/analytics` - Charts, Company comparison
- [ ] `/hr/reports` - ออกรายงาน

### 🔲 Phase 5: API Integration
- [ ] POST `/api/leaves` - สร้างใบลาจริง (ตอนนี้ simulate)
- [ ] GET `/api/leaves/history` - ดึงประวัติจาก DB
- [ ] POST `/api/leaves/:id/approve` - อนุมัติจริง
- [ ] POST `/api/leaves/:id/reject` - ไม่อนุมัติจริง
- [ ] DELETE `/api/leaves/:id` - ยกเลิกใบลา
- [ ] Overlap Check - ตรวจสอบวันซ้ำ
- [ ] Working Days Calculation - หักวันหยุดอัตโนมัติ

### 🔲 Phase 6: Advanced Features
- [ ] Notifications API (แทน hardcoded)
- [ ] File Upload (ใบรับรองแพทย์)
- [ ] Audit Logs - บันทึกทุกกิจกรรม
- [ ] Delegate Approver - มอบหมายคนแทน
- [ ] LINE Notify Integration (optional)
- [ ] Calendar iCal Export (optional)

---

## 9. ไฟล์สำคัญ

### 🔑 Core Configuration

| File | Purpose |
|------|---------|
| `src/auth.ts` | NextAuth config, Demo users fallback |
| `src/middleware.ts` | Auth guard + RBAC |
| `src/lib/db.ts` | Database connection (Singleton) |
| `src/types/index.ts` | All TypeScript types |
| `src/lib/rate-limiter.ts` | Rate Limiting Logic |
| `.env` | Environment variables |

### 📄 Key Components

| File | Purpose |
|------|---------|
| `src/components/layout/sidebar.tsx` | เมนูหลัก (Role-based) |
| `src/components/layout/topbar.tsx` | Header + Notifications |
| `src/components/providers.tsx` | SessionProvider wrapper |

### 📃 Pages

| Route | File | Description |
|-------|------|-------------|
| `/login` | `app/login/page.tsx` | หน้า Login |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Dashboard หลัก |
| `/leave/request` | `app/(dashboard)/leave/request/page.tsx` | ฟอร์มขอลา |
| `/leave/history` | `app/(dashboard)/leave/history/page.tsx` | ประวัติการลา |
| `/profile` | `app/(dashboard)/profile/page.tsx` | โปรไฟล์ |
| `/approvals` | `app/(dashboard)/approvals/page.tsx` | หน้าอนุมัติ |

---

## 10. Business Rules

### ประเภทการลา (8 ประเภท):
| Type | ชื่อ | สิทธิ์/ปี | เงื่อนไข |
|------|------|----------|----------|
| VACATION | พักร้อน | 6 วัน | ทำงานครบ 1 ปีก่อน |
| SICK | ลาป่วย | 30 วัน | >= 3 วัน ต้องมีใบแพทย์ |
| PERSONAL | ลากิจ | 10 วัน | - |
| MATERNITY | ลาคลอด | 120 วัน | ผู้หญิงเท่านั้น |
| MILITARY | เกณฑ์ทหาร | 60 วัน | ผู้ชายเท่านั้น |
| ORDINATION | ลาบวช | 30 วัน | ทำงานครบ 2 ปีขึ้นไป |
| STERILIZATION | ทำหมัน | 30 วัน | ต้องมีใบแพทย์ |
| TRAINING | ฝึกอบรม | 30 วัน | - |

### Approval Flow:
1. พนักงานยื่นใบลา → สถานะ `PENDING`
2. หัวหน้าตรงอนุมัติ → สถานะ `APPROVED`
3. หัวหน้าไม่อนุมัติ → สถานะ `REJECTED` + เหตุผล
4. พนักงานยกเลิกเอง → สถานะ `CANCELLED` (เฉพาะ PENDING)

### Working Days Calculation:
- หักวันเสาร์-อาทิตย์อัตโนมัติ
- หักวันหยุดนักขัตฤกษ์ (จาก PublicHolidays table)
- Half-day = 0.5 วัน

### Timezone:
- ระบบใช้ `Asia/Bangkok (UTC+7)`
- แสดงเวลาแบบ 24 ชั่วโมง

---

## 11. Developer Guidelines

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
