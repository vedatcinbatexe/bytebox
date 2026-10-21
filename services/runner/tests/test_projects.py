"""Integration tests for multi-file projects: these start real Docker containers."""

import sandbox
from sandbox import run_project


def files(**contents):
    # files(**{"utils/greet.py": "..."}) -> [{"path": ..., "content": ...}]
    return [{"path": path, "content": content} for path, content in contents.items()]


def test_python_imports_from_a_folder():
    project = files(
        **{
            "main.py": "from utils.greet import greet\nprint(greet(input()))",
            "utils/greet.py": "def greet(name):\n    return f'Hello, {name}!'",
        }
    )
    result = run_project("python", project, "main.py", "Bytebox")
    assert result["status"] == "completed"
    assert result["stdout"] == "Hello, Bytebox!\n"


def test_python_runs_a_file_inside_a_folder():
    project = files(
        **{
            "main.py": "print('main')",
            "scripts/other.py": "import helper\nprint(helper.VALUE)",
            "scripts/helper.py": "VALUE = 'from scripts'",
        }
    )
    result = run_project("python", project, "scripts/other.py")
    assert result["stdout"] == "from scripts\n"


def test_javascript_requires_another_file():
    project = files(
        **{
            "index.js": "const { add } = require('./lib/math');\nconsole.log(add(2, 3));",
            "lib/math.js": "module.exports = { add: (a, b) => a + b };",
        }
    )
    result = run_project("javascript", project, "index.js")
    assert result["stdout"] == "5\n"


def test_cpp_compiles_other_files_without_main():
    project = files(
        **{
            "main.cpp": '#include <iostream>\n#include "math.h"\nint main() { std::cout << add(2, 3) << std::endl; }',
            "math.h": "int add(int a, int b);",
            "math.cpp": '#include "math.h"\nint add(int a, int b) { return a + b; }',
            "other_program.cpp": "int main() { return 1; }",
        }
    )
    result = run_project("cpp", project, "main.cpp")
    assert result["status"] == "completed"
    assert result["stdout"] == "5\n"


def test_go_compiles_other_files_in_the_same_folder():
    project = files(
        **{
            "main.go": 'package main\nimport "fmt"\nfunc main() { fmt.Println(add(2, 3)) }',
            "math.go": "package main\nfunc add(a, b int) int { return a + b }",
            "other/main.go": "package main\nfunc main() {}",
        }
    )
    result = run_project("go", project, "main.go", "")
    assert result["status"] == "completed", result["stderr"]
    assert result["stdout"] == "5\n"


def test_rust_finds_modules_in_other_files():
    project = files(
        **{
            "main.rs": "mod math;\nfn main() { println!(\"{}\", math::add(2, 3)); }",
            "math.rs": "pub fn add(a: i32, b: i32) -> i32 { a + b }",
        }
    )
    result = run_project("rust", project, "main.rs")
    assert result["status"] == "completed", result["stderr"]
    assert result["stdout"] == "5\n"


def test_program_can_read_and_write_project_files():
    project = files(
        **{
            "main.py": "print(open('data/input.txt').read().strip())\nopen('out.txt', 'w').write('ok')",
            "data/input.txt": "from a text file",
        }
    )
    result = run_project("python", project, "main.py")
    assert result["stdout"] == "from a text file\n"


def test_path_traversal_is_rejected():
    for bad_path in ["../evil.py", "/etc/passwd", "a/../../b.py", "a//b.py", "a b.py"]:
        result = run_project("python", files(**{bad_path: "x"}), bad_path)
        assert result["status"] == "failed", bad_path
        assert "Invalid file path" in result["stderr"]


def test_too_many_files_is_rejected():
    project = files(**{f"f{i}.py": "" for i in range(sandbox.MAX_FILES + 1)})
    result = run_project("python", project, "f0.py")
    assert result["status"] == "failed"


def test_project_too_large_is_rejected():
    project = files(**{"a.py": "#" * 200_000, "b.py": "#" * 100_000})
    result = run_project("python", project, "a.py")
    assert result["status"] == "failed"


def test_missing_entry_file_is_rejected():
    result = run_project("python", files(**{"main.py": "print(1)"}), "other.py")
    assert result["status"] == "failed"
    assert "Entry file not found" in result["stderr"]


def test_typescript_runs_with_imports():
    project = files(
        **{
            "main.ts": 'import { greet } from "./lib/greet.ts";\ninterface User { name: string }\nconst user: User = { name: "TS" };\nconsole.log(greet(user.name));',
            "lib/greet.ts": "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}",
        }
    )
    result = run_project("typescript", project, "main.ts")
    assert result["status"] == "completed", result
    assert result["stdout"] == "Hello, TS!\n"
    assert result["stderr"] == ""


def test_java_runs_with_other_classes_and_stdin():
    project = files(
        **{
            "Main.java": 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        String name = new Scanner(System.in).nextLine();\n        System.out.println(Greeter.greet(name));\n    }\n}',
            "Greeter.java": 'public class Greeter {\n    static String greet(String name) {\n        return "Hello, " + name + "!";\n    }\n}',
        }
    )
    result = run_project("java", project, "Main.java", "Java")
    assert result["status"] == "completed", result
    assert result["stdout"] == "Hello, Java!\n"


def test_java_compile_error_is_reported():
    result = run_project("java", files(**{"Main.java": "public class Main { void broken( }"}), "Main.java")
    assert result["exitCode"] != 0
    assert "error" in result["stderr"]


def test_arguments_reach_the_program_unchanged():
    args = ["hello world", "$HOME", "a'b", "; echo hacked"]
    for language, entry, code in [
        ("python", "main.py", "import sys\nprint(sys.argv[1:])"),
        ("javascript", "main.js", "console.log(JSON.stringify(process.argv.slice(2)))"),
    ]:
        result = run_project(language, files(**{entry: code}), entry, args=args)
        assert result["status"] == "completed", result["stderr"]
        assert "hacked\n" not in result["stdout"]
        assert "hello world" in result["stdout"] and "$HOME" in result["stdout"] and "a'b" in result["stdout"]
