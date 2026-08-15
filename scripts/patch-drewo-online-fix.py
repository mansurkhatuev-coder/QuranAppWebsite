#!/usr/bin/env python3
"""Harden drewo online presence: faster heartbeat, status poll, longer server TTL companion."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

OLD = """      var presenceTimer = null;
      var presenceStarted = false;
      var PRESENCE_INTERVAL_MS = 45000;
      var STATS_ROTATE_MS = 4000;
      var statsRotateTimer = null;
      var statsMode = 'online';
      var knownOnlineCount = null;
      var knownVisitCount = null;"""

NEW = """      var presenceTimer = null;
      var presencePollTimer = null;
      var presenceStarted = false;
      var PRESENCE_INTERVAL_MS = 20000;
      var PRESENCE_POLL_MS = 12000;
      var STATS_ROTATE_MS = 4000;
      var statsRotateTimer = null;
      var statsMode = 'online';
      var knownOnlineCount = null;
      var knownVisitCount = null;"""

OLD_SEND_VIS = """      function onPresenceVisibility() {
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
      }"""

NEW_SEND_VIS = """      function refreshPresenceStats() {
        if (!presenceStarted) return;
        callPublishApi({ action: 'status', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            if (data && data.visitCount != null) applyVisitCount(data.visitCount);
            if (data && data.onlineCount != null) applyOnlineCount(data.onlineCount);
          })
          .catch(function () {});
      }

      function onPresenceVisibility() {
        if (!presenceStarted) return;
        if (document.visibilityState === 'visible') {
          sendPresence('presence-heartbeat');
          refreshPresenceStats();
        } else {
          // Keep a last heartbeat while backgrounding so the other device
          // still sees us for the server TTL window.
          sendPresence('presence-heartbeat');
        }
      }

      function onPresenceFocus() {
        if (!presenceStarted) return;
        sendPresence('presence-heartbeat');
        refreshPresenceStats();
      }

      function startPresence() {
        if (presenceStarted) {
          sendPresence('presence-heartbeat');
          refreshPresenceStats();
          return;
        }
        presenceStarted = true;
        sendPresence('presence-heartbeat');
        refreshPresenceStats();
        if (presenceTimer) clearInterval(presenceTimer);
        presenceTimer = setInterval(function () {
          if (!presenceStarted) return;
          sendPresence('presence-heartbeat');
        }, PRESENCE_INTERVAL_MS);
        if (presencePollTimer) clearInterval(presencePollTimer);
        presencePollTimer = setInterval(function () {
          if (!presenceStarted) return;
          refreshPresenceStats();
        }, PRESENCE_POLL_MS);
        document.addEventListener('visibilitychange', onPresenceVisibility);
        window.addEventListener('focus', onPresenceFocus);
        window.addEventListener('pageshow', onPresenceFocus);
      }

      function stopPresence() {
        presenceStarted = false;
        if (presenceTimer) {
          clearInterval(presenceTimer);
          presenceTimer = null;
        }
        if (presencePollTimer) {
          clearInterval(presencePollTimer);
          presencePollTimer = null;
        }
        document.removeEventListener('visibilitychange', onPresenceVisibility);
        window.removeEventListener('focus', onPresenceFocus);
        window.removeEventListener('pageshow', onPresenceFocus);
        sendPresence('presence-leave');
      }"""


def must_replace(text: str, old: str, new: str, label: str, path: Path) -> str:
    if old not in text:
        raise SystemExit(f"{path}: missing {label}")
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected 1 {label}, got {text.count(old)}")
    return text.replace(old, new, 1)


def main() -> None:
    for path in TARGETS:
        text = path.read_text(encoding="utf-8")
        if "PRESENCE_POLL_MS" in text:
            print(f"skip: {path.relative_to(ROOT)}")
            continue
        text = must_replace(text, OLD, NEW, "intervals", path)
        text = must_replace(text, OLD_SEND_VIS, NEW_SEND_VIS, "presence loop", path)
        path.write_text(text, encoding="utf-8")
        print(f"patched: {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
