# Академия: live-уроки (сайт)

| URL | Кто |
|---|---|
| https://waydean.ru/academy/ | учитель |
| https://waydean.ru/academy/session/?id=… | host |
| https://waydean.ru/join/?c=482719 | ученик |

## Уже сделано

1. SQL `academy_*` (additive) — применена
2. Bootstrap учителей из `auth.users` — через workflow deploy
3. Edge Function `academy-live` (create/join/resume/control/submit/host_state/results/heartbeat)
4. Редактор 3 типов вопросов + запуск сессии + join ученика с resume после F5

## Деплой функции

Workflow: **Deploy Academy live Edge Function** (push на ветку или workflow_dispatch).

План: [`docs/academy-live-lessons-plan.md`](../docs/academy-live-lessons-plan.md).
