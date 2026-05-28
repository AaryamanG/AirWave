#include <vector>
#include <cmath>
#include <string>

class GestureClassifier {
private:
    double pinch_threshold;
    double scroll_deadzone;
    
    // Auxiliary helper for Euclidean distance in 3D
    double get_dist(const std::vector<double>& lm, int idA, int idB) {
        if (lm.size() < 63) return 999.0;
        double dx = lm[idA * 3] - lm[idB * 3];
        double dy = lm[idA * 3 + 1] - lm[idB * 3 + 1];
        double dz = lm[idA * 3 + 2] - lm[idB * 3 + 2];
        return std::sqrt(dx * dx + dy * dy + dz * dz);
    }

public:
    GestureClassifier(double pinch_thresh = 0.04, double scroll_dead = 0.03)
        : pinch_threshold(pinch_thresh), scroll_deadzone(scroll_dead) {}

    // Pinch evaluation (e.g. thumb tip is ID 4, index tip is ID 8)
    bool is_index_pinched(const std::vector<double>& landmarks) {
        double dist = get_dist(landmarks, 4, 8); // Thumb Tip (4) & Index Tip (8)
        return dist < pinch_threshold;
    }

    bool is_middle_pinched(const std::vector<double>& landmarks) {
        double dist = get_dist(landmarks, 4, 12); // Thumb Tip (4) & Middle Tip (12)
        return dist < pinch_threshold;
    }

    bool is_ring_pinched(const std::vector<double>& landmarks) {
        double dist = get_dist(landmarks, 4, 16); // Thumb Tip (4) & Ring Tip (16)
        return dist < pinch_threshold;
    }

    bool is_pinky_pinched(const std::vector<double>& landmarks) {
        double dist = get_dist(landmarks, 4, 20); // Thumb Tip (4) & Pinky Tip (20)
        return dist < pinch_threshold;
    }

    // Checking if palm is open (e.g. fingers extended)
    // We check if fingertips (8, 12, 16, 20) are far away from MCP joints (5, 9, 13, 17)
    bool is_open_palm(const std::vector<double>& landmarks) {
        if (landmarks.size() < 63) return false;
        
        // Thumb extended: Tip (4) lies to the side/far from index MCP (5)
        double thumb_dist = get_dist(landmarks, 4, 5);
        
        // Check other fingers: Tip is higher (smaller Y value) than PIP joint for each finger
        // MediaPipe coords: Y increases downwards in screen.
        bool index_up = landmarks[8 * 3 + 1] < landmarks[6 * 3 + 1];
        bool middle_up = landmarks[12 * 3 + 1] < landmarks[10 * 3 + 1];
        bool ring_up = landmarks[16 * 3 + 1] < landmarks[14 * 3 + 1];
        bool pinky_up = landmarks[20 * 3 + 1] < landmarks[18 * 3 + 1];

        return (thumb_dist > 0.06) && index_up && middle_up && ring_up && pinky_up;
    }

    // Scroll evaluation: Returns wheel tick action value
    // Two-finger vertical drag (Index and Middle are straight and together, others closed)
    // We can evaluate double finger drag vector:
    double get_scroll_speed(const std::vector<double>& landmarks, const std::vector<double>& prev_landmarks) {
        if (landmarks.size() < 63 || prev_landmarks.size() < 63) return 0.0;
        
        // Check if index (8) and middle (12) are straight (both open)
        bool index_open = landmarks[8 * 3 + 1] < landmarks[6 * 3 + 1];
        bool middle_open = landmarks[12 * 3 + 1] < landmarks[10 * 3 + 1];
        bool ring_closed = landmarks[16 * 3 + 1] > landmarks[14 * 3 + 1];
        bool pinky_closed = landmarks[20 * 3 + 1] > landmarks[18 * 3 + 1];

        // If index and middle open, while ring and pinky are closed, calculate vertical movement
        if (index_open && middle_open && ring_closed && pinky_closed) {
            // Index finger tip Y difference
            double current_y = (landmarks[8 * 3 + 1] + landmarks[12 * 3 + 1]) / 2.0;
            double previous_y = (prev_landmarks[8 * 3 + 1] + prev_landmarks[12 * 3 + 1]) / 2.0;
            double dy = current_y - previous_y;

            if (std::abs(dy) > scroll_deadzone) {
                return -dy; // Reversing so that moving hand UP scrolls Up/Down appropriately
            }
        }
        return 0.0;
    }

    // Classify overall hand mode
    std::string classify_gesture(const std::vector<double>& landmarks) {
        if (landmarks.size() < 63) return "none";
        
        if (is_open_palm(landmarks)) {
            return "open_palm";
        }
        
        if (is_index_pinched(landmarks)) {
            return "left_pinch";
        }
        
        if (is_middle_pinched(landmarks)) {
            return "right_pinch";
        }

        if (is_ring_pinched(landmarks)) {
            return "ring_pinch";
        }

        if (is_pinky_pinched(landmarks)) {
            return "pinky_pinch";
        }

        // Check if scrolling (index and middle fingers open, other fingers closed)
        bool index_open = landmarks[8 * 3 + 1] < landmarks[6 * 3 + 1];
        bool middle_open = landmarks[12 * 3 + 1] < landmarks[10 * 3 + 1];
        bool ring_closed = landmarks[16 * 3 + 1] > landmarks[14 * 3 + 1];
        bool pinky_closed = landmarks[20 * 3 + 1] > landmarks[18 * 3 + 1];

        if (index_open && middle_open && ring_closed && pinky_closed) {
            return "scroll_ready";
        }

        return "neutral";
    }

    // Setters
    void set_pinch_threshold(double t) { pinch_threshold = t; }
    void set_scroll_deadzone(double d) { scroll_deadzone = d; }
};
