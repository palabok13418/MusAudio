$ErrorActionPreference = 'Stop'

if (!(Test-Path -LiteralPath '.venv-demucs')) {
  python -m venv .venv-demucs
}

. .\.venv-demucs\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r .\DemucsAPI\requirements.txt

Push-Location .\DemucsAPI
try {
  $env:PORT = $env:PORT -as [string]
  if (-not $env:PORT) { $env:PORT = '8787' }
  python -m uvicorn server:app --host 0.0.0.0 --port $env:PORT
} finally {
  Pop-Location
}
