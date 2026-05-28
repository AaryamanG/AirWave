export interface CodeFile {
  name: string;
  path: string;
  language: "python" | "cpp" | "json" | "markdown";
  content: string;
}

export const codeFiles: CodeFile[] = [
  {
    name: "main.py",
    path: "airwave/main.py",
    language: "python",
    content: `#!/usr/bin/env python3
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

    print("\\n[Airwave Main] Launching PySide6 Modern Dark UI Interface...")
    
    # 3. Launch PySide6 GUI loop
    try:
        from ui import main as launch_ui
        launch_ui()
    except ImportError as e:
        print(f"\\n[Airwave Error] Failed to import PySide6 UI dependencies: {e}")
        print("                Please run: pip install -r requirements.txt")
        sys.exit(1)

if __name__ == "__main__":
    main()`
  },
  {
    name: "ui.py",
    path: "airwave/ui.py",
    language: "python",
    content: `import sys
import os
import time
import cv2
from PySide6.QtCore import Qt, QThread, Signal, Slot, QTimer
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QSlider, QComboBox, QGroupBox, QStackedWidget,
    QProgressBar, QMessageBox
)
from PySide6.QtGui import QImage, QPixmap, QFont, QIcon, QColor

# Import core modules
from config import AirwaveConfig
from tracker import AirwaveTracker
from os_control import AirwaveOSController


class VideoThread(QThread):
    # Signals to communicate frame and metrics back to UI Main Thread
    change_pixmap_signal = Signal(QImage)
    gesture_detected_signal = Signal(str, tuple) # (gesture_name, (x, y) coordinates)
    status_signal = Signal(dict) # general stats dictionary for the UI

    def __init__(self):
        super().__init__()
        self._run_flag = True
        self.tracker = None
        self.os_controller = None
        self.config = AirwaveConfig()
        
    def stop(self):
        self._run_flag = False
        self.wait()

    def run(self):
        # Instantiate tracker and OS Action handler inside subthread context
        self.tracker = AirwaveTracker()
        self.os_controller = AirwaveOSController()
        
        # Open OpenCV capture
        cam_idx = self.config.get("camera", "device_index")
        cap = cv2.VideoCapture(cam_idx)
        
        # Set resolutions
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.get("camera", "width"))
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.get("camera", "height"))

        last_fps_time = time.time()
        frame_counter = 0

        while self._run_flag:
            start_proc_time = time.time()
            ret, cv_img = cap.read()
            if not ret:
                time.sleep(0.01)
                continue

            # Capture pipeline execution (MediaPipe overlay + Smoothing + Classification)
            processed_img, cursor_pos, active_gesture, status_flags = self.tracker.process_frame(cv_img)
            
            # FPS tracking
            frame_counter += 1
            curr_time = time.time()
            if curr_time - last_fps_time >= 1.0:
                status_flags["fps"] = frame_counter
                frame_counter = 0
                last_fps_time = curr_time
            else:
                status_flags["fps"] = 30 # placeholder default

            # Execute real-world mouse hooks/actions
            if self.is_tracking_active:
                self.os_controller.execute_action(cursor_pos, active_gesture)

            # Measure latency
            end_proc_time = time.time()
            status_flags["latency_ms"] = (end_proc_time - start_proc_time) * 1000.0

            # Convert OpenCV BGR to RGB, then package it inside QImage
            rgb_image = cv2.cvtColor(processed_img, cv2.COLOR_BGR2RGB)
            h, w, ch = rgb_image.shape
            bytes_per_line = ch * w
            qt_img = QImage(rgb_image.data, w, h, bytes_per_line, QImage.Format_RGB888)
            
            # Emit updates to MainWindow slots
            self.change_pixmap_signal.emit(qt_img)
            self.gesture_detected_signal.emit(active_gesture, cursor_pos or (0, 0))
            self.status_signal.emit(status_flags)

            # Limit framework processing loops
            time.sleep(0.01)

        cap.release()

    @property
    def is_tracking_active(self):
        # Allows toggling actual OS cursor movement from the UI
        return getattr(self, "_tracking_active", True)

    @is_tracking_active.setter
    def is_tracking_active(self, val):
        self._tracking_active = val


class AirwaveMainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.config = AirwaveConfig()
        self.config.load_from_file() # Load json thresholds

        self.setWindowTitle("Airwave - Gestures Control Panel")
        self.resize(1020, 680)

        # Style Sheets: Modern minimalist dark slate interface
        self.setStyleSheet("""
            QMainWindow { background-color: #0F172A; }
            QWidget { color: #F8FAFC; font-family: 'Inter', sans-serif; }
            QLabel { font-size: 13px; color: #94A3B8; }
            QLabel#TitleLabel { font-size: 24px; font-weight: bold; color: #FFFFFF; }
            QPushButton { background-color: #2563EB; color: white; border-radius: 6px; padding: 10px 18px; }
            /* QSS Style declarations simplified for brevity */
        """)

        # Thread state container
        self.thread = None
        self.is_tracking_enabled = True

        self._build_ui()
        self._start_camera_capture()

    def _build_ui(self):
        # Builds Left layout, Camera Preview feed and right configuration panels 
        pass`
  },
  {
    name: "tracker.py",
    path: "airwave/tracker.py",
    language: "python",
    content: `import cv2
import mediapipe as mp
import time
import math
import numpy as np

# Try to import our pybind11 C++ acceleration library
# If it is not compiled, fall back to Python equivalents gracefully!
try:
    import airwave_cpp_accel
    CPP_ACCEL_AVAILABLE = True
    print("[Airwave Init] C++ Acceleration Module Loaded Successfully.")
except ImportError:
    CPP_ACCEL_AVAILABLE = False
    print("[Airwave Init] C++ acceleration module not found. Building pure-Python fallbacks.")

from config import AirwaveConfig


class PythonGestureSmoothing:
    def __init__(self, ema_alpha=0.25, trend_beta=0.15, history_len=5):
        self.alpha = ema_alpha
        self.beta = trend_beta
        self.last_x, self.last_y = 0.0, 0.0
        self.trend_x, self.trend_y = 0.0, 0.0
        self.is_initialized = False
        self.history = []

    def smooth(self, x, y):
        # Exponential moving double filter algorithm to output filtered values
        pass


class AirwaveTracker:
    def __init__(self):
        self.config = AirwaveConfig()
        self.pinch_thresh = self.config.get("gestures", "pinch_threshold")
        self.scroll_dead = self.config.get("gestures", "scroll_deadzone")

        if CPP_ACCEL_AVAILABLE:
            self.smoothing = airwave_cpp_accel.GestureSmoothing(0.25, 0.15, 5)
            self.classifier = airwave_cpp_accel.GestureClassifier(self.pinch_thresh, self.scroll_dead)
            self.mapper = airwave_cpp_accel.CursorMapper(1920, 1080)
        else:
            self.smoothing = PythonGestureSmoothing()
            self.classifier = PythonGestureClassifier()
            self.mapper = PythonCursorMapper()

    def process_frame(self, frame):
        # Processes Camera BGR Frame, scales landmarks, smooths, classifies gestures
        pass`
  },
  {
    name: "os_control.py",
    path: "airwave/os_control.py",
    language: "python",
    content: `import sys
import os
import time

try:
    import pyautogui
    pyautogui.FAILSAFE = True
    PYAUTOGUI_AVAILABLE = True
except Exception:
    PYAUTOGUI_AVAILABLE = False

class AirwaveOSController:
    def __init__(self):
        self.is_dragging = False

    def execute_action(self, cursor_pos, gesture):
        if cursor_pos is None:
            return
        x, y = cursor_pos
        # Execution mapping to pyautogui mouse events
        pass`
  },
  {
    name: "config.py",
    path: "airwave/config.py",
    language: "python",
    content: `import json
import os

class AirwaveConfig:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AirwaveConfig, cls).__new__(cls)
            cls._instance._load_defaults()
        return cls._instance

    def _load_defaults(self):
        self.data = {
            "camera": { "device_index": 0, "width": 640 },
            "mouse": { "speed": 1.5, "acceleration": 2.0 },
            "gestures": { "pinch_threshold": 0.04 }
        }

    def load_from_file(self, filepath="config.json"):
        pass`
  },
  {
    name: "gesture_smoothing.cpp",
    path: "airwave/cpp/src/gesture_smoothing.cpp",
    language: "cpp",
    content: `#include <vector>
#include <deque>

class GestureSmoothing {
private:
    double alpha;         // Smoother factor for EMA (0.0 < alpha <= 1.0)
    double last_x;
    double last_y;
    bool is_initialized;

    double beta;          // Trend factor
    double trend_x;
    double trend_y;

public:
    GestureSmoothing(double ema_alpha = 0.25, double trend_beta = 0.15)
        : alpha(ema_alpha), beta(trend_beta), last_x(0.0), last_y(0.0), is_initialized(false) {}

    std::pair<double, double> smooth(double x, double y) {
        if (!is_initialized) {
            last_x = x; last_y = y; is_initialized = true;
            return {x, y};
        }
        // Double Exponential Moving Average formula minimizing visual lag
        double prev_smooth_x = last_x;
        last_x = alpha * x + (1.0 - alpha) * (prev_smooth_x + trend_x);
        trend_x = beta * (last_x - prev_smooth_x) + (1.0 - beta) * trend_x;
        return {last_x, last_y};
    }
};`
  },
  {
    name: "gesture_classifier.cpp",
    path: "airwave/cpp/src/gesture_classifier.cpp",
    language: "cpp",
    content: `#include <vector>
#include <cmath>
#include <string>

class GestureClassifier {
private:
    double pinch_threshold;
    double scroll_deadzone;

public:
    GestureClassifier(double pinch_thresh = 0.04, double scroll_dead = 0.03)
        : pinch_threshold(pinch_thresh), scroll_deadzone(scroll_dead) {}

    bool is_index_pinched(const std::vector<double>& landmarks) {
        // Calculate 3D euclidean distance between Thumb TIP (4) and Index TIP (8)
        return false;
    }

    std::string classify_gesture(const std::vector<double>& landmarks) {
        // Identify pinching or scrolling modes using landmark arrays
        return "neutral";
    }
};`
  },
  {
    name: "cursor_mapper.cpp",
    path: "airwave/cpp/src/cursor_mapper.cpp",
    language: "cpp",
    content: `#include <algorithm>
#include <cmath>

class CursorMapper {
private:
    int screen_w;
    int screen_h;
    double sensitivity;
    double acceleration;

public:
    CursorMapper(int w = 1920, int h = 1080) : screen_w(w), screen_h(h) {}

    std::pair<int, int> map_coordinates(double cam_x, double cam_y) {
        // Dynamic acceleration scaling and edge paddings mapping to absolute pixel coordinates
        return {0, 0};
    }
};`
  },
  {
    name: "bindings.cpp",
    path: "airwave/cpp/src/bindings.cpp",
    language: "cpp",
    content: `#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include "gesture_smoothing.cpp"
#include "gesture_classifier.cpp"
#include "cursor_mapper.cpp"

namespace py = pybind11;

PYBIND11_MODULE(airwave_cpp_accel, m) {
    m.doc() = "Airwave high-performance real-time gesture smoothing & classifier bindings";

    py::class_<GestureSmoothing>(m, "GestureSmoothing")
        .def(py::init<double, double, size_t>())
        .def("smooth", &GestureSmoothing::smooth);

    py::class_<GestureClassifier>(m, "GestureClassifier")
        .def(py::init<double, double>())
        .def("classify_gesture", &GestureClassifier::classify_gesture);

    py::class_<CursorMapper>(m, "CursorMapper")
        .def(py::init<int, int, double, double, double>())
        .def("map_coordinates", &CursorMapper::map_coordinates);
}`
  },
  {
    name: "setup.py",
    path: "airwave/setup.py",
    language: "python",
    content: `from setuptools import setup, Extension
from setuptools.command.build_ext import build_ext

class BuildExt(build_ext):
    def build_extensions(self):
        # Configure standard MSVC compilation flags (/std:c++17) and Unix GCC flags (-std=c++17)
        pass`
  },
  {
    name: "config.json",
    path: "airwave/config.json",
    language: "json",
    content: `{
  "camera": {
    "device_index": 0,
    "width": 640,
    "height": 480,
    "mirror": true,
    "fps": 30
  },
  "mouse": {
    "speed": 1.5,
    "acceleration": 2.0,
    "jitter_threshold": 0.002,
    "interpolation_factor": 0.25,
    "edge_padding": 20
  },
  "gestures": {
    "pinch_threshold": 0.04,
    "click_debounce_ms": 150,
    "scroll_deadzone": 0.03,
    "scroll_sensitivity": 0.5,
    "pause_palm_seconds": 1.0
  },
  "mappings": {
    "pinch_index": "left_click",
    "pinch_middle": "right_click",
    "pinch_ring": "middle_click",
    "pinch_pinky": "screenshot",
    "two_finger_up_down": "scroll",
    "open_palm_timeout": "pause_tracking"
  }
}`
  },
  {
    name: "requirements.txt",
    path: "airwave/requirements.txt",
    language: "json",
    content: `opencv-python>=4.8.0
mediapipe>=0.10.8
PySide6>=6.6.0
pyautogui>=0.9.54
pynput>=1.7.6
numpy>=1.24.3`
  }
];
