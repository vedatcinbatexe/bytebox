import io
import re
import socket
import tarfile
import threading
import time

import docker
from docker.errors import ImageNotFound
from docker.types import LogConfig
from requests.exceptions import ConnectionError, ReadTimeout

from languages import LANGUAGES

MAX_FILES = 50
MAX_PROJECT_BYTES = 256 * 1024
MAX_OUTPUT_BYTES = 64 * 1024
DEFAULT_TIMEOUT_SECONDS = 5
DEFAULT_MEMORY = "128m"

client = docker.from_env()


def ensure_images():
    """Pull any missing language images so the first run is not slow."""
    for name, language in LANGUAGES.items():
        image = language["image"]
        try:
            client.images.get(image)
        except ImageNotFound:
            if image.startswith("bytebox/"):
                print(f"Image {image} for {name} is missing, build it with docker compose", flush=True)
                continue
            print(f"Pulling {image} for {name}...", flush=True)
            client.images.pull(image)


def run_code(language, code, stdin=""):
    """Run a single piece of code (a project with one file)."""
    config = LANGUAGES.get(language)
    if config is None:
        return failed(f"Unsupported language: {language}")
    entry = "main" + config["extension"]
    return run_project(language, [{"path": entry, "content": code}], entry, stdin)


def run_project(language, files, entry_file, stdin=""):
    """Run entry_file from a multi-file project in a fresh, locked-down container."""
    config = LANGUAGES.get(language)
    if config is None:
        return failed(f"Unsupported language: {language}")
    error = validate_project(files, entry_file)
    if error:
        return failed(error)

    timeout = config.get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS)
    memory = config.get("memory", DEFAULT_MEMORY)
    archive = build_archive(files, stdin)

    container = client.containers.create(
        image=config["image"],
        command=["sh", "-c", build_script(config, files, entry_file, len(archive))],
        # The project arrives as a tar archive on stdin (see send_archive)
        stdin_open=True,
        working_dir="/tmp",
        labels={"bytebox": "sandbox"},
        # Isolation
        user="65534:65534",  # nobody
        network_mode="none",
        read_only=True,
        tmpfs={"/tmp": "rw,exec,nosuid,size=64m"},
        cap_drop=["ALL"],
        security_opt=["no-new-privileges"],
        # Resource limits
        mem_limit=memory,
        memswap_limit=memory,
        nano_cpus=500_000_000,  # half a CPU
        pids_limit=64,
        # Stop a flood of output from filling the disk
        log_config=LogConfig(type="json-file", config={"max-size": "1m"}),
    )

    try:
        output = OutputCollector(container)
        started = time.monotonic()
        container.start()
        send_archive(container, archive)
        try:
            exit_code = container.wait(timeout=timeout)["StatusCode"]
            status = "completed"
        except (ReadTimeout, ConnectionError):
            container.kill()
            exit_code = None
            status = "timed_out"
        time_ms = int((time.monotonic() - started) * 1000)
        output.join()

        container.reload()
        if container.attrs["State"]["OOMKilled"]:
            status = "memory_exceeded"

        return {
            "status": status,
            "exitCode": exit_code,
            "stdout": output.stdout.decode(errors="replace"),
            "stderr": output.stderr.decode(errors="replace"),
            "truncated": output.truncated,
            "timeMs": time_ms,
        }
    finally:
        container.remove(force=True)


class OutputCollector:
    """Reads stdout/stderr while the container runs and keeps only the first bytes."""

    def __init__(self, container):
        self.stdout = b""
        self.stderr = b""
        self.truncated = False
        # Attach before starting so no output is missed
        stream = container.attach(stdout=True, stderr=True, stream=True, demux=True, logs=True)
        self.thread = threading.Thread(target=self.read, args=(stream,), daemon=True)
        self.thread.start()

    def read(self, stream):
        for out, err in stream:
            self.stdout = self.append(self.stdout, out)
            self.stderr = self.append(self.stderr, err)

    def append(self, buffer, chunk):
        if not chunk:
            return buffer
        if len(buffer) + len(chunk) > MAX_OUTPUT_BYTES:
            self.truncated = True
            return (buffer + chunk)[:MAX_OUTPUT_BYTES]
        return buffer + chunk

    def join(self):
        self.thread.join(timeout=5)


SAFE_PATH = re.compile(r"^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$")
CPP_MAIN = re.compile(r"\bint\s+main\s*\(")


def validate_project(files, entry_file):
    """Return an error message, or None if the project is safe to run."""
    if not files:
        return "The project has no files"
    if len(files) > MAX_FILES:
        return f"A project can have at most {MAX_FILES} files"
    if sum(len(file["content"].encode()) for file in files) > MAX_PROJECT_BYTES:
        return f"The project is larger than {MAX_PROJECT_BYTES // 1024} KB"
    for file in files:
        path = file["path"]
        if len(path) > 200 or not SAFE_PATH.match(path) or ".." in path.split("/"):
            return f"Invalid file path: {path}"
    if entry_file not in {file["path"] for file in files}:
        return f"Entry file not found: {entry_file}"
    return None


def build_script(config, files, entry_file, archive_size):
    # Paths are validated against SAFE_PATH, so they are safe to put in a shell command.
    # head reads exactly the archive, so we never wait for stdin to be closed.
    steps = [f"head -c {archive_size} | tar -x -C /tmp -f -", "cd /tmp/project"]
    if "compile" in config:
        # Compile the entry file plus every other C++ file that has no main()
        others = [
            file["path"]
            for file in files
            if file["path"] != entry_file
            and file["path"].endswith(config["extension"])
            and not CPP_MAIN.search(file["content"])
        ]
        steps.append(config["compile"].format(sources=" ".join([entry_file, *others])))
    steps.append(config["run"].format(entry=entry_file) + " < /tmp/.stdin")
    return " && ".join(steps)


def build_archive(files, stdin):
    """Pack the project (under project/) and stdin (.stdin) into a tar archive."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        add_file(archive, ".stdin", stdin)
        for file in files:
            add_file(archive, f"project/{file['path']}", file["content"])
    return buffer.getvalue()


def send_archive(container, archive):
    """Write the archive to the container's stdin."""
    stream = container.attach_socket(params={"stdin": 1, "stream": 1})
    try:
        stream._sock.sendall(archive)
    finally:
        # Only end our side; the socket itself is closed when the response is cleaned up
        stream._sock.shutdown(socket.SHUT_WR)


def add_file(archive, name, text):
    data = text.encode()
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = 0o644
    info.uid = info.gid = 65534
    info.mtime = int(time.time())
    archive.addfile(info, io.BytesIO(data))


def failed(message):
    return {
        "status": "failed",
        "exitCode": None,
        "stdout": "",
        "stderr": message,
        "truncated": False,
        "timeMs": 0,
    }
