"""
BLE Client for Hearless Wearable Device
- Controls vibration motors
- Receives back camera images for AI processing

This simulates what the phone app would do:
1. Connect to ESP32-CAM wearable
2. Start receiving back camera images
3. Process images + front camera + audio with AI
4. Send motor commands based on detected sound direction
"""

import asyncio
from bleak import BleakClient, BleakScanner
import struct


NUS_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
NUS_RX_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  
NUS_TX_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E" 


CMD_SET_INTENSITY = 0x01
CMD_STOP_ALL = 0x03
CMD_HEARTBEAT = 0x04

MOTOR_FRONT = 0        #0 forward
MOTOR_FRONT_RIGHT = 1  #45
MOTOR_RIGHT = 2        #90
MOTOR_BACK_RIGHT = 3   #135
MOTOR_BACK = 4         #180 backward
MOTOR_BACK_LEFT = 5    #225
MOTOR_LEFT = 6         #270
MOTOR_FRONT_LEFT = 7   #315


image_buffer = bytearray()
image_size = 0
receiving_image = False
images_received = 0


async def find_device():
    """Scan for Hearless BLE device"""
    print("Scanning for BLE devices...")
    devices = await BleakScanner.discover(timeout=5.0)
    
    for device in devices:
        if device.name and "Hearless" in device.name:
            print(f"Found: {device.name} ({device.address})")
            return device.address
        if device.name:
            print(f"Found: {device.name}")
    
    print("!! Hearless device not found")
    return None


def notification_handler(sender, data):
    global image_buffer, image_size, receiving_image, images_received
    

    if len(data) >= 5 and data[0] == ord('I'):

        image_size = struct.unpack('<I', data[1:5])[0]
        image_buffer = bytearray()
        receiving_image = True
        print(f"Receiving image: {image_size} bytes")
        return
    
    
    if len(data) == 1 and data[0] == ord('E'):#is end marker?
        if receiving_image:
            receiving_image = False
            images_received += 1
            print(f"Image complete: {len(image_buffer)} bytes (#{images_received})")
            #process the image with AI
            #process_back_camera_image(image_buffer)
        return
    
   
    if receiving_image:
        image_buffer.extend(data)
        return
    
    
    try:
        message = data.decode('utf-8', errors='ignore')
        print(f"Device: {message.strip()}")
    except:
        print(f"Device (raw): {data.hex()}")


async def send_motor_command(client, command, motor_mask, intensities):
    packet = bytes([command, motor_mask] + intensities)
    await client.write_gatt_char(NUS_RX_UUID, packet, response=False)
    print(f"Sent: {packet.hex()}")


async def send_text_command(client, text):
    data = text.encode('utf-8')
    await client.write_gatt_char(NUS_RX_UUID, data, response=False)
    print(f"Sent: {text}")


async def motor_on(client, motor_num):
    command = f"motor{motor_num}_on"
    await send_text_command(client, command)


async def motor_off(client, motor_num):
    command = f"motor{motor_num}_off"
    await send_text_command(client, command)


async def all_motors_off(client):
    await send_text_command(client, "all_off")


async def set_motor_freq(client, motor_num, frequency):
    command = f"motor{motor_num}_freq={frequency}"
    await send_text_command(client, command)


async def test_connection(client):
    print("\n=== Testing Connection ===")
    await send_text_command(client, "CAM PING")
    await asyncio.sleep(1)


async def test_streaming(client, duration_seconds=5):
    print(f"\n=== Testing Back Camera Streaming ({duration_seconds}s) ===")
    
   
    await send_text_command(client, "CAM START")
    await asyncio.sleep(duration_seconds)
    
   
    await send_text_command(client, "CAM STOP")
    await asyncio.sleep(0.5)
    
    print(f"Received {images_received} images during streaming")


def direction_to_motor(angle_degrees):
    """
    0 = front, 90 = right, 180 = back, 270 = left
    """
   
    angle = angle_degrees % 360 #normalize to 0-360
    
    
    motor_index = int((angle + 22.5) / 45) % 8#each motor covers 45 degree
    return motor_index


def distance_to_intensity(distance_meters):#closer = stronger vibration    
    if distance_meters < 0.5:
        return 255 
    elif distance_meters < 1.0:
        return 200
    elif distance_meters < 2.0:
        return 150
    elif distance_meters < 3.0:
        return 100
    elif distance_meters < 5.0:
        return 50
    else:
        return 0  #no vibration


async def alert_user_to_sound(client, direction_degrees, distance_meters):
    """
    Alert user to detected sound by vibrating appropriate motor, called by ai after processing camera and aduoi
    Args:
        direction_degrees: 0=front, 90=right, 180=back, 270=left
        distance_meters: Estimated distance to sound source
    """
    motor = direction_to_motor(direction_degrees)
    intensity = distance_to_intensity(distance_meters)
    
    print(f"Alert: Sound at {direction_degrees} degrees (motor {motor}), {distance_meters}m away, intensity {intensity}")
    
   
    motor_mask = 1 << motor
    intensities = [0] * 8
    intensities[motor] = intensity
    
    await send_motor_command(client, CMD_SET_INTENSITY, motor_mask, intensities)


async def simulate_ai_detection(client):
    #simulated AI
    print("\n=== Simulating AI Sound Detection ===")
    
    
    print("\n[Simulated] Car horn detected: RIGHT, 3m")
    await alert_user_to_sound(client, 90, 3.0)
    await asyncio.sleep(2)
    
  
    print("\n[Simulated] Voice detected: BACK, 5m")
    await alert_user_to_sound(client, 180, 5.0)
    await asyncio.sleep(2)
    
   
    print("\n[Simulated] Dog bark detected: FRONT-LEFT, 1m (close!)")
    await alert_user_to_sound(client, 315, 1.0)
    await asyncio.sleep(2)
    
   
    await send_motor_command(client, CMD_STOP_ALL, 0xFF, [0] * 8)


async def test_single_motor(client, motor_id, intensity=200):
    print(f"\n=== Testing Motor {motor_id} (Intensity: {intensity}) ===")
    

    motor_mask = 1 << motor_id
    
 
    intensities = [0] * 8
    intensities[motor_id] = intensity
    
    await send_motor_command(client, CMD_SET_INTENSITY, motor_mask, intensities)
    await asyncio.sleep(1.5)
    

    await send_motor_command(client, CMD_STOP_ALL, 0xFF, [0] * 8)
    await asyncio.sleep(0.5)


async def test_directional_pattern(client):
    print("\n=== Testing Directional Pattern ===")
    
    for motor_id in range(8):
        print(f"Activating motor {motor_id}...")
        motor_mask = 1 << motor_id
        intensities = [0] * 8
        intensities[motor_id] = 150
        
        await send_motor_command(client, CMD_SET_INTENSITY, motor_mask, intensities)
        await asyncio.sleep(0.3)
    
    await send_motor_command(client, CMD_STOP_ALL, 0xFF, [0] * 8)


async def test_proximity_simulation(client):
    print("\n=== Testing Proximity Simulation (Right Side) ===")
    

    for intensity in [50, 100, 150, 200, 255]:
        print(f"Intensity: {intensity}")
        motor_mask = 0b00000100 
        intensities = [0, 0, intensity, 0, 0, 0, 0, 0]
        
        await send_motor_command(client, CMD_SET_INTENSITY, motor_mask, intensities)
        await asyncio.sleep(0.5)
    
   
    await send_motor_command(client, CMD_STOP_ALL, 0xFF, [0] * 8)


async def test_multi_motor(client):
    print("\n=== Testing Multiple Motors ===")
    

    motor_mask = 0b00010001 
    intensities = [180, 0, 0, 0, 180, 0, 0, 0]
    
    await send_motor_command(client, CMD_SET_INTENSITY, motor_mask, intensities)
    await asyncio.sleep(2)
    
 
    await send_motor_command(client, CMD_STOP_ALL, 0xFF, [0] * 8)


async def test_phone_commands(client): #sample testing
    print("\n=== Testing Phone Motor Commands ===")
    
    print("Starting motor 1...")
    await motor_on(client, 1)
    await asyncio.sleep(1)
    
    print("Setting motor 1 frequency to 50Hz...")
    await set_motor_freq(client, 1, 50)
    await asyncio.sleep(1)
    
    print("Stopping motor 1...")
    await motor_off(client, 1)
    await asyncio.sleep(0.5)
    
    print("Starting motor 2...")
    await motor_on(client, 2)
    await asyncio.sleep(1)
    
    print("Setting motor 2 frequency to 100Hz...")
    await set_motor_freq(client, 2, 100)
    await asyncio.sleep(1)
    
    print("Starting motor 3...")
    await motor_on(client, 3)
    await asyncio.sleep(1)
    
    print("Setting motor 3 frequency to 75Hz...")
    await set_motor_freq(client, 3, 75)
    await asyncio.sleep(1)

    print("Stopping all motors...")
    await all_motors_off(client)
    await asyncio.sleep(0.5)


async def main():
    #displays
    print("=" * 60)
    print("Hearless BLE Client")
    print("  Sound Direction > Tactile Feedback System")
    print("=" * 60)
    print()
    print("System Overview:")
    print("Phone: Front camera + microphone + AI processing")
    print("ESP32-CAM: Back camera (worn on neck)")
    print("Arduino Mega: 8 vibration motors")
    print()
    

    address = await find_device()
    if not address:
        print("\n!! Cannot proceed without device")
        return
    
    print(f"\nConnecting to {address}...")
    
    try:
        async with BleakClient(address, timeout=10.0) as client:
            print("Connected!")
            

            await client.start_notify(NUS_TX_UUID, notification_handler)
            print("Subscribed to notifications\n")
            
            await asyncio.sleep(1)
        
            await test_connection(client)
            
            await test_streaming(client, duration_seconds=3)
            
            await test_phone_commands(client)
            
            await simulate_ai_detection(client)
            
            print("\n=== Testing All Motors ===")
            for motor in range(8):
                await test_single_motor(client, motor, 150)
            
            print("\n=== All Tests Complete ===")
            print(f"Total images received: {images_received}")
            await asyncio.sleep(1)
            
    except Exception as e:
        print(f"\n!!Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
