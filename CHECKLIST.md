# Hearless Setup Checklist

Use this checklist to ensure everything is properly configured and running.

## ✅ Initial Setup

### Software Installation
- [ ] Node.js v18+ installed (`node --version`)
- [ ] PostgreSQL installed and running
- [ ] Arduino IDE or PlatformIO installed
- [ ] Python 3.8+ installed (`python --version`)
- [ ] Git installed

### Repository Setup
- [ ] Repository cloned
- [ ] API dependencies installed (`cd api && npm install`)
- [ ] Web dependencies installed (`cd web && npm install`)
- [ ] Python dependencies installed (`pip install -r requirements.txt`)

---

## 🗄️ Database Setup

- [ ] PostgreSQL service is running
- [ ] Database `hearless_db` created
- [ ] `api/.env` file created (copy from `.env.example`)
- [ ] `DATABASE_URL` configured in `.env`
- [ ] `SECRET_KEY` generated and set in `.env`
- [ ] Migrations run (`cd api && npx prisma migrate dev`)
- [ ] Prisma client generated (`npx prisma generate`)

**Test:**
```bash
cd api
npx prisma studio
# Should open database browser at http://localhost:5555
```

---

## 🖥️ Backend API

- [ ] API dependencies installed
- [ ] Environment variables configured
- [ ] Database migrations complete
- [ ] API starts without errors (`npm run dev`)
- [ ] API responds on http://localhost:8080

**Test:**
```bash
# Test 1: Health check
curl http://localhost:8080/api/test
# Expected: "API is working properly"

# Test 2: Auth health check
curl http://localhost:8080/auth/test
# Expected: "Auth is working properly"

# Test 3: Signup
curl -X POST http://localhost:8080/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","firstName":"Test"}'
# Expected: "Successfully signed up user"
```

---

## 🌐 Frontend Web

- [ ] Web dependencies installed
- [ ] Development server starts (`npm run dev`)
- [ ] Frontend loads in browser (http://localhost:5173)
- [ ] No console errors in browser DevTools

**Test:**
```bash
cd web
npm run dev
# Opens http://localhost:5173
# Page should load without errors
```

---

## 🔧 Hardware: ESP32-CAM

### Upload & Configuration
- [ ] Arduino IDE installed
- [ ] ESP32 board support installed
  - File → Preferences → Additional Board Manager URLs:
  - `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
- [ ] Board selected: "AI Thinker ESP32-CAM"
- [ ] Upload speed: 115200
- [ ] Partition scheme: "Huge APP (3MB No OTA)"
- [ ] Adafruit PWM Servo Driver library installed (if using I2C motors)

### Upload Process
- [ ] Correct COM port selected
- [ ] Code uploads successfully to ESP32-CAM
- [ ] No compilation errors

### Testing
- [ ] Serial Monitor open at 115200 baud
- [ ] Sees "DIAGNOSTICS SETUP START"
- [ ] Sees "DIAGNOSTICS Camera init: OK"
- [ ] Sees "DIAGNOSTICS PSRAM found: YES" (or NO is okay)
- [ ] Device advertising as BLE peripheral

**Expected Serial Output:**
```
DIAGNOSTICS SETUP START
DIAGNOSTICS Free heap: 283648
DIAGNOSTICS PSRAM found: YES
DIAGNOSTICS Camera init: OK
```

---

## 🤖 Hardware: Arduino Mega

### Upload & Configuration
- [ ] Arduino Mega board selected
- [ ] Correct COM port selected
- [ ] Code uploads successfully

### Wiring
- [ ] ESP32-CAM TX (GPIO1) → Arduino Mega RX1 (Pin 19)
- [ ] ESP32-CAM RX (GPIO3) → Arduino Mega TX1 (Pin 18)
- [ ] Common GND connected
- [ ] Motor pins wired to driver (Pins 2-9)
- [ ] External 5V power supply for motors
- [ ] Motor driver GND connected to Arduino GND

### Testing
- [ ] Serial Monitor open at 115200 baud (on Mega)
- [ ] Sees "MEGA_READY"
- [ ] Sees motor test sequence
- [ ] Built-in LED (pin 13) lights up

**Expected Serial Output:**
```
MEGA_READY
Waiting for motor commands from ESP32-CAM...
Testing motors...
Testing motor 0
Testing motor 1
...
Motor test complete
```

---

## 📡 BLE Communication

### Mobile App Testing (nRF Connect)
- [ ] nRF Connect app installed on phone
- [ ] Bluetooth enabled on phone
- [ ] Scan finds "Hearless - Bluetooth wearable"
- [ ] Can connect to device
- [ ] Nordic UART Service visible
- [ ] Can write to RX characteristic
- [ ] Can enable TX notifications

### Test Commands
**Text Command Test:**
- [ ] Send "CAM PING" → Receive "OK PONG"
- [ ] Send "CAM SNAP" → Receive "OK SNAP" + image data

**Motor Command Test:**
- [ ] Send hex: `01 04 00 00 C8 00 00 00 00 00`
- [ ] Motor 2 (right) vibrates at intensity 200
- [ ] Arduino Mega Serial shows "OK MOTORS_SET"

---

## 🐍 Python BLE Client

- [ ] Python dependencies installed (`pip install -r requirements.txt`)
- [ ] Can import bleak (`python -c "import bleak"`)
- [ ] test_ble.py runs without errors

**Test:**
```bash
python test_ble.py
# Should find device and run motor tests
```

**Expected Output:**
```
===========================================
  Hearless BLE Motor Control Test
===========================================

Scanning for BLE devices...
✓ Found: Hearless - Bluetooth wearable (XX:XX:XX:XX:XX:XX)

Connecting to XX:XX:XX:XX:XX:XX...
✓ Connected!
✓ Subscribed to notifications

=== Testing Connection ===
→ Sent: CAM PING
← Device: OK PONG
...
```

---

## 🔗 Full System Integration

### All Components Running
- [ ] PostgreSQL database running
- [ ] Backend API running (`cd api && npm run dev`)
- [ ] Frontend web running (`cd web && npm run dev`)
- [ ] ESP32-CAM powered and advertising
- [ ] Arduino Mega powered and ready
- [ ] Serial communication working between ESP32 and Mega

### End-to-End Test
- [ ] BLE client connects to ESP32-CAM
- [ ] Send motor command via BLE
- [ ] ESP32-CAM receives command (see TX notifications)
- [ ] ESP32-CAM forwards to Arduino Mega (see Mega serial)
- [ ] Arduino Mega drives motors
- [ ] Motors vibrate as expected

---

## 🐛 Troubleshooting Quick Reference

### API won't start
```bash
# Check database connection
psql -U postgres -d hearless_db

# Check .env file exists
ls api/.env

# Regenerate Prisma client
cd api && npx prisma generate
```

### ESP32-CAM upload fails
- Hold BOOT button during upload
- Check correct board: "AI Thinker ESP32-CAM"
- Try different USB cable
- Verify COM port

### Arduino Mega not receiving commands
- Check TX/RX wiring (must be crossed)
- Verify both use 115200 baud
- Check common ground
- Monitor both serial outputs simultaneously

### BLE device not found
- Power cycle ESP32-CAM
- Check it's not already connected
- Reduce distance
- Check Serial Monitor for BLE errors

### Motors not working
- Check external power supply (5V 2A minimum)
- Verify motor driver wiring
- Test motor driver outputs with multimeter
- Check Arduino serial for command receipts

---

## 🎯 Ready for Demo?

Final checklist before demo:

- [ ] All services running
- [ ] Can create user account
- [ ] Can login
- [ ] BLE connects reliably
- [ ] All 8 motors working
- [ ] Camera captures images
- [ ] Python client controls motors
- [ ] Team knows the demo flow
- [ ] Backup power sources ready
- [ ] Extra motors/wires available

---

## 📝 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Can't reach database server" | Check PostgreSQL is running, verify DATABASE_URL |
| "SECRET_KEY is not defined" | Create .env file, set SECRET_KEY |
| "Camera init failed" | Check camera cable, reduce frame size |
| "Device not found in BLE scan" | Power cycle, check serial output |
| "Motors not responding" | Check power supply, verify wiring |
| Port already in use (5173) | Kill process or use different port |
| Prisma client errors | Run `npx prisma generate` |

---

## ✨ Success Criteria

You're ready when:

1. ✅ Backend API responds to HTTP requests
2. ✅ Frontend loads in browser
3. ✅ ESP32-CAM advertises and accepts BLE connections
4. ✅ Arduino Mega receives and executes motor commands
5. ✅ Python client can control motors via BLE
6. ✅ All 8 motors vibrate on command

**Total setup time (first run): ~30-45 minutes**
**Setup time (after first run): ~5 minutes**

---

Last updated: January 2026
Project: Hearless - Hack the Bias 2026
