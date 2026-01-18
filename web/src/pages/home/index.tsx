import { useState, useRef, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
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
  
  const [serverConnected, setServerConnected] = useState(false);
  const [detectionActive, setDetectionActive] = useState(false);
  const [detectedSound, setDetectedSound] = useState<string>('None');
  const [detectedAngle, setDetectedAngle] = useState<number | null>(null);
  const [detectedObject, setDetectedObject] = useState<string>('None');
  const [detectionConfidence, setDetectionConfidence] = useState<string>('N/A');
  const [motorPowers, setMotorPowers] = useState<{motor_60: number, motor_180: number, motor_300: number}>({motor_60: 0, motor_180: 0, motor_300: 0});
  const [localWebcamStream, setLocalWebcamStream] = useState<MediaStream | null>(null);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialScanning, setSerialScanning] = useState(false);
  
  const imageBufferRef = useRef<Uint8Array>(new Uint8Array());
  const receivingImageRef = useRef(false);
  const deviceRef = useRef<BleDevice | null>(null);
  const portRef = useRef<any>(null);
  const writerRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const imageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const imageIntervalRef = useRef<number | null>(null);
  const audioProcessIntervalRef = useRef<number | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    socketRef.current = io('10.171.235.49:5000');
    
    socketRef.current.on('connect', () => {
      console.log('Connected to detection server');
      addToLog('Detection server connected');
      setServerConnected(true);
    });
    
    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from detection server');
      addToLog('Detection server disconnected');
      setServerConnected(false);
      stopDetection();
    });
    
    socketRef.current.on('result', (data: any) => {
      handleDetectionResult(data);
    });
    
    socketRef.current.on('error', (data: any) => {
      console.error('Detection error:', data.message);
      addToLog(`Detection error: ${data.message}`);
    });
    
    return () => {
      if (imageTimeoutRef.current) {
        clearTimeout(imageTimeoutRef.current);
      }
      stopDetection();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (localWebcamStream && webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = localWebcamStream;
      webcamVideoRef.current.play().catch(err => {
        console.error('Error playing video:', err);
        addToLog(`Error playing webcam video: ${err.message}`);
      });
    }
  }, [localWebcamStream]);
  useEffect(() => {
    const initWebcam = async () => {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 },
          audio: false
        });
        setLocalWebcamStream(videoStream);
        addToLog('Webcam initialized');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to access webcam';
        console.error('Error accessing webcam:', errorMsg);
        addToLog(`Webcam error: ${errorMsg}`);
      }
    };
    
    initWebcam();
  }, []);

  const addToLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setCommandLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  }, []);
  
  const handleDetectionResult = useCallback((data: any) => {
    if (data.sound) setDetectedSound(data.sound);
    if (data.angle !== null && data.angle !== undefined) setDetectedAngle(data.angle);
    if (data.detection_info) {
      setDetectedObject(data.detection_info.object_description || 'None');
      setDetectionConfidence(data.detection_info.confidence || 'N/A');
    }
    
    if (data.motor_powers) {
      setMotorPowers({
        motor_60: data.motor_powers.motor_60 || 0,
        motor_180: data.motor_powers.motor_180 || 0,
        motor_300: data.motor_powers.motor_300 || 0
      });
      
      const powers = data.motor_powers;
      const threshold = 0.3; 
      
      if (powers.motor_300 > threshold) {
        if (!motorStatus[1]?.on) {
          console.log(`Activating Motor 1 (power: ${(powers.motor_300*100).toFixed(0)}%)`);
          if (writerRef.current) {
            const command = 'motor1_on\n';
            const encoder = new TextEncoder();
            writerRef.current.write(encoder.encode(command)).then(() => {
              setMotorStatus(prev => ({
                ...prev,
                1: {on: true, lastCommand: command, timestamp: new Date()}
              }));
              addToLog(`Sent: ${command}`);
            }).catch(err => {
              console.error('Error sending command:', err);
              addToLog(`Failed: ${command}`);
            });
          }
        }
      } else if (motorStatus[1]?.on) {
        console.log(`Deactivating Motor 1 (power: ${(powers.motor_300*100).toFixed(0)}%)`);
        if (writerRef.current) {
          const command = 'motor1_off\n';
          const encoder = new TextEncoder();
          writerRef.current.write(encoder.encode(command)).then(() => {
            setMotorStatus(prev => ({
              ...prev,
              1: {on: false, lastCommand: command, timestamp: new Date()}
            }));
            addToLog(`Sent: ${command}`);
          }).catch(err => {
            console.error('Error sending command:', err);
            addToLog(`Failed: ${command}`);
          });
        }
      }
      if (powers.motor_180 > threshold) {
        if (!motorStatus[2]?.on) {
          console.log(`Activating Motor 2 (power: ${(powers.motor_180*100).toFixed(0)}%)`);
          if (writerRef.current) {
            const command = 'motor2_on\n';
            const encoder = new TextEncoder();
            writerRef.current.write(encoder.encode(command)).then(() => {
              setMotorStatus(prev => ({
                ...prev,
                2: {on: true, lastCommand: command, timestamp: new Date()}
              }));
              addToLog(`Sent: ${command}`);
            }).catch(err => {
              console.error('Error sending command:', err);
              addToLog(`Failed: ${command}`);
            });
          }
        }
      } else if (motorStatus[2]?.on) {
        console.log(`Deactivating Motor 2 (power: ${(powers.motor_180*100).toFixed(0)}%)`);
        if (writerRef.current) {
          const command = 'motor2_off\n';
          const encoder = new TextEncoder();
          writerRef.current.write(encoder.encode(command)).then(() => {
            setMotorStatus(prev => ({
              ...prev,
              2: {on: false, lastCommand: command, timestamp: new Date()}
            }));
            addToLog(`Sent: ${command}`);
          }).catch(err => {
            console.error('Error sending command:', err);
            addToLog(`Failed: ${command}`);
          });
        }
      }
      
      if (powers.motor_60 > threshold) {
        if (!motorStatus[3]?.on) {
          console.log(`Activating Motor 3 (power: ${(powers.motor_60*100).toFixed(0)}%)`);
          if (writerRef.current) {
            const command = 'motor3_on\n';
            const encoder = new TextEncoder();
            writerRef.current.write(encoder.encode(command)).then(() => {
              setMotorStatus(prev => ({
                ...prev,
                3: {on: true, lastCommand: command, timestamp: new Date()}
              }));
              addToLog(`Sent: ${command}`);
            }).catch(err => {
              console.error('Error sending command:', err);
              addToLog(`Failed: ${command}`);
            });
          }
        }
      } else if (motorStatus[3]?.on) {
        console.log(`Deactivating Motor 3 (power: ${(powers.motor_60*100).toFixed(0)}%)`);
        if (writerRef.current) {
          const command = 'motor3_off\n';
          const encoder = new TextEncoder();
          writerRef.current.write(encoder.encode(command)).then(() => {
            setMotorStatus(prev => ({
              ...prev,
              3: {on: false, lastCommand: command, timestamp: new Date()}
            }));
            addToLog(`Sent: ${command}`);
          }).catch(err => {
            console.error('Error sending command:', err);
            addToLog(`Failed: ${command}`);
          });
        }
      }
      
      addToLog(`Powers: M1=${(powers.motor_300*100).toFixed(0)}% M2=${(powers.motor_180*100).toFixed(0)}% M3=${(powers.motor_60*100).toFixed(0)}%`);
    }
  }, [motorStatus, rxCharacteristic, addToLog]);

  const handleNotification = useCallback((event: Event) => {
    const target = event.target as BleCharacteristic;
    const value = target.value as DataView;
    const data = new Uint8Array(value.buffer);

    if (data.length >= 2 && data[0] === 0x54 && data[1] === 0x3A) { //'T'
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
    if (data.length >= 5 && data[0] === 0x49) { //'I'
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

    if (data.length === 1 && data[0] === 0x45) { //'E'
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
          
          if (socketRef.current?.connected) {
            const base64 = btoa(String.fromCharCode(...finalBuffer));
            socketRef.current.emit('image_stream', { camera: 'back', image: base64 });
          }
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
    setSerialScanning(true);
    setError('');
    addToLog('Requesting serial port...');

    try {
      const serial = (navigator as any).serial;
      if (!serial) {
        throw new Error('Web Serial API is not supported. Use Chrome or Edge.');
      }

      const port = await serial.requestPort();
      portRef.current = port;

      await port.open({ baudRate: 115200 });
      addToLog('Serial port opened at 115200 baud');

      const writer = port.writable.getWriter();
      writerRef.current = writer;

      const reader = port.readable.getReader();
      readerRef.current = reader;

      readSerial(reader);

      setSerialConnected(true);
      setSerialScanning(false);
      addToLog('Connected to Arduino Mega via Serial');

      await new Promise(resolve => setTimeout(resolve, 100));
      await writer.write(new TextEncoder().encode('motor1_off\n'));
      await new Promise(resolve => setTimeout(resolve, 50));
      await writer.write(new TextEncoder().encode('motor2_off\n'));
      await new Promise(resolve => setTimeout(resolve, 50));
      await writer.write(new TextEncoder().encode('motor3_off\n'));
      addToLog('Initial motor stop commands sent');

    } catch (err) {
      console.error('Serial error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect';
      setError(errorMsg);
      addToLog(`Serial Error: ${errorMsg}`);
      setSerialScanning(false);
    }
  };

  const disconnectArduino = async () => {
    try {
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
    setSerialConnected(false);
    setMotorStatus({1: {on: false, lastCommand: '', timestamp: null}, 2: {on: false, lastCommand: '', timestamp: null}, 3: {on: false, lastCommand: '', timestamp: null}});
    addToLog('Arduino disconnected');
  };

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
      console.log('Auto-starting ESP32-CAM stream...');
      addToLog('Auto-starting ESP32-CAM stream...');
      await new Promise(resolve => setTimeout(resolve, 500)); 
      await rx.writeValueWithoutResponse(encoder.encode('CAM START'));
      setIsStreaming(true);
      addToLog('ESP32-CAM streaming started');

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
  
  const startDetection = async () => {
    if (!socketRef.current?.connected) {
      addToLog('Detection server not connected');
      return;
    }
    
    try {
      audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      mediaRecorderRef.current = new MediaRecorder(audioStreamRef.current, { mimeType });
      
      socketRef.current.emit('start_audio_stream');
      
      let audioChunks: Blob[] = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            socketRef.current?.emit('audio_chunk', { chunk: base64 });
            socketRef.current?.emit('process_audio_buffer');
          };
          reader.readAsDataURL(audioBlob);
          audioChunks = [];
        }
        
        if (mediaRecorderRef.current && audioStreamRef.current && mediaRecorderRef.current.state === 'inactive') {
          mediaRecorderRef.current.start();
        }
      };
      
      mediaRecorderRef.current.start();
      setDetectionActive(true);
      addToLog('Detection started - continuous audio streaming active');
      
      captureAndSendImage();
      imageIntervalRef.current = window.setInterval(captureAndSendImage, 2000);
      
      audioProcessIntervalRef.current = window.setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 3000);
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to start detection';
      addToLog(`Detection error: ${errorMsg}`);
    }
  };
  
  const stopDetection = () => {
    setDetectionActive(false);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (imageIntervalRef.current) {
      clearInterval(imageIntervalRef.current);
    }
    
    if (audioProcessIntervalRef.current) {
      clearInterval(audioProcessIntervalRef.current);
    }
    
    if (socketRef.current?.connected) {
      socketRef.current.emit('stop_audio_stream');
    }
    
    addToLog('Detection stopped');
  };
  
  const captureAndSendImage = () => {
    if (!localWebcamStream || !socketRef.current?.connected) return;
    
    const videoTrack = localWebcamStream.getVideoTracks()[0];
    if (!videoTrack) return;
    
    const canvas = document.createElement('canvas');
    const video = document.createElement('video');
    video.srcObject = localWebcamStream;
    video.play();
    
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(video, 0, 0);
      
      canvas.toBlob((blob) => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          socketRef.current?.emit('image_stream', { camera: 'front', image: base64 });
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.8);
    };
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Hearless Wearable Device</h1>
        <p className={styles.subtitle}>Sound Direction into Sensory Feedback</p>
      </div>

      <section className={styles.section}>
        <h2>Serial Connection (Motors)</h2>
        <div className={styles.connectionStatus}>
          <div className={styles.statusIndicator}>
            <span className={`${styles.statusDot} ${serialConnected ? styles.connected : ''}`}></span>
            <span>{serialConnected ? 'Arduino Connected' : 'Arduino Not Connected'}</span>
          </div>
          
          {!serialConnected && (
            <button 
              className={styles.connectButton}
              onClick={connectToArduino}
              disabled={serialScanning}
            >
              {serialScanning ? 'Connecting...' : 'Connect Arduino'}
            </button>
          )}
          
          {serialConnected && (
            <button 
              className={styles.connectButton}
              onClick={disconnectArduino}
              style={{ background: '#ef4444' }}
            >
              Disconnect Arduino
            </button>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Bluetooth Connection (Camera)</h2>
        <div className={styles.connectionStatus}>
          <div className={styles.statusIndicator}>
            <span className={`${styles.statusDot} ${isConnected ? styles.connected : ''}`}></span>
            <span>{isConnected ? `Connected to ${deviceName}` : 'Not Connected'}</span>
          </div>
          <div className={styles.statusIndicator}>
            <span className={`${styles.statusDot} ${serverConnected ? styles.connected : ''}`}></span>
            <span>Detection Server: {serverConnected ? 'Connected' : 'Disconnected'}</span>
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
          <h2>Camera Feeds</h2>
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
              <h3 className={styles.cameraLabel}>Front Camera (Webcam)</h3>
              <video 
                ref={webcamVideoRef}
                className={styles.cameraImage}
                autoPlay
                playsInline
                muted
              />
            </div>
            
            <div className={styles.cameraView}>
              <h3 className={styles.cameraLabel}>Back Camera (ESP32-CAM)</h3>
              {cameraImage ? (
                <img src={cameraImage} alt="Back camera feed" className={styles.cameraImage} />
              ) : (
                <div className={styles.noImage}>No camera feed</div>
              )}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Motor Controls - {detectionActive ? 'Automatic Mode' : 'Manual Mode'}</h2>
          
          <div className={styles.detectionControls}>
            <button
              className={`${styles.controlButton} ${styles.onButton}`}
              onClick={startDetection}
              disabled={detectionActive || !isConnected}
            >
              Start Auto Detection
            </button>
            <button
              className={`${styles.controlButton} ${styles.offButton}`}
              onClick={stopDetection}
              disabled={!detectionActive}
            >
              Stop Auto Detection
            </button>
          </div>
          
          {detectionActive && (
            <div className={styles.detectionInfo}>
              <div className={styles.detectionRow}>
                <span className={styles.detectionLabel}>Sound:</span>
                <span className={styles.detectionValue}>{detectedSound}</span>
              </div>
              <div className={styles.detectionRow}>
                <span className={styles.detectionLabel}>Angle:</span>
                <span className={styles.detectionValue}>{detectedAngle !== null ? `${detectedAngle.toFixed(1)}°` : 'N/A'}</span>
              </div>
              <div className={styles.detectionRow}>
                <span className={styles.detectionLabel}>Object:</span>
                <span className={styles.detectionValue}>{detectedObject}</span>
              </div>
              <div className={styles.detectionRow}>
                <span className={styles.detectionLabel}>Confidence:</span>
                <span className={styles.detectionValue}>{detectionConfidence}</span>
              </div>
              <div className={styles.detectionRow}>
                <span className={styles.detectionLabel}>Motor Powers:</span>
                <span className={styles.detectionValue}>
                  M1:{(motorPowers.motor_300*100).toFixed(0)}% | 
                  M2:{(motorPowers.motor_180*100).toFixed(0)}% | 
                  M3:{(motorPowers.motor_60*100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}
          <div className={styles.motorControls}>
            <div 
              className={styles.centerArrow}
              style={{
                transform: detectedAngle !== null 
                  ? `translate(-50%, -50%) rotate(${360 - detectedAngle}deg)` 
                  : 'translate(-50%, -50%)',
                transition: 'transform 0.5s ease-out'
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L12 18M12 2L8 6M12 2L16 6" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {[1, 2, 3].map((motorNum) => {
              const motorPowerMap: {[key: number]: number} = {
                1: motorPowers.motor_300,  
                2: motorPowers.motor_180,  
                3: motorPowers.motor_60  
              };
              const powerLevel = motorPowerMap[motorNum] || 0;
              const isActive = motorStatus[motorNum]?.on || powerLevel > 0.3;
              
              return (
                <button
                  key={motorNum}
                  className={`${styles.motorDot} ${isActive ? styles.motorActive : ''}`}
                  style={{
                    opacity: detectionActive ? 0.3 + (powerLevel * 0.7) : 1,
                    boxShadow: detectionActive 
                      ? `0 0 ${20 + (powerLevel * 40)}px rgba(16, 185, 129, ${powerLevel})`
                      : isActive ? '0 0 20px rgba(16, 185, 129, 0.6)' : '0 4px 8px rgba(0, 0, 0, 0.4)',
                    background: detectionActive && powerLevel > 0.1
                      ? `rgba(16, 185, 129, ${0.5 + (powerLevel * 0.5)})`
                      : isActive ? '#10b981' : '#334155'
                  }}
                  onClick={() => {
                    if (detectionActive) return; 
                    if (motorStatus[motorNum]?.on) {
                      handleMotorOff(motorNum);
                    } else {
                      handleMotorOn(motorNum);
                    }
                  }}
                  disabled={!isConnected || detectionActive}
                  title={detectionActive ? `Motor ${motorNum}: ${(powerLevel*100).toFixed(0)}%` : `Motor ${motorNum}`}
                >
                  {motorNum}
                </button>
              );
            })}
          </div>
          
          {!detectionActive && (
            <div className={styles.allOffContainer}>
              <button 
                className={`${styles.controlButton} ${styles.offButton} ${styles.allOffButton}`}
                onClick={handleAllMotorsOff}
                disabled={!isConnected}
              >
                Stop All Motors
              </button>
            </div>
          )}
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