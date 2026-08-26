# Аудит финансовой логики «Рассрочки»

Дата: 2026-08-26  
Область: `rassrochki/`  
Статус: **только аудит, без исправления бизнес-логики** (ожидается подтверждение).

Автотесты: `npm test` в каталоге `rassrochki`  
Сверка backup: `npx tsx scripts/reconcile-loans.ts <backup.json>`

---

## Фактические формулы (из кода)

Источник: `src/lib/utils.ts`, `src/lib/finance.ts`, `src/app/(app)/loans/new/page.tsx`.

| Понятие | Формула |
|---|---|
| Цена продажи / к возврату (`principal`) | `round(cost_amount × (1 + markup_percent/100), 2)` |
| Прибыль сделки | `max(principal − cost_amount, 0)` (если есть cost+principal; иначе `cost × markup%`) |
| Задолженность по графику (`financed`) | `max(0, round(principal − down_payment, 2))` |
| Ежемесячный платёж | `round(financed / term_months, 2)` |
| График | первые N−1 = base (или меньше остатка); **последний = весь остаток** |
| Доля инвестора (авто) | `min(100, invested / cost_amount × 100)` — **от себестоимости**, не от прибыли и не от principal |
| Разделение прибыли | `splitIncome(profit, manager%, investor%)` — веса нормализуются к сумме долей |
| Прибыль в оплате | `paidAmount × (principal − cost) / principal` |
| Прогресс сбора | `(down_payment + sumSchedulePaid) / principal` |

Первый платёж графика = `start_date + 1 месяц` (`addMonths`, date-fns).

---

## CRITICAL

### C1. Нет серверной защиты от двойной оплаты (race / двойной клик / две вкладки)

1. **Где:** `LoanDetail.confirmPayment` (`src/components/LoanDetail.tsx`), таблица `payments` (`001_initial.sql`).  
2. **Код:** `payments.insert` → затем `allocatePaymentToSchedules` на **клиентском** снимке `schedules` → `payment_schedules.update` без транзакции, без idempotency key, без `WHERE status != 'paid'`, без unique constraint.  
3. **Когда:** двойной клик по «Подтвердить» (loading ставится **после** синхронных проверок), две вкладки, повтор при сбое сети.  
4. **Пример:** платёж 20 000 ₽. Два параллельных запроса → в `payments` 40 000 ₽, в графике `paid_amount = 20 000`.  
5. **Как должно быть:** одна логическая оплата; серверный RPC/транзакция с блокировкой строки графика.  
6. **Как сейчас:** frontend `disabled={loading}` недостаточен; backend не защищает.  
7. **Критичность:** CRITICAL — создаёт «лишние» деньги в кассе/истории.  
8. **Исправление:** Postgres RPC `record_payment(...)` в одной транзакции: `SELECT … FOR UPDATE` строки графика → insert payment → allocate → update; опционально idempotency key; на UI — disable до confirm.

### C2. Повторная оплата уже закрытой строки молча закрывает СЛЕДУЮЩИЙ платёж

1. **Где:** `allocatePaymentToSchedules` + `confirmPayment`.  
2. **Код:** при `due <= EPS` строка пропускается, остаток уходит на следующие (`schedule-payments.ts`). Payment всё равно уже вставлен.  
3. **Когда:** вкладка со старым UI; гонка после первой оплаты.  
4. **Пример:** пользователь «ещё раз» жмёт оплату #1 на 20 000 → создаётся payment к #1, а `paid` ставится на #2.  
5. **Как должно быть:** отказ, если стартовая строка уже `paid` / нечего распределять на неё.  
6. **Как сейчас:** тихий перенос на следующий.  
7. **Критичность:** CRITICAL — чужой платёж считается оплаченным.  
8. **Исправление:** если `startScheduleId` уже полностью оплачен → rollback/ошибка; не redistribute без явного «зачесть на следующие».

### C3. Payment пишется до успешного обновления графика (орфаны)

1. **Где:** `LoanDetail.confirmPayment`.  
2. **Код:** сначала `payments.insert`, потом цикл `payment_schedules.update`; при `updates.length === 0` — throw **после** insert.  
3. **Когда:** сбой сети/RLS на update; allocate вернул пусто.  
4. **Пример:** в `payments` +20 000, график без изменений; повтор → ещё +20 000.  
5. **Как должно быть:** одна транзакция; при ошибке — ничего не коммитить.  
6. **Как сейчас:** возможны орфан-payments.  
7. **Критичность:** CRITICAL.  
8. **Исправление:** тот же server RPC; либо сначала update графика с условием, потом payment (хуже) / compensation delete (хрупко).

---

## HIGH

### H1. Просрочка обновляется только при открытии Dashboard

1. **Где:** `dashboard/page.tsx` (единственный `.update({ status: "overdue" })`).  
2. **Код:** loan detail / список рассрочек **не** вызывают overdue-логику; `settings.overdue_days` на карточке займа не используется.  
3. **Когда:** пользователь работает только с `/loans/[id]`.  
4. **Пример:** платёж просрочен 10 дней, на карточке всё ещё `pending`.  
5. **Как должно быть:** единый расчёт (cron/RPC/при любом чтении) или derived status без записи.  
6. **Как сейчас:** статус «залипает» в pending.  
7. **Критичность:** HIGH.  
8. **Исправление:** вынести mark-overdue в shared server helper; вызывать из layout/loan page; или SQL view.

### H2. Суммы просрочки / «ждём за 30 дней» / WhatsApp = полный `amount`, не остаток

1. **Где:** `dashboard/page.tsx`, `LoanDetail` reminder.  
2. **Код:** `overdueAmount = sum(item.amount)`; reminder `amount: Number(nextUnpaid.amount)`.  
3. **Когда:** частичная оплата (внесено 10 000 из 20 000).  
4. **Пример:** осталось 10 000, дашборд/WhatsApp показывают 20 000.  
5. **Как должно быть:** `scheduleDueRemaining`.  
6. **Как сейчас:** завышенный долг в UI/напоминаниях.  
7. **Критичность:** HIGH.  
8. **Исправление:** везде использовать remaining.

### H3. Модалка оплаты сравнивает ввод с полным `schedule.amount`, не с остатком

1. **Где:** `PaymentConfirmModal.tsx`.  
2. **Код:** `expected = Number(schedule.amount)`; default `useState(String(schedule.amount))`.  
3. **Когда:** после частичной оплаты.  
4. **Пример:** осталось 10 000; default 20 000 → confirm «переплата на следующие»; ввод 10 000 → ложный confirm «частичная».  
5. **Как должно быть:** expected/default = `scheduleDueRemaining`.  
6. **Как сейчас:** путаница и риск лишнего зачёта.  
7. **Критичность:** HIGH.  
8. **Исправление:** передавать `dueRemaining` в модалку.

### H4. Off-by-one у `overdue_days`

1. **Где:** dashboard: `.lt("due_date", today − grace)`.  
2. **Код:** при grace=3 due D становится overdue когда `due < today−3`, т.е. на **4-й** день после due.  
3. **Когда:** настройка «3 дня».  
4. **Пример:** due 12.06, today 15.06 → ещё не overdue; 16.06 → overdue.  
5. **Как должно быть:** явно зафиксировать бизнес-правило (календарные дни просрочки) и тест.  
6. **Как сейчас:** строже/мягче ожиданий на 1 день.  
7. **Критичность:** HIGH (если ожидают «через 3 дня»).  
8. **Исправление:** `due_date <= today − (grace+1)` или `<= today − grace` + документация + тесты 0..4.

### H5. Взнос сразу уменьшает «возврат капитала» инвестору через progress

1. **Где:** `collectionProgress` / `projectedRemaining`.  
2. **Код:** `progress = (down + paidSchedule) / principal`; `capitalReturned = investor_amount × progress`.  
3. **Когда:** любой down_payment > 0.  
4. **Пример:** investor 100 000, principal 130 000, down 20 000 → сразу «возвращено» ≈ 15 385 ₽ капитала без платежа инвестору.  
5. **Как должно быть:** по согласованной модели (взнос ≠ возврат инвестору, либо явная пометка «пропорция учёта»).  
6. **Как сейчас:** искажает блок «Ещё получить» инвестору.  
7. **Критичность:** HIGH для инвестора UI.  
8. **Исправление:** считать возврат капитала только от schedule payments или отдельным правилом.

---

## MEDIUM

### M1. «Касса / прибыль за 30 дней» не включают первоначальный взнос

Взнос не пишется в `payments`. Dashboard cash/profit30d только из `payments` → занижение факта при взносах.

### M2. Переплата сверх графика: payment есть, в графике нет

`surplus` показывается info-сообщением, но `payments.amount` > sum schedule paid → сверка payments≠schedule (см. reconcile script).

### M3. Текст дашборда «доля = вложил/цена» vs факт «сохранённые shares»

На займе всегда пишутся `income_share_*`; `resolveProfitShares` почти всегда `manual`. Hint на dashboard может врать.

### M4. Деньги в JS `number` (float), не integer-копейки

Округление `Math.round(x*100)/100` в целом спасает график (последний платёж компенсирует), но промежуточные float-артефакты возможны. БД `numeric(12,2)` — ок.

### M5. `monthly_payment` override может не совпадать ни с одной строкой графика

UI показывает `loan.monthly_payment`, график строится с компенсацией в последнем. При ручном завышенном платеже возможны нулевые строки.

### M6. Список `/loans` показывает `principal`, не «в рассрочку»

При взносе «Сумма» = полная цена продажи, без пометки взноса — путаница с карточкой займа.

### M7. Нет периодического overdue без визита; TZ сервера = UTC

Cutoff считается от `new Date()` на сервере (часто UTC). Для RU обычно ок, на границе суток возможен сдвиг.

---

## LOW

### L1. `formatMoney(NaN)` → «не число ₽»; `formatMoney(-0)` → «−0,00 ₽»

Нет guard в `formatMoney`.

### L2. Отображение `paid_at` через `.slice(0, 10)` UTC

С `T12:00:00` local для РФ безопасно; экзотические TZ ±12..14 рискованны.

### L3. Косметика: нет единой функции remaining на всех экранах

---

## Что проверено и работает корректно

- `buildSchedule`: SUM всегда = financed; последний платёж добивает копейки (в т.ч. 2 000 000 / 6).  
- `calcFinancedAmount`: down > total → 0, без отрицательного долга; UI создания блокирует down ≥ total.  
- Частичные 10k+10k и переплата 25k на 20k в `allocatePaymentToSchedules` — математика верная.  
- Прибыль = principal − cost; инвесторская доля — **от прибыли**, авто% — **от cost**.  
- Даты 25/29/31 января через `addMonths` — предсказуемые концемесячные сдвиги.  
- 30/70, 0/100, 100/0 в `splitIncome` — ок; 0/0 → всё владельцу.

---

## Реальные данные

В репозитории **нет** seed/fixture рассрочек. Живую БД агент не менял. Для сверки существующих данных: скачать backup в Настройках и прогнать `scripts/reconcile-loans.ts`.

---

## План исправлений (после вашего подтверждения)

1. **RPC `record_payment`** (транзакция + FOR UPDATE + запрет двойной оплаты стартовой строки) — закрывает C1–C3.  
2. **Модалка/reminder/dashboard** на `scheduleDueRemaining` — H2, H3.  
3. **Единый mark-overdue** + явная семантика grace — H1, H4.  
4. **Пересмотр progress/капитала инвестора относительно взноса** — H5 (нужно ваше бизнес-решение).  
5. Опционально: payment-запись на down_payment или отдельная метрика кассы — M1.  
6. Integer minor units / `formatMoney` guards — M4, L1.  
7. Расширить CI: `npm test` + reconcile на backup в релизе.

**Не меняю бизнес-логику до вашего «ок» по пунктам, особенно H4 и H5.**
