#!/usr/bin/env python3
"""Add public visit counter chip + recordVisitOnce to all drewo index.html files."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

CSS_WEATHER_MARKER = """    .weather-chip[hidden] { display: none !important; }
    .weather-temp {
      font-size: 0.92rem;
      font-weight: 700;
    }
    .weather-sub {
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--text-dim);
      max-width: 7.5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }"""

CSS_VISIT = """    .weather-chip[hidden] { display: none !important; }
    .weather-temp {
      font-size: 0.92rem;
      font-weight: 700;
    }
    .weather-sub {
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--text-dim);
      max-width: 7.5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

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
    }
    .visit-sub {
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--text-dim);
      max-width: 7.5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }"""

CSS_MOBILE_MARKER = """      .weather-chip {
        max-width: 5.5rem;
      }

      .weather-sub {
        max-width: 100%;
      }
    }"""

CSS_MOBILE_VISIT = """      .weather-chip {
        max-width: 5.5rem;
      }

      .weather-sub {
        max-width: 100%;
      }

      .visit-chip {
        max-width: 5.5rem;
      }

      .visit-sub {
        max-width: 100%;
      }
    }"""

HTML_MARKER = """      <button type="button" id="weather-chip" class="weather-chip" hidden title="Погода рядом" aria-label="Погода рядом">
        <span class="weather-temp" id="weather-temp">…</span>
        <span class="weather-sub" id="weather-sub">погода</span>
      </button>"""

HTML_VISIT = """      <button type="button" id="weather-chip" class="weather-chip" hidden title="Погода рядом" aria-label="Погода рядом">
        <span class="weather-temp" id="weather-temp">…</span>
        <span class="weather-sub" id="weather-sub">погода</span>
      </button>
      <div id="visit-chip" class="visit-chip" hidden title="Посещения древа" aria-label="Посещения древа">
        <span class="visit-count" id="visit-count">…</span>
        <span class="visit-sub" id="visit-sub">посещений</span>
      </div>"""

WEATHER_CHIP_VAR = "      var weatherChip = document.getElementById('weather-chip');"

VISIT_CHIP_VARS = """      var weatherChip = document.getElementById('weather-chip');
      var visitChip = document.getElementById('visit-chip');
      var visitCountEl = document.getElementById('visit-count');
      var visitSubEl = document.getElementById('visit-sub');"""

LOAD_STATUS_MARKER = """      function loadTreeStatus() {
        return callPublishApi({ action: 'status', treeDir: TREE_DIR, password: '' })
          .then(function (data) {
            applyLockState(!!(data && data.locked), data && data.lockedReason);
          })
          .catch(function () {});
      }"""

LOAD_STATUS_VISIT = """      function visitWord(n) {
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

UNLOCK_MARKER = """      function unlockViewWithPerson(personId, password, authData) {
        writeViewSession(personId);
        rememberSession(password, authData);
        setViewLocked(false);
        setMyPerson(personId);
      }"""

UNLOCK_VISIT = """      function unlockViewWithPerson(personId, password, authData) {
        writeViewSession(personId);
        rememberSession(password, authData);
        setViewLocked(false);
        setMyPerson(personId);
        recordVisitOnce();
      }"""

# finishBoot session restore: after setViewLocked(false) and before loadWeather
FINISH_BOOT_SNIPPETS = [
    (
        """        setViewLocked(false);
        if (!myPersonId) {
          myPersonId = session.personId;
          try {
            localStorage.setItem(MY_PERSON_KEY, myPersonId);
          } catch (err) {}
        }
        setViewFilter('khotu', false);
        updateViewButtons();
        refreshActivityUi();
        updateWhoamiUi();
        updateSaveButton();
        loadWeather();""",
        """        setViewLocked(false);
        if (!myPersonId) {
          myPersonId = session.personId;
          try {
            localStorage.setItem(MY_PERSON_KEY, myPersonId);
          } catch (err) {}
        }
        setViewFilter('khotu', false);
        updateViewButtons();
        refreshActivityUi();
        updateWhoamiUi();
        updateSaveButton();
        recordVisitOnce();
        loadWeather();""",
    ),
    (
        """        setViewLocked(false);
        if (!myPersonId) {
          myPersonId = session.personId;
          try {
            localStorage.setItem(MY_PERSON_KEY, myPersonId);
          } catch (err) {}
        }
        setViewFilter('all', false);
        updateViewButtons();
        refreshActivityUi();
        updateWhoamiUi();
        updateSaveButton();
        loadWeather();""",
        """        setViewLocked(false);
        if (!myPersonId) {
          myPersonId = session.personId;
          try {
            localStorage.setItem(MY_PERSON_KEY, myPersonId);
          } catch (err) {}
        }
        setViewFilter('all', false);
        updateViewButtons();
        refreshActivityUi();
        updateWhoamiUi();
        updateSaveButton();
        recordVisitOnce();
        loadWeather();""",
    ),
]

EXPORT_MARKER = """        var exportAnchor = doc.querySelector('#header-anchor');
        if (exportAnchor) exportAnchor.removeAttribute('style');
        // outerHTML sometimes misses script textContent — re-inject JSON via string replace."""

EXPORT_VISIT = """        var exportAnchor = doc.querySelector('#header-anchor');
        if (exportAnchor) exportAnchor.removeAttribute('style');
        var exportVisitCount = doc.querySelector('#visit-count');
        if (exportVisitCount) exportVisitCount.textContent = '…';
        var exportVisitSub = doc.querySelector('#visit-sub');
        if (exportVisitSub) exportVisitSub.textContent = 'посещений';
        var exportVisitChip = doc.querySelector('#visit-chip');
        if (exportVisitChip) exportVisitChip.setAttribute('hidden', '');
        // outerHTML sometimes misses script textContent — re-inject JSON via string replace."""


def must_replace(text: str, old: str, new: str, label: str, path: Path) -> str:
    if old not in text:
        raise SystemExit(f"{path}: missing marker for {label}")
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected 1 occurrence of {label}, got {text.count(old)}")
    return text.replace(old, new, 1)


def patch_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if 'id="visit-chip"' in text and "function recordVisitOnce()" in text:
        print(f"skip (already patched): {path.relative_to(ROOT)}")
        return

    text = must_replace(text, CSS_WEATHER_MARKER, CSS_VISIT, "visit CSS", path)
    text = must_replace(text, CSS_MOBILE_MARKER, CSS_MOBILE_VISIT, "visit mobile CSS", path)
    text = must_replace(text, HTML_MARKER, HTML_VISIT, "visit HTML", path)
    text = must_replace(text, WEATHER_CHIP_VAR, VISIT_CHIP_VARS, "visit vars", path)
    text = must_replace(text, LOAD_STATUS_MARKER, LOAD_STATUS_VISIT, "loadTreeStatus", path)
    text = must_replace(text, UNLOCK_MARKER, UNLOCK_VISIT, "unlockViewWithPerson", path)
    text = must_replace(text, EXPORT_MARKER, EXPORT_VISIT, "buildExportHtml", path)

    applied = False
    for old, new in FINISH_BOOT_SNIPPETS:
        if old in text:
            text = must_replace(text, old, new, "finishBoot recordVisitOnce", path)
            applied = True
            break
    if not applied:
        raise SystemExit(f"{path}: finishBoot unlock snippet not found")

    path.write_text(text, encoding="utf-8")
    print(f"patched: {path.relative_to(ROOT)}")


def main() -> None:
    for path in TARGETS:
        if not path.exists():
            raise SystemExit(f"missing {path}")
        patch_file(path)


if __name__ == "__main__":
    main()
