# Airwave Application Build and Packaging Guide

This document provides step-by-step instructions on compiling the performance-critical C++ acceleration layer (`airwave_cpp_accel`) and packaging the full application into a standalone Windows `.exe` executable.

---

## 📋 System Prerequisites

Ensure you have the following installed on your Windows 10/11 system:
1. **Python 3.11+**: Add to system PATH during installation.
2. **C++ Desktop Development Workload**: Install via [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) to get MSVC compiler (`cl.exe`) and MSBuild / CMake.
3. **Webcam**: Standard USB webcam or built-in laptop camera.

---

## 1. Quick Setup & Installing Python Dependencies

Clone or download the project files into a folder (e.g., `C:\Airwave`). Open a terminal window (PowerShell / Command Prompt) in that folder and run the following to set up a virtual environment and load requirements:

```powershell
# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\activate

# Install required Python dependencies
pip install -r requirements.txt
```

---

## 2. Compiling the C++ Acceleration Module

Airwave uses a high-performance C++ module compiled with `pybind11` to perform double-exponential coordinate smoothing, fast vector-space pinch classifications, and coordinate mappings with low latency.

You can compile and build this extension directly into Python in two ways:

### Option A: Using Setuptools (Recommended & Easiest)
From the root directory where `setup.py` resides, run:

```powershell
# Compile C++ modules directly using setup.py
pip install .
```
This automatically invokes MSVC, resolves `pybind11` header files, builds `airwave_cpp_accel.cp311-win_amd64.pyd` binary, and installs it into your virtual environment.

### Option B: Compiling In-Place (For developers)
If you want to compile and keep the compiled `.pyd` module directly within the directory for immediate testing:

```powershell
python setup.py build_ext --inplace
```

---

## 3. Running the Airwave Application

With dependencies ready and C++ compiled, run:

```powershell
python main.py
```

If compilation is skipped or fails, the application will inform you and gracefully load its **built-in Python fallback engine**. You still get full mouse tracking, although C++ acceleration increases processing performance on high refresh-rate monitors.

---

## 4. Packaging into a Standalone Windows Executable (.exe)

To bundle the Python dependencies, OpenCV libraries/assets, MediaPipe data models, and the built C++ `.pyd` extension into a single executable, we use **PyInstaller**.

### Step A: Install PyInstaller
```powershell
pip install pyinstaller
```

### Step B: Build the standalone package using PyInstaller spec configuration
To compile cleanly and avoid missing DLL errors with OpenCV or MediaPipe tracks, run this command:

```powershell
pyinstaller --noconfirm --onedir --windowed --name="Airwave" --add-data "config.json;." --collect-all mediapipe main.py
```

*Explanation of Flags:*
* `--onedir`: Bundles the executable and its libraries in a single neat folder (encouraged for complex apps with heavy media libraries like OpenCV and MediaPipe).
* `--windowed`: Launches directly as a native GUI window without popping a blank console window.
* `--add-data "config.json;."`: Packages your threshold settings.
* `--collect-all mediapipe`: Enforces collection of all internal MediaPipe pre-compiled protobuf classifiers and resources.

This packages the final executable, visible inside `./dist/Airwave/Airwave.exe`.

---

## 🛠 Troubleshooting FAQ

### What happens if I see "Microsoft Visual C++ Build Tools is required"?
Pybind11 is a source-only linking binder, meaning it compiles C++ source codes on-the-fly when installing. Install MSVC build compilers from Visual Studio Build Tools to fix this.

### Why does PyInstaller show a MediaPipe model asset loading error?
MediaPipe looks for model tracks (e.g. hand landmarkers) inside its module. If PyInstaller misses downloading those, make sure you ran `--collect-all mediapipe` so all assets are copied inside the compiled `/dist` directory.
