# Hearless - Complete Setup Guide

## 🎯 Project Overview

Hearless is a wearable tactile feedback device for hearing and visually impaired users. It consists of:
- **Backend API** (Node.js/Express with PostgreSQL)
- **Web Frontend** (React with Vite)
- **Hardware** (ESP32-CAM + Arduino Mega with 8 vibration motors)

---

## 📋 Prerequisites

### Software Requirements
- **Node.js** v18 or higher ([Download](https://nodejs.org/))
- **PostgreSQL** v14 or higher ([Download](https://www.postgresql.org/download/))
- **Arduino IDE** or **PlatformIO** for hardware development
- **Python 3.8+** (for BLE client scripts)
- **Git**

### Hardware Requirements
- ESP32-CAM module
- Arduino Mega 2560
- 8x vibration motors (coin/pancake type)
- Motor driver (L293D or DRV8833)
- Power supply (5V 2A minimum)
- Jumper wires

---

## 🚀 Quick Start (5 Minutes)

### 1. Clone and Install Dependencies

```bash
# Clone the repository
cd hack-the-bias-2026

# Install API dependencies
cd api
npm install

# Install Web dependencies
cd ../web
npm install
```

### 2. Setup Database

```bash
# Create PostgreSQL database
psql -U postgres
CREATE DATABASE hearless_db;
\q

# Configure environment variables
cd api
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Run Database Migrations

```bash
cd api
npx prisma migrate dev
```

### 4. Start Development Servers

**Terminal 1 - API:**
```bash
cd api
npm run dev
# API runs on http://localhost:8080
```

**Terminal 2 - Web:**
```bash
cd web
npm run dev
# Frontend runs on http://localhost:5173
```

---

## 🔧 Detailed Setup

### Backend API Setup

#### 1. Environment Variables

Create `api/.env` file:

```env
DATABASE_URL="postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/hearless_db"
SECRET_KEY="generate-a-random-secret-key-here"
PORT=8080
```

**Generate a secure SECRET_KEY:**
```bash
# Option 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 2: Using OpenSSL
openssl rand -hex 32
```

#### 2. Database Setup

```bash
# Option A: Using psql
psql -U postgres
CREATE DATABASE hearless_db;
CREATE USER hearless_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE hearless_db TO hearless_user;
\q

# Option B: Using pgAdmin
# Create a new database named "hearless_db" via GUI
```

#### 3. Run Migrations

```bash
cd api
npx prisma migrate dev
npx prisma generate
```

#### 4. Verify API

```bash
npm run dev
# Should see: "Server is running on port: 8080"

# Test endpoints
curl http://localhost:8080/api/test
# Response: "API is working properly"

curl http://localhost:8080/auth/test
# Response: "Auth is working properly"
```

---

### Frontend Web Setup

#### 1. Install Dependencies

```bash
cd web
npm install
```

#### 2. Start Development Server

```bash
npm run dev
# Opens on http://localhost:5173
```

#### 3. Build for Production (Optional)

```bash
npm run build
npm run preview
```

---

### Hardware Setup

#### ESP32-CAM Setup

**1. Install Arduino Libraries:**

In Arduino IDE, go to Tools → Manage Libraries, install:
- `Adafruit PWM Servo Driver Library` (for PCA9685)

**2. Board Configuration:**
- Board: "AI Thinker ESP32-CAM"
- Upload Speed: 115200
- Flash Frequency: 80MHz
- Partition Scheme: "Huge APP (3MB No OTA)"

**3. Upload Code:**

```bash
# Open Hardware/esp_cam/esp_cam.ino in Arduino IDE
# Select correct COM port
# Press Upload
```

**4. Wiring:**

```
ESP32-CAM        →  Arduino Mega
TX (GPIO1)       →  RX1 (Pin 19)
RX (GPIO3)       →  TX1 (Pin 18)
GND              →  GND
5V               →  5V (if not powered separately)
```

#### Arduino Mega Setup

**1. Upload Code:**

```bash
# Open Hardware/arduino_mega/arduino_mega.ino
# Select board: Arduino Mega 2560
# Select correct COM port
# Upload
```

**2. Motor Wiring:**

```
Arduino Mega     →  Motor Driver    →  Motor
Pin 2            →  IN1            →  Motor 0 (Front)
Pin 3            →  IN2            →  Motor 1 (Front-Right)
Pin 4            →  IN3            →  Motor 2 (Right)
Pin 5            →  IN4            →  Motor 3 (Back-Right)
Pin 6            →  IN5            →  Motor 4 (Back)
Pin 7            →  IN6            →  Motor 5 (Back-Left)
Pin 8            →  IN7            →  Motor 6 (Left)
Pin 9            →  IN8            →  Motor 7 (Front-Left)

External 5V 2A   →  Motor Power
Arduino GND      →  Motor Driver GND (common ground)
```

---

### Python BLE Client Setup

#### 1. Install Python Dependencies

```bash
pip install bleak asyncio
```

#### 2. Test BLE Connection

Create `test_ble.py`:

```python
import asyncio
from bleak import BleakScanner

async def scan():
    print("Scanning for BLE devices...")
    devices = await BleakScanner.discover()
    for device in devices:
        print(f"Found: {device.name} - {device.address}")
        if "Hearless" in str(device.name):
            print(f"✓ Found Hearless device at {device.address}")

asyncio.run(scan())
```

Run:
```bash
python test_ble.py
```

---

## 🧪 Testing the Complete System

### 1. Hardware Test

**Check ESP32-CAM:**
```bash
# Open Serial Monitor (115200 baud)
# Should see:
# "DIAGNOSTICS SETUP START"
# "DIAGNOSTICS Camera init: OK"
# "DIAGNOSTICS PSRAM found: YES"
```

**Check Arduino Mega:**
```bash
# Open Serial Monitor (115200 baud)
# Should see: "MEGA_READY"
```

### 2. BLE Connection Test

**Using nRF Connect Mobile App:**
1. Scan for devices
2. Find "Hearless - Bluetooth wearable"
3. Connect
4. Find Nordic UART Service (NUS)
5. Send "CAM PING" → Should receive "OK PONG"

### 3. Motor Test

Send 10-byte hex packet via nRF Connect:
```
01 04 00 00 C8 00 00 00 00 00
```
- Motor 2 (right) should vibrate at intensity 200

### 4. API Test

```bash
# Test signup
curl -X POST http://localhost:8080/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","firstName":"Test","lastName":"User"}'

# Test login
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

---

## 🐛 Troubleshooting

### API Issues

**Error: "Can't reach database server"**
```bash
# Check PostgreSQL is running
# Windows: Services → PostgreSQL
# Mac: brew services list
# Linux: systemctl status postgresql

# Verify DATABASE_URL in .env
# Test connection:
psql -U postgres -d hearless_db
```

**Error: "SECRET_KEY is not defined"**
```bash
# Ensure .env file exists in api/ directory
# Verify SECRET_KEY is set
# Restart the server
```

### ESP32-CAM Issues

**"Camera init failed"**
- Check camera ribbon cable connection
- Ensure correct board selected: "AI Thinker ESP32-CAM"
- Try reducing frame size in code

**"Can't find device in BLE scan"**
- Power cycle ESP32-CAM
- Ensure it's not already connected
- Check Serial Monitor for errors
- Reduce distance to phone/laptop

**"Upload failed"**
- Hold BOOT button while uploading
- Disconnect GPIO0 from GND after upload
- Check COM port selection

### Arduino Mega Issues

**"Motors not responding"**
- Check power supply (motors need 5V 2A)
- Verify wiring to motor driver
- Test with multimeter on motor driver outputs
- Check Serial Monitor for received commands

**"Serial communication not working"**
- Verify TX/RX crossover (ESP32 TX → Mega RX)
- Check baud rate matches (115200)
- Ensure common ground

---

## 📦 Production Deployment

### Backend API

```bash
cd api
npm run build
npm run prod
```

**Environment Variables for Production:**
- Use strong SECRET_KEY
- Use production DATABASE_URL
- Set NODE_ENV=production

### Frontend

```bash
cd web
npm run build
# Deploy dist/ folder to hosting (Vercel, Netlify, etc.)
```

---

## 🔗 Useful Commands

### Development
```bash
# Format code
cd api && npm run prettier
cd web && npm run prettier

# Lint code
cd api && npm run lint
cd web && npm run lint

# Reset database
cd api && npm run db:reset
```

### Prisma
```bash
# View database in browser
npx prisma studio

# Create new migration
npx prisma migrate dev --name migration_name

# Reset database
npx prisma migrate reset
```

---

## 📚 API Endpoints Reference

### Authentication
- `POST /auth/signup` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/verify` - Verify JWT token
- `GET /auth/logout` - Logout user

### BLE Commands
- `CAM PING` - Health check (text)
- `CAM SNAP` - Capture image (text)
- `[10 bytes]` - Motor control (binary)

---

## 🎓 Learning Resources

- [ESP32-CAM Guide](https://randomnerdtutorials.com/esp32-cam-video-streaming-face-recognition-arduino-ide/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [React Router v7 Docs](https://reactrouter.com/)
- [BLE Protocol Basics](https://www.bluetooth.com/blog/a-developers-guide-to-bluetooth/)

---

## 👥 Team & Support

For hackathon support, contact your team leads or check the Discord channel.

**Project Status:** Active Development for Hack the Bias 2026

---

## 📝 License

[Add your license here]
