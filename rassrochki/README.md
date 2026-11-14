# Рассрочки — учёт платежей

MVP веб-приложения для учёта рассрочек: клиенты, график платежей, касса, доли 30/70, договор PDF, экспорт CSV.

**Стек:** Next.js + Vercel + Supabase

## Возможности MVP

- Мульти-организации: у каждого бизнеса свои данные (RLS)
- Роль: только админ
- Пробный период 30 дней + ручное продление (WhatsApp) и деактивация
- Клиенты и рассрочки с месячным графиком
- Первоначальный взнос — график от оставшейся суммы
- Наценка % на товар (прибыль) + доли владельца/инвестора
- Несколько поручителей
- Новый клиент прямо в форме рассрочки
- Чёрный список клиентов с пометкой
- Настройки по умолчанию + переопределение в каждой сделке
- Инвесторы: вложения + доля от прибыли
- Отметка оплат с чеком, просрочки, дашборд
- Автосохранение черновиков в браузере
- Экспорт CSV / полный JSON, договор PDF
- Адаптив: телефон + компьютер

## Быстрый старт

### 1. Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. SQL Editor → выполните по порядку:
   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_markup_blacklist.sql`
   - `supabase/migrations/003_receipts_investor_amount.sql`
   - `supabase/migrations/004_guarantors.sql`
   - `supabase/migrations/005_down_payment.sql`
   - `supabase/migrations/006_rls_parent_org_checks.sql`
   - `supabase/migrations/007_subscription_trial.sql`
   - `supabase/migrations/008_schedule_on_full_amount.sql`
   - `supabase/migrations/012_platform_revenue_delete.sql`
   - `supabase/migrations/013_platform_activity_stats.sql`
   - `supabase/migrations/014_schedule_on_full_amount_default.sql`
   - `supabase/migrations/015_default_contract_template.sql`
   - `supabase/migrations/016_edit_loan_transaction.sql` — добавляет безопасное редактирование рассрочки.
   - `supabase/migrations/017_delete_unpaid_loan.sql` — добавляет начальную защиту от удаления истории оплат.
   - `supabase/migrations/018_delete_loan_with_history.sql` — добавляет подтверждаемое удаление рассрочки вместе с графиком, оплатами и чеками; удалённые суммы больше не входят в дашборды и отчёты.
   - `supabase/migrations/019_offline_operations.sql` — добавляет версии записей и идемпотентную серверную синхронизацию офлайн-операций.
3. Authentication → Providers → Email: для MVP отключите **Confirm email**
4. Settings → API → скопируйте URL и anon key
5. Назначьте себя владельцем продукта (platform-admin) в SQL Editor:

```sql
update public.profiles
set is_platform_admin = true
where id = (select id from auth.users where email = 'YOUR_EMAIL');
```

Если проект уже создан — выполните все недостающие миграции по порядку. Миграции рассрочек применяются отдельным GitHub Actions workflow при публикации соответствующего SQL-файла в `main`.

### Бэкапы

1. В приложении: **Настройки → Скачать полный бэкап (JSON)** (раз в неделю)
2. GitHub Actions: workflow `Rassrochki DB backup` — артефакт раз в неделю (секреты
   `RASSROCHKI_SUPABASE_URL`, `RASSROCHKI_SUPABASE_SERVICE_ROLE_KEY`)
3. Опционально: пуш в **отдельный приватный** репозиторий
   (`RASSROCHKI_BACKUP_REPO`, `RASSROCHKI_BACKUP_TOKEN`)

Не коммитьте данные клиентов в публичный репозиторий сайта.

### 2. Локально

```bash
cd rassrochki
cp .env.example .env.local
# заполните NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# NEXT_PUBLIC_WHATSAPP_PHONE (ваш WhatsApp для кнопки «Продлить»)
npm install
npm run dev
```

Откройте http://localhost:3000

### 3. Vercel

1. Импортируйте репозиторий в [vercel.com](https://vercel.com)
2. **Root Directory:** `rassrochki`
3. Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_WHATSAPP_PHONE` (например `79001234567`)
4. Deploy

После деплоя: SQL `007`…`012` (недостающие) + `is_platform_admin = true` для вашего email.
Страница управления: `/platform` (продлить / trial / отключить / удалить).

## Структура

```
rassrochki/
  src/app/           # страницы (login, dashboard, clients, loans, settings)
  src/components/    # UI
  src/lib/           # supabase, расчёты, договор PDF
  supabase/migrations/001_initial.sql
```

## Переменные шаблона договора

`{organization}`, `{client}`, `{phone}`, `{amount}`, `{term_months}`, `{monthly_payment}`, `{start_date}`, `{schedule}`, `{manager_share}`, `{investor_share}`, `{investor}`

## Офлайн-режим

1. Войдите с подключением к интернету, дождитесь загрузки данных и нажмите **Подготовить офлайн-доступ**.
2. На компьютере установите сайт как приложение из поддерживаемого браузера. На телефоне добавьте его на главный экран. После первой синхронизации офлайн-рабочее место доступно из баннера состояния сети или при неудачном открытии страницы.
3. Без сети можно просматривать сохранённые рассрочки и клиентов, добавлять клиентов и рассрочки, менять график с сохранением проведённых оплат, отмечать оплаты с чеком, переключать чёрный список и подтверждённо удалять рассрочки. Изменения помечаются как ожидающие отправки и сразу учитываются в локальном обзоре.
4. При восстановлении интернета очередь отправляется автоматически при открытии приложения, возвращении на вкладку или вручную кнопкой **Синхронизировать**. Конфликт версии не перезаписывает серверные данные: локальная операция остаётся на устройстве и отображается в блоке внимания.
5. **Очистить данные** в офлайн-рабочем месте удаляет копию, очередь и локальные чеки только текущей организации. Выход из аккаунта тоже удаляет её; при наличии очереди приложение сначала предлагает остаться и синхронизировать.

Офлайн-копия хранится в IndexedDB браузера и не зашифрована приложением. Защитите учётную запись ОС и профиль браузера паролем или шифрованием диска. Браузер может очистить данные устройства; запрос постоянного хранения снижает этот риск, но не гарантирует резервную копию. Чеки сохраняются локально только когда пользователь прикрепил их к оплате; при синхронизации файл загружается в закрытое хранилище. Фото паспортов не собираются и в офлайн-хранилище не попадают.

## Дальше

- Импорт из Google Таблицы
- Напоминания о платежах
- Несколько шаблонов договоров
- Второй админ в организации

## Отдельный репозиторий

Папка `rassrochki/` самодостаточна — её можно вынести в отдельный GitHub-репозиторий и деплоить только её на Vercel.
