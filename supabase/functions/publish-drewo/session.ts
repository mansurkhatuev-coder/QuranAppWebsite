const encoder = new TextEncoder();

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  let s = btoa(binary);
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export type NekSessionPayload = {
  treeDir: string;
  role: 'editor' | 'super';
  exp: number; // unix ms
};

export async function signNekSession(
  payload: NekSessionPayload,
  secret: string
): Promise<string> {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyNekSession(
  token: string,
  secret: string
): Promise<NekSessionPayload | null> {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  try {
    const [body, sigPart] = parts;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      new Uint8Array(b64urlToBytes(sigPart)),
      encoder.encode(body)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as NekSessionPayload;
    if (!payload?.treeDir || !payload.exp || payload.exp < Date.now()) return null;
    if (payload.role !== 'editor' && payload.role !== 'super') return null;
    return payload;
  } catch {
    return null;
  }
}

/** Default TTL for Nek sessions: 14 days in ms */
export const NEK_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
