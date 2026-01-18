import { useState, useCallback, useRef } from 'react';
import styles from './motortest.module.css';

interface MotorState {
  on: boolean;
  frequency: number;
}

const MotorTest = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [portName, setPortName] = useState('');
  const [error, setError] = useState('');
  const [motorStatus, setMotorStatus] = useState<{[key: number]: MotorState}>({
    1: {on: false, frequency: 40},
    2: {on: false, frequency: 40},
    3: {on: false, frequency: 40}
  });
  const [log, setLog] = useState<string[]>([]);
  
  const portRef = useRef<any>(null);
  const writerRef = useRef<any>(null);
  const readerRef = useRef<any>(null);

  const addToLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLog(prev => [...prev.slice(-20), `[${timestamp}] ${message}`]);
  }, []);

  const sendCommand = async (command: string): Promise<boolean> => {
    if (!writerRef.current) {
      setError('Not connected to device');
      addToLog(`Cannot send "${command}" - not connected`);
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const commandWithNewline = command.endsWith('\n') ? command : command + '\n';
      await writerRef.current.write(encoder.encode(commandWithNewline));
      console.log('Sent command:', command);
      addToLog(`Sent: ${command}`);
      setError('');
      return true;
    } catch (err) {
      console.error('Error sending command:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addToLog(`Failed: ${command} - ${errorMsg}`);
      return false;
    }
  };

  const readSerial = async (reader: any) => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        if (text.trim()) {
          console.log('Arduino:', text.trim());
          addToLog(`Arduino: ${text.trim()}`);
        }
      }
    } catch (err) {
      console.log('Reader stopped');
    }
  };

  const connectToArduino = async () => {
    setIsScanning(true);
    setError('');
    addToLog('Requesting serial port...');

    try {
      const serial = (navigator as any).serial;
      if (!serial) {
        throw new Error('Web Serial API is not supported. Use Chrome or Edge.');
      }

      // Request port - user selects from dialog
      const port = await serial.requestPort();
      portRef.current = port;

      // Open at 115200 baud (matching Arduino)
      await port.open({ baudRate: 115200 });
      addToLog('Serial port opened at 115200 baud');

      // Get writer for sending commands
      const writer = port.writable.getWriter();
      writerRef.current = writer;

      // Get reader for receiving responses
      const reader = port.readable.getReader();
      readerRef.current = reader;

      // Start reading in background
      readSerial(reader);

      setPortName('Arduino Mega');
      setIsConnected(true);
      setIsScanning(false);
      addToLog('Connected to Arduino Mega');

    } catch (err) {
      console.error('Serial error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect';
      setError(errorMsg);
      addToLog(`Error: ${errorMsg}`);
      setIsScanning(false);
    }
  };

  const disconnect = async () => {
    try {
      // Turn off all motors before disconnecting
      if (writerRef.current) {
        const encoder = new TextEncoder();
        await writerRef.current.write(encoder.encode('motor1_off\n'));
        await new Promise(resolve => setTimeout(resolve, 50));
        await writerRef.current.write(encoder.encode('motor2_off\n'));
        await new Promise(resolve => setTimeout(resolve, 50));
        await writerRef.current.write(encoder.encode('motor3_off\n'));
        writerRef.current.releaseLock();
      }
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current.releaseLock();
      }
      if (portRef.current) {
        await portRef.current.close();
      }
    } catch (err) {
      console.log('Disconnect error:', err);
    }
    
    portRef.current = null;
    writerRef.current = null;
    readerRef.current = null;
    setIsConnected(false);
    setMotorStatus({
      1: {on: false, frequency: 50},
      2: {on: false, frequency: 50},
      3: {on: false, frequency: 50}
    });
    addToLog('Disconnected');
  };

  const handleMotorToggle = async (motorNum: number) => {
    const currentState = motorStatus[motorNum];
    
    if (currentState.on) {
      // Turn off
      const success = await sendCommand(`motor${motorNum}_off`);
      if (success) {
        setMotorStatus(prev => ({
          ...prev,
          [motorNum]: { ...prev[motorNum], on: false }
        }));
      }
    } else {
      // Set frequency then turn on
      await sendCommand(`motor${motorNum}_freq=${currentState.frequency}`);
      await new Promise(resolve => setTimeout(resolve, 50));
      const success = await sendCommand(`motor${motorNum}_on`);
      if (success) {
        setMotorStatus(prev => ({
          ...prev,
          [motorNum]: { ...prev[motorNum], on: true }
        }));
      }
    }
  };

  const handleFrequencyChange = (motorNum: number, frequency: number) => {
    setMotorStatus(prev => ({
      ...prev,
      [motorNum]: { ...prev[motorNum], frequency }
    }));
  };

  const handleAllOff = async () => {
    // Turn off each motor individually since all_off is broken
    await sendCommand('motor1_off');
    await new Promise(resolve => setTimeout(resolve, 50));
    await sendCommand('motor2_off');
    await new Promise(resolve => setTimeout(resolve, 50));
    await sendCommand('motor3_off');
    
    setMotorStatus({
      1: { ...motorStatus[1], on: false },
      2: { ...motorStatus[2], on: false },
      3: { ...motorStatus[3], on: false }
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Motor Test (Serial)</h1>
        <a href="/" className={styles.homeLink}>← Back to Main</a>
      </div>

      {/* Connection Section */}
      <section className={styles.section}>
        <h2>Connection</h2>
        {!isConnected ? (
          <button 
            className={styles.connectButton}
            onClick={connectToArduino}
            disabled={isScanning}
          >
            {isScanning ? 'Connecting...' : 'Connect to Arduino'}
          </button>
        ) : (
          <div className={styles.connectedInfo}>
            <span className={styles.connectedDot}></span>
            Connected to: {portName}
            <button 
              className={styles.disconnectButton}
              onClick={disconnect}
              style={{ marginLeft: '1rem', padding: '0.5rem 1rem', background: '#ef4444', border: 'none', borderRadius: '0.5rem', color: 'white', cursor: 'pointer' }}
            >
              Disconnect
            </button>
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}
      </section>

      {/* Motor Controls */}
      <section className={styles.section}>
        <h2>Motor Controls</h2>
        <div className={styles.motorGrid}>
          {[1, 2, 3].map(motorNum => (
            <div key={motorNum} className={styles.motorCard}>
              <h3>Motor {motorNum}</h3>
              <div className={styles.motorInfo}>
                <span className={`${styles.statusDot} ${motorStatus[motorNum].on ? styles.active : ''}`}></span>
                <span>{motorStatus[motorNum].on ? 'ON' : 'OFF'}</span>
              </div>
              
              <div className={styles.frequencyControl}>
                <label>Frequency: {motorStatus[motorNum].frequency} Hz</label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={motorStatus[motorNum].frequency}
                  onChange={(e) => handleFrequencyChange(motorNum, parseInt(e.target.value))}
                  disabled={!isConnected}
                  className={styles.slider}
                />
              </div>

              <button
                className={`${styles.motorButton} ${motorStatus[motorNum].on ? styles.motorOn : styles.motorOff}`}
                onClick={() => handleMotorToggle(motorNum)}
                disabled={!isConnected}
              >
                {motorStatus[motorNum].on ? 'Turn OFF' : 'Turn ON'}
              </button>
            </div>
          ))}
        </div>

        <button
          className={styles.allOffButton}
          onClick={handleAllOff}
          disabled={!isConnected}
        >
          Stop All Motors
        </button>
      </section>

      {/* Log Section */}
      <section className={styles.section}>
        <h2>Activity Log</h2>
        <div className={styles.logContainer}>
          {log.length === 0 ? (
            <div className={styles.logEmpty}>No activity yet</div>
          ) : (
            log.map((entry, idx) => (
              <div key={idx} className={styles.logEntry}>{entry}</div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default MotorTest;
