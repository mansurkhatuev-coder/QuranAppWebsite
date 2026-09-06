const encoder = new TextEncoder();

export const VAULT_PATH = 'trees/credentials.vault.json';

export type VaultFile = {
  version: 1;
  alg: 'AES-GCM';
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

export async function deriveVaultKey(keyMaterial: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(keyMaterial));
  return crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export function emptyVaultMap(): VaultMap {
  return {};
}

export async function encryptVault(map: VaultMap, keyMaterial: string): Promise<VaultFile> {
  const key = await deriveVaultKey(keyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(map));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    version: 1,
    alg: 'AES-GCM',
    iv: bytesToB64(iv),
    data: bytesToB64(new Uint8Array(ciphertext)),
  };
}

export async function decryptVault(file: VaultFile, keyMaterial: string): Promise<VaultMap> {
  if (file.version !== 1 || file.alg !== 'AES-GCM') {
    throw new Error('Unsupported vault file');
  }
  const key = await deriveVaultKey(keyMaterial);
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
      parsed?.version === 1 &&
      parsed?.alg === 'AES-GCM' &&
      typeof parsed?.iv === 'string' &&
      typeof parsed?.data === 'string'
    ) {
      return parsed as VaultFile;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeVaultFile(file: VaultFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}
