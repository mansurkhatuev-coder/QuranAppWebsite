# Academy Live — банки из приложения

Локальные артефакты для живых квизов. **В Supabase ничего не пишется**, пока SQL не применят вручную.

## Файлы

| Файл | Назначение |
|------|------------|
| `standalone-banks.json` | Отфильтрованные standalone-вопросы по банкам |
| `seed-lessons-plan.json` | План уроков (модули / чанки) |
| `../admin/supabase-migration-academy-seed-app-banks.sql` | Additive seed (skip по совпадению title у owner) |

## Фильтр standalone

Без: картинка / «выше» / аудио / «где буква» / неполные `…`.  
С: знания, Тухфа, Муаллим, мединский (vocab/quiz), 99 имён (детерминированные MCQ).

## Пересборка

Нужен соседний репозиторий `../QuranApp`:

```bash
node scripts/export-academy-live-standalone-banks.mjs
```

Типичный объём плана: ~44 урока / ~430 вопросов.

## Применение в БД (только когда решите сами)

1. Workflow `Seed Academy app course banks` — **только** `workflow_dispatch` (не на push).
2. Или локально: `scripts/apply-academy-live-migration.sh admin/supabase-migration-academy-seed-app-banks.sql`

До явного запуска данные в Supabase не меняются.
