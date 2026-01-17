"""
BLE Test Script for Hearless Wearable Device
Tests connection and motor control commands
"""

import asyncio
from bleak import BleakClient, BleakScanner

# Nordic UART Service UUIDs (used by Hearless device)
NUS_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
NUS_RX_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  # Write to device
NUS_TX_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  # Notifications from device

# Command types
CMD_SET_INTENSITY = 0x01
CMD_STOP_ALL = 0x03
CMD_HEARTBEAT = 0x04

# Motor positions
MOTOR_FRONT = 0
MOTOR_FRONT_RIGHT = 1
MOTOR_RIGHT = 2
MOTOR_BACK_RIGHT = 3
MOTOR_BACK = 4
MOTOR_BACK_LEFT = 5
MOTOR_LEFT = 6
MOTOR_FRONT_LEFT = 7


async def find_device():
    """Scan for Hearless BLE device"""
    print("Scanning for BLE devices...")
    devices = await BleakScanner.discover(timeout=5.0)
    
    for device in devices:
        if device.name and "Hearless" in device.name:
            print(f"✓ Found: {device.name} ({device.address})")
            return device.address
        if device.name:
            print(f"  Found: {device.name}")
    
    print("✗ Hearless device not found")
    return None


def notification_handler(sender, data):
    """Handle notifications from device"""
    try:
        message = data.decode('utf-8', errors='ignore')
        print(f"← Device: {message.strip()}")
    except:
        print(f"← Device (raw): {data.hex()}")


async def send_motor_command(client, command, motor_mask, intensities):
    """Send 10-byte motor control packet"""
    packet = bytes([command, motor_mask] + intensities)
    await client.write_gatt_char(NUS_RX_UUID, packet, response=False)
    print(f"→ Sent: {packet.hex()}")


async def send_text_command(client, text):
    """Send text command (like CAM PING)"""
    data = text.encode('utf-8')
    await client.write_gatt_char(NUS_RX_UUID, data, response=False)
    print(f"→ Sent: {text}")


async def test_connection(client):
    """Test basic BLE connection"""
    print("\n=== Testing Connection ===")
    await send_text_command(client, "CAM PING")
    await asyncio.sleep(1)


async def test_single_motor(client, motor_id, intensity=200):
    """Test a single motor"""
    print(f"\n=== Testing Motor {motor_id} (Intensity: {intensity}) ===")
    
    # Create motor mask (only one motor active)
    motor_mask = 1 << motor_id
    
    # Create intensity array
    intensities = [0] * 8
    intensities[motor_id] = intensity
    
    await send_motor_command(client, CMD_SET_INTENSITY, motor_mask, intensities)
    await asyncio.sleep(1.5)
    
    # Stop
    await send_motor_command(client, CMD_STOP_ALL, 0xFF, [0] * 8)
    await asyncio.sleep(0.5)


async def test_directional_pattern(client):
    """Test rotating pattern around the neck"""
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
    """Simulate object approaching from the right"""
    print("\n=== Testing Proximity Simulation (Right Side) ===")
    
    # Gradually increase intensity (simulating object getting closer)
    for intensity in [50, 100, 150, 200, 255]:
        print(f"Intensity: {intensity}")
        motor_mask = 0b00000100  # Right motor (motor 2)
        intensities = [0, 0, intensity, 0, 0, 0, 0, 0]
        
        await send_motor_command(client, CMD_SET_INTENSITY, motor_mask, intensities)
        await asyncio.sleep(0.5)
    
    # Stop
    await send_motor_command(client, CMD_STOP_ALL, 0xFF, [0] * 8)


async def test_multi_motor(client):
    """Test multiple motors simultaneously"""
    print("\n=== Testing Multiple Motors ===")
    
    # Front and back
    motor_mask = 0b00010001  # Motors 0 and 4
    intensities = [180, 0, 0, 0, 180, 0, 0, 0]
    
    await send_motor_command(client, CMD_SET_INTENSITY, motor_mask, intensities)
    await asyncio.sleep(2)
    
    # Stop
    await send_motor_command(client, CMD_STOP_ALL, 0xFF, [0] * 8)


async def main():
    """Main test routine"""
    print("===========================================")
    print("  Hearless BLE Motor Control Test")
    print("===========================================\n")
    
    # Find device
    address = await find_device()
    if not address:
        print("\n✗ Cannot proceed without device")
        return
    
    print(f"\nConnecting to {address}...")
    
    try:
        async with BleakClient(address, timeout=10.0) as client:
            print("✓ Connected!")
            
            # Subscribe to notifications
            await client.start_notify(NUS_TX_UUID, notification_handler)
            print("✓ Subscribed to notifications\n")
            
            await asyncio.sleep(1)
            
            # Run tests
            await test_connection(client)
            
            # Test each motor individually
            for motor in range(8):
                await test_single_motor(client, motor, 200)
            
            await test_directional_pattern(client)
            await test_proximity_simulation(client)
            await test_multi_motor(client)
            
            print("\n=== All Tests Complete ===")
            await asyncio.sleep(1)
            
    except Exception as e:
        print(f"\n✗ Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
