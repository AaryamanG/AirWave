import sys
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
        # Allows toggling actual OS cursor movement from the UI thread
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
            QMainWindow {
                background-color: #0F172A;
            }
            QWidget {
                color: #F8FAFC;
                font-family: 'Inter', system-ui, sans-serif;
            }
            QLabel {
                font-size: 13px;
                color: #94A3B8;
            }
            QLabel#TitleLabel {
                font-size: 24px;
                font-weight: bold;
                color: #FFFFFF;
                margin-bottom: 2px;
            }
            QLabel#StatusLabel {
                font-size: 14px;
                font-weight: 500;
                padding: 4px 10px;
                background-color: #1E293B;
                border-radius: 4px;
            }
            QPushButton {
                background-color: #2563EB;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 10px 18px;
                font-size: 13px;
                font-weight: 500;
            }
            QPushButton:hover {
                background-color: #3B82F6;
            }
            QPushButton:pressed {
                background-color: #1D4ED8;
            }
            QPushButton#StopButton {
                background-color: #DC2626;
            }
            QPushButton#StopButton:hover {
                background-color: #EF4444;
            }
            QPushButton#SecondaryButton {
                background-color: #334155;
            }
            QPushButton#SecondaryButton:hover {
                background-color: #475569;
            }
            QGroupBox {
                border: 1px solid #334155;
                border-radius: 8px;
                margin-top: 15px;
                padding-top: 15px;
                font-weight: 600;
                color: #F1F5F9;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 4px;
            }
            QSlider::groove:horizontal {
                border: 1px solid #334155;
                height: 6px;
                background: #1E293B;
                border-radius: 3px;
            }
            QSlider::handle:horizontal {
                background: #2563EB;
                width: 14px;
                margin-top: -4px;
                margin-bottom: -4px;
                border-radius: 7px;
            }
            QSlider::handle:horizontal:hover {
                background: #3B82F6;
            }
            QComboBox {
                background-color: #1E293B;
                border: 1px solid #334155;
                border-radius: 4px;
                padding: 5px;
                min-width: 120px;
            }
            QComboBox::drop-down {
                border: none;
            }
        """)

        # Thread state container
        self.thread = None
        self.is_tracking_enabled = True

        self._build_ui()
        self._start_camera_capture()

    def _build_ui(self):
        # 1. Main Widget Container
        central_widget = QWidget(self)
        self.setCentralWidget(central_widget)
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(20)

        # 2. Left Column: Camera Feed and Quick Status
        left_column = QVBoxLayout()
        header_layout = QHBoxLayout()

        title_container = QVBoxLayout()
        self.title_label = QLabel("AIRWAVE", self)
        self.title_label.setObjectName("TitleLabel")
        self.subtitle_label = QLabel("Webcam Hands-free Navigation", self)
        title_container.addWidget(self.title_label)
        title_container.addWidget(self.subtitle_label)
        header_layout.addLayout(title_container)

        header_layout.addStretch()
        self.sys_status_indicator = QLabel("Camera Active", self)
        self.sys_status_indicator.setObjectName("StatusLabel")
        self.sys_status_indicator.setStyleSheet("color: #10B981; background-color: #064E3B; border-radius: 4px;")
        header_layout.addWidget(self.sys_status_indicator)

        left_column.addLayout(header_layout)

        # Video Viewport
        self.cam_screen = QLabel(self)
        self.cam_screen.setFixedSize(580, 435)
        self.cam_screen.setAlignment(Qt.AlignCenter)
        self.cam_screen.setStyleSheet("background-color: #020617; border-radius: 8px; border: 2px solid #1E293B;")
        self.cam_screen.setText("Awaiting Camera Connection...")
        left_column.addWidget(self.cam_screen)

        # Quick Control buttons below Feed
        quick_btns = QHBoxLayout()
        self.toggle_track_btn = QPushButton("Pause OS Mapping", self)
        self.toggle_track_btn.clicked.connect(self._toggle_mouse_mapping)
        quick_btns.addWidget(self.toggle_track_btn)

        self.recalibrate_btn = QPushButton("Recalibrate Center", self)
        self.recalibrate_btn.setObjectName("SecondaryButton")
        self.recalibrate_btn.clicked.connect(self._recalibrate_bounds)
        quick_btns.addWidget(self.recalibrate_btn)

        self.stop_btn = QPushButton("Stop Tracker", self)
        self.stop_btn.setObjectName("StopButton")
        self.stop_btn.clicked.connect(self._stop_tracker)
        quick_btns.addWidget(self.stop_btn)

        left_column.addLayout(quick_btns)
        main_layout.addLayout(left_column, stretch=3)

        # 3. Right Column: Gesture Mappings and Sensitivity Adjustments Scroll View
        right_column = QVBoxLayout()
        
        # Gesture Mapping Editor Category
        mapping_group = QGroupBox("Gesture Mapping Options", self)
        mapping_vbox = QVBoxLayout(mapping_group)

        # Dropdowns
        pinch_index_h = QHBoxLayout()
        pinch_index_h.addWidget(QLabel("Index Pinch Action:"))
        self.index_combo = QComboBox()
        self.index_combo.addItems(["left_click", "right_click", "double_click", "none"])
        self.index_combo.setCurrentText(self.config.get("mappings", "pinch_index"))
        self.index_combo.currentTextChanged.connect(lambda txt: self._save_mapping("pinch_index", txt))
        pinch_index_h.addWidget(self.index_combo)
        mapping_vbox.addLayout(pinch_index_h)

        pinch_middle_h = QHBoxLayout()
        pinch_middle_h.addWidget(QLabel("Middle Pinch Action:"))
        self.middle_combo = QComboBox()
        self.middle_combo.addItems(["left_click", "right_click", "middle_click", "none"])
        self.middle_combo.setCurrentText(self.config.get("mappings", "pinch_middle"))
        self.middle_combo.currentTextChanged.connect(lambda txt: self._save_mapping("pinch_middle", txt))
        pinch_middle_h.addWidget(self.middle_combo)
        mapping_vbox.addLayout(pinch_middle_h)

        pinch_pinky_h = QHBoxLayout()
        pinch_pinky_h.addWidget(QLabel("Pinky Pinch Action:"))
        self.pinky_combo = QComboBox()
        self.pinky_combo.addItems(["screenshot", "mute_media", "none"])
        self.pinky_combo.setCurrentText(self.config.get("mappings", "pinch_pinky"))
        self.pinky_combo.currentTextChanged.connect(lambda txt: self._save_mapping("pinch_pinky", txt))
        pinch_pinky_h.addWidget(self.pinky_combo)
        mapping_vbox.addLayout(pinch_pinky_h)

        right_column.addWidget(mapping_group)

        # Sensitivities group
        sens_group = QGroupBox("Sensitivity & Filters", self)
        sens_vbox = QVBoxLayout(sens_group)

        # Slider Speed
        sens_vbox.addWidget(QLabel("Cursor Travel Speed (Sensitivity):"))
        self.speed_slider = QSlider(Qt.Horizontal)
        self.speed_slider.setMinimum(5)
        self.speed_slider.setMaximum(40)
        self.speed_slider.setValue(int(self.config.get("mouse", "speed") * 10))
        self.speed_slider.valueChanged.connect(self._on_speed_changed)
        self.speed_lbl = QLabel(f"Speed multiplier: {self.config.get('mouse', 'speed')}x")
        sens_vbox.addWidget(self.speed_slider)
        sens_vbox.addWidget(self.speed_lbl)

        # Pinch Threshold Slider
        sens_vbox.addWidget(QLabel("Finger-Tip Pinch Close Distance Threshold:"))
        self.pinch_slider = QSlider(Qt.Horizontal)
        self.pinch_slider.setMinimum(20)
        self.pinch_slider.setMaximum(80)
        self.pinch_slider.setValue(int(self.config.get("gestures", "pinch_threshold") * 1000))
        self.pinch_slider.valueChanged.connect(self._on_pinch_thresh_changed)
        self.pinch_lbl = QLabel(f"Threshold limit: {self.config.get('gestures', 'pinch_threshold')}")
        sens_vbox.addWidget(self.pinch_slider)
        sens_vbox.addWidget(self.pinch_lbl)

        right_column.addWidget(sens_group)

        # Active Telemetry Group
        telemetry_group = QGroupBox("Active Telemetry Engine", self)
        tele_grid = QVBoxLayout(telemetry_group)
        self.hand_detected_lbl = QLabel("Hand Detected: No", self)
        self.fps_lbl = QLabel("Frame Frequency: 0 FPS", self)
        self.latency_lbl = QLabel("Algorithm Latency: 0.0 ms", self)
        self.gesture_lbl = QLabel("Gesture Active: neutral", self)
        
        tele_grid.addWidget(self.hand_detected_lbl)
        tele_grid.addWidget(self.fps_lbl)
        tele_grid.addWidget(self.latency_lbl)
        tele_grid.addWidget(self.gesture_lbl)
        right_column.addWidget(telemetry_group)

        right_column.addStretch()
        main_layout.addLayout(right_column, stretch=2)

    def _start_camera_capture(self):
        # Fire up camera execution in Background Thread
        self.thread = VideoThread()
        self.thread.change_pixmap_signal.connect(self._update_image)
        self.thread.gesture_detected_signal.connect(self._on_gesture_detected)
        self.thread.status_signal.connect(self._on_telemetry_updated)
        self.thread.start()

    @Slot(QImage)
    def _update_image(self, qt_img):
        # Resize/scale raw image to fit camera preview smoothly
        resized = qt_img.scaled(580, 435, Qt.KeepAspectRatio, Qt.SmoothTransformation)
        self.cam_screen.setPixmap(QPixmap.fromImage(resized))

    @Slot(str, tuple)
    def _on_gesture_detected(self, gesture, coords):
        self.gesture_lbl.setText(f"Gesture Active: {gesture.upper()}")

    @Slot(dict)
    def _on_telemetry_updated(self, stats):
        hand = "YES" if stats.get("hand_detected") else "NO"
        self.hand_detected_lbl.setText(f"Hand Detected: {hand}")
        self.fps_lbl.setText(f"Frame Frequency: {stats.get('fps', 30)} FPS")
        self.latency_lbl.setText(f"Algorithm Latency: {stats.get('latency_ms', 0.0):.1f} ms")

        # Color indication depending on hand visibility status
        if stats.get("hand_detected"):
            self.sys_status_indicator.setText("ACTIVE")
            self.sys_status_indicator.setStyleSheet("color: #10B981; background-color: #064E3B; border-radius: 4px; padding: 4px 10px;")
        else:
            self.sys_status_indicator.setText("STANDBY")
            self.sys_status_indicator.setStyleSheet("color: #FBBF24; background-color: #78350F; border-radius: 4px; padding: 4px 10px;")

    def _toggle_mouse_mapping(self):
        self.is_tracking_enabled = not self.is_tracking_enabled
        self.thread.is_tracking_active = self.is_tracking_enabled
        if self.is_tracking_enabled:
            self.toggle_track_btn.setText("Pause OS Mapping")
            self.toggle_track_btn.setStyleSheet("background-color: #2563EB;")
        else:
            self.toggle_track_btn.setText("Resume OS Mapping")
            self.toggle_track_btn.setStyleSheet("background-color: #D97706;")

    def _recalibrate_bounds(self):
        # Reset mouse coordinate mapper to reset standard center
        if self.thread and self.thread.tracker:
            self.thread.tracker.mapper.reset()
            QMessageBox.information(self, "Airwave Calibration", "Cursor center successfully recalibrated! Steady your hand.")

    def _stop_tracker(self):
        self._stop_all()
        self.sys_status_indicator.setText("STOPPED")
        self.sys_status_indicator.setStyleSheet("color: #EF4444; background-color: #7F1D1D; border-radius: 4px; padding: 4px 10px;")
        self.cam_screen.clear()
        self.cam_screen.setText("Tracker Stopped. Restart Application to Reinitialize Camera.")

    def _save_mapping(self, field, value):
        self.config.set("mappings", field, value)
        self.config.save_to_file()

    def _on_speed_changed(self, value):
        multiplier = value / 10.0
        self.speed_lbl.setText(f"Speed multiplier: {multiplier}x")
        self.config.set("mouse", "speed", multiplier)
        self.config.save_to_file()

    def _on_pinch_thresh_changed(self, value):
        thresh = value / 1000.0
        self.pinch_lbl.setText(f"Threshold limit: {thresh}")
        self.config.set("gestures", "pinch_threshold", thresh)
        self.config.save_to_file()

    def _stop_all(self):
        if self.thread:
            self.thread.stop()

    def closeEvent(self, event):
        self._stop_all()
        event.accept()

def main():
    app = QApplication(sys.argv)
    window = AirwaveMainWindow()
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
