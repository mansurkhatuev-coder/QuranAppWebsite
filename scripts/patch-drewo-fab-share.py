#!/usr/bin/env python3
"""Add Share button to drewo FAB side panel on all trees."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

CSS_OLD = """    .fab-panel #reload-page {
      background: color-mix(in srgb, var(--bg2) 55%, var(--bg0));
      color: var(--text);
      border-color: color-mix(in srgb, var(--sand) 35%, transparent);
    }

    .fab-panel #save-remote {"""

CSS_NEW = """    .fab-panel #reload-page {
      background: color-mix(in srgb, var(--bg2) 55%, var(--bg0));
      color: var(--text);
      border-color: color-mix(in srgb, var(--sand) 35%, transparent);
    }

    .fab-panel #share-tree {
      background: color-mix(in srgb, var(--bg1) 60%, #2a4a3e);
      color: var(--text);
      border-color: color-mix(in srgb, var(--sand) 38%, transparent);
    }

    .fab-panel #save-remote {"""

PREMIUM_OLD = """    body[data-theme="premium"] .fab-panel #install-home,
    body[data-theme="premium"] .fab-panel #reload-page,
    body[data-theme="premium"] .fab-toggle {
      background: color-mix(in srgb, #121c1a 80%, #0a151c);
      border-color: color-mix(in srgb, var(--sand) 35%, transparent);
    }"""

PREMIUM_NEW = """    body[data-theme="premium"] .fab-panel #install-home,
    body[data-theme="premium"] .fab-panel #reload-page,
    body[data-theme="premium"] .fab-panel #share-tree,
    body[data-theme="premium"] .fab-toggle {
      background: color-mix(in srgb, #121c1a 80%, #0a151c);
      border-color: color-mix(in srgb, var(--sand) 35%, transparent);
    }"""

HTML_OLD = """      <button type="button" id="install-home">На экран Домой</button>
      <button type="button" id="reload-page">Обновить</button>
      <button type="button" id="save-remote" hidden>Сохранить</button>"""

HTML_NEW = """      <button type="button" id="install-home">На экран Домой</button>
      <button type="button" id="reload-page">Обновить</button>
      <button type="button" id="share-tree">Поделиться</button>
      <button type="button" id="save-remote" hidden>Сохранить</button>"""

VARS_OLD = """      var installHomeBtn = document.getElementById('install-home');
      var reloadPageBtn = document.getElementById('reload-page');"""

VARS_NEW = """      var installHomeBtn = document.getElementById('install-home');
      var reloadPageBtn = document.getElementById('reload-page');
      var shareTreeBtn = document.getElementById('share-tree');"""

HANDLERS_OLD = """      if (reloadPageBtn) {
        reloadPageBtn.addEventListener('click', function () {
          var go = function () {
            setFabOpen(false);
            var base = location.pathname.replace(/\\/?$/, '/');
            location.replace(base + '?v=' + Date.now());
          };
          if (!treeDirty) {
            go();"""

# Use a simpler unique marker for inserting share handler after reload block start is fragile.
# Insert right before installHomeBtn handler instead.

INSERT_BEFORE = """      if (installHomeBtn) {
        installHomeBtn.addEventListener('click', function () {
          if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            deferredInstallPrompt.userChoice.finally(function () {
              deferredInstallPrompt = null;
            });
            return;
          }
          openInstallDialog();
        });
      }"""

SHARE_HANDLER = """      function getSharePayload() {
        var titleEl = document.querySelector('.brand h1');
        var title = (titleEl && titleEl.textContent.trim()) || 'Семейное древо';
        var url = '';
        try {
          url = location.origin + location.pathname.replace(/\/?$/, '/');
        } catch (err) {
          url = 'https://waydean.ru/' + TREE_DIR + '/';
        }
        return {
          title: title,
          text: title + ' — семейное древо',
          url: url,
        };
      }

      function copyShareText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
          var textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.setAttribute('readonly', '');
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          try {
            var copied = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (copied) resolve();
            else reject(new Error('copy failed'));
          } catch (err) {
            document.body.removeChild(textarea);
            reject(err);
          }
        });
      }

      function handleShareTree() {
        var payload = getSharePayload();
        setFabOpen(false);
        if (navigator.share) {
          navigator
            .share(payload)
            .catch(function (err) {
              if (err && err.name === 'AbortError') return;
              return copyShareText(payload.text + '\\n' + payload.url)
                .then(function () {
                  showToast('Ссылка скопирована', 'success');
                })
                .catch(function () {
                  showToast('Не удалось поделиться', 'error');
                });
            });
          return;
        }
        copyShareText(payload.text + '\\n' + payload.url)
          .then(function () {
            showToast('Ссылка скопирована', 'success');
          })
          .catch(function () {
            showToast('Не удалось скопировать ссылку', 'error');
          });
      }

      if (shareTreeBtn) {
        shareTreeBtn.addEventListener('click', handleShareTree);
      }

      if (installHomeBtn) {
        installHomeBtn.addEventListener('click', function () {
          if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            deferredInstallPrompt.userChoice.finally(function () {
              deferredInstallPrompt = null;
            });
            return;
          }
          openInstallDialog();
        });
      }"""


def must_replace(text: str, old: str, new: str, label: str, path: Path) -> str:
    if old not in text:
        raise SystemExit(f"{path}: missing {label}")
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected 1 {label}, got {text.count(old)}")
    return text.replace(old, new, 1)


def patch_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if 'id="share-tree"' in text and "function handleShareTree()" in text:
        print(f"skip: {path.relative_to(ROOT)}")
        return

    text = must_replace(text, CSS_OLD, CSS_NEW, "fab CSS", path)
    text = must_replace(text, PREMIUM_OLD, PREMIUM_NEW, "premium fab CSS", path)
    text = must_replace(text, HTML_OLD, HTML_NEW, "fab HTML", path)
    text = must_replace(text, VARS_OLD, VARS_NEW, "share var", path)
    text = must_replace(text, INSERT_BEFORE, SHARE_HANDLER, "share handler", path)
    path.write_text(text, encoding="utf-8")
    print(f"patched: {path.relative_to(ROOT)}")


def main() -> None:
    for path in TARGETS:
        if not path.exists():
            raise SystemExit(f"missing {path}")
        patch_file(path)


if __name__ == "__main__":
    main()
