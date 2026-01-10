#!/usr/bin/env bash
set -euo pipefail

if [ ! -d .venv-demucs ]; then
  python3 -m venv .venv-demucs
fi

# shellcheck disable=SC1091
source .venv-demucs/bin/activate
python -m pip install --upgrade pip
python -m pip install -r ./DemucsAPI/requirements.txt

cd DemucsAPI
PORT="${PORT:-8787}" python -m uvicorn server:app --host 0.0.0.0 --port "$PORT"
