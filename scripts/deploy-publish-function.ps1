# Deploy publish-content Edge Function to Supabase.
# Requires env vars:
#   SUPABASE_ACCESS_TOKEN  -> https://supabase.com/dashboard/account/tokens
#   WEBSITE_PUBLISH_TOKEN  -> GitHub PAT with Contents: Read and write on QuranAppWebsite
#
# Usage:
#   cd website
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
#   $env:WEBSITE_PUBLISH_TOKEN = "github_pat_..."
#   .\scripts\deploy-publish-function.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $root 'tools\supabase-cli\supabase.exe'
$projectRef = 'rivjkiksknnesahrvamf'

if (-not (Test-Path $cli)) {
  Write-Error "Supabase CLI not found at $cli. Run deploy via GitHub Actions workflow instead."
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Error 'Set SUPABASE_ACCESS_TOKEN (Supabase Dashboard -> Account -> Access Tokens).'
}

if (-not $env:WEBSITE_PUBLISH_TOKEN) {
  Write-Error 'Set WEBSITE_PUBLISH_TOKEN (GitHub PAT with Contents write on QuranAppWebsite).'
}

Push-Location $root
try {
  & $cli secrets set `
    --project-ref $projectRef `
    "GITHUB_TOKEN=$($env:WEBSITE_PUBLISH_TOKEN)" `
    'GITHUB_REPO=mansurkhatuev-coder/QuranAppWebsite'

  & $cli functions deploy publish-content `
    --project-ref $projectRef `
    --no-verify-jwt `
    --use-api

  Write-Host ''
  Write-Host 'Deployed: https://rivjkiksknnesahrvamf.supabase.co/functions/v1/publish-content'
  Write-Host 'publishFunctionUrl in admin/supabase-config.js is already set to this URL.'
}
finally {
  Pop-Location
}
