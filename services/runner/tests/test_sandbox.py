"""Integration tests: these start real Docker containers."""

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
