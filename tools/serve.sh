#!/bin/sh
# Serve the game on http://localhost:8770/ (the tools expect it there). Leave it running.
cd "$(dirname "$0")/.." && exec python3 -m http.server 8770
