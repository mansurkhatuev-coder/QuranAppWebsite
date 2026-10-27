export function shouldPromptWhoAmI({ hasSelf, dismissed, isDemo }) {
  return !hasSelf && !dismissed && !isDemo;
}

export function whoAmISkipStorageKey(treeKey) {
  return `waydean-preview:whoami-skip:v1:${treeKey === 'demo' ? 'demo' : 'hoti'}`;
}

export function hasDismissedWhoAmIPrompt(storage, treeKey) {
  try {
    return storage?.getItem(whoAmISkipStorageKey(treeKey)) === '1';
  } catch {
    return false;
  }
}

export function dismissWhoAmIPrompt(storage, treeKey) {
  try {
    storage?.setItem(whoAmISkipStorageKey(treeKey), '1');
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function clearWhoAmIPromptDismissal(storage, treeKey) {
  try {
    storage?.removeItem(whoAmISkipStorageKey(treeKey));
    return Boolean(storage);
  } catch {
    return false;
  }
}
