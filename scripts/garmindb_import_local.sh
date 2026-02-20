#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${GARMINDB_CONFIG_DIR:-$ROOT_DIR/data/garmin}"
VENV_DIR="${GARMINDB_VENV_DIR:-$ROOT_DIR/.venv-garmin}"
CONFIG_FILE="$CONFIG_DIR/GarminConnectConfig.json"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing config: $CONFIG_FILE" >&2
  exit 1
fi

if [[ ! -f "$VENV_DIR/bin/activate" ]]; then
  echo "Missing GarminDB venv: $VENV_DIR (set GARMINDB_VENV_DIR if needed)" >&2
  exit 1
fi

source "$VENV_DIR/bin/activate"
garmindb_cli.py \
  --config "$CONFIG_DIR" \
  --all \
  --import \
  --analyze
