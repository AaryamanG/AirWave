import json
import os

class AirwaveConfig:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AirwaveConfig, cls).__new__(cls)
            cls._instance._load_defaults()
        return cls._instance

    def _load_defaults(self):
        # Fail-safe built-in defaults
        self.data = {
            "camera": {
                "device_index": 0,
                "width": 640,
                "height": 480,
                "mirror": True,
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
        }

    def load_from_file(self, filepath="config.json"):
        if os.path.exists(filepath):
            try:
                with open(filepath, "r") as f:
                    file_data = json.load(f)
                    # Recursively update the dictionary
                    self._update_nested_dict(self.data, file_data)
                print(f"Loaded config from {filepath}")
            except Exception as e:
                print(f"Failed to read {filepath}: {e}, using default configs")
        else:
            print(f"Config path {filepath} not found. Creating new config using default values.")
            self.save_to_file(filepath)

    def save_to_file(self, filepath="config.json"):
        try:
            with open(filepath, "w") as f:
                json.dump(self.data, f, indent=2)
            print(f"Saved config to {filepath}")
        except Exception as e:
            print(f"Failed to write config: {e}")

    def _update_nested_dict(self, target, source):
        for k, v in source.items():
            if k in target and isinstance(target[k], dict) and isinstance(v, dict):
                self._update_nested_dict(target[k], v)
            else:
                target[k] = v

    # Convenient accessors
    def get(self, category, key=None):
        if key is None:
            return self.data.get(category)
        return self.data.get(category, {}).get(key)

    def set(self, category, key, value):
        if category not in self.data:
            self.data[category] = {}
        self.data[category][key] = value
