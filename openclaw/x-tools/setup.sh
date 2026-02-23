#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ID="x-tools"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="${OPENCLAW_EXT_DIR:-$HOME/.openclaw/extensions/$PLUGIN_ID}"
WORKDIR="${OPENCLAW_WORKDIR:-$HOME/.openclaw/workspace}"

log() { echo "[x-tools setup] $*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing command: $1" >&2; exit 1; }
}

usage() {
  cat <<EOF
Usage: ./setup.sh [--no-restart]

Options:
  --no-restart            Skip 'openclaw gateway restart'
  -h, --help              Show this help

Environment variables:
  OPENCLAW_EXT_DIR        Target extension directory (default: ~/.openclaw/extensions/x-tools)
  OPENCLAW_WORKDIR        Workspace for openclaw commands (default: ~/.openclaw/workspace)
EOF
}

NO_RESTART=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-restart) NO_RESTART=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

require_cmd openclaw
require_cmd cp
require_cmd mkdir

log "Source: $SRC_DIR"
log "Dest:   $DEST_DIR"

mkdir -p "$DEST_DIR"
cp -f "$SRC_DIR"/index.ts "$DEST_DIR"/index.ts
cp -f "$SRC_DIR"/openclaw.plugin.json "$DEST_DIR"/openclaw.plugin.json
cp -f "$SRC_DIR"/package.json "$DEST_DIR"/package.json
cp -f "$SRC_DIR"/README.md "$DEST_DIR"/README.md

log "Enabling plugin: $PLUGIN_ID"
openclaw plugins enable "$PLUGIN_ID" >/dev/null || true

if [[ "$NO_RESTART" -eq 0 ]]; then
  log "Restarting OpenClaw gateway"
  (cd "$WORKDIR" && openclaw gateway restart >/dev/null)
else
  log "Skip gateway restart (--no-restart)"
fi

log "Done."
log "Check status: openclaw plugins list | grep -i x-tools"
