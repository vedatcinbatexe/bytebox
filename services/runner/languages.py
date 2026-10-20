# Each language runs inside its own Docker image.
# Optional per-language limits override the defaults in sandbox.py.
LANGUAGES = {
    "python": {
        "image": "python:3.13-slim",
        "file": "main.py",
        "run": "python3 main.py",
    },
    "javascript": {
        "image": "node:24-alpine",
        "file": "main.js",
        "run": "node main.js",
    },
    "cpp": {
        "image": "bytebox/sandbox-cpp",
        "file": "main.cpp",
        "compile": "g++ -O2 -o main main.cpp",
        "run": "./main",
        # Compiling C++ needs more time and memory
        "timeout_seconds": 10,
        "memory": "256m",
    },
}
