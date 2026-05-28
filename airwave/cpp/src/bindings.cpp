#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include "gesture_smoothing.cpp"
#include "gesture_classifier.cpp"
#include "cursor_mapper.cpp"

namespace py = pybind11;

PYBIND11_MODULE(airwave_cpp_accel, m) {
    m.doc() = "Airwave high-performance real-time gesture smoothing & classifier bindings";

    // 1. GestureSmoothing Class
    py::class_<GestureSmoothing>(m, "GestureSmoothing")
        .def(py::init<double, double, size_t>(), 
             py::arg("ema_alpha") = 0.25, 
             py::arg("trend_beta") = 0.15, 
             py::arg("history_len") = 5)
        .def("reset", &GestureSmoothing::reset)
        .def("smooth", &GestureSmoothing::smooth)
        .def("set_alpha", &GestureSmoothing::set_alpha)
        .def("set_beta", &GestureSmoothing::set_beta);

    // 2. GestureClassifier Class
    py::class_<GestureClassifier>(m, "GestureClassifier")
        .def(py::init<double, double>(),
             py::arg("pinch_thresh") = 0.04,
             py::arg("scroll_dead") = 0.03)
        .def("is_index_pinched", &GestureClassifier::is_index_pinched)
        .def("is_middle_pinched", &GestureClassifier::is_middle_pinched)
        .def("is_ring_pinched", &GestureClassifier::is_ring_pinched)
        .def("is_pinky_pinched", &GestureClassifier::is_pinky_pinched)
        .def("is_open_palm", &GestureClassifier::is_open_palm)
        .def("get_scroll_speed", &GestureClassifier::get_scroll_speed)
        .def("classify_gesture", &GestureClassifier::classify_gesture)
        .def("set_pinch_threshold", &GestureClassifier::set_pinch_threshold)
        .def("set_scroll_deadzone", &GestureClassifier::set_scroll_deadzone);

    // 3. CursorMapper Class
    py::class_<CursorMapper>(m, "CursorMapper")
        .def(py::init<int, int, double, double, double>(),
             py::arg("w") = 1920,
             py::arg("h") = 1080,
             py::arg("sens") = 1.5,
             py::arg("accel") = 2.0,
             py::arg("padding") = 20.0)
        .def("set_screen_resolution", &CursorMapper::set_screen_resolution)
        .def("set_sensitivity", &CursorMapper::set_sensitivity)
        .def("set_acceleration", &CursorMapper::set_acceleration)
        .def("set_camera_bounds", &CursorMapper::set_camera_bounds)
        .def("reset", &CursorMapper::reset)
        .def("map_coordinates", &CursorMapper::map_coordinates);
}
