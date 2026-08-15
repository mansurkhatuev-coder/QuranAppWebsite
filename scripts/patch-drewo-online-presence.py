#!/usr/bin/env python3
"""Switch drewo visit chip UI to live online presence + heartbeat."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

HTML_OLD = """      <div id="visit-chip" class="visit-chip" hidden title="Посещения древа" aria-label="Посещения древа">
        <span class="visit-count" id="visit-count">…</span>
        <span class="visit-sub" id="visit-sub">посещений</span>
      </div>"""

HTML_NEW = """      <div id="visit-chip" class="visit-chip" hidden title="Сейчас в сети" aria-label="Сейчас в сети">
        <span class="visit-count" id="visit-count">…</span>
        <span class="visit-sub" id="visit-sub">онлайн</span>
      </div>"""

LOGIC_OLD = """      function visitWord(n) {
        var abs = Math.abs(Number(n) || 0) % 100;
        var n1 = abs % 10;
        if (abs > 10 && abs < 20) return 'посещений';
        if (n1 === 1) return 'посещение';
        if (n1 >= 2 && n1 <= 4) return 'посещения';
        return 'посещений';
      }

      function applyVisitCount(count) {
        var n = Number(count);
        if (!Number.isFinite(n) || n < 0) n = 0;
        n = Math.floor(n);
        if (visitCountEl) visitCountEl.textContent = String(n);
        if (visitSubEl) visitSubEl.textContent = visitWord(n);
        if (visitChip) visitChip.hidden = false;
      }

      function todayKey() {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
      }

      function visitDayStorageKey() {
        return TREE_DIR + '-visit-day';
      }

      function recordVisitOnce() {
        var day = todayKey();
        try {
          if (localStorage.getItem(visitDayStorageKey()) === day) return;
        } catch (err) {}
        callPublishApi({ action: 'record-visit', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            try {
              localStorage.setItem(visitDayStorageKey(), day);
            } catch (err) {}
            if (data && data.visitCount != null) applyVisitCount(data.visitCount);
          })
          .catch(function () {});
      }

      function loadTreeStatus() {
        return callPublishApi({ action: 'status', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            applyLockState(!!(data && data.locked), data && data.lockedReason);
            if (data && data.visitCount != null) applyVisitCount(data.visitCount);
          })
          .catch(function () {});
      }"""

LOGIC_NEW = """      var presenceTimer = null;
      var presenceStarted = false;
      var PRESENCE_INTERVAL_MS = 45000;

      function applyOnlineCount(count) {
        var n = Number(count);
        if (!Number.isFinite(n) || n < 0) n = 0;
        n = Math.floor(n);
        if (visitCountEl) visitCountEl.textContent = String(n);
        if (visitSubEl) visitSubEl.textContent = 'онлайн';
        if (visitChip) visitChip.hidden = false;
      }

      function todayKey() {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
      }

      function visitDayStorageKey() {
        return TREE_DIR + '-visit-day';
      }

      function presenceSessionKey() {
        return TREE_DIR + '-presence-id';
      }

      function getOrCreatePresenceSessionId() {
        try {
          var existing = localStorage.getItem(presenceSessionKey());
          if (existing && /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,79}$/.test(existing)) return existing;
        } catch (err) {}
        var id = '';
        try {
          if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            id = window.crypto.randomUUID().replace(/-/g, '');
          }
        } catch (err) {}
        if (!id) {
          id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
        }
        id = String(id).slice(0, 80);
        try {
          localStorage.setItem(presenceSessionKey(), id);
        } catch (err) {}
        return id;
      }

      function sendPresence(action) {
        var sessionId = getOrCreatePresenceSessionId();
        return callPublishApi({
          action: action,
          treeDir: TREE_DIR,
          password: '',
          sessionId: sessionId,
        })
          .then(function (data) {
            if (data && data.onlineCount != null) applyOnlineCount(data.onlineCount);
            return data;
          })
          .catch(function () {
            return null;
          });
      }

      function onPresenceVisibility() {
        if (document.visibilityState === 'visible' && presenceStarted) {
          sendPresence('presence-heartbeat');
        }
      }

      function startPresence() {
        if (presenceStarted) {
          sendPresence('presence-heartbeat');
          return;
        }
        presenceStarted = true;
        sendPresence('presence-heartbeat');
        if (presenceTimer) clearInterval(presenceTimer);
        presenceTimer = setInterval(function () {
          if (!presenceStarted) return;
          if (document.visibilityState === 'hidden') return;
          sendPresence('presence-heartbeat');
        }, PRESENCE_INTERVAL_MS);
        document.addEventListener('visibilitychange', onPresenceVisibility);
      }

      function stopPresence() {
        presenceStarted = false;
        if (presenceTimer) {
          clearInterval(presenceTimer);
          presenceTimer = null;
        }
        document.removeEventListener('visibilitychange', onPresenceVisibility);
        sendPresence('presence-leave');
      }

      function recordVisitOnce() {
        var day = todayKey();
        try {
          if (localStorage.getItem(visitDayStorageKey()) === day) return;
        } catch (err) {}
        callPublishApi({ action: 'record-visit', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            try {
              localStorage.setItem(visitDayStorageKey(), day);
            } catch (err) {}
            if (data && data.onlineCount != null) applyOnlineCount(data.onlineCount);
          })
          .catch(function () {});
      }

      function loadTreeStatus() {
        return callPublishApi({ action: 'status', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            applyLockState(!!(data && data.locked), data && data.lockedReason);
            if (data && data.onlineCount != null) applyOnlineCount(data.onlineCount);
          })
          .catch(function () {});
      }"""

UNLOCK_OLD = """      function unlockViewWithPerson(personId, password, authData) {
        writeViewSession(personId);
        rememberSession(password, authData);
        setViewLocked(false);
        setMyPerson(personId);
        recordVisitOnce();
      }"""

UNLOCK_NEW = """      function unlockViewWithPerson(personId, password, authData) {
        writeViewSession(personId);
        rememberSession(password, authData);
        setViewLocked(false);
        setMyPerson(personId);
        recordVisitOnce();
        startPresence();
      }"""

LOGOUT_OLD = """      function logoutView() {
        clearViewSession();
        clearMyPerson();
        sessionPassword = '';
        sessionRole = '';
        editUnlocked = false;
        setEditMode(false);
        showViewGate();
        showToast('Вы вышли', 'success');
      }"""

LOGOUT_NEW = """      function logoutView() {
        stopPresence();
        clearViewSession();
        clearMyPerson();
        sessionPassword = '';
        sessionRole = '';
        editUnlocked = false;
        setEditMode(false);
        showViewGate();
        showToast('Вы вышли', 'success');
      }"""

EXPORT_OLD = """        var exportVisitCount = doc.querySelector('#visit-count');
        if (exportVisitCount) exportVisitCount.textContent = '…';
        var exportVisitSub = doc.querySelector('#visit-sub');
        if (exportVisitSub) exportVisitSub.textContent = 'посещений';
        var exportVisitChip = doc.querySelector('#visit-chip');
        if (exportVisitChip) exportVisitChip.setAttribute('hidden', '');"""

EXPORT_NEW = """        var exportVisitCount = doc.querySelector('#visit-count');
        if (exportVisitCount) exportVisitCount.textContent = '…';
        var exportVisitSub = doc.querySelector('#visit-sub');
        if (exportVisitSub) exportVisitSub.textContent = 'онлайн';
        var exportVisitChip = doc.querySelector('#visit-chip');
        if (exportVisitChip) exportVisitChip.setAttribute('hidden', '');"""

FINISH_BOOT_SNIPPETS = [
    (
        """        updateSaveButton();
        recordVisitOnce();
        loadWeather();""",
        """        updateSaveButton();
        recordVisitOnce();
        startPresence();
        loadWeather();""",
    ),
]


def must_replace(text: str, old: str, new: str, label: str, path: Path) -> str:
    if old not in text:
        raise SystemExit(f"{path}: missing marker for {label}")
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected 1 occurrence of {label}, got {text.count(old)}")
    return text.replace(old, new, 1)


def patch_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "function startPresence()" in text and "presence-heartbeat" in text:
        print(f"skip (already patched): {path.relative_to(ROOT)}")
        return

    text = must_replace(text, HTML_OLD, HTML_NEW, "visit chip HTML", path)
    text = must_replace(text, LOGIC_OLD, LOGIC_NEW, "presence logic", path)
    text = must_replace(text, UNLOCK_OLD, UNLOCK_NEW, "unlock startPresence", path)
    text = must_replace(text, LOGOUT_OLD, LOGOUT_NEW, "logout stopPresence", path)
    text = must_replace(text, EXPORT_OLD, EXPORT_NEW, "export reset", path)

    applied = False
    for old, new in FINISH_BOOT_SNIPPETS:
        if old in text:
            text = must_replace(text, old, new, "finishBoot startPresence", path)
            applied = True
            break
    if not applied:
        raise SystemExit(f"{path}: finishBoot presence snippet not found")

    path.write_text(text, encoding="utf-8")
    print(f"patched: {path.relative_to(ROOT)}")


def main() -> None:
    for path in TARGETS:
        if not path.exists():
            raise SystemExit(f"missing {path}")
        patch_file(path)


if __name__ == "__main__":
    main()
