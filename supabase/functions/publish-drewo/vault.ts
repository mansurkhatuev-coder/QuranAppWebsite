const encoder = new TextEncoder();

/**
 * Vault lives under `_private/`, which the Pages deploy workflow strips before
 * publishing. Never move it back under a published directory such as `trees/`.
 */
export const VAULT_PATH = '_private/credentials.vault.json';

/** Old published location — kept only so a deploy can delete it. */
export const LEGACY_VAULT_PATH = 'trees/credentials.vault.json';

export const VAULT_KDF = 'PBKDF2-SHA256';
export const VAULT_ITERATIONS = 210000;
const SALT_BYTES = 16;

/** v2 adds a per-file PBKDF2 salt; v1 derived the key with a bare SHA-256. */
export type VaultFile = {
  version: 1 | 2;
  alg: 'AES-GCM';
  kdf?: typeof VAULT_KDF;
  iterations?: number;
  salt?: string; // base64, v2 only
  iv: string; // base64
  data: string; // base64 ciphertext of JSON map
};

export type VaultEntry = {
  login: string;
  password: string;
  title: string;
  updatedAt: string;
};

export type VaultMap = Record<string, VaultEntry>;

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomVaultSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export async function deriveVaultKey(
  keyMaterial: string,
  salt: Uint8Array,
  iterations = VAULT_ITERATIONS
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyMaterial),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as unknown as BufferSource,
      iterations,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** v1 key derivation, only used to read vaults written before PBKDF2. */
async function deriveLegacyVaultKey(keyMaterial: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(keyMaterial));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export function emptyVaultMap(): VaultMap {
  return {};
}

export async function encryptVault(map: VaultMap, keyMaterial: string): Promise<VaultFile> {
  const salt = randomVaultSalt();
  const key = await deriveVaultKey(keyMaterial, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(map));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    version: 2,
    alg: 'AES-GCM',
    kdf: VAULT_KDF,
    iterations: VAULT_ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    data: bytesToB64(new Uint8Array(ciphertext)),
  };
}

export async function decryptVault(file: VaultFile, keyMaterial: string): Promise<VaultMap> {
  if (file.alg !== 'AES-GCM') {
    throw new Error('Unsupported vault file');
  }
  let key: CryptoKey;
  if (file.version === 2) {
    if (!file.salt || file.kdf !== VAULT_KDF) throw new Error('Unsupported vault file');
    key = await deriveVaultKey(keyMaterial, b64ToBytes(file.salt), file.iterations ?? VAULT_ITERATIONS);
  } else if (file.version === 1) {
    key = await deriveLegacyVaultKey(keyMaterial);
  } else {
    throw new Error('Unsupported vault file');
  }
  const iv = b64ToBytes(file.iv);
  const ciphertext = b64ToBytes(file.data);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as VaultMap;
}

export function upsertVaultEntry(map: VaultMap, treeDir: string, entry: VaultEntry): VaultMap {
  return { ...map, [treeDir]: entry };
}

export function parseVaultFile(raw?: string): VaultFile | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VaultFile>;
    if (
      parsed?.alg !== 'AES-GCM' ||
      typeof parsed?.iv !== 'string' ||
      typeof parsed?.data !== 'string'
    ) {
      return null;
    }
    if (parsed.version === 2) {
      if (parsed.kdf !== VAULT_KDF || typeof parsed.salt !== 'string') return null;
      return parsed as VaultFile;
    }
    if (parsed.version === 1) return parsed as VaultFile;
    return null;
  } catch {
    return null;
  }
}

export function serializeVaultFile(file: VaultFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}
