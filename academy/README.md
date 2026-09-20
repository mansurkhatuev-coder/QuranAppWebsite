# Академия: live-уроки (сайт)

| URL | Кто |
|---|---|
| https://waydean.ru/academy/ | учитель |
| https://waydean.ru/academy/session/?id=… | host |
| https://waydean.ru/join/?c=482719 | ученик (live) |
| https://waydean.ru/q/?t=TOKEN | гость / ученик (домашние async) |
| https://waydean.ru/q/auth/ | регистрация / вход ученика |
| https://waydean.ru/q/cabinet/ | кабинет ученика |

## Уже сделано

1. SQL `academy_*` (additive) — применена
2. Bootstrap учителей из `auth.users` — через workflow deploy
3. Edge Function `academy-live` (create/join/resume/control/submit/host_state/results/heartbeat + hub/async)
4. Редактор вопросов + `letter_grid` (Зачёт №3 · задание 1) + запуск сессии + join ученика с resume после F5
5. Публичный набор домашних (`academy_public_hubs`) + self-paced `/q/`
6. Режим запуска **Зачёт (строго)**: без опоздавших, без разбора ученикам/проектору до итога; CSV из отчёта

## Отдельный аккаунт учителя (медресе)

Не используйте общий админский логин на занятии. Нужен свой Auth-пользователь + строка в `academy_teachers`.

**Вариант A — Dashboard**

1. Supabase → **Authentication → Users → Add user** (email + пароль)
2. Скопируйте UUID → SQL Editor → `admin/supabase-create-academy-teacher.sql` (подставьте uuid и имя)
3. Вход: https://waydean.ru/academy/

**Вариант B — скрипт** (нужен `SUPABASE_SERVICE_ROLE_KEY`):

```bash
SUPABASE_URL=https://rivjkiksknnesahrvamf.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=… \
node scripts/create-academy-teacher.mjs \
  --email teacher@example.com \
  --password '••••••••' \
  --name 'Учитель медресе'
```

## Зачёт: как запускать

1. Создайте урок («+ Зачёт №3 · задание 1» или свой набор)
2. **Запустить** → режим **Зачёт (строго)** (подставляется сам, если в названии есть «Зачёт»)
3. После занятия: **Отчёты → Отчёт → Скачать CSV**

## Деплой функции

Workflow: **Deploy Academy live Edge Function** / **Apply Academy public async migration**.

План live: [`docs/academy-live-lessons-plan.md`](../docs/academy-live-lessons-plan.md).  
План домашних: [`docs/academy-public-async-plan.md`](../docs/academy-public-async-plan.md).
