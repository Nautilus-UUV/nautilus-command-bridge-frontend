"""Pure tests for the cloud-mirror upload planner (config.plan_uploads).

No Drive, no filesystem -- just the decision logic. The frontend repo has no
python pytest harness, so this doubles as a runnable script:

    .venv/bin/python -m pytest test_uploader.py -v   # if pytest is installed
    .venv/bin/python test_uploader.py                # plain run, asserts
"""

from __future__ import annotations

import config

NOW = 1000.0  # fixed "current time"; files older than NOW-UPLOAD_SETTLE_S settle


def test_new_file_is_planned():
    files = [("sensor_20260101T1200.parquet", 100, 900.0)]
    assert config.plan_uploads(files, {}, NOW) == ["sensor_20260101T1200.parquet"]


def test_already_uploaded_file_is_skipped():
    files = [("sensor_20260101T1200.parquet", 100, 900.0)]
    state = {"sensor_20260101T1200.parquet": {"size": 100, "mtime": 900.0,
                                              "drive_id": "id1"}}
    assert config.plan_uploads(files, state, NOW) == []


def test_changed_dives_snapshot_is_replanned():
    # dives.parquet is rewritten in place each minute -> a changed size/mtime
    # means re-upload (the uploader will update the same Drive file).
    files = [("dives.parquet", 250, 950.0)]
    state = {"dives.parquet": {"size": 200, "mtime": 900.0, "drive_id": "id1"}}
    assert config.plan_uploads(files, state, NOW) == ["dives.parquet"]


def test_unchanged_dives_snapshot_is_skipped():
    files = [("dives.parquet", 200, 900.0)]
    state = {"dives.parquet": {"size": 200, "mtime": 900.0, "drive_id": "id1"}}
    assert config.plan_uploads(files, state, NOW) == []


def test_settling_file_is_deferred():
    # Modified 2s ago, inside the 5s settle window -> skip (might be mid-COPY).
    files = [("sensor_20260101T1200.parquet", 100, NOW - 2.0)]
    assert config.plan_uploads(files, {}, NOW) == []


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all passed")
