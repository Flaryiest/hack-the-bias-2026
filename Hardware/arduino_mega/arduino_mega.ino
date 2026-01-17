//mega motor controller
//receive from ESP32-CAM via Serial

const int MOTOR_PINS[8] = {2, 3, 4, 5, 6, 7, 8, 9};  
const int NUM_MOTORS = 8;

void setup() {
  Serial.begin(115200);  
  
  //initialize motor pins
  for (int i = 0; i < NUM_MOTORS; i++) {
    pinMode(MOTOR_PINS[i], OUTPUT);
    analogWrite(MOTOR_PINS[i], 0);  //start off
  }
  
  Serial.println("MEGA_READY");
}

void loop() {
  //read from ESP32-CAM
  if (Serial.available() >= 10) {  //wait until full 10-byte packet
    uint8_t packet[10];
    Serial.readBytes(packet, 10);
    
    uint8_t command = packet[0];
    uint8_t motorMask = packet[1];
    
    switch(command) {
      case 0x01:  //intensity setting
        setMotorIntensities(motorMask, &packet[2]);
        Serial.println("OK MOTORS_SET");
        break;
      case 0x03:  
        stopAllMotors();
        Serial.println("OK MOTORS_STOP");
        break;
      default:
        Serial.println("ERR UNKNOWN_CMD");
    }
  }
}

void setMotorIntensities(uint8_t mask, uint8_t* intensities) {
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (mask & (1 << i)) {
      analogWrite(MOTOR_PINS[i], intensities[i]);
    }
  }
}

void stopAllMotors() {
  for (int i = 0; i < NUM_MOTORS; i++) {
    analogWrite(MOTOR_PINS[i], 0);
  }
}