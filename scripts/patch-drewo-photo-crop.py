#!/usr/bin/env python3
"""Add interactive circular photo crop before upload in all drewo trees."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CROP_CSS = r"""
    #photo-crop-dialog {
      max-width: min(24rem, calc(100vw - 1.25rem));
      width: 100%;
    }
    #photo-crop-dialog .history-body {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin: 0;
    }
    .photo-crop-hint {
      margin: 0;
      color: var(--text-dim);
      font-size: 0.88rem;
      line-height: 1.35;
    }
    .photo-crop-stage {
      position: relative;
      width: min(100%, 20rem);
      margin: 0 auto;
      aspect-ratio: 1 / 1;
      border-radius: 12px;
      overflow: hidden;
      background: #070f14;
      border: 1px solid color-mix(in srgb, var(--sand) 30%, transparent);
      touch-action: none;
      user-select: none;
    }
    #photo-crop-canvas {
      display: block;
      width: 100%;
      height: 100%;
      cursor: grab;
      touch-action: none;
    }
    #photo-crop-canvas.is-dragging {
      cursor: grabbing;
    }
    #photo-crop-dialog label {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.9rem;
      color: var(--text-dim);
    }
    #photo-crop-zoom {
      width: 100%;
      accent-color: var(--sand);
    }
"""

CROP_HTML = r"""
  <dialog id="photo-crop-dialog" aria-labelledby="photo-crop-title">
    <div class="history-body">
      <strong id="photo-crop-title">Кадрирование</strong>
      <p class="photo-crop-hint">Двигайте фото пальцем или мышью. Ползунок — масштаб. В круге будет лицо на древе.</p>
      <div class="photo-crop-stage" id="photo-crop-stage">
        <canvas id="photo-crop-canvas" width="640" height="640" aria-label="Кадрирование фото"></canvas>
      </div>
      <label>
        Масштаб
        <input id="photo-crop-zoom" type="range" min="1" max="3" step="0.01" value="1">
      </label>
      <div class="dialog-actions">
        <button type="button" id="photo-crop-apply">Готово</button>
        <button type="button" id="photo-crop-cancel">Отмена</button>
      </div>
    </div>
  </dialog>
"""

CROP_JS = r"""
      var photoCropDialog = document.getElementById('photo-crop-dialog');
      var photoCropCanvas = document.getElementById('photo-crop-canvas');
      var photoCropZoom = document.getElementById('photo-crop-zoom');
      var photoCropApply = document.getElementById('photo-crop-apply');
      var photoCropCancel = document.getElementById('photo-crop-cancel');
      var photoCropCtx = photoCropCanvas ? photoCropCanvas.getContext('2d') : null;
      var photoCrop = {
        personId: null,
        img: null,
        zoom: 1,
        ox: 0,
        oy: 0,
        dragging: false,
        lastX: 0,
        lastY: 0,
        pointers: {},
        pinchStartDist: 0,
        pinchStartZoom: 1,
      };

      function photoCropCoverScale() {
        if (!photoCrop.img || !photoCropCanvas) return 1;
        var iw = photoCrop.img.naturalWidth || photoCrop.img.width;
        var ih = photoCrop.img.naturalHeight || photoCrop.img.height;
        var cw = photoCropCanvas.width;
        var ch = photoCropCanvas.height;
        return Math.max(cw / iw, ch / ih);
      }

      function photoCropCircleRadius() {
        if (!photoCropCanvas) return 0;
        return Math.min(photoCropCanvas.width, photoCropCanvas.height) * 0.46;
      }

      function clampPhotoCropOffset() {
        if (!photoCrop.img || !photoCropCanvas) return;
        var iw = photoCrop.img.naturalWidth || photoCrop.img.width;
        var ih = photoCrop.img.naturalHeight || photoCrop.img.height;
        var cw = photoCropCanvas.width;
        var ch = photoCropCanvas.height;
        var s = photoCropCoverScale() * photoCrop.zoom;
        var dw = iw * s;
        var dh = ih * s;
        var R = photoCropCircleRadius();
        var maxOx = dw / 2 - R;
        var minOx = R - dw / 2;
        var maxOy = dh / 2 - R;
        var minOy = R - dh / 2;
        if (maxOx < minOx) {
          photoCrop.ox = 0;
        } else {
          photoCrop.ox = Math.min(maxOx, Math.max(minOx, photoCrop.ox));
        }
        if (maxOy < minOy) {
          photoCrop.oy = 0;
        } else {
          photoCrop.oy = Math.min(maxOy, Math.max(minOy, photoCrop.oy));
        }
      }

      function drawPhotoCrop() {
        if (!photoCropCtx || !photoCropCanvas || !photoCrop.img) return;
        var cw = photoCropCanvas.width;
        var ch = photoCropCanvas.height;
        var iw = photoCrop.img.naturalWidth || photoCrop.img.width;
        var ih = photoCrop.img.naturalHeight || photoCrop.img.height;
        var s = photoCropCoverScale() * photoCrop.zoom;
        var dw = iw * s;
        var dh = ih * s;
        var dx = (cw - dw) / 2 + photoCrop.ox;
        var dy = (ch - dh) / 2 + photoCrop.oy;
        var R = photoCropCircleRadius();
        photoCropCtx.clearRect(0, 0, cw, ch);
        photoCropCtx.fillStyle = '#070f14';
        photoCropCtx.fillRect(0, 0, cw, ch);
        photoCropCtx.drawImage(photoCrop.img, dx, dy, dw, dh);
        photoCropCtx.save();
        photoCropCtx.beginPath();
        photoCropCtx.rect(0, 0, cw, ch);
        photoCropCtx.arc(cw / 2, ch / 2, R, 0, Math.PI * 2, true);
        photoCropCtx.fillStyle = 'rgba(3, 9, 16, 0.58)';
        photoCropCtx.fill();
        photoCropCtx.restore();
        photoCropCtx.beginPath();
        photoCropCtx.arc(cw / 2, ch / 2, R, 0, Math.PI * 2);
        photoCropCtx.strokeStyle = 'color-mix(in srgb, #e2c48a 85%, white)';
        photoCropCtx.lineWidth = Math.max(2, cw * 0.004);
        photoCropCtx.stroke();
      }

      function exportPhotoCropDataUrl(outSize, quality) {
        if (!photoCrop.img || !photoCropCanvas) return '';
        var cw = photoCropCanvas.width;
        var ch = photoCropCanvas.height;
        var iw = photoCrop.img.naturalWidth || photoCrop.img.width;
        var ih = photoCrop.img.naturalHeight || photoCrop.img.height;
        var s = photoCropCoverScale() * photoCrop.zoom;
        var dw = iw * s;
        var dh = ih * s;
        var dx = (cw - dw) / 2 + photoCrop.ox;
        var dy = (ch - dh) / 2 + photoCrop.oy;
        var R = photoCropCircleRadius();
        var D = R * 2;
        var full = document.createElement('canvas');
        full.width = cw;
        full.height = ch;
        var fctx = full.getContext('2d');
        fctx.fillStyle = '#070f14';
        fctx.fillRect(0, 0, cw, ch);
        fctx.drawImage(photoCrop.img, dx, dy, dw, dh);
        var out = document.createElement('canvas');
        out.width = outSize;
        out.height = outSize;
        out.getContext('2d').drawImage(full, cw / 2 - R, ch / 2 - R, D, D, 0, 0, outSize, outSize);
        return canvasToDataUrl(out, 'image/jpeg', quality);
      }

      function closePhotoCropDialog() {
        if (photoCrop.img && photoCrop.img.src && String(photoCrop.img.src).indexOf('blob:') === 0) {
          try {
            URL.revokeObjectURL(photoCrop.img.src);
          } catch (err) {}
        }
        photoCrop.personId = null;
        photoCrop.img = null;
        photoCrop.zoom = 1;
        photoCrop.ox = 0;
        photoCrop.oy = 0;
        photoCrop.dragging = false;
        photoCrop.pointers = {};
        if (photoCropCanvas) photoCropCanvas.classList.remove('is-dragging');
        if (photoCropZoom) photoCropZoom.value = '1';
        if (photoCropDialog && photoCropDialog.open) photoCropDialog.close();
      }

      function openPhotoCropDialog(personId, file) {
        if (!file || !photoCropDialog || !photoCropCanvas) {
          showToast('Кадрирование недоступно', 'error');
          return;
        }
        photoCrop.personId = personId;
        if (personSheetDialog && personSheetDialog.open) {
          try {
            personSheetDialog.close();
          } catch (err) {}
        }
        loadImageFromFile(file)
          .then(function (img) {
            photoCrop.img = img;
            photoCrop.zoom = 1;
            photoCrop.ox = 0;
            photoCrop.oy = 0;
            if (photoCropZoom) photoCropZoom.value = '1';
            clampPhotoCropOffset();
            drawPhotoCrop();
            var open = function () {
              try {
                if (typeof photoCropDialog.showModal === 'function') photoCropDialog.showModal();
                else photoCropDialog.setAttribute('open', '');
              } catch (err2) {
                showToast('Не удалось открыть кадрирование', 'error');
              }
            };
            if (photoCropDialog.open) {
              open();
            } else {
              window.setTimeout(open, 40);
            }
          })
          .catch(function (err) {
            showToast((err && err.message) || 'Не удалось прочитать фото', 'error');
          });
      }

      function uploadPersonPhotoData(id, fullDataUrl, thumbDataUrl) {
        var node = TreeModel.findById(tree, id);
        if (!node || !fullDataUrl || !thumbDataUrl) return Promise.resolve();
        if (treeLocked && !isSuperSession()) {
          showToast('Правки заблокированы', 'error');
          return Promise.resolve();
        }
        var password = sessionPassword;
        if (!password) {
          showToast('Сначала введите пароль', 'error');
          return Promise.resolve();
        }
        showToast('Загружаем…', 'success');
        return callPublishApi({
          action: 'upload-photo',
          password: password,
          treeDir: TREE_DIR,
          personId: String(id),
          full: fullDataUrl,
          thumb: thumbDataUrl,
          version: String(Date.now()),
        })
          .then(function (data) {
            node.photo = data.photo || data.version || String(Date.now());
            persistTree();
            pushActivity({
              type: 'photo',
              at: new Date().toISOString(),
              son: node.name || '',
              sonId: id,
            });
            showToast('Фото добавлено. Нажмите «Сохранить»', 'success');
            render(false);
            if (personSheetTargetId && String(personSheetTargetId) === String(id)) {
              openPersonSheet(id);
            } else {
              personSheetTargetId = id;
              openPersonSheet(id);
            }
          })
          .catch(function (err) {
            showToast((err && err.message) || 'Не удалось загрузить фото', 'error');
          });
      }

"""

# Replace compressSquarePhoto block usage path - keep compressSquarePhoto for fallback
# Replace uploadPersonPhoto to still exist but crop is primary

OLD_FILE_HANDLER = """      if (personPhotoFile) {
        personPhotoFile.addEventListener('change', function () {
          var file = personPhotoFile.files && personPhotoFile.files[0];
          var id = personSheetTargetId;
          personPhotoFile.value = '';
          if (!file || !id) return;
          uploadPersonPhoto(id, file);
        });
      }"""

NEW_FILE_HANDLER = """      if (personPhotoFile) {
        personPhotoFile.addEventListener('change', function () {
          var file = personPhotoFile.files && personPhotoFile.files[0];
          var id = personSheetTargetId;
          personPhotoFile.value = '';
          if (!file || !id) return;
          openPhotoCropDialog(id, file);
        });
      }
      if (photoCropZoom) {
        photoCropZoom.addEventListener('input', function () {
          photoCrop.zoom = Math.max(1, Number(photoCropZoom.value) || 1);
          clampPhotoCropOffset();
          drawPhotoCrop();
        });
      }
      if (photoCropCanvas) {
        photoCropCanvas.addEventListener('pointerdown', function (e) {
          if (!photoCrop.img) return;
          e.preventDefault();
          photoCrop.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
          try {
            photoCropCanvas.setPointerCapture(e.pointerId);
          } catch (err) {}
          var ids = Object.keys(photoCrop.pointers);
          if (ids.length === 1) {
            photoCrop.dragging = true;
            photoCrop.lastX = e.clientX;
            photoCrop.lastY = e.clientY;
            photoCropCanvas.classList.add('is-dragging');
          } else if (ids.length === 2) {
            photoCrop.dragging = false;
            var a = photoCrop.pointers[ids[0]];
            var b = photoCrop.pointers[ids[1]];
            photoCrop.pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            photoCrop.pinchStartZoom = photoCrop.zoom;
          }
        });
        photoCropCanvas.addEventListener('pointermove', function (e) {
          if (!photoCrop.img || !photoCrop.pointers[e.pointerId]) return;
          photoCrop.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
          var ids = Object.keys(photoCrop.pointers);
          if (ids.length >= 2) {
            var a = photoCrop.pointers[ids[0]];
            var b = photoCrop.pointers[ids[1]];
            var dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            var next = photoCrop.pinchStartZoom * (dist / (photoCrop.pinchStartDist || 1));
            photoCrop.zoom = Math.min(3, Math.max(1, next));
            if (photoCropZoom) photoCropZoom.value = String(photoCrop.zoom);
            clampPhotoCropOffset();
            drawPhotoCrop();
            return;
          }
          if (!photoCrop.dragging) return;
          var scale = photoCropCanvas.width / Math.max(1, photoCropCanvas.getBoundingClientRect().width);
          photoCrop.ox += (e.clientX - photoCrop.lastX) * scale;
          photoCrop.oy += (e.clientY - photoCrop.lastY) * scale;
          photoCrop.lastX = e.clientX;
          photoCrop.lastY = e.clientY;
          clampPhotoCropOffset();
          drawPhotoCrop();
        });
        function endCropPointer(e) {
          delete photoCrop.pointers[e.pointerId];
          var ids = Object.keys(photoCrop.pointers);
          if (ids.length === 1) {
            var p = photoCrop.pointers[ids[0]];
            photoCrop.dragging = true;
            photoCrop.lastX = p.x;
            photoCrop.lastY = p.y;
            photoCropCanvas.classList.add('is-dragging');
          } else {
            photoCrop.dragging = false;
            photoCropCanvas.classList.remove('is-dragging');
          }
        }
        photoCropCanvas.addEventListener('pointerup', endCropPointer);
        photoCropCanvas.addEventListener('pointercancel', endCropPointer);
        photoCropCanvas.addEventListener(
          'wheel',
          function (e) {
            if (!photoCrop.img) return;
            e.preventDefault();
            var delta = e.deltaY < 0 ? 0.08 : -0.08;
            photoCrop.zoom = Math.min(3, Math.max(1, photoCrop.zoom + delta));
            if (photoCropZoom) photoCropZoom.value = String(photoCrop.zoom);
            clampPhotoCropOffset();
            drawPhotoCrop();
          },
          { passive: false }
        );
      }
      if (photoCropApply) {
        photoCropApply.addEventListener('click', function () {
          var id = photoCrop.personId;
          if (!id || !photoCrop.img) return;
          var full = exportPhotoCropDataUrl(800, 0.82);
          var thumb = exportPhotoCropDataUrl(96, 0.8);
          closePhotoCropDialog();
          if (!full || !thumb) {
            showToast('Не удалось обрезать фото', 'error');
            return;
          }
          uploadPersonPhotoData(id, full, thumb);
        });
      }
      if (photoCropCancel) {
        photoCropCancel.addEventListener('click', function () {
          var id = photoCrop.personId;
          closePhotoCropDialog();
          if (id) openPersonSheet(id);
        });
      }
      if (photoCropDialog) {
        photoCropDialog.addEventListener('cancel', function (e) {
          e.preventDefault();
          var id = photoCrop.personId;
          closePhotoCropDialog();
          if (id) openPersonSheet(id);
        });
      }"""


def patch_file(path: Path) -> None:
    t = path.read_text(encoding="utf-8")
    orig = t

    if 'id="photo-crop-dialog"' in t:
        print(f"skip already patched {path.name}")
        return

    # CSS: add dialog to shared lists
    t = t.replace(
        "    #bio-edit-dialog,\n    #year-edit-dialog {",
        "    #bio-edit-dialog,\n    #year-edit-dialog,\n    #photo-crop-dialog {",
        1,
    )
    t = t.replace(
        "    #bio-edit-dialog::backdrop,\n    #year-edit-dialog::backdrop {",
        "    #bio-edit-dialog::backdrop,\n    #year-edit-dialog::backdrop,\n    #photo-crop-dialog::backdrop {",
        1,
    )
    # dialog-actions list - find year-edit and add photo-crop
    if "#photo-crop-dialog .dialog-actions" not in t:
        t = t.replace(
            "    #year-edit-dialog .dialog-actions {",
            "    #year-edit-dialog .dialog-actions,\n    #photo-crop-dialog .dialog-actions {",
            1,
        )
        # maybe multi-line list ending with year-edit
        t = t.replace(
            "    #year-edit-dialog .dialog-actions,",
            "    #year-edit-dialog .dialog-actions,\n    #photo-crop-dialog .dialog-actions,",
            1,
        )

    # Insert crop-specific CSS before end of first style? after person-sheet-photo-actions button styles or after has-photo block
    marker = "    .person-sheet-photo-actions button {"
    if marker not in t:
        raise SystemExit(f"{path}: photo actions css missing")
    # find end of that rule block - insert after the whole person-sheet photo section
    insert_at = t.find("    .person-btn.has-photo .person-name,")
    # Better: after person-sheet-photo-actions button rule - search unique after photo section
    anchor = "    .person-sheet-photo-actions button {"
    idx = t.find(anchor)
    # find closing brace of that rule
    end = t.find("}", idx)
    end = t.find("\n", end) + 1
    t = t[:end] + "\n" + CROP_CSS + t[end:]

    # HTML after year-edit dialog or before whoami
    if 'id="year-edit-dialog"' in t:
        needle = "  <dialog id=\"whoami-dialog\""
        if needle not in t:
            raise SystemExit(f"{path}: whoami dialog missing")
        t = t.replace(needle, CROP_HTML + "\n" + needle, 1)
    else:
        raise SystemExit(f"{path}: year-edit missing")

    # JS vars after personPhotoFile
    old_var = "      var personPhotoFile = document.getElementById('person-photo-file');\n"
    if old_var not in t:
        raise SystemExit(f"{path}: personPhotoFile var missing")
    # Insert crop helpers before compressSquarePhoto
    if "function compressSquarePhoto" not in t:
        raise SystemExit(f"{path}: compressSquarePhoto missing")
    t = t.replace(
        "      function compressSquarePhoto",
        CROP_JS + "\n      function compressSquarePhoto",
        1,
    )

    if OLD_FILE_HANDLER not in t:
        raise SystemExit(f"{path}: file handler missing")
    t = t.replace(OLD_FILE_HANDLER, NEW_FILE_HANDLER, 1)

    if t == orig:
        raise SystemExit(f"{path}: no changes")
    path.write_text(t, encoding="utf-8")
    print(f"patched {path.relative_to(ROOT)}")


def main() -> None:
    for rel in ["drewo/index.html", "drewo-dada-yurt/index.html", "drewo-reklama/index.html"]:
        patch_file(ROOT / rel)


if __name__ == "__main__":
    main()
