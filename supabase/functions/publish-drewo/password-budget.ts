export function passwordClientAddress(headers: Headers): string {
  const forwarded = (headers.get('x-forwarded-for') || '').split(',').at(-1);
  for (const candidate of [headers.get('cf-connecting-ip'), headers.get('x-real-ip'), forwarded]) {
    const address = candidate?.trim().toLowerCase();
    if (address && /^[0-9a-f:.]{3,64}$/.test(address)) return address;
  }
  return 'unknown';
}

export async function passwordBudgetKeys(secret: string, family: string, client: string) {
  if (!secret) throw new Error('Password budget signing secret is unavailable');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = async (...parts: string[]) => {
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(parts))));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const [p_client, p_family, p_pair] = await Promise.all([
    hash('client', client), hash('family', family), hash('pair', family, client),
  ]);
  return { p_client, p_family, p_pair };
}
