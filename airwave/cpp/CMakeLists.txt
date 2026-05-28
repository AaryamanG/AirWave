cmake_minimum_required(VERSION 3.12)
project(airwave_cpp_accel)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find pybind11 package
find_package(pybind11 REQUIRED)

pybind11_add_module(airwave_cpp_accel src/bindings.cpp)

# Target options
target_compile_definitions(airwave_cpp_accel PRIVATE VERSION_INFO=${PROJECT_VERSION})
