# Deploy academy-giveaway-enter Edge Function to Supabase.
# Requires:
#   SUPABASE_ACCESS_TOKEN  -> https://supabase.com/dashboard/account/tokens
#
# Usage:
#   cd website
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
#   .\scripts\deploy-academy-giveaway-function.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $root 'tools\supabase-cli\supabase.exe'
$projectRef = 'rivjkiksknnesahrvamf'

if (-not (Test-Path $cli)) {
  Write-Error "Supabase CLI not found at $cli"
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Error 'Set SUPABASE_ACCESS_TOKEN (Supabase Dashboard -> Account -> Access Tokens).'
}

Push-Location $root
try {
  & $cli functions deploy academy-giveaway-enter `
    --project-ref $projectRef `
    --no-verify-jwt `
    --use-api

  Write-Host ''
  Write-Host 'Deployed: https://rivjkiksknnesahrvamf.supabase.co/functions/v1/academy-giveaway-enter'
}
finally {
  Pop-Location
}
