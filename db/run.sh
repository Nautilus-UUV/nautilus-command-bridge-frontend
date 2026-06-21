#!/usr/bin/env bash
# Launch the Simpyl Database supervisor for this operating session.
#
# Run this once when you sit down to operate; it stays idle until you press
# Start DB in the UI (or publish nautilus/db/cmd/control). The supervisor keeps
# the writer alive across crashes; a laptop reboot just means re-running this.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# Prefer the dedicated venv if it exists; otherwise fall back to system python.
if [ -d "$HERE/.venv" ]; then
    # shellcheck disable=SC1091
    source "$HERE/.venv/bin/activate"
fi

exec python supervisor.py "$@"
