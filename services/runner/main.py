import os
import time

import pika

RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
QUEUE = "run.requested"


def connect():
    while True:
        try:
            return pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        except pika.exceptions.AMQPConnectionError:
            print("RabbitMQ not ready, retrying in 3s...", flush=True)
            time.sleep(3)


def on_message(channel, method, properties, body):
    print(f"Received run request: {body.decode()}", flush=True)
    channel.basic_ack(delivery_tag=method.delivery_tag)


def main():
    connection = connect()
    channel = connection.channel()
    channel.queue_declare(queue=QUEUE, durable=True)
    channel.basic_consume(queue=QUEUE, on_message_callback=on_message)
    print(f"Runner is waiting for jobs on '{QUEUE}'", flush=True)
    channel.start_consuming()


if __name__ == "__main__":
    main()
