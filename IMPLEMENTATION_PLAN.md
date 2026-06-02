# แผนการพัฒนาระบบลางาน (HR Leave Management)

> 📅 อัปเดตล่าสุด: 9 กุมภาพันธ์ 2026

## 🏁 ระยะที่ 1: ติดตั้งและโครงสร้างหลัก (Project Setup)
| ส่วนประกอบ (Component) | รายละเอียด | สถานะ |
|---------------------|------------|-------|
| **การเริ่มต้นโปรเจค** | Next.js 16, TypeScript, Tailwind CSS v4 | ✅ |
| **ส่วนเสริม (Dependencies)** | `mssql`, `next-auth`, `bcryptjs`, `lucide-react`, `date-fns`, `recharts`, `xlsx` | ✅ |
| **ฐานข้อมูล** | ออกแบบ Schema (Users, LeaveRequests, LeaveBalances, Holidays + 10 ตารางเพิ่มเติม) | ✅ |
| **ระบบยืนยันตัวตน** | NextAuth.js v5 (รหัสพนักงาน/รหัสผ่าน, LDAP, Azure AD, Biometric/WebAuthn) & การแบ่งสิทธิ์ (Role) | ✅ |

---

## 👤 ระยะที่ 2: ฟีเจอร์สำหรับพนักงาน (Employee)
| ส่วนประกอบ | สถานะ |
|------------|-------|
| **หน้าแดชบอร์ด** | ✅ แสดงการ์ดวันลาคงเหลือ, กิจกรรมล่าสุด, และสรุปสถานะ |
| **ระบบขอลางาน** | ✅ ฟอร์มลางาน, ตรวจสอบวันลาชนกัน, เงื่อนไขลาพักร้อนจากวันผ่านทดลองงานจริง + กฎแจ้งล่วงหน้า |
| **ประวัติการลา** | ✅ ดูรายการย้อนหลัง, ยกเลิกใบลาที่ "รออนุมัติ", ตัวกรองสถานะ |
| **โปรไฟล์** | ✅ ดูข้อมูลส่วนตัว, เปลี่ยนรหัสผ่าน |
| **แจ้งเตือน** | ✅ แจ้งเตือนเมื่อใบลาได้รับการอนุมัติ/ปฏิเสธ (UI + เสียง) |
| **วันหยุด** | ✅ ดูรายการวันหยุดประจำปี |

---

## 👔 ระยะที่ 3: ฟีเจอร์สำหรับหัวหน้างาน (Manager)
| ส่วนประกอบ | สถานะ |
|------------|-------|
| **ภาพรวมทีม** | ✅ แดชบอร์ดแสดงคนในทีมและสถานะปัจจุบัน (`/manager/overview`) |
| **การอนุมัติ** | ✅ รายการรออนุมัติ, กดอนุมัติ/ไม่อนุมัติ พร้อมเหตุผล + Magic Link Email |
| **ปฏิทินทีม** | ✅ มุมมองปฏิทินแสดงวันลาของลูกน้องในทีม (`/manager/calendar`) |
| **สมาชิกทีม** | ✅ ดูรายชื่อและข้อมูลวันลาของสมาชิกทีม (`/manager/team`) |
| **มอบหมายผู้แทน** | ✅ สร้าง/ดู/ยกเลิก delegate, dynamic sidebar, แจ้งเตือน delegate (`/manager/delegates`) |
| **การเข้าถึงแผนก** | ✅ กรองดูข้อมูลเฉพาะแผนกที่ดูแลได้ |

---

## 👑 ระยะที่ 4: ฟีเจอร์สำหรับ HR และผู้ดูแลระบบ (HR/Admin)
| ส่วนประกอบ | สถานะ |
|------------|-------|
| **ภาพรวม HR** | ✅ Dashboard สรุปสถานะ HR (`/hr/overview`) |
| **จัดการพนักงาน** | ✅ เพิ่ม/แก้ไข/ปิดใช้งานผู้ใช้, นำเข้า/ส่งออกข้อมูล (Excel), AD Sync |
| **จัดการการลา** | ✅ ดูประวัติการลาทั้งบริษัท, **HR ยกเลิกใบลา (Revoke)** (`/hr/leaves`) |
| **จัดการวันหยุด** | ✅ เพิ่ม/ลบ วันหยุดนักขัตฤกษ์และวันหยุดพิเศษ |
| **จัดการบริษัท** | ✅ Dynamic CRUD บริษัท พร้อม Color Picker (`/hr/companies`) |
| **ตั้งค่าระบบ** | ✅ กำหนดโควตาวันลา, กฎทดลองงาน/ลาพักร้อน, กฎการทบยอดวันลา (Carry-over) |
| **ตารางเวลาทำงาน** | ✅ ตั้งค่าเวลาทำงาน, วันเสาร์ทำงาน (`/hr/work-schedule`) |
| **ประมวลผลสิ้นปี** | ✅ หน้า Preview & Execute เพื่อตัดยอด/เริ่มปีใหม่ |
| **วิเคราะห์ข้อมูล** | ✅ แดชบอร์ดกราฟแสดงสถิติการลา, แนวโน้มต่างๆ (`/hr/analytics`) |
| **รายงาน** | ✅ สรุปรายงานประจำเดือน, ส่งออกเป็น PDF/Excel (`/hr/reports`) |

---

## 🛠 ระยะที่ 5: การปรับปรุงระบบและการตรวจสอบ (System Enhancements)

### 1. ความถูกต้องและเครื่องมือ (Data & Utils)
- [x] **Audit Logging**: บันทึกการกระทำสำคัญกว่า 19 รายการ (Login, Approve, Edit ฯลฯ)
- [x] **Soft Delete**: ใช้การ Deactivate พนักงานแทนการลบถาวร เพื่อเก็บ history
- [x] **Leave Validation**: กฎลาพักร้อนจากวันที่ผ่านทดลองงานจริง + ปีที่ตั้งค่า, แจ้งล่วงหน้าตามระบบ & เช็ควันลาซ้อน
- [x] **Vacation Eligibility Helper**: คำนวณวันผ่านทดลองงานจริง, วันที่เริ่มใช้พักร้อน, และสิทธิ์เต็มปีตามปีงบประมาณ
- [x] **Formatting**: แสดงผลวันลาแบบ "X วัน Y ชม." (เช่น 1 วัน 4 ชม.)
- [x] **AD User Lifecycle**: จัดการผู้ใช้ที่ถูกลบจาก AD (Archive หลัง 1 ปี, Purge หลัง 3 ปี)
- [x] **AD Lifecycle UI**: หน้า `/admin/user-lifecycle` สำหรับ Archive/Purge
- [x] **Scheduled AD Sync**: Cron API + Script สำหรับ Auto Sync ตามเวลา
- [x] **Working Saturdays**: จัดการวันเสาร์ทำงาน + คำนวณวันลาตามสัดส่วนชั่วโมง
- [x] **Weekend/Holiday Validation**: บล็อกการลาวันหยุด (อาทิตย์, เสาร์ไม่ทำงาน, วันหยุดนักขัตฤกษ์)

### 2. ปรับปรุง UI/UX
- [x] **Dark Mode**: รองรับธีมมืด/สว่างทั้งระบบ
- [x] **Mobile Responsive**: รองรับการใช้งานผ่านมือถือ (Sidebar, Tables)
- [x] **PWA Support**: ติดตั้งเป็น App บน Mobile ได้ (manifest.json, Service Worker)
- [x] **Interactive User Guide**: Tour สำหรับพนักงาน + Manager (driver.js)
- [x] **Toast Notifications**: แจ้งเตือน Success/Error แบบ Real-time
- [x] **Notification Sound**: เสียงแจ้งเตือน (Web Audio API)
- [x] **ส่วนประกอบ (Components)**:
    - `Modal`: Global Modal Component
    - `DepartmentCombobox`: เลือก/เพิ่ม แผนกแบบค้นหาได้
    - `CompanySelect`: เลือกบริษัท
    - `ManagerSearchSelect`: ค้นหา Manager (Server-side)
    - `SearchableSelect`: Generic Searchable Select
    - `Skeleton`: แสดงสถานะกำลังโหลด
    - `Toast`: แจ้งเตือน Success/Error แบบสวยงาม
    - `ThemeToggle`: สลับ Dark/Light Mode

### 3. ความปลอดภัย (Security)
- [x] **Rate Limiting**: Token Bucket Algorithm + Admin UI (`/admin/rate-limit`)
- [x] **Biometric Login**: WebAuthn/Passkey (Sentinel Token Pattern)
- [x] **AD User Auth**: บล็อก AD Users ไม่ให้ login ด้วย local password
- [x] **Auth Settings UI**: เปลี่ยน Auth Mode ผ่าน Admin UI (`/admin/auth-settings`)
- [x] **SQL Injection Fix**: Parameterized queries ทุก route

### 4. Email & Communication
- [x] **Email Notifications**: ส่งอีเมลแจ้ง Manager เมื่อมีใบลาใหม่
- [x] **Email Approval Result**: ส่งอีเมลแจ้งพนักงานผลการอนุมัติ
- [x] **Magic Link**: Approve/Reject ใบลาผ่าน Email (JWT Token)

### 5. API และ Backend
- [x] **Endpoints ที่สำคัญ**:
    - `/api/profile`: ดึงข้อมูลผู้ใช้จาก DB
    - `/api/leave/cancel`: ระบบยกเลิกใบลาของ HR
    - `/api/hr/year-end`: ประมวลผลสิ้นปี
    - `/api/hr/employees/import`: นำเข้าข้อมูลพนักงานจำนวนมาก
    - `/api/hr/employees/sync`: Sync ผู้ใช้จาก AD (Local/Azure)
    - `/api/admin/archive-users`: Archive ผู้ใช้ที่ถูกลบ > 1 ปี
    - `/api/admin/purge-archived`: Purge ข้อมูลที่ Archive > 3 ปี
    - `/api/cron/ad-sync`: Cron endpoint สำหรับ Scheduled AD Sync
    - `/api/hr/year-end/preview`: Preview ประมวลผลสิ้นปี
    - `/api/hr/year-end/execute`: Execute ประมวลผลสิ้นปี + Carry-over
    - `/api/leave/vacation-eligibility`: สถานะสิทธิ์พักร้อนของผู้ใช้ปัจจุบัน
    - `/api/hr/work-schedule`: ตั้งค่าเวลาทำงาน
    - `/api/hr/working-saturdays`: จัดการวันเสาร์ทำงาน
    - `/api/working-saturdays/range`: ดึงวันเสาร์ตามช่วงวันที่
    - `/api/email/action`: Magic Link Approve/Reject
    - `/api/auth/mode`: Auth mode query
    - `/api/manager/delegates`: CRUD delegate approvers
    - `/api/manager/delegates/search`: ค้นหา user สำหรับมอบหมาย
    - `/api/auth/delegate-check`: เช็ค delegate status (dynamic sidebar)

---

## 🧪 สถานะการตรวจสอบ (Verification Status)
| ฟีเจอร์ | สถานะ | หมายเหตุ |
|---------|-------|---------|
| **Login/Auth** | ✅ | แยก Role (USER, MANAGER, HR, ADMIN) + Biometric + LDAP/Azure |
| **ขอลางาน** | ✅ | ดักวันหยุด, ตรวจวันชน, คำนวณวันลาถูกต้อง, Working Saturday |
| **การอนุมัติ** | ✅ | หัวหน้าเห็นคำขอของลูกน้อง, Email Magic Link, แจ้งเตือนทำงานถูกต้อง |
| **ผู้อนุมัติแทน** | ✅ | Delegate สร้าง/ยกเลิก/ดูใบลา/อนุมัติได้, dynamic sidebar, self-approval block |
| **ฟีเจอร์ HR** | ✅ | นำเข้า/ส่งออก, ตั้งค่า, ตัดยอดสิ้นปี, Analytics, Reports ทดสอบแล้ว |
| **ความปลอดภัย** | ✅ | Audit Logs บันทึกครบ, รหัสผ่านถูกเข้ารหัส, Rate Limiting |
| **ประสิทธิภาพ** | ✅ | หน้าโหลดเร็ว, มีสถานะ Loading ชัดเจน, PWA |

## 🔲 งานที่เหลือ (Remaining Tasks)
- [x] **Delegate Approver**: ✅ มอบหมายคนแทนอนุมัติ (UI + API + sidebar + notifications ครบ)
- [ ] **LINE Notify Integration**: แจ้งเตือนผ่าน LINE (optional)
- [ ] **Calendar iCal Export**: Export ปฏิทินวันลา (optional)
- [ ] **Final End-to-End Testing**: ทดสอบระบบแบบครบวงจรก่อนใช้งานจริง
- [ ] **Deployment**: ติดตั้งระบบบน Server จริง
