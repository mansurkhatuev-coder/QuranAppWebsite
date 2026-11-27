export const FAMILY_LOGIN_KEY = 'nek:remember';
export const ACCOUNT_EMAIL_KEY = 'drewo:remember-email';

export function restoreRememberedIdentifier(input, choice, key) {
  if (!input || !choice || new URLSearchParams(location.search).get('switch') === '1') return;
  try {
    const saved = localStorage.getItem(key);
    const text = key === FAMILY_LOGIN_KEY ? JSON.parse(saved || 'null')?.login : saved;
    if (typeof text === 'string' && text.trim()) {
      input.value = text;
      choice.checked = true;
    }
  } catch { /* Browser storage is optional. */ }
}

export function rememberIdentifier(key, identifier, selected) {
  try {
    if (!selected) {
      localStorage.removeItem(key);
      return;
    }
    const value = identifier.trim();
    localStorage.setItem(key, key === FAMILY_LOGIN_KEY ? JSON.stringify({ login: value }) : value);
  } catch { /* Remembering an identifier is optional. */ }
}

export function clearFamilyAccess(treeDir) {
  try {
    sessionStorage.removeItem(`nek-session:${treeDir}`);
    if (JSON.parse(sessionStorage.getItem('drewo-atlas:family-view') || 'null')?.dir === treeDir) {
      sessionStorage.removeItem('drewo-atlas:family-view');
    }
  } catch { /* Continue signing out if browser storage is unavailable. */ }
  try {
    if (JSON.parse(localStorage.getItem('nek:lastTree') || 'null')?.path === `/${treeDir}/`) {
      localStorage.removeItem('nek:lastTree');
    }
    localStorage.removeItem(`${treeDir}-view-session`);
  } catch { /* Stored presentation preferences cannot grant access. */ }
}
