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
    "typescript": {
        # Node 24 runs TypeScript directly (it strips the types)
        "image": "node:24-alpine",
        "extension": ".ts",
        "run": "node {entry}",
    },
    "java": {
        # Java 22+ runs a program straight from its source files, including other classes it uses
        "image": "eclipse-temurin:25-jdk-alpine",
        "extension": ".java",
        "run": "java -Xmx160m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 {entry}",
        "timeout_seconds": 10,
        "memory": "256m",
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
