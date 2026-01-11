param(
  [string]$EpoxyDir = "$PSScriptRoot\..\vendor\epoxy-tls",
  [string]$ConfigPath = "$PSScriptRoot\..\epoxy-server.toml"
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path $EpoxyDir)) {
  Write-Host "Missing epoxy-tls at: $EpoxyDir"
  Write-Host "Clone it: git clone --branch multiplexed https://github.com/MercuryWorkshop/epoxy-tls $EpoxyDir"
  exit 1
}

if (!(Test-Path $ConfigPath)) {
  Write-Host "Missing config: $ConfigPath"
  exit 1
}

$serverDir = Join-Path $EpoxyDir 'server'
if (!(Test-Path $serverDir)) {
  Write-Host "Missing server folder at: $serverDir"
  exit 1
}

$exe = Join-Path $serverDir 'target\release\epoxy-server.exe'
if (!(Test-Path $exe)) {
  Write-Host "Building epoxy-server (release)..."
  & cargo build -r --manifest-path (Join-Path $serverDir 'Cargo.toml')
}

& $exe $ConfigPath
