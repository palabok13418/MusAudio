#!/usr/bin/env bash
set -euo pipefail

EPOXY_DIR="${EPOXY_DIR:-"$(cd "$(dirname "$0")/.." && pwd)/vendor/epoxy-tls"}"
CONFIG_PATH="${CONFIG_PATH:-"$(cd "$(dirname "$0")/.." && pwd)/epoxy-server.toml"}"

if [ ! -d "$EPOXY_DIR" ]; then
  echo "Missing epoxy-tls at: $EPOXY_DIR" >&2
  echo "Clone it: git clone --branch multiplexed https://github.com/MercuryWorkshop/epoxy-tls $EPOXY_DIR" >&2
  exit 1
fi

if [ ! -f "$CONFIG_PATH" ]; then
  echo "Missing config: $CONFIG_PATH" >&2
  exit 1
fi

SERVER_DIR="$EPOXY_DIR/server"
if [ ! -d "$SERVER_DIR" ]; then
  echo "Missing server folder at: $SERVER_DIR" >&2
  exit 1
fi

EXE="$SERVER_DIR/target/release/epoxy-server"
if [ ! -f "$EXE" ]; then
  echo "Building epoxy-server (release)..." >&2
  cargo build -r --manifest-path "$SERVER_DIR/Cargo.toml"
fi

"$EXE" "$CONFIG_PATH"
