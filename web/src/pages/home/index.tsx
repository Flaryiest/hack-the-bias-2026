import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './index.module.css';

const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

type BleCharacteristic = any;
type BleDevice = any;

export default function IndexPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');
  const [rxCharacteristic, setRxCharacteristic] = useState<BleCharacteristic | null>(null);
  const [motor1Freq, setMotor1Freq] = useState('50');
  const [motor2Freq, setMotor2Freq] = useState('50');
  const [motor3Freq, setMotor3Freq] = useState('50');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [cameraImage, setCameraImage] = useState<string | null>(null);
  const [imagesReceived, setImagesReceived] = useState(0);
  const [motorStatus, setMotorStatus] = useState<{[key: number]: {on: boolean, lastCommand: string, timestamp: Date | null}}>(
    {1: {on: false, lastCommand: '', timestamp: null}, 2: {on: false, lastCommand: '', timestamp: null}, 3: {on: false, lastCommand: '', timestamp: null}}
  );
  const [commandLog, setCommandLog] = useState<string[]>([]);
  
  const imageBufferRef = useRef<Uint8Array>(new Uint8Array());
  const receivingImageRef = useRef(false);
  const deviceRef = useRef<BleDevice | null>(null);
  const imageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (imageTimeoutRef.current) {
        clearTimeout(imageTimeoutRef.current);
      }
    };
  }, []);

  const addToLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setCommandLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  }, []);

  const handleNotification = useCallback((event: Event) => {
    const target = event.target as BleCharacteristic;
    const value = target.value as DataView;
    const data = new Uint8Array(value.buffer);

    if (data.length >= 2 && data[0] === 0x54 && data[1] === 0x3A) { // 'T:'
      try {
        const message = new TextDecoder().decode(data);
        const trimmed = message.trim().substring(2); 
        console.log('Device:', trimmed);
        addToLog(`Device: ${trimmed}`);
        if (trimmed.includes('OK SNAP_DONE') || trimmed.includes('ERR SNAP_FAIL')) {
          setIsSnapping(false);
        }
        if (trimmed.includes('ERR SNAP_FAIL')) {
          addToLog('Snapshot failed - camera error');
        }
      } catch (err) {
        console.log('Text decode error:', err);
      }
      return;
    }
    if (data.length >= 5 && data[0] === 0x49) { // 'I'
      const imageSize = new DataView(data.buffer, 1, 4).getUint32(0, true);
      imageBufferRef.current = new Uint8Array();
      receivingImageRef.current = true;
      console.log(`Receiving image: ${imageSize} bytes expected`);
      addToLog(`Image start: ${imageSize} bytes`);
      
      if (imageTimeoutRef.current) clearTimeout(imageTimeoutRef.current);
      imageTimeoutRef.current = setTimeout(() => {
        if (receivingImageRef.current) {
          console.error('Image reception timeout');
          addToLog(`Image timeout - received ${imageBufferRef.current.length}/${imageSize} bytes`);
          receivingImageRef.current = false;
          setIsSnapping(false);
        }
      }, 15000);
      return;
    }

    if (data.length === 1 && data[0] === 0x45) { // 'E'
      if (receivingImageRef.current) {
        if (imageTimeoutRef.current) {
          clearTimeout(imageTimeoutRef.current);
          imageTimeoutRef.current = null;
        }
        
        receivingImageRef.current = false;
        const finalBuffer = imageBufferRef.current;
        setImagesReceived(prev => prev + 1);
        
        console.log(`Image complete: ${finalBuffer.length} bytes`);
        addToLog(`Image complete: ${finalBuffer.length} bytes`);
        
        if (finalBuffer.length < 2) {
          console.error('Image too small');
          addToLog('Image too small');
          return;
        }
        
        console.log(`JPEG header check: ${finalBuffer[0].toString(16)} ${finalBuffer[1].toString(16)}`);
        
        if (finalBuffer[0] !== 0xFF || finalBuffer[1] !== 0xD8) {
          console.error('Invalid JPEG header');
          addToLog(`Invalid JPEG: starts with ${finalBuffer[0].toString(16)} ${finalBuffer[1].toString(16)}`);
          return;
        }
        
        try {
          const jpegData = new Uint8Array(finalBuffer);
          const blob = new Blob([jpegData], { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          console.log('Created blob URL:', url);
          addToLog(`Image URL created`);
          setCameraImage(url);
        } catch (err) {
          console.error('Error creating image:', err);
          addToLog(`Error creating image: ${err}`);
        }
      }
      return;
    }
    if (receivingImageRef.current) {
      const currentBuffer = imageBufferRef.current;
      const newBuffer = new Uint8Array(currentBuffer.length + data.length);
      newBuffer.set(currentBuffer);
      newBuffer.set(data, currentBuffer.length);
      imageBufferRef.current = newBuffer;
      return;
    }

    console.log('Unknown data:', Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));
  }, [addToLog]);

  const sendCommand = async (command: string): Promise<boolean> => {
    if (!rxCharacteristic) {
      setError('Not connected to device');
      addToLog(`Cannot send "${command}" - not connected`);
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command);
      await rxCharacteristic.writeValueWithoutResponse(data);
      console.log('Sent command:', command);
      addToLog(`Sent: ${command}`);
      setError('');
      return true;
    } catch (err) {
      console.error('Error sending command:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addToLog(`Failed: ${command} - ${errorMsg}`);
      console.warn('Command failed but not disconnecting:', errorMsg);
      return false;
    }
  };

  const scanForDevice = async () => {
    setIsScanning(true);
    setError('');
    addToLog('Scanning for device...');

    try {
      const bluetooth = (navigator as any).bluetooth;
      if (!bluetooth) {
        throw new Error('Web Bluetooth is not supported in this browser');
      }

      const device = await bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Hearless' }
        ],
        optionalServices: [NUS_SERVICE_UUID]
      });

      deviceRef.current = device;
      console.log('Device found:', device.name);
      setDeviceName(device.name || 'Unknown Device');
      addToLog(`Found: ${device.name}`);
      addToLog('Connecting to GATT server...');
      const server = await device.gatt?.connect();
      if (!server) throw new Error('Failed to connect to GATT server');
      console.log('Connected to GATT server');
      addToLog('Connected to GATT server');

      const service = await server.getPrimaryService(NUS_SERVICE_UUID);
      console.log('Got NUS service');
      addToLog('Got NUS service');

      const rx = await service.getCharacteristic(NUS_RX_UUID);
      setRxCharacteristic(rx);
      console.log('Got RX characteristic');

      const tx = await service.getCharacteristic(NUS_TX_UUID);
      await tx.startNotifications();
      tx.addEventListener('characteristicvaluechanged', handleNotification);
      console.log('Got TX characteristic and subscribed to notifications');
      addToLog('Subscribed to notifications');

      setIsConnected(true);
      setIsScanning(false);

      console.log('Sending initial stop commands...');
      addToLog('Sending initial stop commands...');
      const encoder = new TextEncoder();
      try {
        await rx.writeValueWithoutResponse(encoder.encode('all_off'));
        await new Promise(resolve => setTimeout(resolve, 100)); 
        addToLog('Initial stop commands sent');
      } catch (initErr) {
        console.warn('Initial stop commands failed (non-critical):', initErr);
        addToLog('Initial stop commands failed (non-critical)');
      }

      device.addEventListener('gattserverdisconnected', () => {
        console.log('Device disconnected');
        addToLog('Device disconnected');
        setIsConnected(false);
        setRxCharacteristic(null);
        setIsStreaming(false);
        setMotorStatus({1: {on: false, lastCommand: '', timestamp: null}, 2: {on: false, lastCommand: '', timestamp: null}, 3: {on: false, lastCommand: '', timestamp: null}});
      });

    } catch (err) {
      console.error('Bluetooth error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect to device';
      setError(errorMsg);
      addToLog(`Error: ${errorMsg}`);
      setIsScanning(false);
    }
  };

  const handleMotorOn = async (motorNum: number) => {
    const command = `motor${motorNum}_on`;
    const success = await sendCommand(command);
    if (success) {
      setMotorStatus(prev => ({
        ...prev,
        [motorNum]: {on: true, lastCommand: command, timestamp: new Date()}
      }));
    }
  };

  const handleMotorOff = async (motorNum: number) => {
    const command = `motor${motorNum}_off`;
    const success = await sendCommand(command);
    if (success) {
      setMotorStatus(prev => ({
        ...prev,
        [motorNum]: {on: false, lastCommand: command, timestamp: new Date()}
      }));
    }
  };

  const handleAllMotorsOff = async () => {
    const success = await sendCommand('all_off');
    if (success) {
      setMotorStatus({1: {on: false, lastCommand: 'all_off', timestamp: new Date()}, 2: {on: false, lastCommand: 'all_off', timestamp: new Date()}, 3: {on: false, lastCommand: 'all_off', timestamp: new Date()}});
    }
  };

  const handleSetFrequency = async (motorNum: number, frequency: string) => {
    const freq = parseInt(frequency);
    if (isNaN(freq) || freq <= 0) {
      setError('Please enter a valid frequency (Hz)');
      return;
    }
    sendCommand(`motor${motorNum}_freq=${freq}`);
  };

  const handleStartCamera = () => {
    sendCommand('CAM START');
    setIsStreaming(true);
  };

  const handleStopCamera = () => {
    sendCommand('CAM STOP');
    setIsStreaming(false);
  };

  const handleSnapCamera = () => {
    setIsSnapping(true);
    sendCommand('CAM SNAP');
    setTimeout(() => {
      setIsSnapping(false);
    }, 10000); //10s
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Hearless Wearable Device</h1>
        <p className={styles.subtitle}>Sound Direction into Sensory Feedback</p>
      </div>

      <section className={styles.section}>
        <h2>Bluetooth Connection</h2>
        <div className={styles.connectionStatus}>
          <div className={styles.statusIndicator}>
            <span className={`${styles.statusDot} ${isConnected ? styles.connected : ''}`}></span>
            <span>{isConnected ? `Connected to ${deviceName}` : 'Not Connected'}</span>
          </div>
          
          {!isConnected && (
            <button 
              className={styles.connectButton}
              onClick={scanForDevice}
              disabled={isScanning}
            >
              {isScanning ? 'Scanning...' : 'Scan for Device'}
            </button>
          )}
          
          {error && <div className={styles.error}>{error}</div>}
        </div>
      </section>

      <div className={styles.mainGrid}>
        <section className={styles.section}>
          <h2>Camera Feed</h2>
          <div className={styles.cameraContainer}>
            <div className={styles.cameraControls}>
              <button
                className={`${styles.controlButton} ${styles.onButton}`}
                onClick={handleStartCamera}
                disabled={!isConnected || isStreaming}
              >
                Start Camera
              </button>
              <button
                className={`${styles.controlButton} ${styles.offButton}`}
                onClick={handleStopCamera}
                disabled={!isConnected || !isStreaming}
              >
                Stop Camera
              </button>
              <button
                className={styles.controlButton}
                onClick={handleSnapCamera}
                disabled={!isConnected || isStreaming || isSnapping}
              >
                {isSnapping ? 'Capturing...' : 'Snapshot'}
              </button>
              <span className={styles.streamStatus}>
                {isStreaming ? 'Streaming' : 'Stopped'} | Images: {imagesReceived}
              </span>
            </div>
            <div className={styles.cameraView}>
              {cameraImage ? (
                <img src={cameraImage} alt="Camera feed" className={styles.cameraImage} />
              ) : (
                <div className={styles.noImage}>No camera feed</div>
              )}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Motor Controls</h2>
          <div className={styles.motorControls}>
            <div className={`${styles.centerArrow} ${
              motorStatus[1]?.on ? styles.pointToMotor1 :
              motorStatus[2]?.on ? styles.pointToMotor2 :
              motorStatus[3]?.on ? styles.pointToMotor3 : ''
            }`}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L12 18M12 2L8 6M12 2L16 6" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {[1, 2, 3].map((motorNum) => (
              <button
                key={motorNum}
                className={`${styles.motorDot} ${motorStatus[motorNum]?.on ? styles.motorActive : ''}`}
                onClick={() => {
                  if (motorStatus[motorNum]?.on) {
                    handleMotorOff(motorNum);
                  } else {
                    handleMotorOn(motorNum);
                  }
                }}
                disabled={!isConnected}
              >
                {motorNum}
              </button>
            ))}
          </div>
          <div className={styles.allOffContainer}>
            <button 
              className={`${styles.controlButton} ${styles.offButton} ${styles.allOffButton}`}
              onClick={handleAllMotorsOff}
              disabled={!isConnected}
            >
              Stop All Motors
            </button>
          </div>
        </section>
      </div>
      <section className={styles.section}>
        <h2>Command Log</h2>
        <div className={styles.commandLog}>
          <div className={styles.logEntries}>
            {commandLog.length === 0 ? (
              <div className={styles.noLog}>No commands sent yet</div>
            ) : (
              commandLog.map((log, i) => (
                <div key={i} className={styles.logEntry}>{log}</div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}