# Академия: live-уроки для медресе — план

Цель: учитель запускает урок, ученики заходят по QR/коду/ссылке (сайт или позже приложение), отвечают вживую, учитель видит прогресс и отчёт.

Стратегия: **сначала сайт (waydean.ru) + Supabase**, потом те же данные/API в Expo-приложение. Новых SaaS не подключаем.

Уже есть в экосистеме: Академия в приложении (курсы/уроки/аналитика), админка на Supabase Auth, отзывы и розыгрыш Академии. Live-уроки — **новый контур** рядом, не замена курсов таджвида.

Закладываем сразу (даже если MVP узкий):

1. **Расширяемые типы вопросов/ответов** — новые типы добавляются без ломки старых сессий.
2. **Много учителей и параллельных сессий** — не модель «один ведущий на весь продукт».
3. **Устойчивая session** — F5 / обрыв сети / вкладка убита → человек возвращается туда же, не «вылетает на join».

---

## 1. Что взять у популярных решений

| Откуда | Что берём | Зачем нам |
|---|---|---|
| **Kahoot** | PIN + QR, lobby «ждём всех», teacher-paced live, экран учителя на доске, отчёт после сессии, rejoin по тому же PIN | Класс медресе: ведущий + много телефонов |
| **Quizizz / Wayground** | Вопросы на телефоне ученика, опциональный рейтинг, self-paced / «домашка» позже | WhatsApp-группа без общей доски |
| **Microsoft Forms** | Ссылка + QR, авто- и ручная проверка, разбор по вопросам | Простой вход и серьёзный разбор ошибок |
| **Не берём** | Мемы/power-ups, публичный маркетплейс квизов, обязательный рейтинг | В медресе важнее знание, чем шоу |

Дифференциация: три режима сессии — **Обучение** (сразу правильный ответ + пояснение), **Викторина** (рейтинг опционален), **Контроль** (без подсказок, отчёт учителю).

---

## 2. Продукт MVP (сайт)

### Роли и масштаб людей

Не «один учитель в системе», а:

| Роль | Кто | Права |
|---|---|---|
| **platform_admin** | вы / админка waydean | глобальные настройки, блокировки |
| **org_admin** | завуч / директор медресе (позже) | учителя и классы своей org |
| **teacher** | учитель | свои уроки + сессии; co-teacher на чужих |
| **co_host** | второй учитель на конкретной сессии | вести live (Далее / Завершить), без права удалить урок |
| **student (guest)** | ученик | join по коду, имя, ответы |
| **student (account)** | позже | история, классы |

MVP: `teacher` + `student(guest)` + простой `platform_admin` allowlist.  
Схема сразу: `org_id`, `lesson_teachers`, `session_hosts` — чтобы потом не мигрировать «с нуля».

Параллельность с дня 1:

- У учителя A и учителя B могут идти **две live-сессии одновременно**.
- Коды сессий уникальны среди активных (`lobby` / `live`).
- Один учитель может иметь несколько черновиков уроков; **активный host** — обычно одна live-сессия (мягкий лимит), не жёсткий запрет на уровне продукта навсегда.

### Экраны учителя (web, desktop/планшет)

1. Мои уроки / избранные / создать / (позже) общие уроки org.
2. Редактор: название, предмет, уровень, список вопросов.
3. Запуск: настройки → код + QR + ссылка → lobby → ведение → итог.
4. «Продолжить сессию» если вкладка закрылась.
5. Результаты: сводка, сложные вопросы, карточка ученика.

### Экраны ученика (web, **mobile-first**)

1. `/join` или `/join/{code}`.
2. Имя → lobby.
3. Вопрос → ответ → «ответил» / feedback по режиму.
4. Финал: свой итог.
5. После F5 — **возврат в ту же точку сессии** (см. §8).

### Типы вопросов: MVP vs реестр на будущее

В UI на старте включаем мало. В архитектуре — **реестр типов**, не `if type === 'single'` по всему коду.

| `question_type` | Форма ответа (`answer_shape`) | Проверка | В MVP UI |
|---|---|---|---|
| `single_choice` | `{ option_id }` | auto | да |
| `true_false` | `{ value: bool }` | auto | да |
| `short_text` | `{ text }` | auto (normalize) | да |
| `multi_choice` | `{ option_ids[] }` | auto | сразу после пилота |
| `free_text` | `{ text }` | manual | сразу после пилота |
| `order` | `{ ordered_ids[] }` | auto | позже |
| `match` | `{ pairs: [[a,b],…] }` | auto | позже |
| `image_choice` | `{ option_id }` | auto | позже |
| `audio_prompt` + любой ответ | зависит | зависит | позже |

Правило масштабирования типов: **новый тип = новый scorer + редактор + renderer**, без миграции старых answers. Неизвестный тип на старом клиенте → «обновите страницу / тип пока не поддерживается», сессия не падает.

### Настройки запуска

- Режим: обучение / викторина / контроль.
- Таймер на вопрос: выкл / N секунд.
- Рейтинг: вкл / выкл.
- Перемешать вопросы / варианты.
- Показывать правильный ответ: да / нет / только в обучении.
- Разрешить поздний join после старта: да / нет.

### Вход (Kahoot + Forms)

```text
QR  →  waydean.ru/join/482719
Ссылка (WhatsApp)  →  тот же URL
PIN вручную  →  waydean.ru/join + код
```

На доске: крупный код, QR, «в лобби: N», «Начать».

---

## 3. Потоки

### Live (teacher-paced) — основной MVP

```text
Учитель: урок → Запустить → настройки → lobby (код/QR)
Ученики: join → имя → lobby
Учитель: Начать
Для каждого вопроса:
  сервер: phase=answering, current_index=k
  ученики отвечают
  учитель видит answered_count / total
  Далее или таймер → phase=reveal (опц.) → следующий
Учитель: Завершить → results
```

### Self-paced — фаза позже

То же ядро, `pacing = async`. Поле в схеме сразу, продукт — нет.

---

## 4. Архитектура

```text
                    Supabase
        ┌─────────────────────────────┐
        │ Postgres + RLS              │
        │ Auth (teachers / org)       │
        │ Realtime (session state)    │
        │ Storage (media)             │
        │ Edge Functions (мутации)    │
        └─────────────┬───────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
  Teacher Web    Student Web    Expo App
  /academy/      /join/         фаза позже
```

Правила:

- Клиент **не** считает правильность и **не** двигает `current_index`.
- Realtime = подписка на уже записанное состояние.
- Любая мутация сессии — Edge Function / RPC, идемпотентная где нужно.

### Почему не новый backend

Postgres + Auth + Realtime + Functions уже есть. QR локально.

### РФ / Cloudflare

Статика с waydean.ru; API в Supabase — тот же класс риска, что админка/древа. Прокси — отдельный план, не блокирует MVP.

---

## 5. Расширяемая модель вопросов (важно для будущего)

### Принцип

Хранить **тип + JSON payload**, а не плоские колонки «под каждый тип».

```text
academy_questions
  id
  lesson_id
  type              -- 'single_choice' | 'short_text' | ...
  prompt            -- текст / богатый контент ref
  prompt_media      -- jsonb nullable { kind, url }
  payload           -- jsonb: структура зависит от type
  scoring           -- jsonb: { method, points, accept, normalize… }
  position
  version

academy_answers
  … 
  answer_payload    -- jsonb по answer_shape типа
  is_correct        -- nullable (manual ещё не оценён)
  score             -- numeric
  scored_by         -- 'auto' | teacher_id
```

Примеры `payload`:

```json
// single_choice
{ "options": [{ "id": "a", "label": "4" }, { "id": "b", "label": "3" }], "correct_option_id": "a" }

// short_text
{ "accepted": ["4", "четыре"], "normalize": ["trim", "lower", "yo_to_e"] }

// free_text
{ "rubric_hint": "Кратко: условие и доказательство" }
```

В **session snapshot** копируется весь вопрос (type + payload + scoring) как на момент старта. Правки шаблона урока mid-flight сессию не меняют.

### Реестр на клиенте и сервере

```text
QuestionTypeRegistry[type] = {
  validatePayload(payload)
  score(payload, answer) -> { is_correct, score } | { pending: true }
  TeacherEditor
  StudentRenderer
  ResultsRenderer
}
```

Серверный scorer — source of truth. Клиентский registry только UI. Новый тип в проде: задеплоили function + подключили renderer; старые сессии со старым snapshot продолжают жить.

`academy_question_options` как отдельная таблица — **опционально** для удобства SQL-отчётов; для гибкости можно держать options внутри `payload` в MVP и нормализовать позже. Решение по умолчанию: **options в payload** на старте (меньше join’ов), отчёты через jsonb.

---

## 6. Модель данных (масштаб + сессии)

```text
academy_orgs
academy_org_members       -- org_id, user_id, role (org_admin|teacher)

academy_teachers          -- user_id, display_name, org_id nullable
academy_lessons           -- owner_id, org_id nullable, title, subject, level, meta
academy_lesson_teachers   -- lesson_id, user_id, role (owner|editor|viewer)

academy_questions         -- type, prompt, payload, scoring, position, version

academy_sessions
  id
  org_id nullable
  lesson_id
  host_user_id            -- кто создал
  code                    -- PIN
  status                  -- lobby | live | paused | finished | abandoned
  phase                   -- lobby | answering | reveal | results
  pacing                  -- live | async
  settings jsonb
  current_index int
  question_snapshot jsonb -- полный массив вопросов на старт
  version int             -- optimistic concurrency для control
  started_at, finished_at
  last_activity_at

academy_session_hosts     -- session_id, user_id (co-host)

academy_participants
  id
  session_id
  display_name
  user_id nullable
  resume_token_hash       -- для восстановления после F5
  client_fingerprint nullable  -- доп. якорь, не единственный
  joined_at, last_seen_at
  status                  -- active | left | kicked

academy_answers
  session_id, participant_id, question_id (snapshot id / index)
  answer_payload jsonb
  is_correct, score, scored_at, scored_by
  UNIQUE (participant_id, question_index)
```

Инварианты:

- Активный `code` уникален среди `status in (lobby, live, paused)`.
- Итоги считаются из `answers`, не из одного cached score.
- RLS: учитель/hosts — свои org/сессии; участник — только по resume/participant token; `correct_*` не в клиент до reveal/конца контроля.
- `version` на session: `control` шлёт `expected_version`, при конфликте — 409 + актуальный state (два co-host не ломают индекс вопроса).

---

## 7. Edge Functions

| Функция | Зачем |
|---|---|
| `academy-session-create` | Сессия + code + **question_snapshot** + settings |
| `academy-session-join` | Имя → participant + **resume_token** |
| `academy-session-resume` | token/code → полный state для клиента |
| `academy-session-control` | start / next / reveal / pause / finish / abandon |
| `academy-answer-submit` | принять + score через registry |
| `academy-session-heartbeat` | last_seen (учитель и ученик) |
| `academy-session-results` | сводка / личный итог |
| `academy-session-add-host` | co-host (после MVP ok) |

Идемпотентность: submit по `(participant_id, question_index)`; повторный submit того же ответа → 200 same; другой ответ после score → 409.

---

## 8. Устойчивая session (чтобы не вылетало / не зависало / F5 не сбрасывал)

Это не «фича на потом», а **обязательный слой MVP**. Паттерн как у Kahoot rejoin + обычный resume token SPA.

### 8.1. Источник истины

Состояние урока **только в Postgres** (`academy_sessions` + answers).  
Клиент после любого сбоя делает `resume`, не восстанавливает «из памяти React».

### 8.2. Resume ученика

При join сервер выдаёт `resume_token` (случайный, храним hash).

Клиент кладёт в `localStorage`:

```text
academy_join:{code} = { participant_id, resume_token, saved_at }
```

При открытии `/join/{code}` или F5:

1. Есть сохранённый token → `academy-session-resume`.
2. Ок → сразу lobby / текущий вопрос / results — **без повторного ввода имени**.
3. Token невалиден → мягко «войдите снова», не белый экран.

Дополнительно URL может нести короткий `?p=` только как hint; секретом остаётся token в storage.

### 8.3. Resume учителя

Учитель авторизован. F5 на host:

1. `GET` активной сессии по `host_user_id` / `session_id` в URL (`/academy/session/{id}`).
2. Подписка Realtime заново.
3. UI по `status + phase + current_index`.
4. Кнопка «Продолжить» на списке уроков, если есть `live|lobby|paused`.

Маршрут host **всегда** с `session_id` в URL — чтобы обновление страницы не уводило на «создать урок».

### 8.4. Машина состояний (не зависнуть)

```text
lobby → live/answering ⇄ reveal → answering → … → results
              ↓
           paused → answering
              ↓
           abandoned / finished
```

- Каждая control-команда: проверка перехода + `version`.
- Неизвестная команда / устаревшая version → понятная ошибка, UI подтягивает state.
- Таймер вопроса: **серверный deadline** (`phase_ends_at`), не только `setTimeout` в браузере. Клиент отображает; истечение подтверждает control/cron или следующий next учителя. Так вкладка в фоне не «ломает» урок.

### 8.5. Сеть и «не крутить вечно»

| Ситуация | Поведение |
|---|---|
| Submit при 3G/обрыве | retry с backoff, кнопка «Отправить ещё раз», статус «не дошло» |
| Realtime отвалился | banner «нет живого канала», polling `resume` каждые N с как fallback |
| Edge function > X с | abort + «повторите», не бесконечный spinner |
| Двойной клик «Далее» | disable + version concurrency |
| Ученик ответил, teacher ещё на том же вопросе | ок; смена вопроса приходит event’ом |
| Сессия finished, ученик F5 | экран результатов, не lobby |

### 8.6. Heartbeat и «мертвые» участники

- Клиент шлёт `last_seen` раз в ~30 с пока вкладка видима.
- На host: «онлайн» ≈ seen < 60–90 с.
- Не кикать агрессивно за сеть — только пометка offline; ответ всё ещё принимается, пока phase=answering.
- Сессии в `lobby|live` без activity хозяина N часов → `abandoned` (job / при следующем create).

### 8.7. Co-host и вторая вкладка

- Два устройства учителя: оба делают resume одного `session_id`.
- Control через `version` — побеждает первый успешный; второй получает актуальный state.
- Явный co-host в `session_hosts` для напарника.

### 8.8. Идемпотентность и анти-зависание UI

Глобально на join/host:

- любой экран сессии умеет `reloadState()`;
- ошибка boundary: «Не удалось синхронизировать» + кнопка «Обновить состояние» (не «перезагрузить сайт с потерей context»);
- после `finished` ответы не принимаются;
- после `abandoned` — экран «урок завершён учителем».

---

## 9. Масштабирование нагрузки и продукта

| Рост | Как держим |
|---|---|
| Много учителей | `org` + RLS по `org_id` / ownership; индексы `(host_user_id, status)`, `(code) WHERE active` |
| Много учеников в одной сессии | teacher UI слушает агрегаты (`answered_count`), не каждую строку ответа в полном виде; answers пишет participant |
| Много параллельных сессий | короткие PIN + проверка коллизий; Realtime channel на `session_id` |
| Новые типы вопросов | registry + jsonb; без ALTER на каждый тип |
| Приложение | те же resume_token и functions |
| Классы / семестр | отдельные таблицы поверх `answers`, не ломая live |
| Медиа | Supabase Storage, в payload только url/id |

Ориентир MVP по нагрузке: класс ~30–40 участников на сессию. Выше — сначала оптимизация агрегатов, не смена архитектуры.

---

## 10. Фазы поставки

### Фаза 0 — каркас

- `/academy/`, `/join/`.
- SQL: orgs/teachers/lessons/questions/sessions/participants/answers + snapshot + resume_token.
- RLS + registry stub (3 типа).

### Фаза 1 — редактор

- CRUD урока; UI типов: single / true_false / short_text.
- Превью ученика.
- Без live.

### Фаза 2 — live + устойчивость

- create/join/control/submit/resume/heartbeat.
- Lobby, QR, ссылка, PIN.
- Host URL со `session_id`; F5 teacher/student = resume.
- Realtime + polling fallback.
- Отчёт; режимы обучение/контроль; рейтинг выкл.
- Серверный `phase_ends_at` если таймер включён.

### Фаза 3 — класс и типы

- multi_choice, free_text + ручная оценка.
- Co-host.
- Сложные вопросы, повторить ошибки, duplicate lesson, TV-layout.

### Фаза 4 — приложение

- Expo join/resume теми же token’ами.
- Запуск урока → web host или native later.

### Фаза 5 — рост

- org_admin, классы, async homework, AI-draft, шаблоны, order/match/image.

---

## 11. Критерии готовности MVP (фаза 2)

1. Два разных учителя параллельно ведут свои сессии.
2. Урок из 5 вопросов, 10 учеников с телефонов по ссылке.
3. Ученик обновляет страницу mid-question → остаётся собой, видит тот же вопрос, ответ не потерян если уже ушёл на сервер.
4. Учитель обновляет host → не создаётся новая сессия, тот же PIN/index.
5. Realtime обрыв → polling подхватывает; нет вечного спиннера.
6. После finish — отчёт; рейтинг можно выключить.
7. Нет Firebase/Socket-сервера.
8. Неизвестный/будущий question type в snapshot не роняет клиент.

---

## 12. Риски и решения

| Риск | Решение |
|---|---|
| Читерство | score на сервере; correct не в клиент до reveal |
| Гонки / двойной submit | UNIQUE + идемпотентность |
| F5 «выбросило» | resume_token + session_id в URL |
| Зависание UI | timeout, reloadState, error boundary |
| Таймер в фоне вкладки | `phase_ends_at` на сервере |
| Два co-host жмут Далее | `version` optimistic lock |
| Правка урока во время live | question_snapshot |
| Новый тип ломает старое | registry + jsonb snapshot |
| Любой admin = учитель | academy_teachers / org roles |
| Смешение с курсами таджвида | отдельные events `academy_live_*` |
| Мёртвые lobby навсегда | abandoned по inactivity |
| Перегруз teacher UI | агрегаты, не full answer stream |
| Публичная галерея без модерации | не в MVP |

---

## 13. Сайт → приложение

| Слой | Сайт | Приложение |
|---|---|---|
| Уроки/сессии/answers | source of truth | то же API |
| Host | web | deep link / native позже |
| Join + resume | mobile web обязателен | SecureStore для resume_token |
| Редактор | web | упрощённый later |

Web-join — постоянный канал (WhatsApp, нет приложения, QR на доску).

---

# Ревью плана

Дата ревью: 2026-09-08 (обновлено тем же днём: типы, масштаб учителей, session resilience).

## Вердикт

План **готов к фазе 0–2** с усиленным контуром устойчивости и расширяемости. Без resume/F5 и registry типов запускать live нельзя — иначе первый же класс в медресе получит «обновил страницу и вылетел».

## Что сильно

1. Web-first + один backend под сайт и Expo.
2. **Registry типов + jsonb payload/snapshot** — правильный ответ на «добавим типы потом».
3. **org / co-host / параллельные сессии** заложены в схеме, даже если UI MVP про одного учителя.
4. **Resume token + session_id в URL + version + phase_ends_at** — нормальная session, не игрушечный demo.
5. Realtime с polling fallback — реалистично для РФ/мобильного интернета.
6. Критерии MVP включают multi-teacher и F5 — проверяемо.

## Что поправить / держать в узде при реализации

1. **Не реализовывать org_admin UI в MVP** — только колонки и RLS-заготовки. Иначе снова scope creep.
2. **Не плодить 8 типов в редакторе** — registry да, UI только 3.
3. **resume_token только hash в БД**; raw token один раз клиенту. Иначе утечка из Table Editor = угон участника.
4. **Не делать fingerprint единственным ключом resume** — только доп. сигнал; основной — token.
5. **Heartbeat не должен быть отдельным SPOF** — если heartbeat падает, урок всё равно идёт; offline — косметика.
6. **question_snapshot размер** — лимит медиа (сжимать, не base64 в jsonb); в snapshot url, не blob.
7. **PIN коллизии** при росте — 6 цифр + retry; при необходимости код длиннее или буквенно-цифровой без путаницы (`0/O`).
8. **Отдельные analytics** `academy_live_*`, не смешивать с `academy_lesson_completed`.

## Сознательно откладываем

Self-paced, AI, классы/семестр, native host, order/match/image, полноценный org_admin UI.

## Отвергаем

| Идея | Почему нет |
|---|---|
| Состояние сессии только в памяти клиента / Realtime presence | F5 и второй учитель сломают урок |
| Отдельная таблица колонок на каждый тип вопроса | Не масштабируется |
| Один глобальный «текущий урок» без session_id | Нельзя нескольким учителям |
| Firebase «рядом» | Два мира данных |
| Сначала только приложение | Режет WhatsApp и доску |

## Порядок работ после апрува

1. SQL: teachers/orgs stubs + lessons + questions(jsonb) + sessions(snapshot, version, phase) + participants(resume_token_hash) + answers.  
2. Registry server: 3 scorers.  
3. Edge: create/join/**resume**/control/submit/heartbeat.  
4. Student `/join` mobile-first + localStorage resume.  
5. Teacher host на `/academy/session/{id}` + F5 resume.  
6. Realtime + polling fallback + UI timeouts.  
7. Пилот → multi_choice/free_text → Expo.

## Итог ревью

Утверждать план с акцентом: **расширяемые типы через registry**, **мультиучитель через session/org**, **session = БД + resume + version**. Это как раз те места, где потом «дорого чинить», если забыть на старте.
