#!/usr/bin/env python3
"""Local family-password login, fetch timeouts, photos from Pages, no CF on view."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

REPLACEMENTS: list[tuple[str, str]] = [
    (
        "      var PHOTO_PUBLIC_BASE = 'https://rivjkiksknnesahrvamf.supabase.co/storage/v1/object/public/drewo-photos';\n",
        "      var PHOTO_PUBLIC_BASE = 'photos';\n      var editorPasswordHash = '';\n      var accessLocked = false;\n      var accessLockedReason = '';\n",
    ),
    (
        """      function legacyEditorPasswordMatch(password) {
        var expected =
          TREE_DIR === 'drewo-dada-yurt' ? 'баташ' :
          TREE_DIR === 'drewo-reklama' ? 'демо' :
          'гуно';
        return normalizePassword(password) === normalizePassword(expected);
      }

      function verifyAuth(password) {
        return callPublishApi({
          action: 'auth',
          password: password,
          treeDir: TREE_DIR,
        }).catch(function (err) {
          var msg = (err && err.message) || '';
          if (/Неизвестное действие|unknown/i.test(msg) && legacyEditorPasswordMatch(password)) {
            return { role: 'editor', locked: false, superConfigured: false };
          }
          throw err;
        });
      }
""",
        """      function hashEditorPassword(normalized) {
        if (!(window.crypto && crypto.subtle && window.TextEncoder)) {
          return Promise.resolve('');
        }
        return crypto.subtle
          .digest('SHA-256', new TextEncoder().encode('drewo-pw:' + normalized))
          .then(function (buf) {
            return Array.from(new Uint8Array(buf))
              .map(function (b) {
                return ('0' + b.toString(16)).slice(-2);
              })
              .join('');
          });
      }

      function applyAccessFile(data) {
        if (!data || typeof data !== 'object') return;
        if (typeof data.passwordHash === 'string' && /^[a-f0-9]{64}$/i.test(data.passwordHash)) {
          editorPasswordHash = data.passwordHash.toLowerCase();
        }
        accessLocked = !!data.locked;
        accessLockedReason = data.lockedReason || '';
        applyLockState(accessLocked, accessLockedReason);
      }

      function fetchAccessFile() {
        return fetch('access.json?v=' + Date.now(), { cache: 'no-store' })
          .then(function (res) {
            return res.ok ? res.json() : null;
          })
          .then(function (data) {
            applyAccessFile(data);
            return data;
          })
          .catch(function () {
            return null;
          });
      }

      function verifyLocalEditor(password) {
        var given = normalizePassword(password);
        if (!given || !editorPasswordHash) return Promise.resolve(false);
        return hashEditorPassword(given).then(function (h) {
          return h === editorPasswordHash;
        });
      }

      function verifyAuth(password) {
        return callPublishApi({
          action: 'auth',
          password: password,
          treeDir: TREE_DIR,
        }).then(function (data) {
          if (data) data.fromServer = true;
          return data;
        });
      }
""",
    ),
    (
        """      function fetchWithTimeout(url, ms) {
        var controller = new AbortController();
        var timer = window.setTimeout(function () { controller.abort(); }, ms || 10000);
        return fetch(url, { signal: controller.signal }).finally(function () {
          window.clearTimeout(timer);
        });
      }
""",
        """      function fetchWithTimeout(url, ms, init) {
        var controller = new AbortController();
        var timer = window.setTimeout(function () { controller.abort(); }, ms || 10000);
        var opts = Object.assign({}, init || {}, { signal: controller.signal });
        return fetch(url, opts).finally(function () {
          window.clearTimeout(timer);
        });
      }
""",
    ),
    (
        """      function callPublishApi(payload) {
        return fetch(PUBLISH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(function (res) {
""",
        """      function callPublishApi(payload) {
        return fetchWithTimeout(PUBLISH_URL, 12000, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(function (res) {
""",
    ),
    (
        """        return PHOTO_PUBLIC_BASE + '/' + TREE_DIR + '/' + id + '-thumb.jpg?v=' + v;
""",
        """        return PHOTO_PUBLIC_BASE + '/' + id + '-thumb.jpg?v=' + v;
""",
    ),
    (
        """        return PHOTO_PUBLIC_BASE + '/' + TREE_DIR + '/' + id + '.jpg?v=' + v;
""",
        """        return PHOTO_PUBLIC_BASE + '/' + id + '.jpg?v=' + v;
""",
    ),
    (
        """      function unlockViewWithPerson(personId, password, authData) {
        writeViewSession(personId);
        rememberSession(password, authData);
        clearGateBusy();
        setViewLocked(false);
        recordVisitOnce();
        startPresence();
""",
        """      function unlockViewWithPerson(personId, password, authData) {
        writeViewSession(personId);
        rememberSession(password, authData);
        clearGateBusy();
        setViewLocked(false);
        if (authData && authData.fromServer) {
          recordVisitOnce();
          startPresence();
        }
""",
    ),
    (
        """        updateSaveButton();
        recordVisitOnce();
        startPresence();
        loadWeather();
""",
        """        updateSaveButton();
        loadWeather();
""",
    ),
    (
        """            gateStatus.textContent = 'Проверяем пароль на сервере… Если зависло — попробуйте VPN.';
          }
          verifyAuth(password)
            .then(function (data) {
""",
        """            gateStatus.textContent = 'Проверяем пароль…';
          }
          verifyLocalEditor(password)
            .then(function (ok) {
              if (ok) {
                return {
                  role: 'editor',
                  locked: accessLocked,
                  lockedReason: accessLockedReason,
                  fromServer: false,
                };
              }
              return verifyAuth(password);
            })
            .then(function (data) {
""",
    ),
    (
        """              var networkish =
                !rateLimited &&
                (/failed to fetch|network|load failed|timeout|timed out|503|502|cloudflare|fetch/i.test(
                  String(msg)
                ) ||
                  status === 0 ||
                  (typeof status === 'number' && status >= 500));
              if (networkish) {
                msg =
                  'Не удалось связаться с сервером. Проверьте интернет или включите VPN и попробуйте снова.';
              }
""",
        """              var networkish =
                !rateLimited &&
                (/failed to fetch|network|load failed|timeout|timed out|abort|503|502|cloudflare|fetch/i.test(
                  String(msg)
                ) ||
                  status === 0 ||
                  (typeof status === 'number' && status >= 500));
              if (networkish && editorPasswordHash) {
                msg = 'Неверный пароль';
              } else if (networkish) {
                msg =
                  'Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.';
              }
""",
    ),
    (
        """      setGateBusy('Загружаем древо…');
      fetchRemoteTree().then(function (remote) {
        if (remote && typeof remote === 'object' && remote.id) {
          tree = TreeModel.markAllowAdd(remote, NUTSU_ID);
          if (dataEl) dataEl.textContent = treeJsonForEmbed(tree);
        }
        setGateBusy('Открываем…');
        return rememberFingerprintFromTree();
      }).then(function () {
        finishBoot();
      }).catch(function () {
        setGateBusy('Открываем…');
        rememberFingerprintFromTree().finally(finishBoot);
      });
""",
        """      setGateBusy('Загружаем древо…');
      Promise.all([fetchRemoteTree(), fetchAccessFile()]).then(function (pair) {
        var remote = pair[0];
        if (remote && typeof remote === 'object' && remote.id) {
          tree = TreeModel.markAllowAdd(remote, NUTSU_ID);
          if (dataEl) dataEl.textContent = treeJsonForEmbed(tree);
        }
        setGateBusy('Открываем…');
        return rememberFingerprintFromTree();
      }).then(function () {
        finishBoot();
      }).catch(function () {
        setGateBusy('Открываем…');
        rememberFingerprintFromTree().finally(finishBoot);
      });
""",
    ),
]


def main() -> None:
    for path in TARGETS:
        text = path.read_text(encoding="utf-8")
        for old, new in REPLACEMENTS:
            if old not in text:
                raise SystemExit(f"Missing snippet in {path}:\n{old[:180]!r}")
            text = text.replace(old, new, 1)
        path.write_text(text, encoding="utf-8")
        print(f"patched {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
