"""Thin resilient paho-mqtt wrapper, shared by the writer and the supervisor.

Mirrors the connection discipline proven in the control stack's
mqtt_bridge_node.py: paho v2 callback API, built-in exponential reconnect
backoff, an optional last-will, and connect_async + loop_start so the process
comes up even if the broker is down and reconnects in the background. Topic
(re)subscription belongs in the caller's on_connect, so it replays after every
reconnect -- the broker drops subscriptions on an unclean disconnect.
"""

from __future__ import annotations

import paho.mqtt.client as mqtt

import config


def make_client(
    client_id: str,
    on_connect,
    on_message,
    will: tuple[str, str, int, bool] | None = None,
):
    """Build a configured (but not yet connected) paho client.

    `will` is (topic, payload, qos, retain) -- the broker publishes it if we
    drop uncleanly. A clean disconnect() suppresses it.
    """
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    if will is not None:
        topic, payload, qos, retain = will
        client.will_set(topic, payload=payload, qos=qos, retain=retain)
    client.on_connect = on_connect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    return client


def start(client, host: str = config.BROKER_HOST, port: int = config.BROKER_PORT) -> None:
    """Non-blocking connect + background network loop."""
    client.connect_async(host, port, keepalive=config.KEEPALIVE_S)
    client.loop_start()
