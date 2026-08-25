# Рассрочки — учёт платежей

MVP веб-приложения для учёта рассрочек: клиенты, график платежей, касса, доли 30/70, договор PDF, экспорт CSV.

**Стек:** Next.js + Vercel + Supabase

## Возможности MVP

- Мульти-организации: у каждого бизнеса свои данные (RLS)
- Роль: только админ
- Клиенты и рассрочки с месячным графиком
- Наценка % на товар (прибыль) + доли владельца/инвестора
- Новый клиент прямо в форме рассрочки
- Чёрный список клиентов с пометкой
- Настройки по умолчанию + переопределение в каждой сделке
- Инвесторы как справочник (поля скрыты, если инвесторов нет)
- Отметка оплат, просрочки, дашборд
- Автосохранение черновиков в браузере
- Экспорт CSV, договор PDF из шаблона
- Адаптив: телефон + компьютер

## Быстрый старт

### 1. Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. SQL Editor → выполните по порядку:
   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_markup_blacklist.sql`
   - `supabase/migrations/003_receipts_investor_amount.sql`
3. Authentication → Providers → Email: для MVP отключите **Confirm email**
4. Settings → API → скопируйте URL и anon key

Если проект уже создан и `001`/`002` выполнены — достаточно выполнить **`003_receipts_investor_amount.sql`**.

### 2. Локально

```bash
cd rassrochki
cp .env.example .env.local
# заполните NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY
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
4. Deploy

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
