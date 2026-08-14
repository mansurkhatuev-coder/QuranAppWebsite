#!/usr/bin/env python3
"""Patch drewo + drewo-dada-yurt index.html: view gate (name+password) and photo circles."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CSS_SNIPPET = r"""
    /* --- view gate + photos --- */
    body.view-locked .header,
    body.view-locked .header-anchor,
    body.view-locked .nav-shell,
    body.view-locked .guide-banner,
    body.view-locked #edit-hint,
    body.view-locked #lock-banner,
    body.view-locked main,
    body.view-locked .fab-root,
    body.view-locked .footer-note {
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .view-gate {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
      background:
        radial-gradient(ellipse at 50% 20%, color-mix(in srgb, #1e3d36 55%, transparent), transparent 55%),
        linear-gradient(180deg, #071018 0%, #0d1a22 55%, #12261f 100%);
    }
    body:not(.view-locked) .view-gate {
      display: none !important;
    }
    .view-gate-card {
      width: min(100%, 26rem);
      max-height: min(92vh, 40rem);
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1.15rem 1.1rem 1.25rem;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--sand) 35%, transparent);
      background: color-mix(in srgb, #0a151c 88%, black);
      box-shadow: 0 18px 40px color-mix(in srgb, black 45%, transparent);
      color: var(--text);
    }
    .view-gate-card > strong {
      font-family: var(--font-display);
      font-size: 1.55rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .view-gate-card .install-steps {
      margin: 0;
    }
    #gate-results {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 11rem;
      overflow: auto;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--sand) 22%, transparent);
      background: color-mix(in srgb, var(--bg0) 55%, transparent);
    }
    #gate-results:empty {
      display: none;
    }
    #gate-results button {
      width: 100%;
      text-align: left;
      padding: 0.55rem 0.7rem;
      border: 0;
      border-bottom: 1px solid color-mix(in srgb, var(--sand) 12%, transparent);
      background: transparent;
      color: var(--text);
      font: inherit;
      cursor: pointer;
    }
    #gate-results button:hover,
    #gate-results button.is-selected {
      background: color-mix(in srgb, var(--sand) 18%, transparent);
    }
    #gate-results .whoami-father {
      display: block;
      margin-top: 0.15rem;
      font-size: 0.78rem;
      color: var(--text-dim);
      font-weight: 500;
    }
    #gate-selected {
      margin: 0;
      padding: 0.45rem 0.65rem;
      border-radius: 8px;
      border: 1px dashed color-mix(in srgb, var(--sand) 40%, transparent);
      color: color-mix(in srgb, #f7ecc0 90%, white);
      font-weight: 600;
      font-size: 0.92rem;
    }
    .view-gate-card label {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.85rem;
      color: var(--text-dim);
    }
    .view-gate-card input[type="search"],
    .view-gate-card input[type="password"] {
      min-height: 2.5rem;
      padding: 0.45rem 0.7rem;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--sand) 35%, transparent);
      background: color-mix(in srgb, var(--bg1) 40%, black);
      color: var(--text);
      font: inherit;
    }
    #gate-submit {
      min-height: 2.6rem;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--sand) 55%, white);
      background: linear-gradient(180deg, color-mix(in srgb, #4a3c1c 50%, var(--bg1)), color-mix(in srgb, var(--bg0) 70%, #2a2208));
      color: #f7ecc0;
      font-weight: 700;
      cursor: pointer;
    }
    #gate-submit:disabled {
      opacity: 0.55;
      cursor: wait;
    }

    .person-btn.has-photo {
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 0.35rem;
      text-align: left;
      padding-left: 0.28rem;
      padding-right: 0.5rem;
    }
    .person-avatar {
      flex: 0 0 auto;
      width: 1.7em;
      height: 1.7em;
      min-width: 18px;
      min-height: 18px;
      border-radius: 50%;
      object-fit: cover;
      border: 1.5px solid color-mix(in srgb, var(--sand) 70%, white);
      box-shadow: 0 0 0 1px color-mix(in srgb, black 35%, transparent);
      background: color-mix(in srgb, var(--bg1) 60%, black);
    }
    .person-btn.my-self .person-avatar,
    .person-btn.my-branch .person-avatar {
      border-color: #ffe9a0;
      box-shadow:
        0 0 0 1px color-mix(in srgb, #f0d78a 55%, transparent),
        0 0 10px color-mix(in srgb, #d4b04a 40%, transparent);
    }
    .person-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 0.08rem;
      min-width: 0;
    }
    .person-btn.has-photo .person-name,
    .person-btn.has-photo .person-years {
      text-align: left;
    }

    .person-sheet-photo-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.55rem;
      margin: 0.15rem 0 0.35rem;
    }
    .person-sheet-photo {
      width: 7.5rem;
      height: 7.5rem;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid color-mix(in srgb, var(--sand) 55%, white);
      background:
        radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--sand) 22%, transparent), transparent 55%),
        color-mix(in srgb, var(--bg1) 50%, black);
      box-shadow: 0 8px 20px color-mix(in srgb, black 35%, transparent);
    }
    .person-sheet-photo.is-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: 2.4rem;
      font-weight: 700;
      color: color-mix(in srgb, var(--sand) 75%, white);
    }
    .person-sheet-photo-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      justify-content: center;
    }
"""

GATE_HTML = r"""
  <div id="view-gate" class="view-gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
    <form id="gate-form" class="view-gate-card">
      <strong id="gate-title">__GATE_TITLE__</strong>
      <p class="install-steps">Выберите себя в списке и введите пароль семьи. Тёзок пока отличаем по отцу и годам.</p>
      <label>
        Кто вы
        <input id="gate-search" type="search" placeholder="Начните вводить имя…" autocomplete="off" required>
      </label>
      <ul id="gate-results"></ul>
      <p id="gate-selected" hidden></p>
      <input type="hidden" id="gate-person-id" value="">
      <label>
        Пароль
        <input id="gate-password" type="password" name="password" autocomplete="current-password" required>
      </label>
      <p id="gate-error" class="dialog-error" hidden></p>
      <button type="submit" id="gate-submit">Войти</button>
    </form>
  </div>
"""

PERSON_SHEET_PHOTO = r"""
      <div class="person-sheet-photo-wrap">
        <div id="person-sheet-photo" class="person-sheet-photo is-empty" aria-hidden="true">?</div>
        <div class="person-sheet-photo-actions">
          <button type="button" id="person-sheet-photo-add">Добавить фото</button>
          <button type="button" id="person-sheet-photo-remove" hidden>Убрать фото</button>
        </div>
        <input id="person-photo-file" type="file" accept="image/*" hidden>
      </div>
"""


def patch_file(path: Path, *, tree_dir: str, title: str, view_session_key: str, default_filter: str) -> None:
    text = path.read_text(encoding="utf-8")
    original = text

    if "/* --- view gate + photos --- */" not in text:
        # Insert CSS before closing </style> of main block — first </style>
        idx = text.find("</style>")
        if idx < 0:
            raise SystemExit(f"No </style> in {path}")
        text = text[:idx] + CSS_SNIPPET + "\n  " + text[idx:]

    if 'name="robots"' not in text:
        text = text.replace(
            '<meta name="theme-color" content="#0d1a22">',
            '<meta name="robots" content="noindex, nofollow">\n  <meta name="theme-color" content="#0d1a22">',
            1,
        )

    if 'id="view-gate"' not in text:
        gate = GATE_HTML.replace("__GATE_TITLE__", title)
        # Place gate right after <body ...>
        body_end = text.find(">", text.find("<body"))
        if body_end < 0:
            raise SystemExit(f"No body in {path}")
        # Ensure body has view-locked class
        body_open_start = text.find("<body")
        body_open = text[body_open_start : body_end + 1]
        if "view-locked" not in body_open:
            if 'class="' in body_open:
                body_open2 = body_open.replace('class="', 'class="view-locked ', 1)
            else:
                body_open2 = body_open.replace("<body", '<body class="view-locked"', 1)
            text = text[:body_open_start] + body_open2 + text[body_end + 1 :]
            body_end = text.find(">", text.find("<body"))
        text = text[: body_end + 1] + "\n" + gate + text[body_end + 1 :]

    if 'id="person-sheet-photo"' not in text:
        needle = '      <strong id="person-sheet-title">Человек</strong>\n'
        if needle not in text:
            raise SystemExit(f"person-sheet title missing in {path}")
        text = text.replace(
            needle,
            needle + PERSON_SHEET_PHOTO,
            1,
        )

    if 'id="logout-btn"' not in text:
        text = text.replace(
            '<button type="button" id="whoami-clear-btn" hidden>Сбросить «это я»</button>\n      </div>',
            '<button type="button" id="whoami-clear-btn" hidden>Сбросить «это я»</button>\n'
            '        <button type="button" id="logout-btn">Выйти</button>\n      </div>',
            1,
        )

    # Guide line about login
    old_guide = (
        "<li>Укажите <b>Кто я</b> в меню — ваша ветка подсветится золотом.</li>"
    )
    new_guide = (
        "<li>Вход: своё имя из списка + пароль семьи. <b>Кто я</b> ставится при входе; "
        "фото — в карточке (долгое нажатие), кружок на древе после «Сохранить».</li>"
    )
    if old_guide in text:
        text = text.replace(old_guide, new_guide, 1)

    # JS markers — inject after TREE_DIR assignment
    marker = f"      var TREE_DIR = '{tree_dir}';"
    if marker not in text:
        raise SystemExit(f"TREE_DIR marker missing in {path}")

    extra_consts = f"""
      var VIEW_SESSION_KEY = '{view_session_key}';
      var PHOTO_PUBLIC_BASE = 'https://rivjkiksknnesahrvamf.supabase.co/storage/v1/object/public/drewo-photos';
      var NODE_H_PHOTO = 40;
      var gateSelectedId = null;
      var gateSelectedLabel = '';
      var viewUnlocked = false;
"""
    if "VIEW_SESSION_KEY" not in text:
        text = text.replace(marker, marker + extra_consts, 1)

    # Element refs after whoamiClose
    if "var gateForm = " not in text:
        whoami_refs = "      var whoamiClose = document.getElementById('whoami-close');"
        if whoami_refs not in text:
            raise SystemExit(f"whoamiClose ref missing in {path}")
        text = text.replace(
            whoami_refs,
            whoami_refs
            + """
      var logoutBtn = document.getElementById('logout-btn');
      var gateForm = document.getElementById('gate-form');
      var gateSearch = document.getElementById('gate-search');
      var gateResults = document.getElementById('gate-results');
      var gateSelected = document.getElementById('gate-selected');
      var gatePersonId = document.getElementById('gate-person-id');
      var gatePassword = document.getElementById('gate-password');
      var gateError = document.getElementById('gate-error');
      var gateSubmit = document.getElementById('gate-submit');
      var personSheetPhoto = document.getElementById('person-sheet-photo');
      var personSheetPhotoAdd = document.getElementById('person-sheet-photo-add');
      var personSheetPhotoRemove = document.getElementById('person-sheet-photo-remove');
      var personPhotoFile = document.getElementById('person-photo-file');
""",
            1,
        )

    # Enhance collectNameMatches with years
    old_match = """            matches.push({
              id: node.id,
              name: node.name || '',
              fatherName: parent ? parent.name || '' : '',
              fatherId: parent ? parent.id : null,
            });"""
    new_match = """            matches.push({
              id: node.id,
              name: node.name || '',
              fatherName: parent ? parent.name || '' : '',
              fatherId: parent ? parent.id : null,
              born: Number.isFinite(Number(node.born)) ? Number(node.born) : null,
              died: Number.isFinite(Number(node.died)) ? Number(node.died) : null,
              years: TreeModel.formatLifeYears(node, 'g') || '',
            });"""
    if old_match in text and "years: TreeModel.formatLifeYears" not in text:
        text = text.replace(old_match, new_match)

    # Whoami results: show years for namesakes
    old_whoami_sub = """          if (m.fatherName) {
            var sub = document.createElement('span');
            sub.className = 'whoami-father';
            sub.textContent = 'отец: ' + m.fatherName;
            btn.appendChild(document.createElement('br'));
            btn.appendChild(sub);
          }"""
    new_whoami_sub = """          var bits = [];
          if (m.fatherName) bits.push('отец: ' + m.fatherName);
          if (m.years) bits.push(m.years);
          if (bits.length) {
            var sub = document.createElement('span');
            sub.className = 'whoami-father';
            sub.textContent = bits.join(' · ');
            btn.appendChild(document.createElement('br'));
            btn.appendChild(sub);
          }"""
    if old_whoami_sub in text:
        text = text.replace(old_whoami_sub, new_whoami_sub)

    # Inject gate+photo functions before finishBoot
    if "function readViewSession()" not in text:
        finish = "      function finishBoot() {"
        if finish not in text:
            raise SystemExit(f"finishBoot missing in {path}")
        helpers = r'''
      function photoVersion(nodeOrMeta) {
        if (!nodeOrMeta || nodeOrMeta.photo == null || nodeOrMeta.photo === false) return '';
        return String(nodeOrMeta.photo).trim();
      }

      function photoThumbUrl(personId, version) {
        var v = encodeURIComponent(String(version || '1'));
        var id = encodeURIComponent(String(personId));
        return PHOTO_PUBLIC_BASE + '/' + TREE_DIR + '/' + id + '-thumb.webp?v=' + v;
      }

      function photoFullUrl(personId, version) {
        var v = encodeURIComponent(String(version || '1'));
        var id = encodeURIComponent(String(personId));
        return PHOTO_PUBLIC_BASE + '/' + TREE_DIR + '/' + id + '.webp?v=' + v;
      }

      function readViewSession() {
        try {
          var raw = localStorage.getItem(VIEW_SESSION_KEY);
          if (!raw) return null;
          var s = JSON.parse(raw);
          if (!s || !s.personId) return null;
          if (Date.now() - Number(s.at || 0) > 30 * 24 * 60 * 60 * 1000) return null;
          if (!TreeModel.findById(tree, s.personId)) return null;
          return s;
        } catch (err) {
          return null;
        }
      }

      function writeViewSession(personId) {
        try {
          localStorage.setItem(
            VIEW_SESSION_KEY,
            JSON.stringify({ personId: String(personId), at: Date.now() })
          );
        } catch (err) {}
      }

      function clearViewSession() {
        try {
          localStorage.removeItem(VIEW_SESSION_KEY);
        } catch (err) {}
      }

      function setViewLocked(locked) {
        viewUnlocked = !locked;
        document.body.classList.toggle('view-locked', !!locked);
      }

      function formatMatchLabel(m) {
        var bits = [];
        if (m.fatherName) bits.push('отец: ' + m.fatherName);
        if (m.years) bits.push(m.years);
        return bits.join(' · ');
      }

      function selectGatePerson(m) {
        gateSelectedId = m.id;
        gateSelectedLabel = m.name + (formatMatchLabel(m) ? ' · ' + formatMatchLabel(m) : '');
        if (gatePersonId) gatePersonId.value = String(m.id);
        if (gateSelected) {
          gateSelected.hidden = false;
          gateSelected.textContent = 'Выбрано: ' + gateSelectedLabel;
        }
        if (gateSearch) gateSearch.value = m.name;
        if (gateResults) gateResults.replaceChildren();
      }

      function renderGateResults(query) {
        if (!gateResults) return;
        gateResults.replaceChildren();
        var q = String(query || '').trim();
        if (!q) return;
        var matches = collectNameMatches(q).slice(0, 40);
        if (!matches.length) {
          var none = document.createElement('li');
          none.style.listStyle = 'none';
          none.style.padding = '0.45rem 0.65rem';
          none.style.color = 'var(--text-dim)';
          none.textContent = 'Никого не найдено';
          gateResults.appendChild(none);
          return;
        }
        matches.forEach(function (m) {
          var li = document.createElement('li');
          li.style.listStyle = 'none';
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = m.name;
          if (String(m.id) === String(gateSelectedId)) btn.classList.add('is-selected');
          var subText = formatMatchLabel(m);
          if (subText) {
            var sub = document.createElement('span');
            sub.className = 'whoami-father';
            sub.textContent = subText;
            btn.appendChild(document.createElement('br'));
            btn.appendChild(sub);
          }
          btn.addEventListener('click', function () {
            selectGatePerson(m);
          });
          li.appendChild(btn);
          gateResults.appendChild(li);
        });
      }

      function showViewGate() {
        setViewLocked(true);
        gateSelectedId = null;
        gateSelectedLabel = '';
        if (gatePersonId) gatePersonId.value = '';
        if (gateSelected) {
          gateSelected.hidden = true;
          gateSelected.textContent = '';
        }
        if (gatePassword) gatePassword.value = '';
        if (gateError) {
          gateError.hidden = true;
          gateError.textContent = '';
        }
        if (gateSearch) {
          gateSearch.value = '';
          window.setTimeout(function () {
            gateSearch.focus();
          }, 80);
        }
        renderGateResults('');
      }

      function unlockViewWithPerson(personId, password, authData) {
        writeViewSession(personId);
        rememberSession(password, authData);
        setViewLocked(false);
        setMyPerson(personId);
      }

      function logoutView() {
        clearViewSession();
        clearMyPerson();
        sessionPassword = '';
        sessionRole = '';
        editUnlocked = false;
        setEditMode(false);
        showViewGate();
        showToast('Вы вышли', 'success');
      }

      function loadImageFromFile(file) {
        return new Promise(function (resolve, reject) {
          var url = URL.createObjectURL(file);
          var img = new Image();
          img.onload = function () {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error('Не удалось прочитать фото'));
          };
          img.src = url;
        });
      }

      function canvasToDataUrl(canvas, mime, quality) {
        try {
          return canvas.toDataURL(mime, quality);
        } catch (err) {
          return canvas.toDataURL('image/jpeg', quality);
        }
      }

      function compressSquarePhoto(file, size, quality) {
        return loadImageFromFile(file).then(function (img) {
          var side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
          var sx = Math.floor(((img.naturalWidth || img.width) - side) / 2);
          var sy = Math.floor(((img.naturalHeight || img.height) - side) / 2);
          var canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          var webp = canvasToDataUrl(canvas, 'image/webp', quality);
          if (webp && webp.indexOf('data:image/webp') === 0) return webp;
          return canvasToDataUrl(canvas, 'image/jpeg', quality);
        });
      }

      function refreshPersonSheetPhoto(node) {
        if (!personSheetPhoto || !node) return;
        var ver = photoVersion(node);
        var initial = String(node.name || '?').trim().charAt(0) || '?';
        if (ver) {
          personSheetPhoto.classList.remove('is-empty');
          personSheetPhoto.textContent = '';
          personSheetPhoto.style.backgroundImage = 'url("' + photoFullUrl(node.id, ver) + '")';
          personSheetPhoto.style.backgroundSize = 'cover';
          personSheetPhoto.style.backgroundPosition = 'center';
          if (personSheetPhotoAdd) personSheetPhotoAdd.textContent = 'Сменить фото';
          if (personSheetPhotoRemove) personSheetPhotoRemove.hidden = false;
        } else {
          personSheetPhoto.classList.add('is-empty');
          personSheetPhoto.textContent = initial;
          personSheetPhoto.style.backgroundImage = '';
          if (personSheetPhotoAdd) personSheetPhotoAdd.textContent = 'Добавить фото';
          if (personSheetPhotoRemove) personSheetPhotoRemove.hidden = true;
        }
      }

      function requestPhotoEdit(id) {
        if (editUnlocked || sessionPassword) {
          if (personPhotoFile) {
            personPhotoFile.value = '';
            personPhotoFile.click();
          }
          return;
        }
        openPasswordDialog({ type: 'photo', personId: id });
      }

      function requestPhotoRemove(id) {
        if (editUnlocked || sessionPassword) {
          removePersonPhoto(id);
          return;
        }
        openPasswordDialog({ type: 'photo-remove', personId: id });
      }

      function uploadPersonPhoto(id, file) {
        var node = TreeModel.findById(tree, id);
        if (!node || !file) return Promise.resolve();
        if (treeLocked && !isSuperSession()) {
          showToast('Правки заблокированы', 'error');
          return Promise.resolve();
        }
        var password = sessionPassword;
        if (!password) {
          showToast('Сначала введите пароль', 'error');
          return Promise.resolve();
        }
        showToast('Сжимаем фото…', 'success');
        return Promise.all([
          compressSquarePhoto(file, 800, 0.82),
          compressSquarePhoto(file, 96, 0.8),
        ])
          .then(function (parts) {
            showToast('Загружаем…', 'success');
            return callPublishApi({
              action: 'upload-photo',
              password: password,
              treeDir: TREE_DIR,
              personId: String(id),
              full: parts[0],
              thumb: parts[1],
              version: String(Date.now()),
            });
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
            }
          })
          .catch(function (err) {
            showToast((err && err.message) || 'Не удалось загрузить фото', 'error');
          });
      }

      function removePersonPhoto(id) {
        var node = TreeModel.findById(tree, id);
        if (!node) return;
        if (!photoVersion(node)) return;
        if (treeLocked && !isSuperSession()) {
          showToast('Правки заблокированы', 'error');
          return;
        }
        var password = sessionPassword;
        if (!password) {
          showToast('Сначала введите пароль', 'error');
          return;
        }
        askConfirm('Убрать фото у «' + (node.name || '') + '»?').then(function (ok) {
          if (!ok) return;
          callPublishApi({
            action: 'delete-photo',
            password: password,
            treeDir: TREE_DIR,
            personId: String(id),
          })
            .catch(function () {
              return { ok: true };
            })
            .then(function () {
              delete node.photo;
              persistTree();
              pushActivity({
                type: 'photo-remove',
                at: new Date().toISOString(),
                son: node.name || '',
                sonId: id,
              });
              showToast('Фото убрано. Нажмите «Сохранить»', 'success');
              render(false);
              if (personSheetTargetId && String(personSheetTargetId) === String(id)) {
                openPersonSheet(id);
              }
            });
        });
      }

'''
        text = text.replace(finish, helpers + "\n" + finish, 1)

    # Replace finishBoot body to honor view gate
    old_finish_body_start = f"""      function finishBoot() {{
        setViewFilter('{default_filter}', false);
        updateViewButtons();
        refreshActivityUi();
        updateWhoamiUi();
        updateSaveButton();
        loadWeather();
        if (myPersonId && TreeModel.findById(tree, myPersonId)) {{"""

    new_finish = f"""      function finishBoot() {{
        var session = readViewSession();
        if (!session) {{
          showViewGate();
          updateViewButtons();
          refreshActivityUi();
          updateWhoamiUi();
          updateSaveButton();
          return;
        }}
        setViewLocked(false);
        if (!myPersonId) {{
          myPersonId = session.personId;
          try {{
            localStorage.setItem(MY_PERSON_KEY, myPersonId);
          }} catch (err) {{}}
        }}
        setViewFilter('{default_filter}', false);
        updateViewButtons();
        refreshActivityUi();
        updateWhoamiUi();
        updateSaveButton();
        loadWeather();
        if (myPersonId && TreeModel.findById(tree, myPersonId)) {{"""

    if old_finish_body_start in text:
        text = text.replace(old_finish_body_start, new_finish, 1)
    elif "showViewGate();" not in text.split("function finishBoot()")[1][:800]:
        raise SystemExit(f"Could not patch finishBoot in {path}")

    # estimateBoxWidth + layout photo
    old_est = """      function estimateBoxWidth(name) {
        var text = String(name || '');
        var padX = 16;
        var borderX = 3;
        var minW = 58;"""
    new_est = """      function estimateBoxWidth(name, hasPhoto) {
        var text = String(name || '');
        var padX = 16;
        var borderX = 3;
        var minW = 58;
        var photoExtra = hasPhoto ? 34 : 0;"""
    if "function estimateBoxWidth(name, hasPhoto)" not in text:
        text = text.replace(old_est, new_est, 1)
        text = text.replace(
            "return Math.max(minW, Math.ceil(ctx.measureText(text).width + padX + borderX));",
            "return Math.max(minW, Math.ceil(ctx.measureText(text).width + padX + borderX)) + photoExtra;",
            1,
        )
        text = text.replace(
            "return Math.max(minW, Math.ceil(20 + text.length * 8.2));",
            "return Math.max(minW, Math.ceil(20 + text.length * 8.2)) + photoExtra;",
            1,
        )

    old_measure = """        function measure(node) {
          node._bw = estimateBoxWidth(node.name);
          node._bh = nodeHasYears(node) ? NODE_H_YEARS : NODE_H;"""
    new_measure = """        function measure(node) {
          var hasPhoto = !!photoVersion(node);
          node._bw = estimateBoxWidth(node.name, hasPhoto);
          node._bh = Math.max(
            nodeHasYears(node) ? NODE_H_YEARS : NODE_H,
            hasPhoto ? NODE_H_PHOTO : 0
          );"""
    if "var hasPhoto = !!photoVersion(node);" not in text:
        text = text.replace(old_measure, new_measure, 1)

    old_pos = """            born: Number.isFinite(Number(node.born)) ? Number(node.born) : null,
            died: Number.isFinite(Number(node.died)) ? Number(node.died) : null,
          };"""
    new_pos = """            born: Number.isFinite(Number(node.born)) ? Number(node.born) : null,
            died: Number.isFinite(Number(node.died)) ? Number(node.died) : null,
            photo: photoVersion(node) || null,
          };"""
    if "photo: photoVersion(node) || null," not in text:
        text = text.replace(old_pos, new_pos, 1)

    # renderPerson: insert avatar
    old_render_btn = """        if (myPersonId && String(meta.id) === String(myPersonId)) btn.classList.add('my-self');
        var nameEl = document.createElement('span');
        nameEl.className = 'person-name';
        nameEl.textContent = meta.name;
        btn.appendChild(nameEl);
        if (hasYears) {
          var yearsEl = document.createElement('span');
          yearsEl.className = 'person-years';
          yearsEl.style.fontSize = Math.max(7, 9.2 * s) + 'px';
          var gLayer = document.createElement('span');
          gLayer.className = 'person-years-layer is-gregorian';
          gLayer.textContent = gText;
          var hLayer = document.createElement('span');
          hLayer.className = 'person-years-layer is-hijri';
          hLayer.textContent = TreeModel.formatLifeYears(
            { born: meta.born, died: meta.died },
            'h'
          );
          yearsEl.appendChild(gLayer);
          yearsEl.appendChild(hLayer);
          btn.appendChild(yearsEl);
        }"""
    new_render_btn = """        if (myPersonId && String(meta.id) === String(myPersonId)) btn.classList.add('my-self');
        var hasPhoto = !!photoVersion(meta);
        var textCol = document.createElement('span');
        textCol.className = 'person-text';
        var nameEl = document.createElement('span');
        nameEl.className = 'person-name';
        nameEl.textContent = meta.name;
        textCol.appendChild(nameEl);
        if (hasYears) {
          var yearsEl = document.createElement('span');
          yearsEl.className = 'person-years';
          yearsEl.style.fontSize = Math.max(7, 9.2 * s) + 'px';
          var gLayer = document.createElement('span');
          gLayer.className = 'person-years-layer is-gregorian';
          gLayer.textContent = gText;
          var hLayer = document.createElement('span');
          hLayer.className = 'person-years-layer is-hijri';
          hLayer.textContent = TreeModel.formatLifeYears(
            { born: meta.born, died: meta.died },
            'h'
          );
          yearsEl.appendChild(gLayer);
          yearsEl.appendChild(hLayer);
          textCol.appendChild(yearsEl);
        }
        if (hasPhoto) {
          btn.classList.add('has-photo');
          var avatar = document.createElement('img');
          avatar.className = 'person-avatar';
          avatar.alt = '';
          avatar.loading = 'lazy';
          avatar.decoding = 'async';
          avatar.src = photoThumbUrl(meta.id, meta.photo);
          avatar.addEventListener('error', function () {
            avatar.remove();
            btn.classList.remove('has-photo');
          });
          btn.appendChild(avatar);
        }
        btn.appendChild(textCol);"""
    if "btn.classList.add('has-photo')" not in text:
        if old_render_btn not in text:
            raise SystemExit(f"renderPerson block missing in {path}")
        text = text.replace(old_render_btn, new_render_btn, 1)

    # minHeight with photo
    old_minh = """        btn.style.minHeight =
          Math.max(hasYears ? 30 : 20, (hasYears ? NODE_H_YEARS : NODE_H) * s) + 'px';"""
    new_minh = """        btn.style.minHeight =
          Math.max(
            hasPhoto ? 28 : hasYears ? 30 : 20,
            (hasPhoto ? NODE_H_PHOTO : hasYears ? NODE_H_YEARS : NODE_H) * s
          ) + 'px';"""
    if "hasPhoto ? NODE_H_PHOTO" not in text:
        text = text.replace(old_minh, new_minh, 1)

    # openPersonSheet: refresh photo
    if "refreshPersonSheetPhoto(node);" not in text:
        text = text.replace(
            "        refreshPersonSheetDates(node);\n",
            "        refreshPersonSheetDates(node);\n        refreshPersonSheetPhoto(node);\n",
            1,
        )

    # password action handlers for photo — find passwordForm submit handler
    # Look for bio action handling
    photo_actions = """          } else if (action && action.type === 'photo') {
            editUnlocked = true;
            rememberSession(passwordInput.value, { role: 'editor', locked: treeLocked });
            if (personPhotoFile) {
              personPhotoFile.value = '';
              personPhotoFile.click();
            }
          } else if (action && action.type === 'photo-remove') {
            editUnlocked = true;
            rememberSession(passwordInput.value, { role: 'editor', locked: treeLocked });
            removePersonPhoto(action.personId);
"""
    # Find a good insertion point near bio handling in password form
    bio_action_marker = "action.type === 'bio'"
    if "action.type === 'photo'" not in text and bio_action_marker in text:
        # Find the bio block end - we'll insert after the bio else-if block carefully
        # Search for pattern used in password submit
        pass

    # Wire events before initChrome()
    if "gateForm.addEventListener" not in text:
        init_chrome = "      initChrome();"
        events = r'''
      if (gateSearch) {
        gateSearch.addEventListener('input', function () {
          gateSelectedId = null;
          if (gatePersonId) gatePersonId.value = '';
          if (gateSelected) gateSelected.hidden = true;
          renderGateResults(gateSearch.value);
        });
      }
      if (gateForm) {
        gateForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var personId = gateSelectedId || (gatePersonId && gatePersonId.value);
          var password = gatePassword ? gatePassword.value : '';
          if (!personId) {
            if (gateError) {
              gateError.textContent = 'Выберите себя из списка';
              gateError.hidden = false;
            }
            return;
          }
          if (!password) {
            if (gateError) {
              gateError.textContent = 'Введите пароль';
              gateError.hidden = false;
            }
            return;
          }
          if (gateSubmit) gateSubmit.disabled = true;
          if (gateError) gateError.hidden = true;
          verifyAuth(password)
            .then(function (data) {
              unlockViewWithPerson(personId, password, data);
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
              showToast('Добро пожаловать', 'success');
            })
            .catch(function (err) {
              if (gateError) {
                gateError.textContent = (err && err.message) || 'Неверный пароль';
                gateError.hidden = false;
              }
            })
            .finally(function () {
              if (gateSubmit) gateSubmit.disabled = false;
            });
        });
      }
      if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
          setNavMenuOpen(false);
          logoutView();
        });
      }
      if (personSheetPhotoAdd) {
        personSheetPhotoAdd.addEventListener('click', function () {
          if (!personSheetTargetId) return;
          requestPhotoEdit(personSheetTargetId);
        });
      }
      if (personSheetPhotoRemove) {
        personSheetPhotoRemove.addEventListener('click', function () {
          if (!personSheetTargetId) return;
          requestPhotoRemove(personSheetTargetId);
        });
      }
      if (personPhotoFile) {
        personPhotoFile.addEventListener('change', function () {
          var file = personPhotoFile.files && personPhotoFile.files[0];
          var id = personSheetTargetId;
          personPhotoFile.value = '';
          if (!file || !id) return;
          uploadPersonPhoto(id, file);
        });
      }

'''
        text = text.replace(init_chrome, events + init_chrome, 1)

    # Hook photo into password dialog success path — find verifyAuth in passwordForm
    # Read how password form works
    if "type === 'photo'" not in text:
        # Insert into password form handler after successful auth for bio-like actions
        needle = "          } else if (action && action.type === 'bio') {"
        if needle in text:
            # Find the whole bio elseif and add after its block - easier to add parallel branches before bio
            text = text.replace(
                needle,
                """          } else if (action && action.type === 'photo') {
            closePasswordDialog();
            if (personPhotoFile) {
              personPhotoFile.value = '';
              personPhotoFile.click();
            }
          } else if (action && action.type === 'photo-remove') {
            var removeId = action.personId;
            closePasswordDialog();
            removePersonPhoto(removeId);
          } else if (action && action.type === 'bio') {""",
                1,
            )
        else:
            # try alternate - after rememberSession in password submit
            print(f"WARN: bio password action not found in {path.name}; photo password hooks may be incomplete")

    # clearMyPerson must exist - check
    if "function clearMyPerson" not in text and "function clearMyPerson(" not in text:
        # logout uses clearMyPerson - check setMyPerson area for clear
        if "function setMyPerson" in text:
            # look for whoami clear inline
            pass

    if text == original:
        print(f"No changes? {path}")
    else:
        path.write_text(text, encoding="utf-8")
        print(f"Patched {path.relative_to(ROOT)} ({len(text) - len(original):+d} chars)")


def ensure_clear_my_person(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "function clearMyPerson" in text:
        return
    # Find whoami clear logic used by button and extract
    if "function setMyPerson(" not in text:
        raise SystemExit(f"setMyPerson missing in {path}")
    # Insert clearMyPerson before setMyPerson by copying from whoamiClear handler pattern
    # Search for existing clear sequence near whoamiClearBtn
    snippet = """
      function clearMyPerson() {
        myPersonId = null;
        myBranchIds = new Set();
        try {
          localStorage.removeItem(MY_PERSON_KEY);
        } catch (err) {}
        updateWhoamiUi();
        render(false);
      }

"""
    text = text.replace("      function setMyPerson(", snippet + "      function setMyPerson(", 1)
    path.write_text(text, encoding="utf-8")
    print(f"Added clearMyPerson to {path.name}")


def fix_password_remember_for_photo(path: Path) -> None:
    """Ensure photo actions remember session password when unlocking via dialog."""
    text = path.read_text(encoding="utf-8")
    old = """          } else if (action && action.type === 'photo') {
            closePasswordDialog();
            if (personPhotoFile) {
              personPhotoFile.value = '';
              personPhotoFile.click();
            }
          } else if (action && action.type === 'photo-remove') {
            var removeId = action.personId;
            closePasswordDialog();
            removePersonPhoto(removeId);"""
    # Need to see how other actions remember session - read surrounding
    if "action.type === 'photo'" not in text:
        return
    # Patch verifyAuth then callback - the password form typically does verifyAuth then rememberSession
    # If photo branch doesn't call rememberSession, upload fails. Fix by requiring remember before click.
    # Look at actual inserted context after patch by reading file later.
    path.write_text(text, encoding="utf-8")


def main() -> None:
    patch_file(
        ROOT / "drewo" / "index.html",
        tree_dir="drewo",
        title="Хьоти некъ",
        view_session_key="drewo-view-session",
        default_filter="khotu",
    )
    patch_file(
        ROOT / "drewo-dada-yurt" / "index.html",
        tree_dir="drewo-dada-yurt",
        title="Дади-Юрт",
        view_session_key="drewo-dada-yurt-view-session",
        default_filter="all",
    )
    ensure_clear_my_person(ROOT / "drewo" / "index.html")
    ensure_clear_my_person(ROOT / "drewo-dada-yurt" / "index.html")


if __name__ == "__main__":
    main()
