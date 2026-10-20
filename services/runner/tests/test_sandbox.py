"""Integration tests: these start real Docker containers."""

import threading
import time

import sandbox
from sandbox import run_code


def test_python_hello_world_with_stdin():
    result = run_code("python", "print('Hello, ' + input())", "Bytebox")
    assert result["status"] == "completed"
    assert result["exitCode"] == 0
    assert result["stdout"] == "Hello, Bytebox\n"


def test_javascript_hello_world():
    result = run_code("javascript", "console.log(1 + 2)")
    assert result["status"] == "completed"
    assert result["stdout"] == "3\n"


def test_cpp_hello_world():
    code = '#include <iostream>\nint main() { std::cout << "hi" << std::endl; }'
    result = run_code("cpp", code)
    assert result["status"] == "completed"
    assert result["stdout"] == "hi\n"


def test_cpp_compile_error_is_reported():
    result = run_code("cpp", "int main() { this is not cpp }")
    assert result["status"] == "completed"
    assert result["exitCode"] != 0
    assert "error" in result["stderr"]


def test_runtime_error_goes_to_stderr():
    result = run_code("python", "raise ValueError('boom')")
    assert result["exitCode"] == 1
    assert "ValueError: boom" in result["stderr"]


def test_unknown_language_fails():
    result = run_code("cobol", "DISPLAY 'HI'")
    assert result["status"] == "failed"


def test_code_too_large_fails():
    result = run_code("python", "#" * (sandbox.MAX_PROJECT_BYTES + 1))
    assert result["status"] == "failed"


def test_infinite_loop_times_out():
    result = run_code("python", "while True: pass")
    assert result["status"] == "timed_out"


def test_memory_bomb_is_killed():
    result = run_code("python", "data = b'x' * (512 * 1024 * 1024)")
    assert result["status"] == "memory_exceeded"


def test_fork_bomb_is_contained():
    code = "import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass"
    result = run_code("python", code)
    assert result["status"] in ("timed_out", "completed")


def test_network_is_disabled():
    code = "import urllib.request\nurllib.request.urlopen('http://1.1.1.1', timeout=2)"
    result = run_code("python", code)
    assert result["exitCode"] != 0


def test_filesystem_is_read_only():
    result = run_code("python", "open('/etc/hacked', 'w').write('x')")
    assert result["exitCode"] != 0
    assert "Read-only file system" in result["stderr"] or "Permission denied" in result["stderr"]


def test_runs_as_non_root_user():
    result = run_code("python", "import os; print(os.getuid())")
    assert result["stdout"] == "65534\n"


def test_huge_output_is_truncated():
    result = run_code("python", "print('x' * 1_000_000)")
    assert result["truncated"] is True
    assert len(result["stdout"]) == sandbox.MAX_OUTPUT_BYTES


def test_endless_output_flood_is_stopped():
    result = run_code("python", "while True: print('x' * 1000)")
    assert result["status"] == "timed_out"
    assert result["truncated"] is True


def test_containers_are_removed():
    run_code("python", "print('bye')")
    leftovers = sandbox.client.containers.list(all=True, filters={"label": "bytebox=sandbox"})
    assert leftovers == []


def test_leftover_containers_are_removed():
    leftover = sandbox.client.containers.create("python:3.13-slim", "true", labels={"bytebox": "sandbox"})
    assert sandbox.remove_leftover_containers(max_age_seconds=0) >= 1
    remaining = [c.id for c in sandbox.client.containers.list(all=True, filters={"label": "bytebox=sandbox"})]
    assert leftover.id not in remaining


def test_output_can_be_watched_while_running():
    seen = []

    def watch(output):
        # Sample the growing output a few times while the program runs
        def sample():
            for _ in range(20):
                seen.append(output.stdout)
                time.sleep(0.1)

        threading.Thread(target=sample, daemon=True).start()

    code = "import time\nfor i in range(3):\n    print(i, flush=True)\n    time.sleep(0.4)"
    result = sandbox.run_project("python", [{"path": "main.py", "content": code}], "main.py", on_start=watch)
    assert result["stdout"] == "0\n1\n2\n"
    # Partial output was visible before the program finished
    assert b"0\n" in seen and any(chunk.startswith(b"0\n") and chunk != b"0\n1\n2\n" for chunk in seen)
