"""Send one job to the runner through RabbitMQ and print the result.

Usage: python send_job.py <language> <file> [stdin]
Example: python send_job.py python examples/hello.py
"""

import json
import os
import sys
import time
import uuid

import pika

RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://bytebox:bytebox@localhost:5673")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    language, path = sys.argv[1], sys.argv[2]
    stdin = sys.argv[3] if len(sys.argv) > 3 else ""
    with open(path) as file:
        code = file.read()

    run_id = str(uuid.uuid4())
    connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
    channel = connection.channel()
    channel.queue_declare(queue="run.requested", durable=True)
    channel.queue_declare(queue="run.completed", durable=True)
    channel.basic_publish(
        exchange="",
        routing_key="run.requested",
        body=json.dumps(
            {
                "runId": run_id,
                "language": language,
                "entryFile": os.path.basename(path),
                "files": [{"path": os.path.basename(path), "content": code}],
                "stdin": stdin,
            }
        ),
    )
    print(f"Sent run {run_id}, waiting for result...")

    deadline = time.time() + 30
    while time.time() < deadline:
        method, _, body = channel.basic_get(queue="run.completed")
        if method is None:
            time.sleep(0.2)
            continue
        result = json.loads(body)
        if result.get("runId") == run_id:
            channel.basic_ack(method.delivery_tag)
            print(json.dumps(result, indent=2))
            break
        channel.basic_nack(method.delivery_tag, requeue=True)
    else:
        print("No result after 30s")

    connection.close()


if __name__ == "__main__":
    main()
