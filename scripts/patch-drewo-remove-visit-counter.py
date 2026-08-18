#!/usr/bin/env python3
"""Remove visit/online counter from family-tree pages."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]


def must_replace(text: str, old: str, new: str, name: str, path: Path) -> str:
    if old not in text:
        raise SystemExit(f"{path}: {name} not found")
    return text.replace(old, new, 1)


def patch_file(path: Path) -> None:
    text = path.read_text()

    text = must_replace(
        text,
        """
    .visit-chip {
      flex: 0 0 auto;
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 0.05rem;
      min-height: 2.35rem;
      padding: 0.28rem 0.65rem;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--sand) 35%, transparent);
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--bg1) 55%, transparent),
        color-mix(in srgb, var(--bg0) 80%, black)
      );
      color: var(--text);
      line-height: 1.15;
      text-align: left;
      pointer-events: none;
    }
    .visit-chip[hidden] { display: none !important; }
    .visit-count {
      font-size: 0.92rem;
      font-weight: 700;
      transition: opacity 0.25s ease;
    }
    .visit-sub {
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--text-dim);
      max-width: 7.5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: opacity 0.25s ease;
    }

""",
        "\n",
        "visit-chip CSS",
        path,
    )

    text = must_replace(
        text,
        """
      .visit-chip {
        max-width: 5.5rem;
      }

      .visit-sub {
        max-width: 100%;
      }
""",
        "\n",
        "visit-chip mobile CSS",
        path,
    )

    text = must_replace(
        text,
        """      </button>
      <div id="visit-chip" class="visit-chip" hidden title="Онлайн и посещения" aria-label="Онлайн и посещения">
        <span class="visit-count" id="visit-count">…</span>
        <span class="visit-sub" id="visit-sub">онлайн</span>
      </div>
      <div class="search-wrap">
""",
        """      </button>
      <div class="search-wrap">
""",
        "visit-chip HTML",
        path,
    )

    text = must_replace(
        text,
        """      var weatherChip = document.getElementById('weather-chip');
      var visitChip = document.getElementById('visit-chip');
      var visitCountEl = document.getElementById('visit-count');
      var visitSubEl = document.getElementById('visit-sub');
      var weatherTemp = document.getElementById('weather-temp');
""",
        """      var weatherChip = document.getElementById('weather-chip');
      var weatherTemp = document.getElementById('weather-temp');
""",
        "visit chip vars",
        path,
    )

    start = "      var presenceTimer = null;\n"
    end = "      function loadTreeStatus() {"
    i = text.find(start)
    j = text.find(end)
    if i < 0 or j < 0 or j <= i:
        raise SystemExit(f"{path}: presence/visit JS block not found")
    text = text[:i] + text[j:]

    text = must_replace(
        text,
        """      function loadTreeStatus() {
        return callPublishApi({ action: 'status', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            applyLockState(!!(data && data.locked), data && data.lockedReason);
            if (data && data.visitCount != null) applyVisitCount(data.visitCount);
            if (data && data.onlineCount != null) applyOnlineCount(data.onlineCount);
          })
          .catch(function () {});
      }
""",
        """      function loadTreeStatus() {
        return callPublishApi({ action: 'status', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            applyLockState(!!(data && data.locked), data && data.lockedReason);
          })
          .catch(function () {});
      }
""",
        "loadTreeStatus",
        path,
    )

    text = must_replace(
        text,
        """        var exportAnchor = doc.querySelector('#header-anchor');
        if (exportAnchor) exportAnchor.removeAttribute('style');
        var exportVisitCount = doc.querySelector('#visit-count');
        if (exportVisitCount) exportVisitCount.textContent = '…';
        var exportVisitSub = doc.querySelector('#visit-sub');
        if (exportVisitSub) exportVisitSub.textContent = 'онлайн';
        var exportVisitChip = doc.querySelector('#visit-chip');
        if (exportVisitChip) exportVisitChip.setAttribute('hidden', '');
        // outerHTML sometimes misses script textContent — re-inject JSON via string replace.
""",
        """        var exportAnchor = doc.querySelector('#header-anchor');
        if (exportAnchor) exportAnchor.removeAttribute('style');
        // outerHTML sometimes misses script textContent — re-inject JSON via string replace.
""",
        "export visit chip",
        path,
    )

    text = must_replace(
        text,
        """        setViewLocked(false);
        if (authData && authData.fromServer) {
          recordVisitOnce();
          startPresence();
        }
        // One whoami path, deferred so unlock UI can paint; banner covers the paint hitch.
""",
        """        setViewLocked(false);
        // One whoami path, deferred so unlock UI can paint; banner covers the paint hitch.
""",
        "unlock visit/presence",
        path,
    )

    text = must_replace(
        text,
        """      function logoutView() {
        stopPresence();
        clearViewSession();
""",
        """      function logoutView() {
        clearViewSession();
""",
        "logout stopPresence",
        path,
    )

    leftovers = [
        "visit-chip",
        "recordVisitOnce",
        "startPresence",
        "stopPresence",
        "presence-heartbeat",
        "record-visit",
        "applyVisitCount",
        "applyOnlineCount",
    ]
    for needle in leftovers:
        if needle in text:
            raise SystemExit(f"{path}: leftover {needle!r}")

    path.write_text(text)
    print(f"patched {path.relative_to(ROOT)}")


def main() -> None:
    for path in TARGETS:
        patch_file(path)


if __name__ == "__main__":
    main()
