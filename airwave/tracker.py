import cv2
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

# Pure Python Fallbacks for the C++ acceleration elements (to ensure robustness)
class PythonGestureSmoothing:
    def __init__(self, ema_alpha=0.25, trend_beta=0.15, history_len=5):
        self.alpha = ema_alpha
        self.beta = trend_beta
        self.last_x = 0.0
        self.last_y = 0.0
        self.trend_x = 0.0
        self.trend_y = 0.0
        self.is_initialized = False
        self.history = []
        self.max_history_size = history_len

    def reset(self):
        self.is_initialized = False
        self.last_x, self.last_y = 0.0, 0.0
        self.trend_x, self.trend_y = 0.0, 0.0
        self.history.clear()

    def smooth(self, x, y):
        if not self.is_initialized:
            self.last_x, self.last_y = x, y
            self.trend_x, self.trend_y = 0.0, 0.0
            self.is_initialized = True
            self.history.append((x, y))
            return x, y

        # Impulse Noise Spike Limiter
        if self.history:
            prev_x, prev_y = self.history[-1]
            dx, dy = x - prev_x, y - prev_y
            dist = math.sqrt(dx*dx + dy*dy)
            if dist > 0.15 and len(self.history) >= 3:
                x = prev_x + dx * 0.2
                y = prev_y + dy * 0.2

        prev_smooth_x, prev_smooth_y = self.last_x, self.last_y

        self.last_x = self.alpha * x + (1.0 - self.alpha) * (prev_smooth_x + self.trend_x)
        self.last_y = self.alpha * y + (1.0 - self.alpha) * (prev_smooth_y + self.trend_y)

        self.trend_x = self.beta * (self.last_x - prev_smooth_x) + (1.0 - self.beta) * self.trend_x
        self.trend_y = self.beta * (self.last_y - prev_smooth_y) + (1.0 - self.beta) * self.trend_y

        self.history.append((self.last_x, self.last_y))
        if len(self.history) > self.max_history_size:
            self.history.pop(0)

        return self.last_x, self.last_y


class PythonGestureClassifier:
    def __init__(self, pinch_thresh=0.04, scroll_dead=0.03):
        self.pinch_threshold = pinch_thresh
        self.scroll_deadzone = scroll_dead

    def get_dist(self, landmarks, idA, idB):
        if len(landmarks) < 63:
            return 999.0
        dx = landmarks[idA * 3] - landmarks[idB * 3]
        dy = landmarks[idA * 3 + 1] - landmarks[idB * 3 + 1]
        dz = landmarks[idA * 3 + 2] - landmarks[idB * 3 + 2]
        return math.sqrt(dx*dx + dy*dy + dz*dz)

    def is_index_pinched(self, landmarks):
        return self.get_dist(landmarks, 4, 8) < self.pinch_threshold

    def is_middle_pinched(self, landmarks):
        return self.get_dist(landmarks, 4, 12) < self.pinch_threshold

    def is_ring_pinched(self, landmarks):
        return self.get_dist(landmarks, 4, 16) < self.pinch_threshold

    def is_pinky_pinched(self, landmarks):
        return self.get_dist(landmarks, 4, 20) < self.pinch_threshold

    def is_open_palm(self, landmarks):
        if len(landmarks) < 63:
            return False
        thumb_dist = self.get_dist(landmarks, 4, 5)
        # Check finger extensions relative to PIP coordinates
        index_up = landmarks[8 * 3 + 1] < landmarks[6 * 3 + 1]
        middle_up = landmarks[12 * 3 + 1] < landmarks[10 * 3 + 1]
        ring_up = landmarks[16 * 3 + 1] < landmarks[14 * 3 + 1]
        pinky_up = landmarks[20 * 3 + 1] < landmarks[18 * 3 + 1]
        return (thumb_dist > 0.06) and index_up and middle_up and ring_up and pinky_up

    def get_scroll_speed(self, landmarks, prev_landmarks):
        if len(landmarks) < 63 or len(prev_landmarks) < 63:
            return 0.0
        index_up = landmarks[8 * 3 + 1] < landmarks[6 * 3 + 1]
        middle_up = landmarks[12 * 3 + 1] < landmarks[10 * 3 + 1]
        ring_down = landmarks[16 * 3 + 1] > landmarks[14 * 3 + 1]
        pinky_down = landmarks[20 * 3 + 1] > landmarks[18 * 3 + 1]

        if index_up and middle_up and ring_down and pinky_down:
            current_y = (landmarks[8 * 3 + 1] + landmarks[12 * 3 + 1]) / 2.0
            previous_y = (prev_landmarks[8 * 3 + 1] + prev_landmarks[12 * 3 + 1]) / 2.0
            dy = current_y - previous_y
            if abs(dy) > self.scroll_deadzone:
                return -dy
        return 0.0

    def classify_gesture(self, landmarks):
        if len(landmarks) < 63:
            return "none"
        if self.is_open_palm(landmarks):
            return "open_palm"
        if self.is_index_pinched(landmarks):
            return "left_pinch"
        if self.is_middle_pinched(landmarks):
            return "right_pinch"
        if self.is_ring_pinched(landmarks):
            return "ring_pinch"
        if self.is_pinky_pinched(landmarks):
            return "pinky_pinch"

        # Check scroll posture
        index_up = landmarks[8 * 3 + 1] < landmarks[6 * 3 + 1]
        middle_up = landmarks[12 * 3 + 1] < landmarks[10 * 3 + 1]
        ring_down = landmarks[16 * 3 + 1] > landmarks[14 * 3 + 1]
        pinky_down = landmarks[20 * 3 + 1] > landmarks[18 * 3 + 1]
        if index_up and middle_up and ring_down and pinky_down:
            return "scroll_ready"

        return "neutral"


class PythonCursorMapper:
    def __init__(self, w=1920, h=1080, sens=1.5, accel=2.0, padding=20.0):
        self.screen_w = w
        self.screen_h = h
        self.sensitivity = sens
        self.acceleration = accel
        self.edge_padding = padding
        self.min_x, self.max_x = 0.2, 0.8
        self.min_y, self.max_y = 0.2, 0.7
        self.last_screen_x, self.last_screen_y = 0.0, 0.0
        self.has_previous = False

    def set_screen_resolution(self, w, h):
        self.screen_h, self.screen_w = h, w

    def set_sensitivity(self, s):
        self.sensitivity = s

    def set_acceleration(self, a):
        self.acceleration = a

    def set_camera_bounds(self, xmin, xmax, ymin, ymax):
        self.min_x, self.max_x = xmin, xmax
        self.min_y, self.max_y = ymin, ymax

    def reset(self):
        self.has_previous = False

    def map_coordinates(self, cam_x, cam_y):
        nx = (cam_x - self.min_x) / (self.max_x - self.min_x)
        ny = (cam_y - self.min_y) / (self.max_y - self.min_y)
        nx = max(0.0, min(1.0, nx))
        ny = max(0.0, min(1.0, ny))

        target_x = nx * self.screen_w
        target_y = ny * self.screen_h

        if not self.has_previous:
            self.last_screen_x, self.last_screen_y = target_x, target_y
            self.has_previous = True
            return int(target_x), int(target_y)

        dx = target_x - self.last_screen_x
        dy = target_y - self.last_screen_y
        dist = math.sqrt(dx*dx + dy*dy)

        multiplier = 1.0
        if dist > 0.1:
            multiplier = math.pow(dist * 0.05, self.acceleration - 1.0) * self.sensitivity
            multiplier = max(0.2, min(3.5, multiplier))

        final_x = self.last_screen_x + dx * multiplier
        final_y = self.last_screen_y + dy * multiplier

        # Border locking
        if final_x < self.edge_padding: final_x = 0
        if final_x > self.screen_w - self.edge_padding: final_x = self.screen_w
        if final_y < self.edge_padding: final_y = 0
        if final_y > self.screen_h - self.edge_padding: final_y = self.screen_h

        self.last_screen_x, self.last_screen_y = final_x, final_y
        return int(round(final_x)), int(round(final_y))


class AirwaveTracker:
    def __init__(self):
        self.config = AirwaveConfig()
        
        # Pull parameters from config
        self.pinch_thresh = self.config.get("gestures", "pinch_threshold")
        self.scroll_dead = self.config.get("gestures", "scroll_deadzone")
        self.mouse_speed = self.config.get("mouse", "speed")
        self.mouse_accel = self.config.get("mouse", "acceleration")
        self.padding = self.config.get("mouse", "edge_padding")

        # Initialize core components (using C++ module if compiled, otherwise fallback to Python implementation)
        if CPP_ACCEL_AVAILABLE:
            self.smoothing = airwave_cpp_accel.GestureSmoothing(0.25, 0.15, 5)
            self.classifier = airwave_cpp_accel.GestureClassifier(self.pinch_thresh, self.scroll_dead)
            self.mapper = airwave_cpp_accel.CursorMapper(1920, 1080, self.mouse_speed, self.mouse_accel, self.padding)
        else:
            self.smoothing = PythonGestureSmoothing(0.25, 0.15, 5)
            self.classifier = PythonGestureClassifier(self.pinch_thresh, self.scroll_dead)
            self.mapper = PythonCursorMapper(1920, 1080, self.mouse_speed, self.mouse_accel, self.padding)

        # MediaPipe Hands pipeline setup
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        self.mp_draw = mp.solutions.drawing_utils

        self.prev_landmarks = []
        self.is_tracking = False

    def update_config_params(self):
        """Update tracker settings dynamically from current shared configuration values."""
        self.pinch_thresh = self.config.get("gestures", "pinch_threshold")
        self.scroll_dead = self.config.get("gestures", "scroll_deadzone")
        self.mouse_speed = self.config.get("mouse", "speed")
        self.mouse_accel = self.config.get("mouse", "acceleration")

        if CPP_ACCEL_AVAILABLE:
            self.classifier.set_pinch_threshold(self.pinch_thresh)
            self.classifier.set_scroll_deadzone(self.scroll_dead)
            self.mapper.set_sensitivity(self.mouse_speed)
            self.mapper.set_acceleration(self.mouse_accel)
        else:
            self.classifier.pinch_threshold = self.pinch_thresh
            self.classifier.scroll_deadzone = self.scroll_dead
            self.mapper.set_sensitivity(self.mouse_speed)
            self.mapper.set_acceleration(self.mouse_accel)

    def process_frame(self, frame):
        """
        Main pipeline process:
        1. RGB conversions
        2. MediaPipe detection
        3. Feature scaling and landmarks list generation
        4. Smooth/Map Index finger tip coordinates
        5. Gesture Classification
        Returns: (annotated_frame, cursor_coords, active_gesture, status_flags)
        """
        if frame is None:
            return None, None, "none", {"hand_detected": False}

        # Dynamic parameter sync
        self.update_config_params()

        h, w, c = frame.shape
        # Flip frame horizontally to act like a real mirror reflecting input
        if self.config.get("camera", "mirror"):
            frame = cv2.flip(frame, 1)

        # Convert colors to RGB for mediapipe processing
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(rgb_frame)

        hand_detected = False
        cursor_coords = None
        active_gesture = "neutral"
        landmarks_flat = []

        if results.multi_hand_landmarks:
            hand_detected = True
            for hand_lms in results.multi_hand_landmarks:
                # Optionally draw visual guide landmarks
                self.mp_draw.draw_landmarks(frame, hand_lms, self.mp_hands.HAND_CONNECTIONS)

                # Flatten landmarks list [x0, y0, z0, x1, y1, z1...]
                for lm in hand_lms.landmark:
                    landmarks_flat.extend([lm.x, lm.y, lm.z])

                # Index fingertip is landmark ID 8
                index_tip_x = hand_lms.landmark[8].x
                index_tip_y = hand_lms.landmark[8].y

                # C++ Smoothing Module Pipeline
                sm_x, sm_y = self.smoothing.smooth(index_tip_x, index_tip_y)

                # C++ Coordinate Screen Mapping
                cursor_coords = self.mapper.map_coordinates(sm_x, sm_y)

                # Gesture categorization via Classifier C++ bindings
                active_gesture = self.classifier.classify_gesture(landmarks_flat)

                # Scroll tracking
                if active_gesture == "scroll_ready" and self.prev_landmarks:
                    scroll_speed = self.classifier.get_scroll_speed(landmarks_flat, self.prev_landmarks)
                    if abs(scroll_speed) > 0.005:
                        active_gesture = f"scroll_{'down' if scroll_speed < 0 else 'up'}"

                self.prev_landmarks = landmarks_flat.copy()
                break # Only process one hand for simplicity
        else:
            self.smoothing.reset()
            self.mapper.reset()
            self.prev_landmarks = []

        status_flags = {
            "hand_detected": hand_detected,
            "latency_ms": 0.0 # Will be populated by timer
        }

        return frame, cursor_coords, active_gesture, status_flags
