#!/usr/bin/env python3
"""Skip floating whoami path reveal (boot freeze: expand-all + double render)."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

# Boot: animated overview → simple focus on me
BOOT_OLD = """            if (preferReducedWhoamiMotion()) {
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
            }"""

BOOT_NEW = """            // No floating path draw on open — expand-all overview froze large trees.
            whoamiFocusAfterReveal = false;
            finishWhoamiReveal();
            goToPerson(myPersonId);"""

# After picking "это я": same freeze risk from prepareWhoamiPathView
SET_OLD = """        if (options.focus !== false) {
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
        }"""

SET_NEW = """        if (options.focus !== false) {
          whoamiFocusAfterReveal = false;
          finishWhoamiReveal();
          goToPerson(myPersonId);
        } else {
          whoamiFocusAfterReveal = false;
          finishWhoamiReveal();
          render(false);
        }"""


def patch(path: Path) -> None:
    text = path.read_text()
    if BOOT_OLD not in text:
        raise SystemExit(f"{path}: boot whoami block not found")
    text = text.replace(BOOT_OLD, BOOT_NEW, 1)
    if SET_OLD not in text:
        raise SystemExit(f"{path}: setMyPerson whoami block not found")
    text = text.replace(SET_OLD, SET_NEW, 1)
    path.write_text(text)
    print(f"patched {path.relative_to(ROOT)}")


def main() -> None:
    for target in TARGETS:
        patch(target)


if __name__ == "__main__":
    main()
