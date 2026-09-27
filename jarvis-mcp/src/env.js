import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Fill empty keys from a dotenv-style file. Existing values win, so Jarvis
 * `env` overrides `.env`.
 */
export function applyEnvText(text, env) {
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const body = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] == null || env[key] === '') env[key] = value;
  }
  return env;
}

export function loadEnvFile(path, env = process.env) {
  if (env.WAYDEAN_MCP_SKIP_DOTENV === '1') return env;
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return env;
  }
  return applyEnvText(text, env);
}

export function loadPackageEnv(env = process.env) {
  return loadEnvFile(resolve(PACKAGE_ROOT, '.env'), env);
}
