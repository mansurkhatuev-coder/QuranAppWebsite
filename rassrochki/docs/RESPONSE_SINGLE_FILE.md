# Результат этапа исправлений (одним файлом)

## 1) Какие файлы изменены

1. `rassrochki/supabase/migrations/008_payment_rpc_overdue.sql`
2. `rassrochki/src/components/LoanDetail.tsx`
3. `rassrochki/src/components/PaymentConfirmModal.tsx`
4. `rassrochki/src/lib/schedule-payments.ts`
5. `rassrochki/src/lib/overdue.ts`
6. `rassrochki/src/app/(app)/dashboard/page.tsx`
7. `rassrochki/src/app/(app)/loans/page.tsx`
8. `rassrochki/src/app/(app)/loans/[id]/page.tsx`
9. `rassrochki/src/lib/finance.test.ts`
10. `rassrochki/src/types/database.ts`

---

## 2) Какие проблемы C1–C3 исправлены

### C1/C2/C3 закрыты через серверный атомарный `record_payment(...)`

Добавлен RPC в `008_payment_rpc_overdue.sql`, который выполняет операцию в одной транзакции:

1. Получает стартовый `schedule`.
2. Блокирует строки графика (`SELECT ... FOR UPDATE`).
3. Повторно проверяет актуальное состояние внутри транзакции.
4. Проверяет, не оплачен ли стартовый `schedule` полностью.
5. Распределяет сумму по актуальному графику.
6. Обновляет `payment_schedules`.
7. Создаёт запись в `payments`.
8. При полном покрытии закрывает `loan`.

При любой ошибке транзакция откатывается целиком.

### Защита от повторов и параллелизма

- Добавлено поле `payments.idempotency_key`.
- Добавлен уникальный индекс `(organization_id, idempotency_key)` (partial, для non-null).
- В RPC добавлен `pg_advisory_xact_lock` по `(org + key)` для защиты от network retry и параллельных дублей.
- `LoanDetail` переведён на `supabase.rpc("record_payment", ...)` вместо клиентской цепочки `insert -> update`.

### Повторная оплата paid стартового schedule

Теперь возвращается понятная ошибка: стартовый платёж уже полностью оплачен.
Автоматический перенос такого платежа на следующий schedule запрещён.

---

## 3) Какие UI-проблемы исправлены

### Единый remaining через `scheduleDueRemaining(schedule)`

Применено в:

- `PaymentConfirmModal` (default сумма и проверки);
- `LoanDetail` (next unpaid, суммы к оплате по строкам);
- `Dashboard`:
  - overdue amount,
  - upcoming amount,
  - суммы в карточках,
  - WhatsApp reminders.

Это убирает расхождения, когда в одном месте показывался `amount`, а в другом остаток.

### Overdue архитектурно синхронизирован

Создан единый helper:

- `calculateOverdueStatus(...)`
- `calculateOverdueCutoff(...)`
- `syncOverdueSchedules(...)`

И он вызывается при открытии:

- Dashboard,
- списка loans,
- LoanDetail.

Важно: смысл `overdue_days` не менялся (сохранена текущая фактическая семантика).

---

## 4) Какие тесты добавлены

Обновлён `src/lib/finance.test.ts`:

1. Один платёж.
2. Двойной параллельный платёж (race-сценарий на одном снимке).
3. Повторная оплата paid schedule (отклонение).
4. Частичная оплата 10 000 из 20 000.
5. Два частичных 10 000 + 10 000.
6. Переплата 25 000 при долге 20 000.
7. Несколько schedules.
8. Платёж, закрывающий один schedule и частично следующий.
9. Down payment (граничные случаи).
10. Округление последнего платежа.
11. Overdue 0–4 дня с явной датой наступления overdue.

Проверки:

- `npm test` — проходит.
- `npm exec tsc --noEmit` — проходит.

---

## 5) Что осталось без изменений (нужно отдельное решение)

1. H4: новая семантика `overdue_days` не вводилась.
2. H5: формула влияния `down_payment` на `collectionProgress / capitalReturned` не менялась.
3. Формула прибыли не менялась.
4. Формула инвесторской доли не менялась.
5. Поведение `surplus` (переплаты) не менялось.
6. Существующие данные не менялись.

---

## 6) Какие решения нужно принять отдельно

### A) Учёт down_payment в cash/analytics

Нужно утвердить модель денежных событий (без внедрения на этом этапе):

- `down_payment`
- `scheduled_payment`
- `partial_payment`
- `overpayment`
- `refund`

### B) Семантика `overdue_days`

Подтвердить правило: считать overdue на N-й день или после N полных дней.
Сейчас оставлено текущее поведение без изменения.

### C) Влияние down_payment на инвесторский капитал

Нужно решение: должен ли `down_payment` сразу участвовать в возврате `investor_amount`, либо только платежи по графику.

### D) Переплата (`surplus`)

Сейчас:

- payment создаётся на полную сумму;
- в график попадает только распределённая часть;
- `surplus` возвращается из RPC и показывается в UI;
- в dashboard cash учитывается полный payment (как и раньше).

Нужно утвердить целевую бизнес-модель обработки surplus (хранение/перенос/зачёт/возврат).
