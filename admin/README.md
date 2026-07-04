# Админка waydean.ru/admin

Простая страница для редактирования:

- дуа в поддержку (`support_dua`)
- дуа на случаи (`general_dua`)
- версии приложения в Store (`app-release.json`)

## Первый запуск

1. Откройте `admin-config.js` и замените пароль `change-me-before-deploy`.
2. Залейте на сайт папки `data/` и `admin/`.
3. Откройте `https://waydean.ru/admin/`.

## Публикация изменений

1. Отредактируйте записи в админке.
2. Нажмите кнопки скачивания JSON в блоке «Публикация».
3. Замените файлы в репозитории сайта (`website/data/`).
4. Увеличенный `remote-dua.manifest.json` уже будет в скачанном файле.
5. Сделайте `git push` — GitHub Pages обновит waydean.ru.

Из приложения QuranApp можно также выполнить:

```bash
npm run sync:website-dua-data
```

Скрипт пересоберёт `website/data/` из bundled JSON и поднимет версии manifest.

## После релиза в Store

1. Вкладка «Версия в Store».
2. Обновите `versionCode` / `latestVersion` / ссылки.
3. Скачайте `app-release.json` и залейте в `website/data/`.
4. Пользователи увидят баннер на главной после следующей проверки (до 12 часов или перезапуска приложения).

## Безопасность

- Страница закрыта паролем в `admin-config.js` (client-side). Это MVP-защита.
- Не используйте сложный production-пароль в открытом JS надолго.
- Следующий шаг: Supabase Auth + Edge Function для записи без ручной заливки JSON.

## Supabase (следующий этап)

SQL-схема: `website/admin/supabase-schema.sql`

После подключения Supabase админка сможет публиковать JSON автоматически, без скачивания файлов.
