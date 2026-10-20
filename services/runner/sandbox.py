import base64
import threading
import time

import docker
from docker.errors import ImageNotFound
from docker.types import LogConfig
from requests.exceptions import ConnectionError, ReadTimeout

from languages import LANGUAGES

MAX_CODE_BYTES = 64 * 1024
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
    """Run code in a fresh, locked-down container and return the result."""
    config = LANGUAGES.get(language)
    if config is None:
        return failed(f"Unsupported language: {language}")
    if len(code.encode()) > MAX_CODE_BYTES:
        return failed(f"Code is larger than {MAX_CODE_BYTES // 1024} KB")

    timeout = config.get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS)
    memory = config.get("memory", DEFAULT_MEMORY)

    container = client.containers.create(
        image=config["image"],
        command=["sh", "-c", build_script(config)],
        # Code and stdin are passed base64-encoded, so no files need to be copied in
        environment={"CODE": to_base64(code), "STDIN": to_base64(stdin)},
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


def build_script(config):
    steps = ["cd /tmp", f'echo "$CODE" | base64 -d > {config["file"]}']
    if "compile" in config:
        steps.append(config["compile"])
    steps.append(f'echo -n "$STDIN" | base64 -d | {config["run"]}')
    return " && ".join(steps)


def to_base64(text):
    return base64.b64encode(text.encode()).decode()


def failed(message):
    return {
        "status": "failed",
        "exitCode": None,
        "stdout": "",
        "stderr": message,
        "truncated": False,
        "timeMs": 0,
    }
