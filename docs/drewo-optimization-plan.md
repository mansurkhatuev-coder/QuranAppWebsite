# План оптимизации древ (VPN, Cloudflare, скорость)

Страницы: `/drewo/` (Хьоти некъ), `/drewo-dada-yurt/` (Дади-Юрт), `/drewo-reklama/` (демо), пульт `/trees/`.

Цель: **одна и та же страница работает и без VPN из РФ, и с VPN**. Авторизация, фото и открытие не должны зависеть от Cloudflare.

---

## 1. Главный виновник — Cloudflare на Supabase, не сам сайт

Проверено 17.08.2026 по DNS и заголовкам живого `https://waydean.ru`:

| Хост | Кто отвечает | Cloudflare? |
|---|---|---|
| `waydean.ru` / `/drewo/` | GitHub Pages + Fastly (`server: GitHub.com`, `x-fastly-request-id`) | **Нет.** DNS на `ns1.reg.ru`, A-записи `185.199.x.x` (GitHub) |
| `*.supabase.co` (вход, сохранение, онлайн) | Edge Function | **Да:** `server: cloudflare`, `cf-ray`, cookie `__cf_bm` |
| фото `.../storage/v1/object/public/drewo-photos/` | Supabase Storage | **Да:** те же `cf-ray` + `__cf_bm` |
| `quranapp-qf.*.workers.dev` | Cloudflare Worker (Коран API, не древа) | Да, но к древам не относится |
| Cloudflare Pages для сайта | workflow выключен (`if: false`) | Сейчас не в пути |

То есть HTML древ идёт мимо Cloudflare, а **всё «живое» — через него**, потому что Supabase стоит за Cloudflare.

Это совпадает с жалобами:

- **Без VPN:** страница открывается (GitHub/Fastly в РФ часто жив), вход и фото нет — в РФ режут/тормозят **IP Cloudflare**. Браузер не доходит до `publish-drewo` и Storage.
- **С VPN:** Cloudflare Bot Management (`__cf_bm`) не любит датацентровые VPN. Вместо JSON прилетает challenge «Just a moment…» / 403, `fetch` не умеет его пройти. Плюс HTTP/3 (`alt-svc: h3`) до Cloudflare с VPN часто зависает — кажется, что «сайт не открылся», хотя это зависла проверка пароля или загрузка кружков на гейте.

В коде вход уже намекает на это: *«Если зависло — попробуйте VPN»* и ловит слово `cloudflare` в ошибке. Это обход, не лечение.

**Вывод:** тащить `waydean.ru` под «оранжевое облако» Cloudflare **нельзя** — это повторит ту же поломку уже на самом открытии HTML. Прокси на Cloudflare Worker (`qf-proxy` как образец) для древ тоже не подходит: телефон снова будет ходить на Cloudflare.

---

## 2. Что ещё мешает, но вторично

1. **`callPublishApi` без таймаута.** Пока Cloudflare/Supabase молчит, кнопка «Проверяем…» и экран «Загружаем древо…» висят. С VPN это выглядит как «не открывается».
2. **Лимит 5 паролей с одного IP.** На VPN один выход на всех; плюс Cloudflare может подставлять свой IP.
3. **Тяжёлый HTML** 340–380 КБ × три почти одинаковых файла + несколько фонов.
4. **Шрифты Google** — отдельная блокировка, не Cloudflare; `document.fonts.ready` откладывает перерисовку.
5. **Публикация через GitHub API** и кэш Pages ~10 мин.

---

## 3. Принцип решения

Браузер говорит **только с origin без Cloudflare**.

```
телефон  →  https://waydean.ru/drewo/     GitHub Pages / российский хостинг (не CF)
         →  https://waydean.ru/api/drewo  nginx/PHP на Beget|VPS → supabase.co (CF видит только сервер)
         →  https://waydean.ru/photos/    тот же хостинг или файлы рядом со статикой
```

Cloudflare остаётся у Supabase на бэкенде — это нормально. Телефон его больше не трогает. Worker’ы и оранжевое облако на `waydean.ru` не используем.

---

## 4. Этапы

### Этап A — Убрать Cloudflare с пути телефона (главное)

**A1. Прокси API на хостинге без Cloudflare.**  
Лучше всего тот же домен, путь `POST /api/drewo`:

- Beget / Timeweb / любой VPS в РФ или EU **без** прокси Cloudflare
- nginx `proxy_pass` на `https://rivjkiksknnesahrvamf.supabase.co/functions/v1/publish-drewo`
- таймаут 12–15 с, при обрыве — JSON `{ error: "…" }`, не HTML challenge
- пробрасывать реальный IP клиента (`X-Forwarded-For`), чтобы лимит пароля не схлопывался в один IP сервера

DNS: либо поддомен `api.waydean.ru` A-записью на этот хостинг (серые NS reg.ru, **без** CF), либо весь `waydean.ru` переезжает на этот хостинг (GitHub Pages остаётся зеркалом).

В трёх древах и пульте:

```js
var PUBLISH_URL = '/api/drewo';  // same-origin, не supabase.co
```

**A2. Фото с того же origin, не с `supabase.co`.**  
Варианты по простоте:

1. Прокси `GET /photos/<treeDir>/<file>` на том же nginx → Storage (телефон не видит CF).
2. При `upload-photo` дополнительно класть файл на этот хостинг / в репозиторий Pages — тогда кружки грузятся как обычная статика GitHub/Fastly, как сам HTML.

Для РФ надёжнее (2) или хотя бы кэш на диске прокси после первой загрузки.

В клиенте: `PHOTO_PUBLIC_BASE = '/photos'` (или относительный путь к статике).

**A3. Не включать Cloudflare Pages и не вешать оранжевое облако на `waydean.ru`.**  
Workflow `.github/workflows/deploy-cloudflare-pages.yml` оставить выключенным. `qf-proxy` не трогать — он для Корана, не для древ.

**A4. Свои шрифты**, без `fonts.googleapis.com`. У `/trees/` убрать `cdn.jsdelivr.net`.

Проверка (МТС/Мегафон без VPN **и** с Outline/v2ray):

- [ ] открывается `/drewo/`
- [ ] вход
- [ ] старые фото видны
- [ ] новое фото
- [ ] «Сохранить»
- [ ] в DevTools нет запросов на `supabase.co` и нет `cf-ray` / `__cf_bm`

---

### Этап B — Не зависать, пока прокси ещё нет

Можно делать сразу в клиенте, даже до Beget:

1. Таймаут 12 с на `callPublishApi` (AbortController). Сейчас таймаут только у погоды.
2. Если API недоступен — не держать гейт вечно: понятный текст «сервер входа недоступен», без совета жонглировать VPN как единственным способом.
3. Сессия в `localStorage` уже есть: повторный заход показывает дерево из `family-tree.json` / встроенного JSON, даже если фото не приехали.
4. Лимит пароля не по IP VPN/Cloudflare: ключ в таблице по дереву + session, не `cf-connecting-ip`.
5. Рендер не ждать `document.fonts.ready`.
6. `record-visit` не коммитить в GitHub на каждый визит.

---

### Этап C — Скорость

1. Общий `drewo.css` + `drewo.js` вместо трёх `index.html` по 9–11 тыс. строк.
2. Источник данных — `family-tree.json`, убрать дубль `<script id="tree-data">` из HTML.
3. Один дневной и один ночной фон, WebP, preload только текущего.
4. На древе только `*-thumb.jpg`, полный кадр — в лайтбоксе.

---

### Этап D — Сопровождение

Один движок на три древа, пульт `/trees/` тоже через `/api/drewo`, бэкапы только JSON (не HTML-снимки приложения).

---

## 5. Что не делать

- Не ставить Cloudflare перед `waydean.ru` «чтобы обойти блокировки GitHub» — для древ это основной источник поломки входа/фото и зависаний с VPN.
- Не проксировать древа через Cloudflare Worker / Pages / R2.
- Не звать `supabase.co` с телефона параллельно с прокси «на всякий случай».
- Не класть все оригиналы фото в git без сжатия; thumb + хостинг/кэш достаточно.

---

## 6. Порядок работ

1. Таймаут `fetch` + ошибка без вечного спиннера (этап B) — сразу меньше «зависло с VPN».
2. Nginx/Beget: `/api/drewo` и `/photos`, смена URL в клиенте (этап A). Это убирает Cloudflare с телефона.
3. Свои шрифты, убрать jsdelivr.
4. Визиты без GitHub-коммита.
5. Вынести CSS/JS, JSON из HTML (этап C).

Критерий: без VPN и с VPN одни и те же шаги — открыть, войти, увидеть фото, сохранить; в сети телефона нет `supabase.co`.
