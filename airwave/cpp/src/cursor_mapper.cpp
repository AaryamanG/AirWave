#include <algorithm>
#include <cmath>
#include <utility>

class CursorMapper {
private:
    int screen_w;
    int screen_h;
    double sensitivity;
    double acceleration;
    double edge_padding; // pixels near the edges of screen that are stabilized/accessible

    // Normalized bounds in camera coordinates to map from
    // Helps avoid stretching your hands out excessively
    double min_x;
    double max_x;
    double min_y;
    double max_y;

    double last_screen_x;
    double last_screen_y;
    bool has_previous;

public:
    CursorMapper(int w = 1920, int h = 1080, double sens = 1.5, double accel = 2.0, double padding = 20.0)
        : screen_w(w), screen_h(h), sensitivity(sens), acceleration(accel), edge_padding(padding),
          min_x(0.2), max_x(0.8), min_y(0.2), max_y(0.7), last_screen_x(0.0), last_screen_y(0.0),
          has_previous(false) {}

    void set_screen_resolution(int w, int h) {
        screen_w = w;
        screen_h = h;
    }

    void set_sensitivity(double s) {
        sensitivity = s;
    }

    void set_acceleration(double a) {
        acceleration = a;
    }

    void set_camera_bounds(double xmin, double xmax, double ymin, double ymax) {
        min_x = xmin;
        max_x = xmax;
        min_y = ymin;
        max_y = ymax;
    }

    void reset() {
        has_previous = false;
    }

    std::pair<int, int> map_coordinates(double cam_x, double cam_y) {
        // Clamp camera values to bounds
        double nx = (cam_x - min_x) / (max_x - min_x);
        double ny = (cam_y - min_y) / (max_y - min_y);

        nx = std::max(0.0, std::min(1.0, nx));
        ny = std::max(0.0, std::min(1.0, ny));

        // Theoretical target pixel positions
        double target_x = nx * screen_w;
        double target_y = ny * screen_h;

        if (!has_previous) {
            last_screen_x = target_x;
            last_screen_y = target_y;
            has_previous = true;
            return {static_cast<int>(target_x), static_cast<int>(target_y)};
        }

        // Apply mouse acceleration model:
        // Calculate raw deviation
        double dx = target_x - last_screen_x;
        double dy = target_y - last_screen_y;
        double distance = std::sqrt(dx * dx + dy * dy);

        // Distance scale filter
        double multiplier = 1.0;
        if (distance > 0.1) {
            // Acceleration formula: multiplier increases for larger displacements
            multiplier = std::pow(distance * 0.05, acceleration - 1.0) * sensitivity;
            // Prevent excessively extreme jumps
            if (multiplier < 0.2) multiplier = 0.2;
            if (multiplier > 3.5) multiplier = 3.5;
        }

        double final_x = last_screen_x + dx * multiplier;
        double final_y = last_screen_y + dy * multiplier;

        // Clip/pad screen edges (to make it simple to hit standard scroll bars or click start menu)
        if (final_x < edge_padding) final_x = 0;
        if (final_x > screen_w - edge_padding) final_x = screen_w;
        if (final_y < edge_padding) final_y = 0;
        if (final_y > screen_h - edge_padding) final_y = screen_h;

        last_screen_x = final_x;
        last_screen_y = final_y;

        return {static_cast<int>(std::round(final_x)), static_cast<int>(std::round(final_y))};
    }
};
