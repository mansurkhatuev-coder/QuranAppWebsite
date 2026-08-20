#!/usr/bin/env python3
"""Sort sons left-to-right by birth year (oldest first)."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

OLD_BLOCK = """      function layoutChildren(node) {
        var sons = node.sons || [];
        if (viewFilter === 'all') return sons;
        if (khotuPath.has(node.id) && node.id !== KHOTU_ID) {
          return sons.filter(function (s) {
            return khotuPath.has(s.id);
          });
        }
        if (underKhotu.has(node.id)) return sons;
        return sons.filter(function (s) {
          return khotuPath.has(s.id) || underKhotu.has(s.id);
        });
      }
"""

NEW_BLOCK = """      function parseBornYear(node) {
        if (!node || node.born == null || node.born === '') return null;
        var value = Number(node.born);
        return Number.isFinite(value) ? value : null;
      }

      function sortSonsByBirth(sons) {
        return (sons || [])
          .map(function (son, idx) {
            return {
              son: son,
              idx: idx,
              born: parseBornYear(son),
              name: String((son && son.name) || '').trim().toLocaleLowerCase('ru-RU'),
            };
          })
          .sort(function (a, b) {
            var aHas = a.born != null;
            var bHas = b.born != null;
            if (aHas && bHas) {
              if (a.born !== b.born) return a.born - b.born; // older (smaller year) first
              if (a.name && b.name && a.name !== b.name) return a.name.localeCompare(b.name, 'ru');
              return a.idx - b.idx;
            }
            if (aHas !== bHas) return aHas ? -1 : 1; // known years first
            return a.idx - b.idx;
          })
          .map(function (row) {
            return row.son;
          });
      }

      function layoutChildren(node) {
        var sons = sortSonsByBirth(node.sons || []);
        if (viewFilter === 'all') return sons;
        if (khotuPath.has(node.id) && node.id !== KHOTU_ID) {
          return sortSonsByBirth(
            sons.filter(function (s) {
              return khotuPath.has(s.id);
            })
          );
        }
        if (underKhotu.has(node.id)) return sons;
        return sortSonsByBirth(
          sons.filter(function (s) {
            return khotuPath.has(s.id) || underKhotu.has(s.id);
          })
        );
      }
"""


def patch_file(path: Path) -> None:
    text = path.read_text()
    if OLD_BLOCK not in text:
        raise SystemExit(f"{path}: layoutChildren block not found")
    text = text.replace(OLD_BLOCK, NEW_BLOCK, 1)
    path.write_text(text)
    print(f"patched {path.relative_to(ROOT)}")


def main() -> None:
    for target in TARGETS:
        patch_file(target)


if __name__ == "__main__":
    main()
