#!/usr/bin/env python3
"""Fix drewo boot freeze: no double whoami on login + gate loading indicator."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

SET_MY_PERSON_OLD = """        if (options.focus !== false) {
          if (preferReducedWhoamiMotion()) {
            whoamiFocusAfterReveal = false;
            goToPerson(myPersonId);
            armWhoamiReveal();
            redrawLinks();
            startWhoamiReveal();
          } else {
            whoamiFocusAfterReveal = true;
            prepareWhoamiPathView(myPersonId);
            armWhoamiReveal();
            redrawLinks();
            startWhoamiReveal();
          }
        } else {
          whoamiFocusAfterReveal = false;
          render(false);
          armWhoamiReveal();
          redrawLinks();
          startWhoamiReveal();
        }
        showToast('Это вы: ' + (node.name || ''), 'success');
        return true;
      }"""

SET_MY_PERSON_NEW = """        if (options.focus !== false) {
          if (preferReducedWhoamiMotion()) {
            whoamiFocusAfterReveal = false;
            goToPerson(myPersonId);
            armWhoamiReveal();
            redrawLinks();
            startWhoamiReveal();
          } else {
            whoamiFocusAfterReveal = true;
            prepareWhoamiPathView(myPersonId);
            armWhoamiReveal();
            redrawLinks();
            startWhoamiReveal();
          }
        } else {
          whoamiFocusAfterReveal = false;
          render(false);
          armWhoamiReveal();
          redrawLinks();
          startWhoamiReveal();
        }
        if (!options.silent) {
          showToast('Это вы: ' + (node.name || ''), 'success');
        }
        return true;
      }"""

UNLOCK_OLD = """      function unlockViewWithPerson(personId, password, authData) {
        writeViewSession(personId);
        rememberSession(password, authData);
        setViewLocked(false);
        setMyPerson(personId);
        recordVisitOnce();
        startPresence();
      }"""

UNLOCK_NEW = """      function setGateBusy(message) {
        if (!gateStatus) return;
        gateStatus.hidden = false;
        gateStatus.classList.add('is-busy');
        gateStatus.textContent = message || 'Загружаем…';
      }

      function clearGateBusy() {
        if (!gateStatus) return;
        gateStatus.hidden = true;
        gateStatus.classList.remove('is-busy');
        gateStatus.textContent = '';
      }

      function unlockViewWithPerson(personId, password, authData) {
        writeViewSession(personId);
        rememberSession(password, authData);
        clearGateBusy();
        setViewLocked(false);
        recordVisitOnce();
        startPresence();
        // One whoami path, deferred so unlock/gate UI can paint first.
        window.requestAnimationFrame(function () {
          setMyPerson(personId, { silent: true });
        });
      }"""

# Gate submit: remove duplicate whoami after unlockViewWithPerson
GATE_SUCCESS_OLD = """              unlockViewWithPerson(personId, password, data);
              if (gatePassword) gatePassword.value = '';
              updateViewButtons();
              refreshActivityUi();
              updateSaveButton();
              loadWeather();
              rebuildLineSets();
              updateWhoamiUi();
              if (preferReducedWhoamiMotion()) {
                whoamiFocusAfterReveal = false;
                goToPerson(personId);
                armWhoamiReveal();
                redrawLinks();
                startWhoamiReveal();
              } else {
                whoamiFocusAfterReveal = true;
                prepareWhoamiPathView(personId);
                armWhoamiReveal();
                redrawLinks();
                startWhoamiReveal();
              }
              showToast('Марша вохийла', 'success');"""

GATE_SUCCESS_NEW = """              unlockViewWithPerson(personId, password, data);
              if (gatePassword) gatePassword.value = '';
              updateViewButtons();
              refreshActivityUi();
              updateSaveButton();
              loadWeather();
              showToast('Марша вохийла', 'success');"""

# finishBoot: clear busy + defer whoami for session restore (two filter variants)
FINISH_BOOT_PREFIX_OLD_KHOTU = """      function finishBoot() {
        var session = readViewSession();
        if (!session) {
          showViewGate();
          updateViewButtons();
          refreshActivityUi();
          updateWhoamiUi();
          updateSaveButton();
          return;
        }
        setViewLocked(false);
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
        startPresence();
        loadWeather();
        if (myPersonId && TreeModel.findById(tree, myPersonId)) {
          rebuildLineSets();
          updateWhoamiUi();
          if (preferReducedWhoamiMotion()) {
            whoamiFocusAfterReveal = false;
            goToPerson(myPersonId);
            armWhoamiReveal();
            redrawLinks();
            startWhoamiReveal();
          } else {
            whoamiFocusAfterReveal = true;
            prepareWhoamiPathView(myPersonId);
            armWhoamiReveal();
            redrawLinks();
            startWhoamiReveal();
          }
        } else {
          render(true);
          maybeAskWhoami();
        }
      }"""

FINISH_BOOT_PREFIX_NEW_KHOTU = """      function finishBoot() {
        var session = readViewSession();
        clearGateBusy();
        if (!session) {
          showViewGate();
          updateViewButtons();
          refreshActivityUi();
          updateWhoamiUi();
          updateSaveButton();
          return;
        }
        setViewLocked(false);
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
        startPresence();
        loadWeather();
        window.requestAnimationFrame(function () {
          if (myPersonId && TreeModel.findById(tree, myPersonId)) {
            rebuildLineSets();
            updateWhoamiUi();
            if (preferReducedWhoamiMotion()) {
              whoamiFocusAfterReveal = false;
              goToPerson(myPersonId);
              armWhoamiReveal();
              redrawLinks();
              startWhoamiReveal();
            } else {
              whoamiFocusAfterReveal = true;
              prepareWhoamiPathView(myPersonId);
              armWhoamiReveal();
              redrawLinks();
              startWhoamiReveal();
            }
          } else {
            render(true);
            maybeAskWhoami();
          }
        });
      }"""

FINISH_BOOT_PREFIX_OLD_ALL = FINISH_BOOT_PREFIX_OLD_KHOTU.replace(
    "setViewFilter('khotu', false);", "setViewFilter('all', false);"
)
FINISH_BOOT_PREFIX_NEW_ALL = FINISH_BOOT_PREFIX_NEW_KHOTU.replace(
    "setViewFilter('khotu', false);", "setViewFilter('all', false);"
)

BOOT_FETCH_OLD = """      initChrome();

      // Свежие данные из JSON (обход кэша HTML на GitHub Pages ~10 мин).
      fetchRemoteTree().then(function (remote) {
        if (remote && typeof remote === 'object' && remote.id) {
          tree = TreeModel.markAllowAdd(remote, NUTSU_ID);
          if (dataEl) dataEl.textContent = treeJsonForEmbed(tree);
        }
        return rememberFingerprintFromTree();
      }).then(function () {
        finishBoot();
      }).catch(function () {
        rememberFingerprintFromTree().finally(finishBoot);
      });"""

BOOT_FETCH_NEW = """      initChrome();

      // Свежие данные из JSON (обход кэша HTML на GitHub Pages ~10 мин).
      setGateBusy('Загружаем древо…');
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
      });"""


def must_replace(text: str, old: str, new: str, label: str, path: Path) -> str:
    if old not in text:
        raise SystemExit(f"{path}: missing {label}")
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected 1 {label}, got {text.count(old)}")
    return text.replace(old, new, 1)


def patch_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "function setGateBusy(message)" in text and "options.silent" in text:
        print(f"skip: {path.relative_to(ROOT)}")
        return

    text = must_replace(text, SET_MY_PERSON_OLD, SET_MY_PERSON_NEW, "setMyPerson silent", path)
    text = must_replace(text, UNLOCK_OLD, UNLOCK_NEW, "unlockViewWithPerson", path)
    text = must_replace(text, GATE_SUCCESS_OLD, GATE_SUCCESS_NEW, "gate success path", path)

    if FINISH_BOOT_PREFIX_OLD_KHOTU in text:
        text = must_replace(
            text, FINISH_BOOT_PREFIX_OLD_KHOTU, FINISH_BOOT_PREFIX_NEW_KHOTU, "finishBoot khotu", path
        )
    elif FINISH_BOOT_PREFIX_OLD_ALL in text:
        text = must_replace(
            text, FINISH_BOOT_PREFIX_OLD_ALL, FINISH_BOOT_PREFIX_NEW_ALL, "finishBoot all", path
        )
    else:
        raise SystemExit(f"{path}: finishBoot variant not found")

    text = must_replace(text, BOOT_FETCH_OLD, BOOT_FETCH_NEW, "boot fetch busy", path)
    path.write_text(text, encoding="utf-8")
    print(f"patched: {path.relative_to(ROOT)}")


def main() -> None:
    for path in TARGETS:
        if not path.exists():
            raise SystemExit(f"missing {path}")
        patch_file(path)


if __name__ == "__main__":
    main()
