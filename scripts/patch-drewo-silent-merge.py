#!/usr/bin/env python3
"""Silent three-way merge on Save; no conflict dialogs."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "drewo" / "index.html",
    ROOT / "drewo-dada-yurt" / "index.html",
    ROOT / "drewo-reklama" / "index.html",
]

OLD_MERGE = r"""  /**
   * Merge concurrent edits: keep server structure, fill missing years/bio from local,
   * attach locally-added sons under the same parent when possible.
   */
  function mergeConcurrentEdits(serverRoot, localRoot) {
    const server = cloneTree(serverRoot);
    const byId = new Map();
    const parentOf = new Map();
    function index(node, parentId) {
      byId.set(String(node.id), node);
      if (parentId != null) parentOf.set(String(node.id), String(parentId));
      (node.sons || []).forEach((s) => index(s, node.id));
    }
    index(server, null);

    const localById = new Map();
    const localParentOf = new Map();
    function indexLocal(node, parentId) {
      localById.set(String(node.id), node);
      if (parentId != null) localParentOf.set(String(node.id), String(parentId));
      (node.sons || []).forEach((s) => indexLocal(s, node.id));
    }
    indexLocal(localRoot, null);

    const stats = { filled: [], overridden: [], addedSons: [] };

    function mergeField(serverNode, localNode, field) {
      const sv = serverNode[field];
      const lv = localNode[field];
      const sEmpty = sv == null || sv === '';
      const lEmpty = lv == null || lv === '';
      if (sEmpty && !lEmpty) {
        serverNode[field] = lv;
        stats.filled.push({ id: serverNode.id, field, value: lv });
      } else if (!sEmpty && !lEmpty && String(sv) !== String(lv)) {
        serverNode[field] = lv;
        stats.overridden.push({ id: serverNode.id, field, server: sv, local: lv });
      }
    }

    localById.forEach((localNode, id) => {
      const serverNode = byId.get(id);
      if (!serverNode) return;
      mergeField(serverNode, localNode, 'born');
      mergeField(serverNode, localNode, 'died');
      mergeField(serverNode, localNode, 'bio');
      if ((!serverNode.name || !String(serverNode.name).trim()) && localNode.name) {
        serverNode.name = localNode.name;
      }
    });

    localParentOf.forEach((parentId, childId) => {
      if (byId.has(childId)) return;
      const parent = byId.get(parentId);
      const localChild = localById.get(childId);
      if (!parent || !localChild) return;
      if (!Array.isArray(parent.sons)) parent.sons = [];
      const copy = cloneTree(localChild);
      parent.sons.push(copy);
      stats.addedSons.push({ id: childId, parentId, name: copy.name });
      index(copy, parentId);
    });

    return { tree: server, stats };
  }
"""

NEW_MERGE = r"""  /**
   * Merge concurrent edits by person id.
   * With baseRoot (the tree this editor loaded): keep the other person's field
   * changes and apply ours. Same field, both changed → local wins.
   * Deletes and reparents are not applied.
   */
  function mergeConcurrentEdits(serverRoot, localRoot, baseRoot) {
    const server = cloneTree(serverRoot);
    const byId = new Map();
    function index(node, parentId) {
      byId.set(String(node.id), node);
      (node.sons || []).forEach((s) => index(s, node.id));
    }
    index(server, null);

    const localById = new Map();
    function indexLocal(node) {
      localById.set(String(node.id), node);
      (node.sons || []).forEach(indexLocal);
    }
    indexLocal(localRoot);

    const baseById = new Map();
    if (baseRoot) {
      (function indexBase(node) {
        baseById.set(String(node.id), node);
        (node.sons || []).forEach(indexBase);
      })(baseRoot);
    }

    const stats = { filled: [], overridden: [], addedSons: [], skippedDeletes: [] };
    const fields = ['name', 'born', 'died', 'bio', 'photo'];

    function fieldValueOf(node, field) {
      const value = node && node[field];
      if (value == null || value === false || value === '') return '';
      return String(value);
    }

    function applyTwoWay(serverNode, localNode, field, onlyIfServerEmpty) {
      const sv = fieldValueOf(serverNode, field);
      const lv = fieldValueOf(localNode, field);
      if (!lv) return;
      if (onlyIfServerEmpty && sv) return;
      if (!sv) {
        serverNode[field] = localNode[field];
        stats.filled.push({ id: serverNode.id, field, value: localNode[field] });
        return;
      }
      if (sv !== lv) {
        const previous = serverNode[field];
        serverNode[field] = localNode[field];
        stats.overridden.push({
          id: serverNode.id,
          field,
          server: previous,
          local: localNode[field],
        });
      }
    }

    function applyThreeWay(serverNode, localNode, baseNode, field) {
      const sv = fieldValueOf(serverNode, field);
      const lv = fieldValueOf(localNode, field);
      const bv = fieldValueOf(baseNode, field);
      if (lv === bv) return;
      if (!lv) {
        stats.skippedDeletes.push({ id: serverNode.id, field });
        return;
      }
      if (sv === lv) return;
      const previous = serverNode[field];
      serverNode[field] = localNode[field];
      if (!sv) {
        stats.filled.push({ id: serverNode.id, field, value: localNode[field] });
      } else {
        stats.overridden.push({
          id: serverNode.id,
          field,
          server: previous,
          local: localNode[field],
        });
      }
    }

    localById.forEach((localNode, id) => {
      const serverNode = byId.get(id);
      if (!serverNode) return;
      if (baseRoot) {
        const baseNode = baseById.get(id);
        fields.forEach((field) => applyThreeWay(serverNode, localNode, baseNode, field));
      } else {
        applyTwoWay(serverNode, localNode, 'born', false);
        applyTwoWay(serverNode, localNode, 'died', false);
        applyTwoWay(serverNode, localNode, 'bio', false);
        applyTwoWay(serverNode, localNode, 'photo', false);
        applyTwoWay(serverNode, localNode, 'name', true);
      }
    });

    function attach(localNode, parentOnResult) {
      const id = String(localNode.id);
      const existing = byId.get(id);
      if (existing) {
        (localNode.sons || []).forEach((son) => attach(son, existing));
        return;
      }
      if (baseRoot && baseById.has(id)) return;
      if (!parentOnResult) return;
      const copy = cloneTree(localNode);
      copy.sons = [];
      if (!Array.isArray(parentOnResult.sons)) parentOnResult.sons = [];
      parentOnResult.sons.push(copy);
      byId.set(id, copy);
      stats.addedSons.push({ id, parentId: parentOnResult.id, name: copy.name });
      (localNode.sons || []).forEach((son) => attach(son, copy));
    }
    attach(localRoot, null);

    return { tree: server, stats };
  }
"""

OLD_CONFLICT = r"""              if (err && err.conflict) {
                var serverJson = err.data && err.data.serverTreeJson;
                var serverFp = err.data && err.data.serverFingerprint;
                if (serverJson && TreeModel.mergeConcurrentEdits) {
                  try {
                    var serverTree =
                      typeof serverJson === 'string' ? JSON.parse(serverJson) : serverJson;
                    var merged = TreeModel.mergeConcurrentEdits(serverTree, tree);
                    var filled = (merged.stats && merged.stats.filled) || [];
                    var added = (merged.stats && merged.stats.addedSons) || [];
                    var changed = filled.length + added.length;
                    tree = TreeModel.markAllowAdd(merged.tree, NUTSU_ID);
                    if (dataEl) dataEl.textContent = treeJsonForEmbed(tree);
                    if (serverFp) baseFingerprint = serverFp;
                    setTreeDirty(true);
                    rebuildLineSets();
                    render(false);
                    return askChoice(
                      changed
                        ? 'На сайте были другие правки. Объединил изменения (' +
                            changed +
                            '). Сохранить объединённое?'
                        : 'На сайте уже другая версия. Сохранить с объединением?',
                      [
                        { id: 'merge', label: 'Сохранить объединённое', primary: true },
                        { id: 'reload', label: 'Только взять с сайта' },
                        { id: 'force', label: 'Только моё (затрёт чужое)' },
                        { id: 'cancel', label: 'Отмена' },
                      ]
                    ).then(function (choice) {
                      if (choice === 'merge') {
                        showBusyBanner('Сохраняю объединённое…');
                        return runPublish(false);
                      }
                      if (choice === 'reload') {
                        showBusyBanner('Обновляю с сайта…');
                        return fetchRemoteTree().then(function (remote) {
                          hideCenterBanner();
                          if (remote) applyRemoteTreeData(remote);
                          else showToast('Не удалось загрузить дерево', 'error');
                          unlockSaveForm();
                        });
                      }
                      if (choice === 'force') {
                        showBusyBanner('Сохраняю принудительно…');
                        return runPublish(true);
                      }
                      unlockSaveForm();
                    });
                  } catch (mergeErr) {
                    /* fall through to classic conflict UI */
                  }
                }
                return askChoice(
                  'На сайте уже другая версия дерева. Что сделать?',
                  [
                    { id: 'reload', label: 'Обновить у себя', primary: true },
                    { id: 'force', label: 'Всё равно сохранить' },
                    { id: 'cancel', label: 'Отмена' },
                  ]
                ).then(function (choice) {
                  if (choice === 'reload') {
                    showBusyBanner('Обновляю с сайта…');
                    return fetchRemoteTree().then(function (remote) {
                      hideCenterBanner();
                      if (remote) applyRemoteTreeData(remote);
                      else showToast('Не удалось загрузить дерево', 'error');
                      unlockSaveForm();
                    });
                  }
                  if (choice === 'force') {
                    showBusyBanner('Сохраняю принудительно…');
                    return runPublish(true);
                  }
                  unlockSaveForm();
                });
              }"""

NEW_CONFLICT = r"""              if (err && err.conflict) {
                var attempt = (err.mergeAttempt || 0) + 1;
                if (attempt > 2) {
                  showToast('Не удалось объединить правки. Обновите страницу.', 'error', 5000);
                  unlockSaveForm();
                  return;
                }
                var serverJson = err.data && err.data.serverTreeJson;
                var serverFp = err.data && err.data.serverFingerprint;
                if (serverJson && TreeModel.mergeConcurrentEdits) {
                  try {
                    var serverTree =
                      typeof serverJson === 'string' ? JSON.parse(serverJson) : serverJson;
                    var baseForMerge = null;
                    try {
                      baseForMerge = baseTreeJson ? JSON.parse(baseTreeJson) : null;
                    } catch (baseErr) {
                      baseForMerge = null;
                    }
                    var merged = TreeModel.mergeConcurrentEdits(serverTree, tree, baseForMerge);
                    tree = TreeModel.markAllowAdd(merged.tree, NUTSU_ID);
                    if (dataEl) dataEl.textContent = treeJsonForEmbed(tree);
                    if (serverFp) baseFingerprint = serverFp;
                    try {
                      baseTreeJson = JSON.stringify(serverTree);
                    } catch (baseSetErr) {}
                    setTreeDirty(true);
                    rebuildLineSets();
                    render(false);
                    showBusyBanner('Сохраняю вместе с правками с сайта…');
                    return runPublish(false, attempt).catch(handleSaveError);
                  } catch (mergeErr) {
                    showToast('Не удалось объединить правки', 'error', 5000);
                    unlockSaveForm();
                    return;
                  }
                }
                showToast((err && err.message) || 'На сайте уже другая версия', 'error', 5000);
                unlockSaveForm();
                return;
              }"""

RUN_PUBLISH_RE = re.compile(
    r"""          function runPublish\(force\) \{
            return publishToGitHub\(pass, \{ force: !!force \}\)\.then\(function \(\) \{
              window\.clearTimeout\(progressTimer\);
              setTreeDirty\(false\);
              hideCenterBanner\(\);
              showToast\('(?P<toast>Сохранено на waydean\.ru/[^']+)', 'success', 3200\);
              unlockSaveForm\(\);
            \}\);
          \}""",
    re.M,
)

NEW_RUN_PUBLISH = r"""          function runPublish(force, mergeAttempt) {
            mergeAttempt = mergeAttempt || 0;
            return publishToGitHub(pass, { force: !!force }).then(function (data) {
              window.clearTimeout(progressTimer);
              setTreeDirty(false);
              hideCenterBanner();
              if (data && data.merged) {
                try {
                  rebuildLineSets();
                  render(false);
                } catch (renderErr) {}
              }
              showToast(
                data && data.merged
                  ? 'Сохранено вместе с правками с сайта'
                  : '\g<toast>',
                'success',
                3200
              );
              unlockSaveForm();
            }).catch(function (err) {
              if (err) err.mergeAttempt = mergeAttempt;
              throw err;
            });
          }"""

APPLY_PUBLISHED = r"""
        var data = await callPublishApi(payload);
        if (data && data.treeJson) {
          try {
            var publishedTree = JSON.parse(data.treeJson);
            if (publishedTree && publishedTree.id) {
              tree = TreeModel.markAllowAdd(publishedTree, NUTSU_ID);
              treeJson = treeJsonForEmbed(tree);
              if (dataEl) dataEl.textContent = treeJson;
            }
          } catch (applyErr) {}
        }
        if (data && typeof data.activityJson === 'string' && activityEl) {
          activityEl.textContent = data.activityJson;
          refreshActivityUi();
        }
"""


def patch_file(path: Path) -> None:
    text = path.read_text()
    original = text

    if OLD_MERGE not in text:
        raise SystemExit(f"{path}: mergeConcurrentEdits block not found")
    text = text.replace(OLD_MERGE, NEW_MERGE, 1)

    if "var baseFingerprint = '';" not in text:
        raise SystemExit(f"{path}: baseFingerprint not found")
    text = text.replace(
        "var baseFingerprint = '';",
        "var baseFingerprint = '';\n      var baseTreeJson = '';",
        1,
    )

    old_remember = """      function rememberFingerprintFromTree() {
        return fingerprintTreeText(treeJsonForEmbed(tree)).then(function (fp) {
          baseFingerprint = fp;
          return fp;
        });
      }"""
    new_remember = """      function rememberFingerprintFromTree() {
        var snapshot = treeJsonForEmbed(tree);
        baseTreeJson = snapshot;
        return fingerprintTreeText(snapshot).then(function (fp) {
          baseFingerprint = fp;
          return fp;
        });
      }"""
    if old_remember not in text:
        raise SystemExit(f"{path}: rememberFingerprintFromTree not found")
    text = text.replace(old_remember, new_remember, 1)

    old_fp_line = "          baseFingerprint: baseFingerprint || '',\n          force: !!opts.force,"
    new_fp_line = (
        "          baseFingerprint: baseFingerprint || '',\n"
        "          baseTreeJson: baseTreeJson || '',\n"
        "          force: !!opts.force,"
    )
    if old_fp_line not in text:
        raise SystemExit(f"{path}: publish payload fingerprint line not found")
    text = text.replace(old_fp_line, new_fp_line, 1)

    old_call = "        var data = await callPublishApi(payload);\n"
    if old_call not in text:
        raise SystemExit(f"{path}: callPublishApi line not found")
    text = text.replace(old_call, APPLY_PUBLISHED.lstrip("\n"), 1)

    old_fp_update = """        if (data && data.fingerprint) baseFingerprint = data.fingerprint;
        else baseFingerprint = await fingerprintTreeText(treeJson);"""
    new_fp_update = """        if (data && data.fingerprint) baseFingerprint = data.fingerprint;
        else baseFingerprint = await fingerprintTreeText(treeJson);
        baseTreeJson = treeJson;"""
    if old_fp_update not in text:
        raise SystemExit(f"{path}: fingerprint update block not found")
    text = text.replace(old_fp_update, new_fp_update, 1)

    match = RUN_PUBLISH_RE.search(text)
    if not match:
        raise SystemExit(f"{path}: runPublish block not found")
    text = RUN_PUBLISH_RE.sub(NEW_RUN_PUBLISH, text, count=1)

    old_catch = "          runPublish(false)\n            .catch(function (err) {"
    new_catch = "          runPublish(false)\n            .catch(function handleSaveError(err) {"
    if old_catch not in text:
        raise SystemExit(f"{path}: save error catch not found")
    text = text.replace(old_catch, new_catch, 1)

    if OLD_CONFLICT not in text:
        raise SystemExit(f"{path}: 409 conflict UI not found")
    text = text.replace(OLD_CONFLICT, NEW_CONFLICT, 1)

    if text == original:
        raise SystemExit(f"{path}: no changes applied")
    path.write_text(text)
    print(f"patched {path.relative_to(ROOT)}")


def main() -> None:
    for path in TARGETS:
        patch_file(path)


if __name__ == "__main__":
    main()
