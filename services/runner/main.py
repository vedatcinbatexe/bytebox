import json
import os
import time

import pika

from sandbox import ensure_images, failed, run_code

RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
REQUEST_QUEUE = "run.requested"
RESULT_QUEUE = "run.completed"


def connect():
    while True:
        try:
            return pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        except pika.exceptions.AMQPConnectionError:
            print("RabbitMQ not ready, retrying in 3s...", flush=True)
            time.sleep(3)


def on_message(channel, method, properties, body):
    try:
        job = json.loads(body)
        run_id = job["runId"]
    except (ValueError, KeyError):
        print(f"Skipping invalid job: {body[:200]!r}", flush=True)
        channel.basic_ack(delivery_tag=method.delivery_tag)
        return

    print(f"Running {run_id} ({job.get('language')})", flush=True)
    try:
        result = run_code(job.get("language"), job.get("code", ""), job.get("stdin", ""))
    except Exception as error:  # Docker problems must not crash the runner
        print(f"Run {run_id} failed: {error}", flush=True)
        result = failed("Internal error while running code")

    result["runId"] = run_id
    channel.basic_publish(
        exchange="",
        routing_key=RESULT_QUEUE,
        body=json.dumps(result),
        properties=pika.BasicProperties(content_type="application/json", delivery_mode=2),
    )
    channel.basic_ack(delivery_tag=method.delivery_tag)
    print(f"Finished {run_id}: {result['status']} in {result['timeMs']} ms", flush=True)


def main():
    ensure_images()
    connection = connect()
    channel = connection.channel()
    channel.queue_declare(queue=REQUEST_QUEUE, durable=True)
    channel.queue_declare(queue=RESULT_QUEUE, durable=True)
    channel.basic_qos(prefetch_count=1)  # one run at a time per runner
    channel.basic_consume(queue=REQUEST_QUEUE, on_message_callback=on_message)
    print(f"Runner is waiting for jobs on '{REQUEST_QUEUE}'", flush=True)
    channel.start_consuming()


if __name__ == "__main__":
    main()
