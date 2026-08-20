#!/usr/bin/env bash
# Idempotent bootstrap for the QuranAppWebsite Cloud Agent environment.
# The site itself is static (no build step). This installs dependencies for the
# optional Cloudflare Worker proxy so `wrangler` is available for local work.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [ -f qf-proxy/package.json ]; then
  echo "Installing qf-proxy (Cloudflare Worker) dependencies..."
  ( cd qf-proxy && npm ci )
else
  echo "qf-proxy/package.json not found; skipping worker dependency install."
fi

echo "Install complete."
