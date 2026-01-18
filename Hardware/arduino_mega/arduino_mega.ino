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

void setup() {
  Serial.begin(115200);  // default serial port

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

  updateMotors(millis());
}

void parseCommand(String cmd) {
  // motorX_freq=Y
  if (cmd.indexOf("_freq=") > -1) {
    int motorNum = cmd.charAt(5) - '0';
    int eqIndex = cmd.indexOf('=');
    int freq = cmd.substring(eqIndex + 1).toInt();

    if (motorNum >= 1 && motorNum <= NUM_MOTORS && freq > 0) {
      motors[motorNum - 1].frequency = freq;
    }
    return;
  }

  // motorX_on
  if (cmd.indexOf("_on") > -1) {
    int motorNum = cmd.charAt(5) - '0';
    if (motorNum >= 1 && motorNum <= NUM_MOTORS) {
      motors[motorNum - 1].enabled = true;
      motors[motorNum - 1].lastToggleTime = millis();
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
    return;
  }
}

void updateMotors(unsigned long currentTime) {
  for (int i = 0; i < NUM_MOTORS; i++) {
    if (!motors[i].enabled) continue;

    unsigned long halfPeriod = 500 / motors[i].frequency;

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
