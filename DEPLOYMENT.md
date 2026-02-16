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
PORT=3000
DB_SERVER=your-db-server-ip
DB_PORT=1433
DB_NAME=HRLeave
DB_USER=sa
DB_PASSWORD=your-complex-password
NEXTAUTH_SECRET=your-random-generated-secret-key
NEXTAUTH_URL=http://your-server-ip-or-domain
TZ=Asia/Bangkok

# === AD/LDAP Sync Configuration ===
# Local LDAP (On-premises AD)
LDAP_URL=ldap://your-ad-server.domain.com
LDAP_BASE_DN=DC=domain,DC=com
LDAP_BIND_DN=CN=ServiceAccount,OU=ServiceAccounts,DC=domain,DC=com
LDAP_BIND_PASSWORD=your-ldap-password
LDAP_USER_FILTER=(objectClass=user)

# Azure AD (Microsoft Entra ID)
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret

# Scheduled AD Sync
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

เพื่อให้เข้าผ่าน Port 80 (HTTP) แทนที่จะเป็น 3000

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
        proxy_pass http://localhost:3000;
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

# 3. Build ใหม่
npm run build

# 4. Restart PM2
pm2 restart hr-leave
```

---

## 🔄 ตั้งค่า AD Sync (Active Directory)

### วิธีที่ 1: ใช้ Cron + curl (แนะนำ)

**ทดสอบก่อน:**
```bash
curl -X POST http://localhost:3002/api/cron/ad-sync \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: default-cron-secret-change-me" \
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
0 6 * * * curl -s -X POST http://localhost:3002/api/cron/ad-sync -H "Content-Type: application/json" -H "x-cron-secret: default-cron-secret-change-me" -d '{"source":"ldap"}' >> /var/log/hr-adsync.log 2>&1
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
  -H "x-cron-secret: default-cron-secret-change-me" \
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

## 🧹 ตั้งค่า Audit Log Cleanup (Retention 12 เดือน)

ลบ Audit Logs ที่เก่ากว่า 12 เดือนอัตโนมัติ เพื่อไม่ให้ DB โตเกินไป

### ทดสอบก่อน:
```bash
curl -X POST http://localhost:3000/api/cron/audit-cleanup \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

ผลลัพธ์:
```json
{"success":true,"message":"Cleaned up 0 audit log records older than 12 months","deleted":0}
```

### ตั้ง Cron Job (ทุกเดือนวันที่ 1 เวลา 02:00):

**Linux:**
```bash
crontab -e
```

เพิ่มบรรทัด:
```
0 2 1 * * curl -s -X POST http://localhost:3000/api/cron/audit-cleanup -H "x-cron-secret: YOUR_CRON_SECRET" >> /var/log/hr-audit-cleanup.log 2>&1
```

**Windows (Task Scheduler):**
```
schtasks /create /tn "HR Audit Cleanup" /tr "curl -s -X POST http://localhost:3000/api/cron/audit-cleanup -H \"x-cron-secret: YOUR_CRON_SECRET\"" /sc monthly /d 1 /st 02:00
```

---

## 📊 Azure AD App Registration

หากใช้ Azure AD ต้องสร้าง App Registration ใน Azure Portal:

1. ไปที่ **Azure Portal** → **Microsoft Entra ID** → **App Registrations**
2. กด **New Registration** → ตั้งชื่อ (เช่น HR Leave Sync)
3. หลังสร้างเสร็จ จดค่า:
   - **Application (client) ID** → `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_TENANT_ID`
4. ไปที่ **Certificates & secrets** → **New client secret** → จดค่า → `AZURE_CLIENT_SECRET`
5. ไปที่ **API permissions** → **Add permission** → **Microsoft Graph** → **Application permissions**:
   - `User.Read.All`
   - `Directory.Read.All`
6. กด **Grant admin consent**
