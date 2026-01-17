# Hearless - Tactile Wearable for Accessibility

A wearable neck device that converts environmental sound and visual input into tactile feedback for hearing and visually impaired users.

## 🚀 Quick Start

See [SETUP.md](SETUP.md) for complete installation and setup instructions.

```bash
# 1. Install dependencies
cd api && npm install
cd ../web && npm install

# 2. Setup database and environment
cd api
cp .env.example .env
# Edit .env with your database credentials
npx prisma migrate dev

# 3. Run development servers
# Terminal 1:
cd api && npm run dev

# Terminal 2:
cd web && npm run dev
```

## 🏗️ Architecture

- **Backend API**: Node.js/Express with PostgreSQL (Prisma ORM)
- **Frontend**: React 19 with Vite and React Router v7
- **Hardware**: ESP32-CAM + Arduino Mega with 8 vibration motors
- **Communication**: BLE (Nordic UART Service protocol)

## 📦 Repository Structure

```
├── api/                    # Backend API
│   ├── prisma/            # Database schema and migrations
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Auth middleware
│   │   └── database/      # Database queries
│   └── package.json
├── web/                    # Frontend React app
│   ├── src/
│   │   ├── app/           # App setup and routing
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   └── hooks/         # Custom hooks
│   └── package.json
├── Hardware/              # Embedded systems code
│   ├── esp_cam/           # ESP32-CAM (BLE + Camera)
│   └── arduino_mega/      # Arduino Mega (Motor control)
└── SETUP.md              # Detailed setup guide
```

## 🎯 Features

- ✅ User authentication (JWT-based)
- ✅ BLE communication with wearable device
- ✅ 8-motor directional haptic feedback
- ✅ Camera capture and streaming
- 🔄 Real-time visual/audio processing (in development)

## 📡 Hardware Setup

### Motor Layout
```
     Front (0°)
        [0]
   [7]     [1]
[6]           [2]
   [5]     [3]
      [4]
    Back (180°)
```

### BLE Protocol
- **Device Name**: "Hearless - Bluetooth wearable"
- **Service**: Nordic UART Service (NUS)
- **Commands**: 10-byte binary packets for motor control

## 🧪 Testing

```bash
# Test API
curl http://localhost:8080/api/test

# Test Auth
curl http://localhost:8080/auth/test

# Run BLE scan
python test_ble.py
```

## 🤝 Contributing

This is a hackathon project for Hack the Bias 2026. See [SETUP.md](SETUP.md) for development guidelines.

## 📄 License

[Add your license here]