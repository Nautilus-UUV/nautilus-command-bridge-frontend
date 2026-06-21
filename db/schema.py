"""DuckDB schema for the Simpyl Database.

Three tables, as agreed with the operator:

  DIVES     -- one row per Start->Terminate bracket (laptop wall-clock stamps).
  COMMANDS  -- everything flowing laptop->glider, plus operator markers. FK to
               the dive it happened in (1 dive -> many commands).
  SENSOR    -- every numeric telemetry leaf coming off the glider, one
               (channel, value) row per leaf, FK to its dive.

Ids come from sequences via column DEFAULTs, so inserts never carry an id and
the writer can pull a fresh dive id back with INSERT ... RETURNING.
"""

from __future__ import annotations

import duckdb

_DDL = """
CREATE SEQUENCE IF NOT EXISTS seq_dive START 1;
CREATE SEQUENCE IF NOT EXISTS seq_cmd START 1;
CREATE SEQUENCE IF NOT EXISTS seq_sensor START 1;

CREATE TABLE IF NOT EXISTS dives (
    id          BIGINT PRIMARY KEY DEFAULT nextval('seq_dive'),
    name        VARCHAR,     -- operator-given label (UI box), for easy searching
    started_at  TIMESTAMP,   -- laptop wall clock at Start
    ended_at    TIMESTAMP    -- NULL while the dive is open
);

CREATE TABLE IF NOT EXISTS commands (
    id       BIGINT PRIMARY KEY DEFAULT nextval('seq_cmd'),
    ts       TIMESTAMP,   -- laptop arrival time
    dive_id  BIGINT,      -- FK dives.id
    type     VARCHAR,     -- e.g. 'sawtooth', 'bcu_rpm', 'lifeguard_arm', 'marker'
    source   VARCHAR,     -- automatic | debug | initialize | manual
    params   VARCHAR      -- raw JSON payload
);

CREATE TABLE IF NOT EXISTS sensor (
    id       BIGINT PRIMARY KEY DEFAULT nextval('seq_sensor'),
    ts       TIMESTAMP,   -- laptop arrival time
    dive_id  BIGINT,      -- FK dives.id
    channel  VARCHAR,     -- e.g. 'telemetry/imu/angular_velocity/z'
    value    DOUBLE
);
"""


def connect(path: str) -> duckdb.DuckDBPyConnection:
    """Open the single-writer connection and make sure the schema exists."""
    con = duckdb.connect(path)
    con.execute(_DDL)
    return con
