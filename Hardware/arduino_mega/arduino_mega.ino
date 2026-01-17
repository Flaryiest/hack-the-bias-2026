struct Motor {
  int pinA;
  int pinB;
  int frequency;
  bool enabled;
  unsigned long lastToggleTime;
  bool state;
};

Motor motors[3] = {
  {2, 3, 10, false, 0, false},
  {4, 5, 10, false, 0, false},
  {6, 7, 10, false, 0, false}
};

const int NUM_MOTORS = 3;
unsigned long lastUpdateTime = 0;

void setup() {
  Serial.begin(9600);
  
  for (int i = 0; i < NUM_MOTORS; i++) {
    pinMode(motors[i].pinA, OUTPUT);
    pinMode(motors[i].pinB, OUTPUT);
    digitalWrite(motors[i].pinA, LOW);
    digitalWrite(motors[i].pinB, LOW);
  }

}

void loop() {
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    parseCommand(command);
  }
  
  unsigned long currentTime = millis();
  updateMotors(currentTime);
}

void parseCommand(String cmd) {
  if (cmd.indexOf("_freq=") > -1) {
    int motorNum = cmd.charAt(5) - '0';
    int eqIndex = cmd.indexOf('=');
    int freq = cmd.substring(eqIndex + 1).toInt();
    
    if (motorNum >= 1 && motorNum <= NUM_MOTORS && freq > 0) {
      motors[motorNum - 1].frequency = freq;
      Serial.print("Motor ");
      Serial.print(motorNum);
      Serial.print(" frequency set to ");
      Serial.print(freq);
      Serial.println(" Hz");
    }
    return;
  }
  
  // motorX_on
  if (cmd.indexOf("_on") > -1) {
    int motorNum = cmd.charAt(5) - '0';
    if (motorNum >= 1 && motorNum <= NUM_MOTORS) {
      motors[motorNum - 1].enabled = true;
      motors[motorNum - 1].lastToggleTime = millis();
      Serial.print("Motor ");
      Serial.print(motorNum);
      Serial.println(" vibration started");
    }
    return;
  }
  
  // motorX_off
  if (cmd.indexOf("_off") > -1) {
    int motorNum = cmd.charAt(5) - '0';
    if (motorNum >= 1 && motorNum <= NUM_MOTORS) {
      motors[motorNum - 1].enabled = false;
      motors[motorNum - 1].state = false;
      digitalWrite(motors[motorNum - 1].pinA, LOW);
      digitalWrite(motors[motorNum - 1].pinB, LOW);
      Serial.print("Motor ");
      Serial.print(motorNum);
      Serial.println(" stopped");
    }
    return;
  }
  
  // all_off
  if (cmd.equals("all_off")) {
    for (int i = 0; i < NUM_MOTORS; i++) {
      motors[i].enabled = false;
      motors[i].state = false;
      digitalWrite(motors[i].pinA, LOW);
      digitalWrite(motors[i].pinB, LOW);
    }
    Serial.println("All motors stopped");
    return;
  }
}

void updateMotors(unsigned long currentTime) {
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (!motors[i].enabled) {
      continue;
    }
    
    unsigned long halfPeriod = 500 / motors[i].frequency;  // 1000/(2*frequency)
    
    if (currentTime - motors[i].lastToggleTime >= halfPeriod) {
      motors[i].lastToggleTime = currentTime;
      motors[i].state = !motors[i].state;
      
      if (motors[i].state) {
        digitalWrite(motors[i].pinA, HIGH);
        digitalWrite(motors[i].pinB, LOW);
      } else {
        digitalWrite(motors[i].pinA, LOW);
        digitalWrite(motors[i].pinB, HIGH);
      }
    }
  }
}
