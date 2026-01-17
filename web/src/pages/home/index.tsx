import { useState } from 'react';
import styles from './index.module.css';

const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export default function IndexPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');
  const [rxCharacteristic, setRxCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [motor1Freq, setMotor1Freq] = useState('50');
  const [motor2Freq, setMotor2Freq] = useState('50');
  const [motor3Freq, setMotor3Freq] = useState('50');
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraImage, setCameraImage] = useState<string | null>(null);
  const [imageBuffer, setImageBuffer] = useState<Uint8Array>(new Uint8Array());
  const [receivingImage, setReceivingImage] = useState(false);
  const [imagesReceived, setImagesReceived] = useState(0);

  const handleNotification = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const data = new Uint8Array(target.value!.buffer);

    if (data.length >= 5 && data[0] === 0x49) { //'I'
      const imageSize = new DataView(data.buffer, 1, 4).getUint32(0, true);
      setImageBuffer(new Uint8Array());
      setReceivingImage(true);
      console.log(`Receiving image: ${imageSize} bytes`);
      return;
    }


    if (data.length === 1 && data[0] === 0x45) { //'E'
      if (receivingImage) {
        setReceivingImage(false);
        setImagesReceived(prev => prev + 1);
        const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        setCameraImage(url);
        console.log(`Image complete: ${imageBuffer.length} bytes`);
      }
      return;
    }

    if (receivingImage) {
      const newBuffer = new Uint8Array(imageBuffer.length + data.length);
      newBuffer.set(imageBuffer);
      newBuffer.set(data, imageBuffer.length);
      setImageBuffer(newBuffer);
      return;
    }

    try {
      const message = new TextDecoder().decode(data);
      console.log('Device:', message);
    } catch (err) {
      console.log('Device (raw):', data);
    }
  };

  const sendCommand = async (command: string) => {
    if (!rxCharacteristic) {
      setError('Not connected to device');
      return;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command);
      await rxCharacteristic.writeValue(data);
      console.log('Sent command:', command);
      setError(''); 
    } catch (err) {
      console.error('Error sending command:', err);
      setError(`Failed to send command: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const scanForDevice = async () => {
    setIsScanning(true);
    setError('');

    try {
      
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth is not supported in this browser');
      }
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Hearless' },
          { services: [NUS_SERVICE_UUID] }
        ],
        optionalServices: [NUS_SERVICE_UUID]
      });

      console.log('Device found:', device.name);
      setDeviceName(device.name || 'Unknown Device');

      const server = await device.gatt?.connect();
      if (!server) throw new Error('Failed to connect to GATT server');
      console.log('Connected to GATT server');

      const service = await server.getPrimaryService(NUS_SERVICE_UUID);
      console.log('Got NUS service');

      const rx = await service.getCharacteristic(NUS_RX_UUID);
      setRxCharacteristic(rx);
      console.log('Got RX characteristic');

      const tx = await service.getCharacteristic(NUS_TX_UUID);
      await tx.startNotifications();
      tx.addEventListener('characteristicvaluechanged', handleNotification);
      console.log('Got TX characteristic and subscribed to notifications');

      setIsConnected(true);
      setIsScanning(false);

      
      console.log('Sending initial stop commands...');
      const encoder = new TextEncoder();
      await rx.writeValue(encoder.encode('all_off'));
      await rx.writeValue(encoder.encode('CAM STOP'));
      console.log('Initial stop commands sent');

      device.addEventListener('gattserverdisconnected', () => {
        console.log('Device disconnected');
        setIsConnected(false);
        setDeviceName('');
        setRxCharacteristic(null);
        setIsStreaming(false);
      });

    } catch (err) {
      console.error('Bluetooth error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect to device');
      setIsScanning(false);
    }
  };

  const handleMotorOn = (motorNum: number) => {
    sendCommand(`motor${motorNum}_on`);
  };

  const handleMotorOff = (motorNum: number) => {
    sendCommand(`motor${motorNum}_off`);
  };

  const handleAllMotorsOff = () => {
    sendCommand('all_off');
  };

  const handleSetFrequency = (motorNum: number, frequency: string) => {
    const freq = parseInt(frequency);
    if (isNaN(freq) || freq <= 0) {
      setError('Please enter a valid frequency (Hz)');
      return;
    }
    sendCommand(`motor${motorNum}_freq=${freq}`);
  };

  const handleStartCamera = async () => {
    await sendCommand('CAM START');
    setIsStreaming(true);
  };

  const handleStopCamera = async () => {
    await sendCommand('CAM STOP');
    setIsStreaming(false);
  };

  return (
    <div className={styles.container}>
      <h1>Hearless Wearable Device</h1>
      <p>Sound Direction into Sensory feedback</p>
      
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

      {isConnected && (
        <section className={styles.section}>
          <h2>Camera Feed</h2>
          <div className={styles.cameraContainer}>
            <div className={styles.cameraControls}>
              <button
                className={`${styles.controlButton} ${styles.onButton}`}
                onClick={handleStartCamera}
                disabled={isStreaming}
              >
                Start Camera
              </button>
              <button
                className={`${styles.controlButton} ${styles.offButton}`}
                onClick={handleStopCamera}
                disabled={!isStreaming}
              >
                Stop Camera
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
      )}

      {isConnected && (
        <section className={styles.section}>
          <h2>Motor Controls</h2>
          <div className={styles.motorControls}>
            {[1, 2, 3].map((motorNum) => (
              <div key={motorNum} className={styles.motorCard}>
                <h3>Motor {motorNum}</h3>
                
                <div className={styles.controlGroup}>
                  <div className={styles.buttonGroup}>
                    <button 
                      className={`${styles.controlButton} ${styles.onButton}`}
                      onClick={() => handleMotorOn(motorNum)}
                    >
                      Turn On
                    </button>
                    <button 
                      className={`${styles.controlButton} ${styles.offButton}`}
                      onClick={() => handleMotorOff(motorNum)}
                    >
                      Turn Off
                    </button>
                  </div>
                  
                  <div className={styles.frequencyGroup}>
                    <label htmlFor={`motor${motorNum}Freq`}>Frequency (Hz):</label>
                    <div className={styles.frequencyInput}>
                      <input
                        id={`motor${motorNum}Freq`}
                        type="number"
                        min="1"
                        max="200"
                        value={motorNum === 1 ? motor1Freq : motorNum === 2 ? motor2Freq : motor3Freq}
                        onChange={(e) => {
                          if (motorNum === 1) setMotor1Freq(e.target.value);
                          else if (motorNum === 2) setMotor2Freq(e.target.value);
                          else setMotor3Freq(e.target.value);
                        }}
                        className={styles.freqInput}
                      />
                      <button 
                        className={styles.setButton}
                        onClick={() => handleSetFrequency(
                          motorNum, 
                          motorNum === 1 ? motor1Freq : motorNum === 2 ? motor2Freq : motor3Freq
                        )}
                      >
                        Set
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      <section className={styles.section}>
        <h2>System Overview</h2>
        <ul>
          <li>Phone</li>
          <li>ESP32-CAM</li>
          <li>Arduino Mega</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Features</h2>
        <ul>
          <li>Line 1</li>
          <li>Lorem ipsum dolor, sit amet consectetur adipisicing elit. Quasi ullam velit tempore repudiandae? Nemo corrupti consectetur dicta, molestiae doloribus culpa ea quos tempore rerum? Facere eveniet fugit magni corporis odit.</li>
          <li>Lorem ipsum dolor sit amet consectetur adipisicing elit. Porro aliquam sequi, accusamus natus, perferendis dolore possimus quis omnis repudiandae placeat eaque atque error? A libero eaque dignissimos ducimus, ad nostrum!</li>
          <li>Lorem, ipsum dolor sit amet consectetur adipisicing elit. Aspernatur, molestiae inventore dolorem dolorum at praesentium asperiores sit. Enim, vel! Accusamus, ad! Nulla voluptas id obcaecati animi ab corporis a tenetur.</li>
        </ul>
      </section>
    </div>
  );
}