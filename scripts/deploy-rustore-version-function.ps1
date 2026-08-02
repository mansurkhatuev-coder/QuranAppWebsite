# Deploy rustore-version Edge Function to Supabase.
# Requires:
#   SUPABASE_ACCESS_TOKEN
#   RUSTORE_KEY_ID + RUSTORE_API_TOKEN (from QuranApp/.env or set in shell)
#
# Usage (from website/):
#   .\scripts\deploy-rustore-version-function.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$appRoot = Split-Path -Parent $root
$cli = Join-Path $root 'tools\supabase-cli\supabase.exe'
$projectRef = 'rivjkiksknnesahrvamf'

function Import-DotEnv([string]$path) {
  if (-not (Test-Path $path)) { return }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -le 0) { return }
    $key = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $existing = [Environment]::GetEnvironmentVariable($key, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($existing)) { return }
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
}

Import-DotEnv (Join-Path $appRoot '.env')
Import-DotEnv (Join-Path $root '.env')

if (-not (Test-Path $cli)) {
  Write-Error "Supabase CLI not found at $cli."
}
if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Error 'Set SUPABASE_ACCESS_TOKEN (Supabase Dashboard -> Account -> Access Tokens).'
}
if (-not $env:RUSTORE_KEY_ID -or -not $env:RUSTORE_API_TOKEN) {
  Write-Error 'Set RUSTORE_KEY_ID and RUSTORE_API_TOKEN (QuranApp/.env).'
}

$package = if ($env:RUSTORE_PACKAGE_NAME) { $env:RUSTORE_PACKAGE_NAME } else { 'com.sheyhmansur.quranapp' }

Push-Location $root
try {
  & $cli secrets set `
    --project-ref $projectRef `
    "RUSTORE_KEY_ID=$($env:RUSTORE_KEY_ID)" `
    "RUSTORE_API_TOKEN=$($env:RUSTORE_API_TOKEN)" `
    "RUSTORE_PACKAGE_NAME=$package"

  & $cli functions deploy rustore-version `
    --project-ref $projectRef `
    --no-verify-jwt `
    --use-api

  Write-Host ''
  Write-Host 'Deployed: https://rivjkiksknnesahrvamf.supabase.co/functions/v1/rustore-version'
  Write-Host 'Set rustoreVersionUrl in admin/supabase-config.js to this URL.'
}
finally {
  Pop-Location
}
