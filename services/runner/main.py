import json
import os
import threading
import time

import pika

from sandbox import ensure_images, failed, remove_leftover_containers, run_project

RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
REQUEST_QUEUE = "run.requested"
RESULT_QUEUE = "run.completed"
OUTPUT_QUEUE = "run.output"  # live output while a program runs
LIVE_OUTPUT_EVERY_SECONDS = 0.25


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

    print(f"Running {run_id}: {job.get('entryFile')} ({job.get('language')})", flush=True)

    # The run happens in a worker thread; this (RabbitMQ) thread sends its live output meanwhile.
    # pika channels may only be used from the thread that owns them, so all publishing stays here.
    outcome = {}
    output = {}

    def work():
        try:
            outcome["result"] = run_project(
                job.get("language"),
                job.get("files", []),
                job.get("entryFile", ""),
                job.get("stdin", ""),
                on_start=lambda collector: output.setdefault("collector", collector),
                args=[str(arg) for arg in job.get("args", [])],
            )
        except Exception as error:  # Docker problems must not crash the runner
            print(f"Run {run_id} failed: {error}", flush=True)
            outcome["result"] = failed("Internal error while running code")

    worker = threading.Thread(target=work, daemon=True)
    worker.start()
    sent = None
    while worker.is_alive():
        worker.join(timeout=LIVE_OUTPUT_EVERY_SECONDS)
        collector = output.get("collector")
        if collector is None or not worker.is_alive():
            continue
        snapshot = (collector.stdout, collector.stderr)
        if snapshot != sent:
            sent = snapshot
            publish(channel, OUTPUT_QUEUE, {
                "runId": run_id,
                "stdout": snapshot[0].decode(errors="replace"),
                "stderr": snapshot[1].decode(errors="replace"),
            })
    result = outcome["result"]

    result["runId"] = run_id
    publish(channel, RESULT_QUEUE, result)
    channel.basic_ack(delivery_tag=method.delivery_tag)
    print(f"Finished {run_id}: {result['status']} in {result['timeMs']} ms", flush=True)


def publish(channel, queue, message):
    channel.basic_publish(
        exchange="",
        routing_key=queue,
        body=json.dumps(message),
        properties=pika.BasicProperties(content_type="application/json", delivery_mode=2),
    )


def sweep_leftovers_forever():
    # Runs time out after at most 10 seconds, so anything older than a minute is a leftover
    while True:
        time.sleep(30)
        try:
            if removed := remove_leftover_containers(max_age_seconds=60):
                print(f"Removed {removed} leftover sandbox container(s)", flush=True)
        except Exception as error:
            print(f"Leftover sweep failed: {error}", flush=True)


def main():
    ensure_images()
    print(f"Removed {remove_leftover_containers(max_age_seconds=0)} leftover container(s) from before", flush=True)
    threading.Thread(target=sweep_leftovers_forever, daemon=True).start()
    connection = connect()
    channel = connection.channel()
    channel.queue_declare(queue=REQUEST_QUEUE, durable=True)
    channel.queue_declare(queue=RESULT_QUEUE, durable=True)
    channel.queue_declare(queue=OUTPUT_QUEUE, durable=True)
    channel.basic_qos(prefetch_count=1)  # one run at a time per runner
    channel.basic_consume(queue=REQUEST_QUEUE, on_message_callback=on_message)
    print(f"Runner is waiting for jobs on '{REQUEST_QUEUE}'", flush=True)
    channel.start_consuming()


if __name__ == "__main__":
    main()
