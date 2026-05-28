import os
from setuptools import setup, Extension
from setuptools.command.build_ext import build_ext
import sys

class Pybind11Extension(Extension):
    def __init__(self, name, sources, *args, **kwargs):
        super().__init__(name, sources, *args, **kwargs)

class BuildExt(build_ext):
    def build_extensions(self):
        # Retrieve compiler type
        compiler_type = self.compiler.compiler_type
        
        # Add flags depending on compilers
        for ext in self.extensions:
            if compiler_type == "msvc":
                ext.extra_compile_args = ["/std:c++17", "/O2", "/EHsc"]
            else:
                ext.extra_compile_args = ["-std=c++17", "-O3"]
                
        super().build_extensions()

# Automatically fetch pybind11 includes
class GetPybindInclude:
    def __str__(self):
        import pybind11
        return pybind11.get_include()

setup(
    name="airwave_cpp_accel",
    version="1.0.0",
    author="Airwave AI Developer",
    description="C++ acceleration module for hands-free camera gesture control",
    ext_modules=[
        Pybind11Extension(
            "airwave_cpp_accel",
            sources=["cpp/src/bindings.cpp"],
            include_dirs=[
                "cpp/src",
                GetPybindInclude()
            ],
            language="c++"
        )
    ],
    setup_requires=["pybind11>=2.10.0"],
    cmdclass={"build_ext": BuildExt},
    zip_safe=False,
    python_requires=">=3.11",
)
