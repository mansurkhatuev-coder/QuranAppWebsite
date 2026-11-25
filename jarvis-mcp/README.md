# MCP для Jarvis: аналитика и отзывы

Локальный stdio-сервер только на чтение. Jarvis (isair/jarvis) спрашивает голосом сводку аналитики и отзывы академии из того же проекта Supabase, что и админка. Запись, публикация и загрузка CSV здесь не делаются.

## Установка

Нужен Node.js 18+.

```bash
cd jarvis-mcp
npm install
cp .env.example .env
```

Заполните `.env`. Файл в git не попадает.

Проверка, что процесс поднимается:

```bash
npm start
```

В stderr будет строка `waydean-jarvis-mcp listening on stdio`. Остановка: Ctrl+C. Для Jarvis сервер запускать вручную не нужно — Jarvis сам стартует процесс.

## Переменные

| Переменная | Зачем |
| --- | --- |
| `SUPABASE_URL` | Project URL, как в админке |
| `SUPABASE_ANON_KEY` | anon / publishable key, как в админке |
| `SUPABASE_EMAIL` | пользователь Supabase Auth |
| `SUPABASE_PASSWORD` | пароль этого пользователя |

Вход тот же, что в админке: anon-ключ плюс сессия `authenticated`. RPC `analytics_dashboard(p_days)` и чтение `academy_course_feedback` выданы этой роли, не анониму. Можно завести отдельного пользователя только для Jarvis, если ему достаточно читать эти данные.

**Service role не используйте.** Ключ `service_role` / `sb_secret_*` обходит RLS и может менять данные. Если подставить его в `SUPABASE_ANON_KEY`, сервер отклонит запрос. Отдельный доступ только на чтение — это anon/publishable ключ и пользователь Supabase Auth, а не service role.

## Регистрация в Jarvis

В `~/.config/jarvis/config.json` (раздел MCP из [документации Jarvis](https://github.com/isair/jarvis/blob/main/docs/CONFIGURATION.md#mcp-integrations)):

```json
{
  "mcps": {
    "waydean": {
      "command": "node",
      "args": ["/ABS/PATH/QuranAppWebsite/jarvis-mcp/src/index.js"]
    }
  }
}
```

Подставьте абсолютный путь к клону. Секреты остаются в `jarvis-mcp/.env` рядом со скриптом: процесс читает этот файл сам. Если в блоке Jarvis задать `env`, эти значения важнее `.env`.

Так можно передать секреты прямо в конфиг, без `.env`:

```json
{
  "mcps": {
    "waydean": {
      "command": "node",
      "args": ["/ABS/PATH/QuranAppWebsite/jarvis-mcp/src/index.js"],
      "env": {
        "SUPABASE_URL": "https://YOUR_PROJECT_REF.supabase.co",
        "SUPABASE_ANON_KEY": "YOUR_ANON_OR_PUBLISHABLE_KEY",
        "SUPABASE_EMAIL": "you@example.com",
        "SUPABASE_PASSWORD": "your-password"
      }
    }
  }
}
```

Если Jarvis не видит `node`, укажите полный путь (`which node`). После правки конфига перезапустите Jarvis.

Другие способы запуска того же входа: `npm start` в каталоге `jarvis-mcp` или `npx --prefix /ABS/PATH/jarvis-mcp waydean-jarvis-mcp`.

## Примеры вопросов

- «Джарвис, сколько активных и новых установок за неделю?»
- «Джарвис, какая аналитика приложения за всё время?»
- «Джарвис, прочитай последние отзывы академии»
- «Джарвис, какая средняя оценка курсов?»

## Инструменты

- `get_analytics_summary` — аргумент `days` (по умолчанию 7, `0` = всё время). RPC `analytics_dashboard` с `p_days`. В ответе, если поля есть: active, new_installs, all_time_installs, events, azkar, lessons, app_open, tasbih. Если RPC недоступен — короткая ошибка, без выгрузки событий.
- `list_academy_feedback` — `limit` (по умолчанию 20, максимум 50) и необязательный `min_rating`. Таблица `academy_course_feedback`, сортировка `created_at` по убыванию, те же колонки, что в админке (при старой схеме — укороченный набор). Длинные комментарии обрезаются.
- `get_feedback_stats` — число отзывов и средняя оценка, можно задать `min_rating`.
