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
  assert.deepEqual(validateFamilyPasswordChange('  Новый семейный пароль  ', 'новый семейный пароль'), {
    ok: true,
    normalizedPassword: 'новый семейный пароль'
  });
  assert.deepEqual(validateFamilyPasswordChange('newpass', 'different'), {
    ok: false,
    error: 'Пароли не совпадают.'
  });
});

test('enforces the family password length accepted by the server', () => {
  for (const length of [14, 65]) {
    const password = '🌳'.repeat(length);
    assert.deepEqual(validateFamilyPasswordChange(password, password), {
      ok: false,
      error: 'Пароль семьи должен содержать от 15 до 64 символов.'
    });
  }
  for (const length of [15, 64]) {
    const password = '🌳'.repeat(length);
    assert.deepEqual(validateFamilyPasswordChange(` ${password} `, password), {
      ok: true,
      normalizedPassword: password
    });
  }
});
