import assert from 'node:assert/strict';
import test from 'node:test';

import { syncGooglePlayInstalls } from './google-play-reports.ts';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function createServiceAccountJson(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  return JSON.stringify({
    client_email: 'test@quranapp-publishing.iam.gserviceaccount.com',
    private_key: `-----BEGIN PRIVATE KEY-----\n${toBase64(new Uint8Array(privateKey))}\n-----END PRIVATE KEY-----\n`,
  });
}

test('downloads the known monthly overview when Cloud Storage listing is forbidden', async () => {
  const previousFetch = globalThis.fetch;
  const serviceAccountJson = await createServiceAccountJson();
  const requestedObjectNames: string[] = [];
  const month = currentMonth();
  const expectedObjectName = `stats/installs/installs_com.sheyhmansur.quranapp_${month}_overview.csv`;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'oauth2.googleapis.com') {
      return Response.json({ access_token: 'test-access-token' });
    }
    if (url.pathname.endsWith('/o')) {
      return Response.json({ error: { code: 403, errors: [{ reason: 'forbidden' }] } }, { status: 403 });
    }

    const encodedName = url.pathname.split('/o/')[1] || '';
    const objectName = decodeURIComponent(encodedName);
    requestedObjectNames.push(objectName);
    if (objectName !== expectedObjectName) {
      return Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 });
    }

    return new Response(
      'Date,Daily User Installs,Daily Device Upgrades,Daily User Uninstalls,Current User Installs,Installs on active devices\n2026-10-01,4,2,1,20,18\n',
      { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-16le' } },
    );
  };

  try {
    const result = await syncGooglePlayInstalls({
      serviceAccountJson,
      bucket: 'pubsite_prod_5997333154759014155',
      packageName: 'com.sheyhmansur.quranapp',
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.requested, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].downloads, 4);
    assert.equal(requestedObjectNames[0], expectedObjectName);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('reports a direct CSV permission error when listing and object access are forbidden', async () => {
  const previousFetch = globalThis.fetch;
  const serviceAccountJson = await createServiceAccountJson();

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'oauth2.googleapis.com') {
      return Response.json({ access_token: 'test-access-token' });
    }
    return Response.json({ error: { code: 403, errors: [{ reason: 'forbidden' }] } }, { status: 403 });
  };

  try {
    const result = await syncGooglePlayInstalls({
      serviceAccountJson,
      bucket: 'pubsite_prod_5997333154759014155',
      packageName: 'com.sheyhmansur.quranapp',
    });

    assert.equal(result.status, 'error');
    assert.match(result.message, /скачивании CSV отчёта \(HTTP 403, код forbidden\)/);
    assert.deepEqual(result.rows, []);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
