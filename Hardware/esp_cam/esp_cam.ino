#include <Arduino.h>
#include "esp_camera.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>


#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

static const char* BLE_DEVICE_NAME = "Hearless - Bluetooth wearable";
static const char* NUS_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
static const char* NUS_RX_UUID      = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";
static const char* NUS_TX_UUID      = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";

BLECharacteristic* txChar = nullptr;
volatile bool bleConnected = false;
volatile bool bleNotifyEnabled = false;

static const uint32_t MEGA_BAUD = 115200;

// ---------- Small helpers ----------
static void bleSendTextLine(const String& s) {
  if (!bleConnected || !bleNotifyEnabled || !txChar) return;
  String msg = "T:" + s + "\n";
  txChar->setValue((uint8_t*)msg.c_str(), msg.length());
  txChar->notify();
}

static void bleSendImage(camera_fb_t* fb) {
  if (!fb) return;
  if (!bleConnected || !bleNotifyEnabled || !txChar) {
    return;
  }

  // Send header
  uint8_t hdr[5];
  hdr[0] = 'I';
  uint32_t len = (uint32_t)fb->len;
  hdr[1] = (uint8_t)(len & 0xFF);
  hdr[2] = (uint8_t)((len >> 8) & 0xFF);
  hdr[3] = (uint8_t)((len >> 16) & 0xFF);
  hdr[4] = (uint8_t)((len >> 24) & 0xFF);

  txChar->setValue(hdr, sizeof(hdr));
  txChar->notify();
  delay(10);

  const size_t CHUNK = 180;

  const uint8_t* p = fb->buf;
  size_t remaining = fb->len;

  while (remaining > 0) {
    size_t n = (remaining > CHUNK) ? CHUNK : remaining;
    txChar->setValue((uint8_t*)p, n);
    txChar->notify();

    p += n;
    remaining -= n;

    delay(3);
  }

  uint8_t endByte = 'E';
  txChar->setValue(&endByte, 1);
  txChar->notify();
}

static bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;

  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;

  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // Default safe values
  config.fb_count = 1;
  config.fb_location = CAMERA_FB_IN_DRAM;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    config.frame_size = FRAMESIZE_QQVGA;
    config.jpeg_quality = 20;
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }
  return true;
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    bleConnected = true;
    bleSendTextLine("OK CONNECTED");
  }
  void onDisconnect(BLEServer* pServer) override {
    bleConnected = false;
    bleNotifyEnabled = false;
    BLEDevice::startAdvertising();
  }
};

class TxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    (void)c;
  }
};

class RxCallbacks : public BLECharacteristicCallbacks {
public:
  void onWrite(BLECharacteristic* c) override {
    
    uint8_t* data = c->getData(); //value
    size_t len = c->getValue().length(); //length
    
    if (len == 0) return;

    if (len == 10) {    //10 bytes of motor command
      Serial.write(data, 10);
      bleSendTextLine("OK MOTOR_CMD_SENT");
      return;
    }
    
    
    String s = c->getValue().c_str();//text commands
    s.trim();
    if (s.length() == 0) return;

    if (s.startsWith("CAM ")) {
      if (s == "CAM PING") {
        bleSendTextLine("OK PONG");
        return;
      }
      if (s == "CAM SNAP") {
        camera_fb_t* fb = esp_camera_fb_get();
        if (!fb || fb->format != PIXFORMAT_JPEG) {
          if (fb) esp_camera_fb_return(fb);
          bleSendTextLine("ERR SNAP_FAIL");
          return;
        }
        bleSendTextLine("OK SNAP");
        bleSendImage(fb);
        esp_camera_fb_return(fb);
        bleSendTextLine("OK SNAP_DONE");
        return;
      }
      
      bleSendTextLine("ERR UNKNOWN_CAM_CMD");
      return;
    }

    // Forward unknown text commands to Mega
    Serial.print(s);
    Serial.print("\n");
  }
};

static void markNotifyEnabled() {
  bleNotifyEnabled = true;
  bleSendTextLine("OK NOTIFY_ON");
}

void setup() {
  // Serial to Mega
  Serial.begin(MEGA_BAUD);
  Serial.println();
  Serial.println("DIAGNOSTICS SETUP START");
  Serial.printf("DIAGNOSTICS Free heap: %u\n", ESP.getFreeHeap());
  Serial.printf("DIAGNOSTICS PSRAM found: %s\n", psramFound() ? "YES" : "NO");
  
  bool camOK = initCamera();

  Serial.printf("DIAGNOSTICS Camera init: %s\n", camOK ? "OK" : "FAIL");

  BLEDevice::setMTU(247);
  BLEDevice::init(BLE_DEVICE_NAME);

  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(NUS_SERVICE_UUID);

  txChar = service->createCharacteristic(
    NUS_TX_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  txChar->addDescriptor(new BLE2902());
  txChar->setCallbacks(new TxCallbacks());

  BLECharacteristic* rxChar = service->createCharacteristic(
    NUS_RX_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  rxChar->setCallbacks(new RxCallbacks());

  service->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE_UUID);
  adv->setScanResponse(true);
  adv->start();

  delay(100);

  if (!camOK) {
  }
}

void loop() {
  static uint32_t t0 = 0;
  if (bleConnected && !bleNotifyEnabled) {
    if (t0 == 0) t0 = millis();
    if (millis() - t0 > 800) {
      markNotifyEnabled();
      bleSendTextLine("OK READY");
      bleSendTextLine(String("OK PSRAM ") + (psramFound() ? "YES" : "NO"));
    }
  }
  if (!bleConnected) t0 = 0;

  static String megaLine;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (megaLine.length()) {
        bleSendTextLine("MEGA " + megaLine);
        megaLine = "";
      }
    } else {
      megaLine += c;
      if (megaLine.length() > 300) {
        bleSendTextLine("MEGA " + megaLine);
        megaLine = "";
      }
    }
  }

  delay(5);
}
