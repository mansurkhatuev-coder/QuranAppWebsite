# Академия: live-уроки (сайт)

Публичные страницы:

| URL | Кто |
|---|---|
| https://waydean.ru/academy/ | учитель (вход Supabase) |
| https://waydean.ru/academy/session/?id=… | host / продолжение после F5 |
| https://waydean.ru/join/ | ученик (код + имя) |
| https://waydean.ru/join/?c=482719 | ученик по ссылке |

Приложение пока не трогаем.

## Один раз в Supabase

1. SQL Editor → выполнить `admin/supabase-migration-academy-live.sql`
2. Authentication → пользователь учителя (можно тот же, что для админки)
3. Добавить учителя:

```sql
insert into public.academy_teachers (user_id, display_name)
values ('<uuid-из-auth.users>', 'Имя учителя')
on conflict (user_id) do update
  set is_active = true,
      display_name = excluded.display_name;
```

План: [`docs/academy-live-lessons-plan.md`](../docs/academy-live-lessons-plan.md).

## Сейчас (фаза 0)

- схема + RLS
- вход учителя и проверка `academy_teachers`
- список уроков / активных сессий (пока пусто)
- join-экран с локальным resume заделом

## Дальше

Edge Functions: create / join / resume / control / submit → редактор 3 типов → live host.
