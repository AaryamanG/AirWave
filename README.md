# Airwave

Hands-free computing with your webcam.

Airwave is an AI-powered desktop application that turns a normal laptop webcam into a hands-free mouse replacement. It lets users control the cursor, click, drag, and scroll using simple hand gestures without needing a physical mouse or touchpad.

Built for Windows using Python, OpenCV, MediaPipe, and C++ acceleration for low-latency gesture processing.

## Features

- Real-time hand tracking using webcam
- Cursor movement using index fingertip
- Left click using thumb-index pinch
- Right click using alternate gesture
- Drag and drop using hold pinch
- Scroll using palm tilt or vertical gesture
- Gesture smoothing and debouncing
- Sensitivity and calibration controls
- Live camera preview with landmarks overlay
- Modern desktop UI
- Performance-critical modules in C++

## How it works

1. Captures webcam frames using OpenCV
2. Detects hand landmarks using MediaPipe
3. Interprets gestures from landmark positions
4. Maps gestures to mouse actions
5. Uses C++ modules for smoothing, gesture classification, and low-latency cursor mapping

## Tech stack

- Python 3.11+
- OpenCV
- MediaPipe
- PySide6 or PyQt6
- pyautogui or pynput
- NumPy
- C++17
- pybind11

## Installation

### Clone the repository

```bash
git clone https://github.com/your-username/airwave.git
cd airwave
