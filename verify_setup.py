"""
Quick Setup Verification Script
Checks if all components are properly configured
"""

import subprocess
import sys
import os
from pathlib import Path

def check_command(cmd, name):
    """Check if a command exists"""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, shell=True)
        return True
    except:
        return False

def check_file(path, name):
    """Check if a file exists"""
    return Path(path).exists()

def check_port(port):
    """Check if a port is in use"""
    try:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('localhost', port))
        sock.close()
        return result == 0
    except:
        return False

def main():
    print("=" * 60)
    print("  Hearless Setup Verification")
    print("=" * 60)
    print()
    
    checks = {
        "passed": 0,
        "failed": 0,
        "warnings": 0
    }
    
    # Software checks
    print("📦 Software Prerequisites:")
    print("-" * 60)
    
    if check_command("node --version", "Node.js"):
        print("✓ Node.js installed")
        checks["passed"] += 1
    else:
        print("✗ Node.js NOT found")
        checks["failed"] += 1
    
    if check_command("npm --version", "npm"):
        print("✓ npm installed")
        checks["passed"] += 1
    else:
        print("✗ npm NOT found")
        checks["failed"] += 1
    
    if check_command("python --version", "Python"):
        print("✓ Python installed")
        checks["passed"] += 1
    else:
        print("✗ Python NOT found")
        checks["failed"] += 1
    
    if check_command("psql --version", "PostgreSQL"):
        print("✓ PostgreSQL installed")
        checks["passed"] += 1
    else:
        print("⚠ PostgreSQL NOT found (may not be in PATH)")
        checks["warnings"] += 1
    
    print()
    
    # File checks
    print("📁 Repository Structure:")
    print("-" * 60)
    
    files_to_check = [
        ("api/package.json", "API package.json"),
        ("web/package.json", "Web package.json"),
        ("api/.env", "API .env (REQUIRED)"),
        ("api/prisma/schema.prisma", "Prisma schema"),
        ("Hardware/esp_cam/esp_cam.ino", "ESP32-CAM code"),
        ("Hardware/arduino_mega/arduino_mega.ino", "Arduino Mega code"),
        ("test_ble.py", "BLE test script"),
        ("requirements.txt", "Python requirements"),
    ]
    
    for file_path, name in files_to_check:
        if check_file(file_path, name):
            print(f"✓ {name}")
            checks["passed"] += 1
        else:
            if ".env" in file_path:
                print(f"✗ {name} - CRITICAL! Copy from .env.example")
                checks["failed"] += 1
            else:
                print(f"⚠ {name} - Missing")
                checks["warnings"] += 1
    
    print()
    
    # Dependencies check
    print("📦 Dependencies:")
    print("-" * 60)
    
    if check_file("api/node_modules", "API dependencies"):
        print("✓ API node_modules exists")
        checks["passed"] += 1
    else:
        print("✗ API node_modules NOT found - Run: cd api && npm install")
        checks["failed"] += 1
    
    if check_file("web/node_modules", "Web dependencies"):
        print("✓ Web node_modules exists")
        checks["passed"] += 1
    else:
        print("✗ Web node_modules NOT found - Run: cd web && npm install")
        checks["failed"] += 1
    
    print()
    
    # Service checks
    print("🚀 Services:")
    print("-" * 60)
    
    if check_port(8080):
        print("✓ API running on port 8080")
        checks["passed"] += 1
    else:
        print("⚠ API NOT running on port 8080")
        checks["warnings"] += 1
    
    if check_port(5173) or check_port(5174):
        print("✓ Web dev server running")
        checks["passed"] += 1
    else:
        print("⚠ Web dev server NOT running")
        checks["warnings"] += 1
    
    if check_port(5432):
        print("✓ PostgreSQL appears to be running on port 5432")
        checks["passed"] += 1
    else:
        print("⚠ PostgreSQL NOT detected on port 5432")
        checks["warnings"] += 1
    
    print()
    print("=" * 60)
    print(f"Results: ✓ {checks['passed']} passed | "
          f"✗ {checks['failed']} failed | "
          f"⚠ {checks['warnings']} warnings")
    print("=" * 60)
    print()
    
    if checks["failed"] > 0:
        print("⚠️  CRITICAL ISSUES FOUND")
        print("Please address the ✗ items above before proceeding.")
        print()
        print("Quick fixes:")
        print("  - Missing .env: cd api && cp .env.example .env")
        print("  - Missing dependencies: cd api && npm install")
        print("  - Missing dependencies: cd web && npm install")
        return 1
    elif checks["warnings"] > 0:
        print("⚠️  WARNINGS PRESENT")
        print("The system may work, but check the ⚠ items above.")
        print("See CHECKLIST.md for detailed troubleshooting.")
        return 0
    else:
        print("✅ ALL CHECKS PASSED!")
        print("Your development environment appears ready.")
        print()
        print("Next steps:")
        print("  1. Start API: cd api && npm run dev")
        print("  2. Start Web: cd web && npm run dev")
        print("  3. Upload Hardware: Upload .ino files to devices")
        print("  4. Test BLE: python test_ble.py")
        return 0

if __name__ == "__main__":
    sys.exit(main())
