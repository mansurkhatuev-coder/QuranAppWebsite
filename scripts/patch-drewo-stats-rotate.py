#!/usr/bin/env python3
"""Make visit/online header chip rotate between both metrics."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

HTML_OLD = """      <div id="visit-chip" class="visit-chip" hidden title="Сейчас в сети" aria-label="Сейчас в сети">
        <span class="visit-count" id="visit-count">…</span>
        <span class="visit-sub" id="visit-sub">онлайн</span>
      </div>"""

HTML_NEW = """      <div id="visit-chip" class="visit-chip" hidden title="Онлайн и посещения" aria-label="Онлайн и посещения">
        <span class="visit-count" id="visit-count">…</span>
        <span class="visit-sub" id="visit-sub">онлайн</span>
      </div>"""

OLD_BLOCK = """      var presenceTimer = null;
      var presenceStarted = false;
      var PRESENCE_INTERVAL_MS = 45000;

      function applyOnlineCount(count) {
        var n = Number(count);
        if (!Number.isFinite(n) || n < 0) n = 0;
        n = Math.floor(n);
        if (visitCountEl) visitCountEl.textContent = String(n);
        if (visitSubEl) visitSubEl.textContent = 'онлайн';
        if (visitChip) visitChip.hidden = false;
      }"""

NEW_BLOCK = """      var presenceTimer = null;
      var presenceStarted = false;
      var PRESENCE_INTERVAL_MS = 45000;
      var STATS_ROTATE_MS = 4000;
      var statsRotateTimer = null;
      var statsMode = 'online';
      var knownOnlineCount = null;
      var knownVisitCount = null;

      function visitWord(n) {
        var abs = Math.abs(Number(n) || 0) % 100;
        var n1 = abs % 10;
        if (abs > 10 && abs < 20) return 'посещений';
        if (n1 === 1) return 'посещение';
        if (n1 >= 2 && n1 <= 4) return 'посещения';
        return 'посещений';
      }

      function normalizeStatCount(count) {
        var n = Number(count);
        if (!Number.isFinite(n) || n < 0) return 0;
        return Math.floor(n);
      }

      function renderStatsChip() {
        var hasOnline = knownOnlineCount != null;
        var hasVisits = knownVisitCount != null;
        if (!hasOnline && !hasVisits) {
          if (visitChip) visitChip.hidden = true;
          return;
        }
        if (visitChip) visitChip.hidden = false;

        var mode = statsMode;
        if (mode === 'online' && !hasOnline) mode = 'visits';
        if (mode === 'visits' && !hasVisits) mode = 'online';

        if (mode === 'visits' && hasVisits) {
          if (visitCountEl) visitCountEl.textContent = String(knownVisitCount);
          if (visitSubEl) visitSubEl.textContent = visitWord(knownVisitCount);
          if (visitChip) visitChip.title = 'Всего посещений';
        } else {
          if (visitCountEl) visitCountEl.textContent = String(knownOnlineCount);
          if (visitSubEl) visitSubEl.textContent = 'онлайн';
          if (visitChip) visitChip.title = 'Сейчас в сети';
        }
      }

      function ensureStatsRotate() {
        if (statsRotateTimer) return;
        if (knownOnlineCount == null || knownVisitCount == null) return;
        statsRotateTimer = setInterval(function () {
          if (knownOnlineCount == null || knownVisitCount == null) return;
          statsMode = statsMode === 'online' ? 'visits' : 'online';
          renderStatsChip();
        }, STATS_ROTATE_MS);
      }

      function applyOnlineCount(count) {
        knownOnlineCount = normalizeStatCount(count);
        renderStatsChip();
        ensureStatsRotate();
      }

      function applyVisitCount(count) {
        knownVisitCount = normalizeStatCount(count);
        renderStatsChip();
        ensureStatsRotate();
      }"""

# Update recordVisitOnce and loadTreeStatus to also apply visitCount
RECORD_OLD = """        callPublishApi({ action: 'record-visit', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            try {
              localStorage.setItem(visitDayStorageKey(), day);
            } catch (err) {}
            if (data && data.onlineCount != null) applyOnlineCount(data.onlineCount);
          })
          .catch(function () {});"""

RECORD_NEW = """        callPublishApi({ action: 'record-visit', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            try {
              localStorage.setItem(visitDayStorageKey(), day);
            } catch (err) {}
            if (data && data.visitCount != null) applyVisitCount(data.visitCount);
            if (data && data.onlineCount != null) applyOnlineCount(data.onlineCount);
          })
          .catch(function () {});"""

STATUS_OLD = """      function loadTreeStatus() {
        return callPublishApi({ action: 'status', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            applyLockState(!!(data && data.locked), data && data.lockedReason);
            if (data && data.onlineCount != null) applyOnlineCount(data.onlineCount);
          })
          .catch(function () {});
      }"""

STATUS_NEW = """      function loadTreeStatus() {
        return callPublishApi({ action: 'status', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            applyLockState(!!(data && data.locked), data && data.lockedReason);
            if (data && data.visitCount != null) applyVisitCount(data.visitCount);
            if (data && data.onlineCount != null) applyOnlineCount(data.onlineCount);
          })
          .catch(function () {});
      }"""

EXPORT_OLD = """        if (exportVisitSub) exportVisitSub.textContent = 'онлайн';"""
EXPORT_NEW = """        if (exportVisitSub) exportVisitSub.textContent = 'онлайн';
        // Rotation state is runtime-only; keep a neutral placeholder label."""


def must_replace(text: str, old: str, new: str, label: str, path: Path) -> str:
    if old not in text:
        raise SystemExit(f"{path}: missing marker for {label}")
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected 1 occurrence of {label}, got {text.count(old)}")
    return text.replace(old, new, 1)


def patch_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "STATS_ROTATE_MS" in text and "function applyVisitCount(count)" in text:
        print(f"skip (already patched): {path.relative_to(ROOT)}")
        return

    text = must_replace(text, HTML_OLD, HTML_NEW, "chip aria", path)
    text = must_replace(text, OLD_BLOCK, NEW_BLOCK, "rotate logic", path)
    text = must_replace(text, RECORD_OLD, RECORD_NEW, "recordVisitOnce", path)
    text = must_replace(text, STATUS_OLD, STATUS_NEW, "loadTreeStatus", path)
    # EXPORT_NEW intentionally keeps the same first line; skip no-op export change

    path.write_text(text, encoding="utf-8")
    print(f"patched: {path.relative_to(ROOT)}")


def main() -> None:
    for path in TARGETS:
        if not path.exists():
            raise SystemExit(f"missing {path}")
        patch_file(path)


if __name__ == "__main__":
    main()
