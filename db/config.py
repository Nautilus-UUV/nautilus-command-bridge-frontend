"""Shared configuration for the Simpyl Database logger.

Everything the supervisor and the writer need to agree on lives here: where the
broker is, where data lands, which MQTT topics carry control/marker/status, the
batching cadence, and how a raw `nautilus/cmd/*` topic maps onto the
(type, source) pair recorded in the COMMANDS table.

Nothing here imports duckdb or paho -- it's pure constants + small pure helpers,
so it's cheap to import from either process and from a smoke test.
"""

from __future__ import annotations

import os
from pathlib import Path

# --- broker -----------------------------------------------------------------
# The logger taps the laptop broker over plain TCP (the browser uses the
# WebSocket listener; we don't). Overridable for a non-localhost broker.
BROKER_HOST = os.environ.get("NAUTILUS_DB_BROKER_HOST", "127.0.0.1")
BROKER_PORT = int(os.environ.get("NAUTILUS_DB_BROKER_PORT", "1883"))
KEEPALIVE_S = 30

# --- paths ------------------------------------------------------------------
# Resolve relative to this file so `python writer.py` works from any cwd.
HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "data"
DUCKDB_PATH = DATA_DIR / "nautilus.duckdb"
PARQUET_DIR = DATA_DIR / "parquet"
WRITER_PATH = HERE / "writer.py"


def ensure_dirs() -> None:
    """Create the runtime data directories if they don't exist yet."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PARQUET_DIR.mkdir(parents=True, exist_ok=True)


# --- topics -----------------------------------------------------------------
# The writer taps EVERYTHING under the nautilus tree with one wildcard; routing
# happens by prefix below. The db/* subtree is ours alone -- the bridge's
# ingress allowlist never includes it, so control/marker never reach the glider.
WILDCARD = "nautilus/#"

DB_STATUS_TOPIC = "nautilus/db/status"  # writer heartbeat (retained, LWT)
DB_CONTROL_TOPIC = "nautilus/db/cmd/control"  # start/terminate (+ name, retained)
DB_MARKER_TOPIC = "nautilus/db/cmd/marker"  # operator marker -> COMMANDS

# How the supervisor hands the operator-given dive name to a freshly spawned
# writer (which is the process that actually opens the dive row).
DIVE_NAME_ENV = "NAUTILUS_DB_DIVE_NAME"

# Prefixes used to route an incoming topic.
_NAUTILUS_PREFIX = "nautilus/"
DB_PREFIX = "nautilus/db/"  # our private subtree (status/control/marker live under here)
TELEMETRY_PREFIX = "nautilus/telemetry/"
CMD_PREFIX = "nautilus/cmd/"
DEBUG_PREFIX = "nautilus/cmd/debug/"

# --- cadence ----------------------------------------------------------------
FLUSH_PERIOD_S = 2.0  # OLAP batch insert into DuckDB
STATUS_PERIOD_S = 1.0  # liveness heartbeat publish

# A still-open dive (ended_at IS NULL) whose newest row is older than this is
# treated as abandoned (an unclean death of a past session): the writer closes
# it and opens a fresh dive instead of resuming it. A crash-respawn happens
# within seconds, so a recent open dive is always resumed -- which is the point.
STALE_DIVE_S = 600.0

# --- source classification --------------------------------------------------
SOURCE_AUTOMATIC = "automatic"  # dive-profile / mission control
SOURCE_DEBUG = "debug"  # manual actuator pokes
SOURCE_INITIALIZE = "initialize"  # pre-dive init panel (lifeguard + initialize)
SOURCE_MANUAL = "manual"  # operator markers

# mission_id -> human label (factory.py: TRIM=0, SAWTOOTH=1, SURFACE=2).
MISSION_NAMES = {0: "trim_and_neutral", 1: "sawtooth", 2: "surface"}


def classify_command(topic: str, payload: dict) -> tuple[str, str] | None:
    """Map a `nautilus/cmd/*` topic + payload onto (type, source).

    Returns None for things that aren't operator commands worth recording -- the
    1 Hz lifeguard keepalive most importantly, which would otherwise flood the
    table. `source` is one of the SOURCE_* categories agreed with the operator.
    """
    if topic == "nautilus/cmd/heartbeat":
        return None  # link keepalive, not a command

    if topic == "nautilus/cmd/path":
        mid = payload.get("mission_id")
        return MISSION_NAMES.get(mid, f"mission_{mid}"), SOURCE_AUTOMATIC

    if topic == "nautilus/cmd/command":
        started = bool(payload.get("data"))
        return ("mission_start" if started else "mission_stop"), SOURCE_AUTOMATIC

    if topic.startswith(DEBUG_PREFIX):
        leaf = topic[len(DEBUG_PREFIX) :].replace("/", "_")
        return leaf, SOURCE_DEBUG

    if topic == "nautilus/cmd/init":
        return "init", SOURCE_INITIALIZE

    if topic == "nautilus/cmd/lifeguard":
        armed = bool(payload.get("data"))
        return ("lifeguard_arm" if armed else "lifeguard_disarm"), SOURCE_INITIALIZE

    # Any other nautilus/cmd/* we didn't anticipate: keep it rather than drop it.
    leaf = topic[len(CMD_PREFIX) :].replace("/", "_")
    return leaf, SOURCE_MANUAL


def channel_of(topic: str) -> str:
    """Channel prefix for a telemetry topic: the topic minus the `nautilus/`."""
    return topic[len(_NAUTILUS_PREFIX) :]
