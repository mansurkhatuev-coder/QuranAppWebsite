# Подключение Supabase к админке waydean.ru

Пошаговая инструкция: база данных, вход по email, публикация JSON на сайт одной кнопкой.

**Время:** ~1–2 часа при первой настройке.

---

## Что вы получите

| Было | Станет |
|------|--------|
| Пароль в открытом JS | Вход **email + пароль** Supabase |
| Скачивание JSON вручную | Кнопка **«Опубликовать на waydean.ru»** |
| Данные только в браузере | Дуа хранятся в **облачной БД** |
| Риск потерять правки | Данные в Supabase + на сайте |

Приложение на телефоне **не меняется** — по-прежнему читает JSON с `https://waydean.ru/data/`.

---

## Часть 1. Создать проект Supabase

### 1.1 Регистрация

1. Откройте [https://supabase.com](https://supabase.com)
2. **Start your project** → войдите через GitHub (удобнее всего)
3. **New project**
4. Заполните:
   - **Name:** `waydean-admin` (или любое)
   - **Database Password:** придумайте сложный пароль → **сохраните в блокнот** (нужен для прямого доступа к БД, не для админки)
   - **Region:** `Frankfurt (eu-central-1)` — ближе к РФ/Европе
5. **Create new project** → подождите 1–2 минуты

### 1.2 Скопировать ключи API

1. В левом меню: **Project Settings** (шестерёнка внизу)
2. **API**
3. Сохраните в блокнот:
   - **Project URL** — например `https://abcdefgh.supabase.co`
   - **anon public** key — длинная строка `eyJ...`
   - **service_role** key — **секретная**, никому не показывать и не вставлять в админку

---

## Часть 2. Создать таблицы в базе

### 2.1 SQL-скрипт

1. В Supabase: **SQL Editor** → **New query**
2. Откройте файл в проекте: `website/admin/supabase-schema.sql`
3. Скопируйте **весь** текст → вставьте в SQL Editor
4. **Run** → должно быть `Success. No rows returned`

Создаются таблицы:
- `dua_items` — все дуа
- `app_release` — версия в Store
- `content_manifest` — последняя публикация

### 2.2 Проверка

**Table Editor** → должны появиться таблицы `dua_items`, `app_release`, `content_manifest`.

### 2.3 Отзывы Академии (вкладка «Отзывы Академии» в админке)

Если нужны отзывы из приложения (Академия → Таджвид):

1. **SQL Editor** → **New query**
2. Выполните по очереди:
   - `website/admin/supabase-migration-academy-feedback.sql`
   - `website/admin/supabase-migration-academy-feedback-v2.sql`
3. **Table Editor** → должна появиться таблица `academy_course_feedback`.

Без этих миграций вкладка «Отзывы Академии» покажет ошибку или пустой список.

---

## Часть 3. Создать пользователя админки

1. **Authentication** → **Users** → **Add user** → **Create new user**
2. Заполните:
   - **Email:** ваш email (например `ne.kradi@mail.ru`)
   - **Password:** пароль для входа в админку
   - **Auto Confirm User:** включите ✓ (чтобы не подтверждать email)
3. **Create user**

Этот email/пароль — для входа на `waydean.ru/admin/`.

### 3.1 Отключить публичную регистрацию

1. **Authentication** → **Providers** → **Email**
2. Убедитесь, что **Enable Email Signup** выключен (чтобы никто кроме вас не регистрировался)

---

## Часть 4. Настроить `supabase-config.js` на сайте

### 4.1 Локально

1. В папке `website/admin/` скопируйте:
   ```
   supabase-config.example.js → supabase-config.js
   ```
2. Откройте `supabase-config.js` и вставьте:
   ```javascript
   window.SUPABASE_CONFIG = {
     url: 'https://ВАШ_PROJECT_REF.supabase.co',
     anonKey: 'ВАШ_ANON_KEY',
     publishFunctionUrl: 'https://ВАШ_PROJECT_REF.supabase.co/functions/v1/publish-content',
   };
   ```

`publishFunctionUrl` заработает после Части 6 (деплой Edge Function).

### 4.2 Задеплоить на сайт

Из папки `website/`:

```powershell
git add admin/supabase-config.js admin/supabase-config.example.js admin/admin-supabase.js admin/admin.js admin/index.html admin/supabase-schema.sql supabase/
git commit -m "Enable Supabase admin integration"
git push origin main
```

Подождите 1–2 минуты → откройте `https://waydean.ru/admin/` с **Ctrl+F5**.

На экране входа появится поле **Email** (если `url` и `anonKey` заполнены).

---

## Часть 5. Импортировать текущие дуа в Supabase

Один раз переносим данные из JSON в базу.

### 5.1 Установить CLI-зависимость (в корне QuranApp)

```powershell
cd C:\Users\SHEYH-MANSUR\Desktop\QuranApp
npm install --save-dev @supabase/supabase-js
```

### 5.2 Запустить импорт

```powershell
$env:SUPABASE_URL = "https://ВАШ_PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "ВАШ_SERVICE_ROLE_KEY"
node scripts/import-dua-to-supabase.js
```

Ожидаемый вывод:
```
Imported 14 dua items (10 support, 4 general).
```

### 5.3 Проверка

**Table Editor** → `dua_items` → должны быть строки с дуа.

---

## Часть 6. Edge Function «Опубликовать на сайт»

Функция берёт данные из админки и пушит JSON в GitHub → сайт обновляется.

### 6.1 Установить Supabase CLI

**Windows (Scoop):**
```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Или npm:**
```powershell
npm install -g supabase
```

Проверка: `supabase --version`

### 6.2 Войти и привязать проект

```powershell
cd C:\Users\SHEYH-MANSUR\Desktop\QuranApp\website
supabase login
supabase link --project-ref ВАШ_PROJECT_REF
```

`PROJECT_REF` — часть URL: `https://abcdefgh.supabase.co` → ref = `abcdefgh`.

### 6.3 GitHub Token для публикации файлов

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
2. **Generate new token**
3. Repository access: только **QuranAppWebsite**
4. Permissions:
   - **Contents:** Read and write
5. Скопируйте токен `github_pat_...`

### 6.4 Секреты в Supabase

```powershell
supabase secrets set GITHUB_TOKEN=github_pat_ВАШ_ТОКЕН
supabase secrets set GITHUB_REPO=mansurkhatuev-coder/QuranAppWebsite
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` в Edge Functions подставляются автоматически.

### 6.5 Деплой функции

```powershell
cd C:\Users\SHEYH-MANSUR\Desktop\QuranApp\website
supabase functions deploy publish-content --no-verify-jwt
```

> `--no-verify-jwt` нужен, потому что функция сама проверяет JWT пользователя внутри кода.

### 6.6 Проверка URL функции

После деплоя в консоли будет URL вида:
```
https://abcdefgh.supabase.co/functions/v1/publish-content
```

Вставьте его в `supabase-config.js` → `publishFunctionUrl` → снова `git push`.

---

## Часть 7. Как пользоваться админкой

1. Откройте **https://waydean.ru/admin/**
2. Войдите: **email + пароль** из Части 3
3. Редактируйте дуа → **Сохранить** (пишет в Supabase)
4. Вкладка **Версия в Store** — обновите versionCode после релиза
5. Нажмите **«Опубликовать на waydean.ru»**
6. Через 1–2 минуты проверьте:
   - https://waydean.ru/data/remote-dua.manifest.json
   - версия `version` должна увеличиться

Приложение подтянет изменения при следующем запуске (или в течение ~12 часов).

---

## Часть 8. Проверочный чеклист

- [ ] Вход в админку по email работает
- [ ] Список дуа загружается из Supabase
- [ ] Сохранение дуа → строка в `dua_items` обновилась
- [ ] «Опубликовать» → без ошибки
- [ ] `waydean.ru/data/support-dua.json` обновился
- [ ] Приложение видит новые дуа после перезапуска

---

## Часть 9. Безопасность

| Ключ | Где можно | Где нельзя |
|------|-----------|------------|
| **anon key** | `supabase-config.js` на сайте | — |
| **service_role key** | Только локальный импорт, Edge Function (авто) | Админка, GitHub, чат |
| **GITHUB_TOKEN** | Supabase secrets | Везде публично |
| **Пароль admin-config.js** | Удалён — вход только через Supabase Users | — |

RLS (Row Level Security): без входа в Supabase чужой человек **не может** менять дуа. Читать опубликованные дуа публично можно — это нормально (то же самое на waydean.ru).

---

## Часть 10. Частые проблемы

### «Invalid login credentials»
- Проверьте email/пароль в **Authentication → Users**
- У пользователя должен быть статус **confirmed**

### Нет поля Email на странице входа
- `supabase-config.js` пустой или не задеплоен
- Проверьте `url` и `anonKey`

### «GITHUB_TOKEN secret is missing»
- Выполните `supabase secrets set GITHUB_TOKEN=...`
- Передеплойте функцию

### «GitHub API error 403»
- У токена нет прав **Contents: Read and write** на `QuranAppWebsite`

### Публикация прошла, сайт старый
- Подождите 2 минуты (GitHub Pages / Cloudflare)
- Откройте JSON с `?t=123` для обхода кэша

### Деплой GitHub Pages падает
- Зайдите в **Actions** репозитория `QuranAppWebsite`
- Перезапустите failed workflow вручную (**Re-run jobs**)

---

## Часть 11. Стоимость

**Free tier Supabase** для вашего масштаба (1 админ, ~20–50 дуа) — **$0/мес**.

Лимиты free tier с запасом:
- 50 000 MAU auth
- 500 MB базы
- 500 000 вызовов Edge Functions в месяц

---

## Файлы в проекте

| Файл | Назначение |
|------|------------|
| `website/admin/supabase-schema.sql` | SQL для таблиц |
| `website/admin/supabase-config.js` | URL и ключи (на сайте) |
| `website/admin/admin-supabase.js` | Логика Supabase в админке |
| `website/supabase/functions/publish-content/` | Edge Function публикации |
| `scripts/import-dua-to-supabase.js` | Первичный импорт дуа |

---

## Порядок действий (кратко)

1. Создать проект Supabase  
2. Выполнить SQL  
3. Создать пользователя  
4. Заполнить `supabase-config.js` → push на сайт  
5. Импортировать дуа скриптом  
6. Настроить GitHub token → secrets → deploy function  
7. Войти в админку → опубликовать  

Если застрянете на шаге — напишите на каком именно и что показывает ошибка.
