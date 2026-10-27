import test from 'node:test';
import assert from 'node:assert/strict';
import { accountLockPresentation, validateFamilyPasswordChange } from './waydean-preview-admin-controls.mjs';

test('describes effective lock status and the inverse available action', () => {
  assert.deepEqual(accountLockPresentation(true, 'Правки временно закрыты', true), {
    state: 'Правки закрыты',
    detail: 'Правки временно закрыты',
    buttonLabel: 'Разрешить правки',
    canToggle: true
  });
  assert.deepEqual(accountLockPresentation(false, '', true), {
    state: 'Правки открыты',
    detail: 'Редакторы могут сохранять изменения.',
    buttonLabel: 'Закрыть правки',
    canToggle: true
  });
  assert.deepEqual(accountLockPresentation(true, 'Изменение ограничено тарифом', false), {
    state: 'Правки закрыты',
    detail: 'Изменение ограничено тарифом',
    buttonLabel: 'Изменение недоступно',
    canToggle: false
  });
});

test('validates family password equality using the legacy trim and case-insensitive rule', () => {
  assert.deepEqual(validateFamilyPasswordChange('  NewPass  ', 'newpass'), {
    ok: true,
    normalizedPassword: 'newpass'
  });
  assert.deepEqual(validateFamilyPasswordChange('newpass', 'different'), {
    ok: false,
    error: 'Пароли не совпадают.'
  });
});

test('enforces the family password length accepted by the server', () => {
  assert.deepEqual(validateFamilyPasswordChange('x', 'x'), {
    ok: false,
    error: 'Пароль должен содержать от 2 до 64 символов.'
  });
  assert.deepEqual(validateFamilyPasswordChange('x'.repeat(65), 'x'.repeat(65)), {
    ok: false,
    error: 'Пароль должен содержать от 2 до 64 символов.'
  });
});
