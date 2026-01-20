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
