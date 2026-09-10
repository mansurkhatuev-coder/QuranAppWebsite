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
4. Редактор 3 типов вопросов + запуск сессии + join ученика с resume после F5
5. Публичный набор домашних (`academy_public_hubs`) + self-paced `/q/`

## Деплой функции

Workflow: **Deploy Academy live Edge Function** / **Apply Academy public async migration**.

План live: [`docs/academy-live-lessons-plan.md`](../docs/academy-live-lessons-plan.md).  
План домашних: [`docs/academy-public-async-plan.md`](../docs/academy-public-async-plan.md).
