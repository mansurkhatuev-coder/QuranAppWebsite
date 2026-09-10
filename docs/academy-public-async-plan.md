# Публичный async-режим Академии

Согласовано: учитель публикует набор → ссылка → гости/ученики проходят self-paced → учитель видит отчёты и может закрыть набор.

## Роли

| Роль | Таблица | URL |
|---|---|---|
| teacher | `academy_teachers` | `/academy/` |
| student | `academy_students` | `/q/cabinet/` |
| guest | только `academy_participants` | `/q/?t=…` |

Не смешивать кабинеты. Один `auth.users` может иметь обе роли, но UI и `storageKey` раздельные (`academy-teacher-auth` / `academy-student-auth`).

## Модель (additive SQL)

Файл: `admin/supabase-migration-academy-public-async.sql`

- `academy_students` — профиль ученика
- `academy_public_hubs` — набор учителя + `token` + `is_open`
- `academy_public_hub_lessons` — какие уроки в наборе
- `academy_sessions.hub_id` — связь async-прохождения с хабом
- Прохождение = `academy_sessions` с `pacing = 'async'` + participant + answers (как live)

Live не ломаем: teacher-paced submit / auto-advance только для `pacing='live'`.

## Edge Function `academy-live`

Новые action:

| action | кто | что |
|---|---|---|
| `hub_get` / `hub_upsert` / `hub_toggle` | teacher | CRUD набора + уроки + ссылка |
| `hub_reports` | teacher | все async-прохождения набора |
| `public_catalog` | anon | список уроков если `is_open` |
| `async_start` | anon (+ optional student JWT) | новая async-сессия + participant |
| `async_state` / `async_submit` | resume_token | self-paced вопрос → следующий / финиш |
| `ensure_student` / `student_history` | student JWT | профиль + история + агрегатный рейтинг |

## UI

- Учитель: вкладка **Домашние** — название, тумблер открыт/закрыт, чекбоксы уроков, ссылка, отчёты
- Публично: `/q/?t=TOKEN` — имя → список → self-paced → итог; баннеры регистрации для гостя
- Ученик: `/q/auth/` (вход/регистрация, показать пароль, recovery) → `/q/cabinet/`

## Безопасность

- Каталог/старт только если `is_open`
- Вопросы без ключей до ответа; после ответа — feedback
- Рейтинг только агрегаты (точность %, число прохождений)
- Пишет через service role Edge Function; RLS на таблицах для teacher/student self

## Деплой

- Workflow: `.github/workflows/apply-academy-public-async.yml`
- Также подключён к `deploy-academy-live.yml` на этой ветке
