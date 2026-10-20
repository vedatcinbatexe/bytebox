# Each language runs inside its own Docker image.
# {entry} is the file to run, {sources} the C++ files to compile.
# Optional per-language limits override the defaults in sandbox.py.
LANGUAGES = {
    "python": {
        "image": "python:3.13-slim",
        "extension": ".py",
        "run": "python3 {entry}",
    },
    "javascript": {
        "image": "node:24-alpine",
        "extension": ".js",
        "run": "node {entry}",
    },
    "cpp": {
        "image": "bytebox/sandbox-cpp",
        "extension": ".cpp",
        "compile": "g++ -O2 -o /tmp/program {sources}",
        "run": "/tmp/program",
        # Compiling C++ needs more time and memory
        "timeout_seconds": 10,
        "memory": "256m",
    },
}
