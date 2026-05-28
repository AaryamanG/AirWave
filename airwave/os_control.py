import sys
import os
import time

try:
    import pyautogui
    # Disabling pyautogui fail-safe can be risky, but we rely on a clean UI STOP button instead.
    # We keep it enabled so dragging to corner pauses tracking as a safety valve.
    pyautogui.FAILSAFE = True
    PYAUTOGUI_AVAILABLE = True
except Exception:
    PYAUTOGUI_AVAILABLE = False
    print("[Airwave OS Control] PyAutoGUI not initialized. Simulated virtual actions instead.")

class AirwaveOSController:
    def __init__(self):
        self.is_dragging = False
        self.last_click_time = 0.0
        self.click_debounce = 0.25 # seconds

    def execute_action(self, cursor_pos, gesture):
        """
        Takes coordinates and classified gestures, mapping them into real native Windows events.
        """
        if cursor_pos is None:
            # If dragged, release if hand goes out of view
            if self.is_dragging:
                self.release_drag()
            return

        x, y = cursor_pos

        # Move mouse cursor (default behavior)
        if PYAUTOGUI_AVAILABLE:
            try:
                # If dragging, move dragging cursor, else move normally
                if gesture == "left_pinch":
                    if not self.is_dragging:
                        self.start_drag(x, y)
                    else:
                        pyautogui.dragTo(x, y, duration=0.0)
                else:
                    if self.is_dragging:
                        self.release_drag()
                    pyautogui.moveTo(x, y)
            except Exception as e:
                # Fail-safe triggered (mouse moved to corner)
                print(f"[Airwave FAILSAFE] PyAutoGUI action failed: {e}")
                gesture = "pause_tracking" # Signal stop
        else:
            print(f"[Airwave Sim] Moving mouse cursor to ({x}, {y})")

        # Action-specific triggers (Pinch / Clicks / Scrolls)
        now = time.time()
        if now - self.last_click_time < self.click_debounce:
            return  # Debounce clicks to avoid multi-register triggers

        if gesture == "right_pinch":
            self.right_click()
            self.last_click_time = now
            
        elif gesture == "ring_pinch":
            self.middle_click()
            self.last_click_time = now
            
        elif gesture == "pinky_pinch":
            self.trigger_screenshot()
            self.last_click_time = now
            
        elif "scroll_up" in gesture:
            self.scroll_wheel(120)  # Scroll up
            
        elif "scroll_down" in gesture:
            self.scroll_wheel(-120) # Scroll down

    def start_drag(self, x, y):
        self.is_dragging = True
        if PYAUTOGUI_AVAILABLE:
            try:
                pyautogui.mouseDown(x, y, button='left')
                print(f"[Airwave OS] Start Drag-Hold at ({x}, {y})")
            except Exception:
                pass
        else:
            print(f"[Airwave Sim] Drag-Hold Active at ({x}, {y})")

    def release_drag(self):
        self.is_dragging = False
        if PYAUTOGUI_AVAILABLE:
            try:
                pyautogui.mouseUp()
                print("[Airwave OS] Drag-Hold Released")
            except Exception:
                pass
        else:
            print("[Airwave Sim] Drag-Hold Released")

    def right_click(self):
        if PYAUTOGUI_AVAILABLE:
            try:
                pyautogui.rightClick()
                print("[Airwave OS] Right Click Triggered")
            except Exception:
                pass
        else:
            print("[Airwave Sim] Right Click Pressed")

    def middle_click(self):
        if PYAUTOGUI_AVAILABLE:
            try:
                pyautogui.middleClick()
                print("[Airwave OS] Middle Click Triggered")
            except Exception:
                pass
        else:
            print("[Airwave Sim] Middle Click Pressed")

    def scroll_wheel(self, amount):
        if PYAUTOGUI_AVAILABLE:
            try:
                # pyautogui scroll takes ticks
                pyautogui.scroll(amount)
                # print(f"[Airwave OS] Scroll Wheel Action: {amount}")
            except Exception:
                pass
        else:
            print(f"[Airwave Sim] Scrolling Wheel Amount: {amount}")

    def trigger_screenshot(self):
        if PYAUTOGUI_AVAILABLE:
            try:
                # Trigger screen capture
                img = pyautogui.screenshot()
                # Create saving path
                filename = f"airwave_screenshot_{int(time.time())}.png"
                img.save(filename)
                print(f"[Airwave OS] Screenshot saved to: {filename}")
            except Exception as e:
                print(f"Failed screenshot: {e}")
        else:
            print("[Airwave Sim] Snipping Screenshot Event Saved.")
