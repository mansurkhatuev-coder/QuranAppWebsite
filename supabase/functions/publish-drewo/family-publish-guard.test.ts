import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { familyPublishGuardError } from './family-publish-guard.ts';

const validFingerprint = 'a'.repeat(64);

Deno.test('signed-session publish requires a valid SHA-256 base fingerprint', () => {
  assertEquals(familyPublishGuardError({
    role: 'editor',
    signedFamilySession: true,
    force: false,
    baseFingerprint: '',
  }), {
    status: 409,
    code: 'FAMILY_PUBLISH_BASE_REQUIRED',
    error: 'Не удалось проверить исходную версию дерева. Обновите дерево перед публикацией.',
  });
  assertEquals(familyPublishGuardError({
    role: 'editor',
    signedFamilySession: true,
    force: false,
    baseFingerprint: 'not-a-fingerprint',
  })?.code, 'FAMILY_PUBLISH_BASE_REQUIRED');
});

Deno.test('only a super role may bypass a family publish conflict', () => {
  assertEquals(familyPublishGuardError({
    role: 'editor',
    signedFamilySession: true,
    force: true,
    baseFingerprint: validFingerprint,
  }), {
    status: 403,
    code: 'FAMILY_PUBLISH_FORCE_DENIED',
    error: 'Принудительная публикация доступна только роли super.',
  });
  assertEquals(familyPublishGuardError({
    role: 'super',
    signedFamilySession: true,
    force: true,
    baseFingerprint: '',
  }), null);
});

Deno.test('password-authenticated legacy publish keeps its existing optional-base behavior', () => {
  assertEquals(familyPublishGuardError({
    role: 'editor',
    signedFamilySession: false,
    force: false,
    baseFingerprint: '',
  }), null);
});
