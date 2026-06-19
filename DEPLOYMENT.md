# Deployment Guide (Ubuntu Server)

เอกสารนี้จะสอนวิธีการ Deploy โปรเจกต์ **HR Leave Management System** (Next.js) ขึ้น Server ที่ใช้ระบบปฏิบัติการ **Ubuntu** (20.04 หรือ 22.04 LTS)

---

## 📋 สิ่งที่ต้องเตรียม (Prerequisites)

1.  **Server Ubuntu**: ที่มี Public IP
2.  **Domain Name**: (Optional) ถ้าต้องการใช้ HTTPS/SSL
3.  **SSH Access**: เข้าใช้งาน Server ผ่าน Terminal ได้
4.  **Database**: MS SQL Server ที่เข้าถึงได้จาก Server นี้ (ถ้าใช้ DB แยก)

---

## 🚀 ขั้นตอนการติดตั้ง (Step-by-Step)

### 1. อัปเดต Server และติดตั้งเครื่องมือพื้นฐาน

เข้า SSH ไปที่ Server แล้วรันคำสั่ง:

```bash
# อัปเดต Package lists
sudo apt update && sudo apt upgrade -y

# ติดตั้ง Curl และ Git
sudo apt install -y curl git
```

### 2. ติดตั้ง Node.js (LTS Version)

เราจะใช้ NodeSource เพื่อติดตั้ง Node.js เวอร์ชันล่าสุด (v20 หรือ v22):

```bash
# ดาวน์โหลด Script ติดตั้ง Node.js v20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# ติดตั้ง Node.js
sudo apt install -y nodejs

# ตรวจสอบเวอร์ชัน
node -v
npm -v
```

### 3. Clone โปรเจกต์และติดตั้ง Dependencies

```bash
# ไปที่โฟลเดอร์ home หรือ path ที่ต้องการ
cd /var/www

# สร้างโฟลเดอร์ (ถ้ายังไม่มี) และกำหนดสิทธิ์
sudo mkdir -p hr-leave
sudo chown -R $USER:$USER hr-leave

# Clone git (เปลี่ยน URL เป็น repository ของคุณ)
git clone https://github.com/iEel/hr-leave.git .

# ติดตั้ง Dependencies
npm install
```

### 4. ตั้งค่า Environment Variables

สร้างไฟล์ `.env.local` หรือ `.env.production`:

```bash
nano .env.local
```

ใส่ค่า Config (ปรับแก้ตามจริง):

```env
DB_SERVER=your-db-server-ip
DB_PORT=1433
DB_NAME=HRLeave
DB_USER=sa
DB_PASSWORD=your-complex-password
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
NEXTAUTH_SECRET=your-random-generated-secret-key
NEXTAUTH_URL=https://your-domain.com
TZ=Asia/Bangkok
AUTH_MODE=LOCAL

# === AD/LDAP Sync Configuration ===
# Local LDAP (On-premises AD)
LDAP_URL=ldap://your-ad-server.domain.com
LDAP_DOMAIN=domain.com
LDAP_BASE_DN=DC=domain,DC=com
LDAP_BIND_DN=CN=ServiceAccount,OU=ServiceAccounts,DC=domain,DC=com
LDAP_BIND_PASSWORD=your-ldap-password

# Azure AD (Microsoft Entra ID)
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_CLIENT_SECRET=your-client-secret

# Scheduled jobs: AD Sync, HIP Attendance Sync, Audit Cleanup
CRON_SECRET=your-super-secret-cron-key-32-chars

# Email (SMTP)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=your-smtp-password
JWT_SECRET=your-jwt-secret-for-magic-links
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

*(กด Ctrl+X, กด Y, กด Enter เพื่อบันทึก)*

> หมายเหตุ: script `npm start` ของโปรเจกต์นี้รัน Next.js ที่ port `3002` (`next start -p 3002`) ดังนั้น Nginx และ cron examples ด้านล่างจะยิงไปที่ `localhost:3002`

### 4.1 รัน Database Migrations

ก่อน build/restart production ให้รัน migration ที่ยังไม่ได้ลงบนฐานข้อมูล production เสมอ โดยเฉพาะฟีเจอร์เครื่องบันทึกเวลา:

```bash
# ตัวอย่างรันด้วย sqlcmd จากเครื่องที่เข้าถึง SQL Server ได้
sqlcmd -S your-db-server-ip,1433 -d HRLeave -U sa -P "your-complex-password" -i database/migrations/add_attendance_tables.sql
```

หรือเปิดไฟล์ `database/migrations/add_attendance_tables.sql` ใน SSMS/Azure Data Studio แล้วรันบน production database

หาก production database ยังไม่เคยลง migration อื่น ๆ ให้รันตามลำดับที่อยู่ในโฟลเดอร์ `database/migrations/` ก่อนเปิดใช้งานจริง และควร backup database ก่อนทุกครั้ง

### 5. Build โปรเจกต์

```bash
npm run build
```

*หาก Build ผ่าน จะเห็นโฟลเดอร์ `.next` เกิดขึ้น*

### 6. รันโปรเจกต์ด้วย PM2 (Process Manager)

PM2 จะช่วยรัน App เป็น Background Service และ Restart อัตโนมัติถ้า App ล่ม หรือ Server รีบูต

```bash
# ติดตั้ง PM2 แบบ Global
sudo npm install -g pm2

# รัน Next.js App
pm2 start npm --name "hr-leave" -- start

# ตรวจสอบสถานะ
pm2 status

# สั่งให้ PM2 รันอัตโนมัติเมื่อเปิดเครื่อง
pm2 startup
# (Copy คำสั่งที่แสดงขึ้นมา แล้วรันใน Terminal)
pm2 save
```

### 7. ตั้งค่า Nginx (Reverse Proxy)

เพื่อให้เข้าผ่าน Port 80 (HTTP) แทนที่จะเป็น 3002

```bash
# ติดตั้ง Nginx
sudo apt install -y nginx

# สร้าง Config file
sudo nano /etc/nginx/sites-available/hr-leave
```

ใส่เนื้อหาดังนี้:

```nginx
server {
    listen 80;
    server_name your-domain.com OR_YOUR_IP;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

เปิดใช้งาน Config:

```bash
# Link file
sudo ln -s /etc/nginx/sites-available/hr-leave /etc/nginx/sites-enabled/

# ลบ default config (ถ้าไม่ใช้)
sudo rm /etc/nginx/sites-enabled/default

# ตรวจสอบความถูกต้อง
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 8. ตั้งค่า Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 🔒 การทำ HTTPS (SSL) ฟรีด้วย Certbot (Optional)

ถ้ามี Domain Name สามารถทำ HTTPS ได้ง่ายๆ:

```bash
# ติดตั้ง Certbot
sudo apt install -y certbot python3-certbot-nginx

# ขอ Certificate
sudo certbot --nginx -d your-domain.com
```

---

## 🔄 วิธีอัปเดต Code เมื่อมีการเปลี่ยนแปลง

เมื่อคุณ Push code ใหม่ขึ้น Git แล้ว ต้องการ Deploy ใหม่:

```bash
# 1. Pull code ล่าสุด
git pull

# 2. Install dependencies (เผื่อมีเพิ่ม)
npm install

# 3. รัน database migrations ที่เพิ่มใหม่ (ถ้ามี)
# เช่น database/migrations/add_attendance_tables.sql

# 4. Build ใหม่
npm run build

# 5. Restart PM2
pm2 restart hr-leave
```

---

## 🔄 ตั้งค่า AD Sync (Active Directory)

### วิธีที่ 1: ใช้ Cron + curl (แนะนำ)

**ทดสอบก่อน:**
```bash
curl -X POST http://localhost:3002/api/cron/ad-sync \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: <CRON_SECRET>" \
  -d '{"source":"ldap"}'
```

ผลลัพธ์ที่ควรจะได้:
```json
{"success":true,"summary":{"totalFound":346,"added":0,"updated":346,"markedDeleted":0,"source":"ldap"}}
```

**ตั้ง Cron Job (Sync ทุกวัน 06:00 น.):**
```bash
crontab -e
```

เพิ่มบรรทัด:
```
0 6 * * * curl -s -X POST http://localhost:3002/api/cron/ad-sync -H "Content-Type: application/json" -H "x-cron-secret: <CRON_SECRET>" -d '{"source":"ldap"}' >> /var/log/hr-adsync.log 2>&1
```

**ตรวจสอบว่า Cron ถูกบันทึก:**
```bash
crontab -l
```

**ดู Log:**
```bash
tail -f /var/log/hr-adsync.log
```

### ตัวเลือก Source
| Source | คำอธิบาย |
|--------|---------|
| `ldap` | Local Active Directory (On-premises) |
| `azure` | Azure AD / Microsoft Entra ID |

### ตัวเลือกเวลา Cron
| เวลา | Cron Expression |
|------|-----------------|
| ทุกวัน 06:00 | `0 6 * * *` |
| ทุก 6 ชม. | `0 */6 * * *` |
| ทุกวันจันทร์-ศุกร์ 07:00 | `0 7 * * 1-5` |

### วิธีที่ 2: ใช้ Shell Script (ทางเลือก)

```bash
# สร้าง shell script
sudo mkdir -p /opt/scripts
sudo nano /opt/scripts/ad-sync.sh
```

ใส่เนื้อหา:
```bash
#!/bin/bash
curl -s -X POST http://localhost:3002/api/cron/ad-sync \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: <CRON_SECRET>" \
  -d '{"source":"ldap"}' >> /var/log/hr-adsync.log 2>&1
```

ทำให้ execute ได้:
```bash
sudo chmod +x /opt/scripts/ad-sync.sh

# ตั้ง cron
crontab -e

# เพิ่มบรรทัด
0 6 * * * /opt/scripts/ad-sync.sh
```

---

## 🕒 ตั้งค่า HIP Attendance Sync (เครื่องบันทึกเวลา)

ฟีเจอร์นี้ใช้ดึงเวลาเข้า-ออกจากเครื่อง HIP CMiF68S ผ่าน TCP จากฝั่ง server เท่านั้น

### สิ่งที่ต้องตรวจสอบก่อนเปิดใช้งาน

1. Server ที่รัน Next.js ต้องเชื่อมต่อ IP/Port ของเครื่อง HIP ได้ เช่น `192.168.108.201:5005`
2. ห้ามเปิดเครื่อง HIP ออก Internet โดยตรง ให้เชื่อมผ่าน LAN/VPN/เครือข่ายภายในเท่านั้น
3. รัน migration `database/migrations/add_attendance_tables.sql` แล้ว
4. ตรวจว่า `user_key` บนเครื่อง HIP ตรงกับ `Users.employeeId` ในระบบ ไม่เช่นนั้นข้อมูลจะถูก sync เข้า DB แต่พนักงานจะยังไม่เห็นในหน้า `/attendance`

### ตั้งค่าเครื่องในระบบ

1. Login ด้วย Admin
2. ไปที่ **System Admin → เครื่องบันทึกเวลา** (`/admin/attendance-devices`)
3. เพิ่มหรือแก้ไขเครื่อง:
   - IP Address เช่น `192.168.108.201`
   - Port เช่น `5005`
   - Pass ค่า default ของรุ่นนี้คือ `0`
   - เปิด `Sync อัตโนมัติ`
   - ตั้ง `รอบ Sync` เช่น `30` หรือ `60` นาที
4. กด `ทดสอบ` เพื่อเช็ก connection
5. ใช้ `Backfill ประวัติทั้งหมด` สำหรับรอบแรก เพื่อดึงประวัติทั้งหมดเข้า DB
6. หลังจากนั้นให้ใช้ `Sync now` หรือ cron endpoint สำหรับ incremental sync

### ตั้ง Cron Job สำหรับ Attendance Sync

แนะนำให้ cron เรียก endpoint ทุก `15` นาที แล้วให้ระบบเลือกเฉพาะเครื่องที่ถึงเวลา sync จากค่า `syncFrequencyMinutes` ในหน้า UI

**ทดสอบก่อน:**

```bash
curl -X POST http://localhost:3002/api/cron/attendance-sync \
  -H "x-cron-secret: <CRON_SECRET>"
```

ผลลัพธ์ตัวอย่าง:

```json
{"success":true,"count":1,"results":[{"deviceId":1,"deviceName":"HIP CMiF68S","status":"SUCCESS"}]}
```

**ตั้ง Cron Job (Linux):**

```bash
crontab -e
```

เพิ่มบรรทัด:

```
*/15 * * * * curl -s -X POST http://localhost:3002/api/cron/attendance-sync -H "x-cron-secret: <CRON_SECRET>" >> /var/log/hr-attendance-sync.log 2>&1
```

ดู Log:

```bash
tail -f /var/log/hr-attendance-sync.log
```

**Windows Task Scheduler (ถ้า production ใช้ Windows):**

```powershell
schtasks /create /tn "HR Attendance Sync" /tr "curl -s -X POST http://localhost:3002/api/cron/attendance-sync -H \"x-cron-secret: <CRON_SECRET>\"" /sc minute /mo 15
```

### ข้อควรทราบ

- Sync ปัจจุบันเป็นแบบ no-confirm/read-only ต่อเครื่อง: ระบบไม่ส่ง `A2` เพื่อ clear queue บนเครื่อง
- ค่า new queue บนเครื่องอาจไม่ลดลงหลัง sync ถือเป็น expected behavior
- DB มี unique dedupe key กันข้อมูลซ้ำ จึงอ่านซ้ำได้โดยไม่เพิ่ม record ซ้ำ
- ไม่ควรตั้ง cron ถี่เกินไป เพราะเมื่อไม่ส่ง `A2` ระบบอาจต้องอ่าน pending records ซ้ำจำนวนมาก
- ควรมี scheduler เพียงตัวเดียวต่อ environment แม้ระบบจะมี DB lock กัน sync ซ้อนแล้ว
- ดูผล sync ได้ที่หน้า **System Admin → เครื่องบันทึกเวลา** ในส่วนประวัติ sync

---

## 🧹 ตั้งค่า Audit Log Cleanup (Retention 12 เดือน)

ลบ Audit Logs ที่เก่ากว่า 12 เดือนอัตโนมัติ เพื่อไม่ให้ DB โตเกินไป

### ทดสอบก่อน:
```bash
curl -X POST http://localhost:3002/api/cron/audit-cleanup \
  -H "x-cron-secret: <CRON_SECRET>"
```

ผลลัพธ์:
```json
{"success":true,"message":"No old audit logs to clean up","deleted":0}
```

### ตั้ง Cron Job (ทุกเดือนวันที่ 1 เวลา 02:00):

**Linux:**
```bash
crontab -e
```

เพิ่มบรรทัด:
```
0 2 1 * * curl -s -X POST http://localhost:3002/api/cron/audit-cleanup -H "x-cron-secret: <CRON_SECRET>" >> /var/log/hr-audit-cleanup.log 2>&1
```

**Windows (Task Scheduler):**
```
schtasks /create /tn "HR Audit Cleanup" /tr "curl -s -X POST http://localhost:3002/api/cron/audit-cleanup -H \"x-cron-secret: <CRON_SECRET>\"" /sc monthly /d 1 /st 02:00
```

---

## 📊 Azure AD App Registration

หากใช้ Azure AD ต้องสร้าง App Registration ใน Azure Portal:

1. ไปที่ **Azure Portal** → **Microsoft Entra ID** → **App Registrations**
2. กด **New Registration** → ตั้งชื่อ (เช่น HR Leave Sync)
3. หลังสร้างเสร็จ จดค่า:
   - **Application (client) ID** → `AZURE_AD_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_AD_TENANT_ID`
4. ไปที่ **Certificates & secrets** → **New client secret** → จดค่า → `AZURE_AD_CLIENT_SECRET`
5. ไปที่ **API permissions** → **Add permission** → **Microsoft Graph** → **Application permissions**:
   - `User.Read.All`
   - `Directory.Read.All`
6. กด **Grant admin consent**
