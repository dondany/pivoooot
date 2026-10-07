#!/bin/sh
# One-time setup for the tools: a Python venv in tools/.venv with what cdp.py needs.
T=$(cd "$(dirname "$0")" && pwd)
python3 -m venv "$T/.venv" && "$T/.venv/bin/pip" install -q websocket-client && echo "tools ready: $T/.venv"
