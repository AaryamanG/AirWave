#include <cmath>
#include <vector>
#include <deque>

class GestureSmoothing {
private:
    double alpha;         // Smoother factor for EMA (0.0 < alpha <= 1.0)
    double last_x;
    double last_y;
    bool is_initialized;

    // For double exponential moving average (Holt-Winters / Adaptive)
    double beta;          // Trend factor
    double trend_x;
    double trend_y;

    // Historical buffer to detect and clip sudden impulse noise / tracking jumps
    std::deque<std::pair<double, double>> history;
    size_t max_history_size;

public:
    GestureSmoothing(double ema_alpha = 0.25, double trend_beta = 0.15, size_t history_len = 5)
        : alpha(ema_alpha), beta(trend_beta), last_x(0.0), last_y(0.0),
          is_initialized(false), trend_x(0.0), trend_y(0.0), max_history_size(history_len) {}

    void reset() {
        is_initialized = false;
        last_x = 0.0;
        last_y = 0.0;
        trend_x = 0.0;
        trend_y = 0.0;
        history.clear();
    }

    std::pair<double, double> smooth(double x, double y) {
        if (!is_initialized) {
            last_x = x;
            last_y = y;
            trend_x = 0.0;
            trend_y = 0.0;
            is_initialized = true;
            history.push_back({x, y});
            return {x, y};
        }

        // Noise filter: clip high-frequency jumps if they are physically impossible spikes
        if (!history.empty()) {
            double dx = x - history.back().first;
            double dy = y - history.back().second;
            double distance = std::sqrt(dx * dx + dy * dy);
            
            // If the jump is massive (e.g. hand tracker temporary glitch), temper it
            if (distance > 0.15 && history.size() >= 3) {
                // Adaptive clamping: clip 80% towards previous coordinate
                x = history.back().first + dx * 0.2;
                y = history.back().second + dy * 0.2;
            }
        }

        // Double Exponential Smoothing (Holt-Winters design)
        // Helps reduce lag while keeping motion smooth
        double prev_smooth_x = last_x;
        double prev_smooth_y = last_y;

        // Update levels
        last_x = alpha * x + (1.0 - alpha) * (prev_smooth_x + trend_x);
        last_y = alpha * y + (1.0 - alpha) * (prev_smooth_y + trend_y);

        // Update trends
        trend_x = beta * (last_x - prev_smooth_x) + (1.0 - beta) * trend_x;
        trend_y = beta * (last_y - prev_smooth_y) + (1.0 - beta) * trend_y;

        // Update history
        history.push_back({last_x, last_y});
        if (history.size() > max_history_size) {
            history.pop_front();
        }

        return {last_x, last_y};
    }

    // Setters
    void set_alpha(double a) { if (a > 0.0 && a <= 1.0) alpha = a; }
    void set_beta(double b) { if (b >= 0.0 && b <= 1.0) beta = b; }
};
