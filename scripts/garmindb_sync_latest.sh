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

export GARMINDB_HTTP_TIMEOUT="${GARMINDB_HTTP_TIMEOUT:-30}"
export GARMINDB_HTTP_RETRIES="${GARMINDB_HTTP_RETRIES:-6}"
export GARMINDB_HTTP_BACKOFF="${GARMINDB_HTTP_BACKOFF:-1.0}"

RUN_CONFIG_DIR="$CONFIG_DIR"
TMP_CONFIG_DIR=""

cleanup() {
  if [[ -n "$TMP_CONFIG_DIR" && -d "$TMP_CONFIG_DIR" ]]; then
    rm -rf "$TMP_CONFIG_DIR"
  fi
}
trap cleanup EXIT

if [[ -n "${GARMIN_USER:-}" || -n "${GARMIN_START_DATE:-}" ]]; then
  if [[ -n "${GARMIN_USER:-}" && -z "${GARMIN_PASSWORD:-}" && -z "${GARMIN_PASSWORD_FILE:-}" ]]; then
    echo "Set GARMIN_PASSWORD or GARMIN_PASSWORD_FILE with GARMIN_USER." >&2
    exit 1
  fi

  TMP_CONFIG_DIR="$(mktemp -d)"
  cp "$CONFIG_FILE" "$TMP_CONFIG_DIR/GarminConnectConfig.json"
  RUN_CONFIG_DIR="$TMP_CONFIG_DIR"

  apply_jq() {
    jq "$@" "$RUN_CONFIG_DIR/GarminConnectConfig.json" > "$RUN_CONFIG_DIR/.config.tmp"
    mv "$RUN_CONFIG_DIR/.config.tmp" "$RUN_CONFIG_DIR/GarminConnectConfig.json"
  }

  if [[ -n "${GARMIN_START_DATE:-}" ]]; then
    apply_jq \
      --arg start_date "$GARMIN_START_DATE" \
      '.data.weight_start_date = $start_date
      | .data.sleep_start_date = $start_date
      | .data.rhr_start_date = $start_date
      | .data.monitoring_start_date = $start_date'
  fi

  if [[ -n "${GARMIN_USER:-}" ]]; then
    if [[ -n "${GARMIN_PASSWORD_FILE:-}" ]]; then
      apply_jq \
        --arg user "$GARMIN_USER" \
        --arg password_file "$GARMIN_PASSWORD_FILE" \
        '.credentials.user = $user
        | .credentials.secure_password = false
        | .credentials.password = ""
        | .credentials.password_file = $password_file'
    else
      apply_jq \
        --arg user "$GARMIN_USER" \
        --arg password "$GARMIN_PASSWORD" \
        '.credentials.user = $user
        | .credentials.secure_password = false
        | .credentials.password = $password
        | .credentials.password_file = null'
    fi
  fi
fi

source "$VENV_DIR/bin/activate"
if [[ -n "${GARMIN_MFA_CODE:-}" ]]; then
  printf '%s\n' "$GARMIN_MFA_CODE" | garmindb_cli.py \
    --config "$RUN_CONFIG_DIR" \
    --all \
    --download \
    --import \
    --analyze \
    --latest
else
  garmindb_cli.py \
    --config "$RUN_CONFIG_DIR" \
    --all \
    --download \
    --import \
    --analyze \
    --latest
fi
