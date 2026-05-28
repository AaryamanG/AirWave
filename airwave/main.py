#!/usr/bin/env python3
"""
Airwave Orchestrator
Main entry point for starting the hands-free webcam mouse controller desktop application.
"""

import sys
import os

# Ensure the parent app root is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import AirwaveConfig

def main():
    print("=" * 60)
    print("  AIRWAVE - WEBCAM GESTURE MOUSE REPLACEMENT SYSTEM  ")
    print("=" * 60)
    
    # 1. Initialize configuration manager
    config = AirwaveConfig()
    config_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
    config.load_from_file(config_file)
    
    # 2. Check if C++ binary exists, log status
    try:
        import airwave_cpp_accel
        print("[Airwave Main] C++ Acceleration Core Module: ENABLED (Compiled Binaries Found)")
    except ImportError:
        print("[Airwave Main] C++ Acceleration Core Module: FALLBACK-MODE (Using Pure-Python Maths)")
        print("              To compile C++ bindings for low latency math smoothing and classification, run:")
        print("              pip install .")
        print("              inside the airwave root directory.")

    print("\n[Airwave Main] Launching PySide6 Modern Dark UI Interface...")
    
    # 3. Launch PySide6 GUI loop
    try:
        from ui import main as launch_ui
        launch_ui()
    except ImportError as e:
        print(f"\n[Airwave Error] Failed to import PySide6 UI dependencies: {e}")
        print("                Please run: pip install -r requirements.txt")
        sys.exit(1)

if __name__ == "__main__":
    main()
