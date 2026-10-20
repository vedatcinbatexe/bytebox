# Each language runs inside its own Docker image.
# {entry} is the file to run, {sources} the files to compile (see build_script in sandbox.py).
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
        "main": r"\bint\s+main\s*\(",
        # Compiling C++ needs more time and memory
        "timeout_seconds": 10,
        "memory": "256m",
    },
    "go": {
        "image": "bytebox/sandbox-go",
        "extension": ".go",
        # All .go files of a package must be in one folder
        "compile": "go build -o /tmp/program {sources}",
        "run": "/tmp/program",
        "main": r"\bfunc\s+main\s*\(",
        "same_folder": True,
        "timeout_seconds": 10,
        "memory": "256m",
    },
    "rust": {
        "image": "rust:1-slim",
        "extension": ".rs",
        # rustc finds the other files itself through `mod name;`
        "compile": "rustc -O -o /tmp/program {entry}",
        "run": "/tmp/program",
        "timeout_seconds": 10,
        "memory": "256m",
    },
}
