[CmdletBinding()]
param(
  [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pagePath = '/drewo/waydean-preview.html?state=all-tree'
$buildMarker = '<meta name="waydean-local-build" content="release-candidate-2026-10-10">'
$python = Get-Command py, python -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $python) {
  throw 'Python не найден. Установи Python 3 и повторно запусти scripts/start-waydean-local.ps1.'
}

function Test-WaydeanLocalServer([int]$Port) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/drewo/waydean-preview.html" -TimeoutSec 2 -UseBasicParsing
    return $response.StatusCode -eq 200 -and $response.Content.Contains($buildMarker)
  } catch {
    return $false
  }
}

function Test-LocalPortAvailable([int]$Port) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  try {
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    try { $listener.Stop() } catch { }
  }
}

$selectedPort = $null
$startedProcess = $null
foreach ($candidatePort in 8784..8800) {
  if (Test-WaydeanLocalServer $candidatePort) {
    $selectedPort = $candidatePort
    break
  }

  if (-not (Test-LocalPortAvailable $candidatePort)) { continue }

  if ($python.Name -match '^py(\.exe)?$') {
    $serverArgs = @('-3', '-m', 'http.server', [string]$candidatePort, '--bind', '127.0.0.1')
  } else {
    $serverArgs = @('-m', 'http.server', [string]$candidatePort, '--bind', '127.0.0.1')
  }

  $startedProcess = Start-Process -FilePath $python.Source -ArgumentList $serverArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    if (Test-WaydeanLocalServer $candidatePort) {
      $selectedPort = $candidatePort
      break
    }
    if ($startedProcess.HasExited) { break }
  }

  if ($selectedPort) { break }
  if (-not $startedProcess.HasExited) { Stop-Process -Id $startedProcess.Id -Force }
  $startedProcess = $null
}

if (-not $selectedPort) {
  throw 'Не удалось запустить Waydean local. Проверь Python и порты 8784–8800.'
}

$url = "http://127.0.0.1:$selectedPort$pagePath"
Write-Host "Waydean local готов: $url"
Write-Host 'Здесь используется локальный снимок HOTI; production не изменяется.'
if (-not $NoBrowser) { Start-Process $url }
