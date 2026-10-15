[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$projectDirectory = Join-Path $repoRoot 'docs\design\waydean\export\video-prototype\remotion-preview'
$serverPath = Join-Path $projectDirectory 'export-studio-server.mjs'
$port = 8781
$studioUrl = "http://127.0.0.1:$port/"
$healthUrl = "http://127.0.0.1:$port/api/health"
$expectedVersion = '2026-10-12-local-1'
$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "Не найден локальный Remotion-проект: $serverPath"
}
if (-not $node) {
  throw 'Для локального рендера установи Node.js LTS и повторно запусти Start-Waydean-Local.cmd.'
}

function Get-WaydeanVideoHealth {
  try {
    return Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  } catch {
    return $null
  }
}

function Test-WaydeanVideoPortAvailable {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
  try {
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    try { $listener.Stop() } catch { }
  }
}

$health = Get-WaydeanVideoHealth
if (-not $health) {
  if (-not (Test-WaydeanVideoPortAvailable)) {
    throw "Порт $port занят другой программой. Закрой старую локальную студию видео и повтори запуск."
  }

  $dependencyMarker = Join-Path $projectDirectory 'node_modules\@remotion\renderer\package.json'
  if (-not (Test-Path -LiteralPath $dependencyMarker)) {
    if (-not $npm) { throw 'Не найден npm.cmd. Переустанови Node.js LTS и запусти Waydean снова.' }
    if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'package-lock.json'))) {
      throw 'Не найден lock-файл видеостудии; установка остановлена без изменения проекта.'
    }

    if (Test-Path -LiteralPath 'H:\') {
      $npmCache = 'H:\CodexBuildTemp\WaydeanRemotion\npm-cache'
    } else {
      $npmCache = Join-Path $env:LOCALAPPDATA 'Waydean\npm-cache'
    }
    New-Item -ItemType Directory -Path $npmCache -Force | Out-Null
    $previousNpmCache = $env:npm_config_cache
    $env:npm_config_cache = $npmCache
    try {
      Write-Host 'Первый запуск: устанавливаю зависимости видеостудии. Это нужно только один раз.'
      Push-Location $projectDirectory
      try {
        & $npm.Source ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Не удалось установить зависимости видеостудии.' }
      } finally {
        Pop-Location
      }
    } finally {
      if ($null -eq $previousNpmCache) { Remove-Item Env:\npm_config_cache -ErrorAction SilentlyContinue }
      else { $env:npm_config_cache = $previousNpmCache }
    }
  }

  if (Test-Path -LiteralPath 'H:\') {
    $renderDirectory = 'H:\CodexBuildTemp\WaydeanRemotion'
  } else {
    $renderDirectory = Join-Path $env:LOCALAPPDATA 'Waydean\Remotion'
  }
  New-Item -ItemType Directory -Path $renderDirectory -Force | Out-Null
  $logDirectory = Join-Path $renderDirectory 'logs'
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

  $env:WAYDEAN_EXPORT_STUDIO_PORT = [string]$port
  $env:WAYDEAN_EXPORT_TEMP_DIR = $renderDirectory
  $env:WAYDEAN_RENDER_CONCURRENCY = '1'
  $started = Start-Process -FilePath $node.Source `
    -ArgumentList @($serverPath) `
    -WorkingDirectory $projectDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory 'video-studio.log') `
    -RedirectStandardError (Join-Path $logDirectory 'video-studio-error.log') `
    -PassThru

  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Seconds 1
    $health = Get-WaydeanVideoHealth
    if ($health) { break }
    if ($started.HasExited) { break }
  }
}

if (-not $health -or $health.service -ne 'waydean-local-video-studio' -or $health.version -ne $expectedVersion) {
  $errorLog = if (Test-Path -LiteralPath $renderDirectory) { Join-Path $renderDirectory 'logs\video-studio-error.log' } else { $null }
  if ($errorLog -and (Test-Path -LiteralPath $errorLog)) {
    $details = (Get-Content -LiteralPath $errorLog -Tail 8) -join ' '
    throw "Видеостудия не запустилась. Последняя ошибка: $details"
  }
  throw 'Видеостудия не запустилась за 90 секунд. Проверь Node.js, Chrome/Edge и занятость порта 8781.'
}

if (-not $health.renderAvailable) {
  throw 'Превью запущено, но не найден Chrome или Edge для локального MP4-рендера.'
}

Write-Host "Локальный видеоэкспорт готов: $studioUrl"
Write-Host 'MP4 остаются на этом компьютере; сервер привязан только к 127.0.0.1.'
