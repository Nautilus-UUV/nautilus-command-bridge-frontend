"""Flatten a telemetry JSON payload into (channel, value) sensor rows.

One generic recursive walk handles every telemetry topic uniformly, present and
future: a scalar `{"data": 1234}` becomes one row, a Pose seven, an Imu ten plus
its covariance arrays. The channel is the dotted JSON path under the topic, so
`/angular_velocity/z` and `/orientation_covariance/0` are distinct, queryable
series.

Only numeric leaves are kept -- the SENSOR.value column is DOUBLE. Booleans map
to 1.0/0.0 (valve bitmasks etc.); strings (a mission `state`, a `frame_id`) and
nulls (a NaN the bridge already turned into JSON null) are dropped. If a
categorical channel is ever wanted, add a text_value column rather than abusing
this one.
"""

from __future__ import annotations


def flatten(channel_prefix: str, payload) -> list[tuple[str, float]]:
    """Return [(channel, value)] for every numeric leaf in `payload`."""
    rows: list[tuple[str, float]] = []

    def walk(prefix: str, val) -> None:
        # bool is a subclass of int -- catch it first so True/False don't slip
        # through as 1/0 unintentionally typed; here we *do* want 1.0/0.0.
        if isinstance(val, bool):
            rows.append((prefix, 1.0 if val else 0.0))
        elif isinstance(val, (int, float)):
            rows.append((prefix, float(val)))
        elif isinstance(val, dict):
            for k, v in val.items():
                walk(f"{prefix}/{k}", v)
        elif isinstance(val, list):
            for i, v in enumerate(val):
                walk(f"{prefix}/{i}", v)
        # str / None -> not a numeric time series, skip.

    walk(channel_prefix, payload)
    return rows
