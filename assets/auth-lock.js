/**
 * Client-side brute-force guard for Supabase login forms (admin + trees).
 * Mirrors drewo: 5 fails → ~15 min lock. Persists in localStorage.
 */
(function initAuthLock(global) {
  const MAX_FAILS = 5;
  const FAIL_WINDOW_MS = 15 * 60 * 1000;
  const LOCK_MS = 15 * 60 * 1000;

  function storageKey(scope) {
    return `waydean_auth_lock_${String(scope || 'default')}_v1`;
  }

  function emptyState(now = Date.now()) {
    return { fails: 0, windowStart: now, lockedUntil: 0 };
  }

  function read(scope) {
    try {
      const raw = localStorage.getItem(storageKey(scope));
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyState();
      return {
        fails: Number(parsed.fails) || 0,
        windowStart: Number(parsed.windowStart) || Date.now(),
        lockedUntil: Number(parsed.lockedUntil) || 0,
      };
    } catch {
      return emptyState();
    }
  }

  function write(scope, state) {
    try {
      localStorage.setItem(storageKey(scope), JSON.stringify(state));
    } catch {
      // ignore quota / private mode
    }
  }

  function normalize(scope) {
    const now = Date.now();
    let state = read(scope);
    if (state.lockedUntil > now) return state;
    if (now - state.windowStart > FAIL_WINDOW_MS) {
      state = emptyState(now);
      write(scope, state);
    }
    return state;
  }

  function retryAfterSec(state) {
    return Math.max(1, Math.ceil((state.lockedUntil - Date.now()) / 1000));
  }

  function lockMessage(state) {
    const sec = retryAfterSec(state);
    const mins = Math.max(1, Math.ceil(sec / 60));
    return `Слишком много попыток. Подождите ${mins} мин.`;
  }

  function getState(scope) {
    const state = normalize(scope);
    const now = Date.now();
    const locked = state.lockedUntil > now;
    return {
      fails: state.fails,
      locked,
      lockedUntil: state.lockedUntil,
      attemptsLeft: Math.max(0, MAX_FAILS - state.fails),
      retryAfterSec: locked ? retryAfterSec(state) : 0,
      message: locked
        ? lockMessage(state)
        : state.fails > 0
          ? `Неверный пароль. Осталось попыток: ${Math.max(0, MAX_FAILS - state.fails)}`
          : '',
      maxFails: MAX_FAILS,
    };
  }

  function assertAllowed(scope) {
    const snapshot = getState(scope);
    if (snapshot.locked) {
      const error = new Error(snapshot.message);
      error.code = 'AUTH_LOCKED';
      error.lockedUntil = snapshot.lockedUntil;
      error.retryAfterSec = snapshot.retryAfterSec;
      throw error;
    }
    return snapshot;
  }

  function recordFailure(scope) {
    const now = Date.now();
    let state = normalize(scope);
    if (state.lockedUntil > now) return getState(scope);
    state.fails += 1;
    if (state.fails >= MAX_FAILS) {
      state.lockedUntil = now + LOCK_MS;
    }
    write(scope, state);
    return getState(scope);
  }

  function clear(scope) {
    write(scope, emptyState());
    return getState(scope);
  }

  global.AuthLock = {
    MAX_FAILS,
    getState,
    assertAllowed,
    recordFailure,
    clear,
  };
})(window);
