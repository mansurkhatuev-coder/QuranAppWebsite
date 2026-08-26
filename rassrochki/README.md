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
3. Authentication → Providers → Email: для MVP отключите **Confirm email**
4. Settings → API → скопируйте URL и anon key
5. Назначьте себя владельцем продукта (platform-admin) в SQL Editor:

```sql
update public.profiles
set is_platform_admin = true
where id = (select id from auth.users where email = 'YOUR_EMAIL');
```

Если проект уже создан — выполните недостающие миграции по порядку (`002`…`008`).

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

После деплоя: SQL `007_subscription_trial.sql` + `is_platform_admin = true` для вашего email.
Страница управления: `/platform` (продлить / trial / отключить).

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

## Дальше

- Импорт из Google Таблицы
- Напоминания о платежах
- Несколько шаблонов договоров
- Второй админ в организации

## Отдельный репозиторий

Папка `rassrochki/` самодостаточна — её можно вынести в отдельный GitHub-репозиторий и деплоить только её на Vercel.
