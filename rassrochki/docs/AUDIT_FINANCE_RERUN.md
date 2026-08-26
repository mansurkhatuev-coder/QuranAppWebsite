# Повторный аудит финансовой логики «Рассрочки»

Дата: 2026-08-26  
Ветка: `cursor/rassrochki-finance-audit-368b`  
Статус: **только аудит, без новых правок бизнес-логики**  
Проверки: `npm test` → 38 passed; `tsc --noEmit` → ok

---

## Вердикт

Критичные денежные дыры из первого аудита (двойная оплата, орфан payment, silent перенос на следующий schedule, surplus сверх остатка, capitalReturned от down_payment) **закрыты в коде**.

Система в целом соответствует зафиксированной модели:

```text
principal = cost × (1 + markup%)
financed  = principal − down_payment
collected = down_payment + schedulePaid
earnedProfit = profitTotal × min(1, collected / principal)
capitalReturned = investorAmount × min(1, schedulePaid / financed)
payment ≤ общий остаток рассрочки  (иначе полный отказ)
```

Остались в основном **MEDIUM/LOW**: аналитика `profit30d`, UX списка займов, оплата «не с первой» строки графика, отсутствие live-проверки прод-БД из агента.

---

## Фактическая модель (как в коде сейчас)

| Показатель | Формула / место |
|---|---|
| `principal` | `calcTotalWithMarkup(cost, markup)` |
| `financed` | `max(0, principal − down)` |
| график | `buildSchedule(financed, …)`; последний платёж добивает копейки |
| `collected` | `down + sumSchedulePaid` |
| `earnedProfit` | `profit × collected/principal` (cap ≤ profit) |
| `capitalReturned` | `investorAmount × schedulePaid/financed` (**без** down) |
| Cash месяц | `sum(payments в месяце) + sum(down по loans.start_date в месяце)` |
| Платёж | RPC `record_payment` (атомарно) |
| Overdue | `due_date < today − overdue_days` (strict `<`) |

---

## CRITICAL

**Не найдено новых CRITICAL в текущем коде.**

Закрыто ранее и подтверждено повторной проверкой:

1. Атомарный `record_payment` + `FOR UPDATE` + idempotency  
2. Запрет оплаты уже paid стартовой строки  
3. Запрет `amount > общий остаток` (полный rollback, без surplus)  
4. `down_payment` не двигает `capitalReturned`  
5. UI remaining через `scheduleDueRemaining` / `loanScheduleRemaining`

> Примечание: живую БД агент не читал. Если на проде применён `010_repair_payment_schema.sql` и check-query дал 3×`true` — серверная часть должна совпадать с кодом.

---

## HIGH

### H1. Можно оплатить «с середины» графика и оставить ранние строки неоплаченными

**Где:** `record_payment` / `allocatePaymentToSchedules`  
**Как:** распределение идёт только с `sequence_number >= start`  
**Пример:** остаток 60 000 (#1,#2,#3 по 20k). Пользователь жмёт оплату на #2 на 40 000 → закрываются #2 и #3, **#1 остаётся 20 000 unpaid**.  
**Деньги не дублируются**, но порядок погашения может быть нарушен.  
**Критичность:** HIGH (операционный/учётный риск, не race).  
**Как должно быть (на выбор):**  
- A) всегда начинать с самого раннего unpaid;  
- B) запретить старт не с первой неоплаченной строки;  
- C) оставить как есть (явный выбор пользователя).

### H2. `Прибыль за 30 дней` на Dashboard не включает долю прибыли от down_payment

**Где:** `dashboard/page.tsx` → `profit30d` только из `payments` через `profitFromPaymentForLoan`  
**Cash** взнос уже учитывает, **earnedProfit** на карточке займа — тоже.  
**А `profit30d` — нет.**  
**Пример:** сделка с взносом 500 000 в этом месяце без schedule-платежей → касса +500k, прибыль 30д ≈ 0, хотя `earnedProfit` по сделке уже > 0.  
**Критичность:** HIGH для аналитики факта, не для баланса долга.  
**Исправление:** добавить пропорциональную прибыль от down_payment по `start_date` в окне, без двойного учёта.

---

## MEDIUM

### M1. Список `/loans` показывает `principal`, не «в рассрочку / остаток»

Можно путать полную цену продажи с текущим долгом.

### M2. Receipt upload до RPC

Если RPC упадёт после upload — в storage может остаться файл без payment. Деньги не портятся.

### M3. Клиентская проверка `loanRemaining` со stale props

Сервер защищён `FOR UPDATE`; клиент может показать устаревший max до refresh. Не создаёт лишних денег.

### M4. Нет integration-тестов Postgres RPC в CI

Покрыта чистая TS-логика (38 тестов). SQL RPC проверяется миграцией, но не автотестом против живой БД.

### M5. Dashboard hint про долю инвестора

Текст «доля = вложил/цена» может не совпадать с сохранёнными `income_share_*` (режим manual).

### M6. Overdue пишется в БД при открытии страниц

Derived + sync на Dashboard/Loans/LoanDetail. Если долго никто не заходит — статусы в БД устаревают, но при входе синхронизируются. Математика корректна.

---

## LOW

### L1. `formatMoney(NaN)` → «не число ₽»

Нет guard.

### L2. Деньги в JS `number` + `Math.round(x*100)/100`

Для графика спасает last-payment compensation; БД `numeric(12,2)`.

### L3. Отображение «переплата по строке» в LoanDetail

После запрета overpay сверх остатка новые случаи редки; возможны только legacy-данные.

### L4. TZ / `paid_at` через `T12:00:00` local

Для РФ обычно безопасно.

---

## Что проверено и работает корректно

| Сценарий | Статус |
|---|---|
| SUM(график) = financed, копейки в последнем | OK |
| down уменьшает financed | OK |
| collected включает down | OK |
| earnedProfit пропорционален collected/principal | OK |
| capitalReturned = 0 сразу после down | OK |
| capitalReturned растёт только от schedulePaid | OK |
| payment > loanRemaining → отказ | OK |
| один платёж закрывает несколько schedules | OK |
| paid start → ошибка, без переноса | OK |
| idempotency / atomic RPC (по коду) | OK |
| remaining в Dashboard/LoanDetail/Modal/WhatsApp | OK |
| overdue 25 + 3 дня → overdue с 29 | OK |
| настройки overdue — понятный текст | OK |
| Cash = payments + down (по start_date) | OK |

Числовой контроль (целевая модель):

```text
cost=2_000_000 principal=2_500_000 down=500_000 investor=2_000_000 share=100%

после взноса:
  financed=2_000_000
  collected=500_000
  earnedProfit=100_000
  capitalReturned=0

после +500_000 по графику:
  earnedProfit=200_000
  capitalReturned=500_000
  capitalLeft=1_500_000
```

---

## Статус миграций

| Файл | Назначение |
|---|---|
| `008_payment_rpc_overdue.sql` | колонка/индекс idempotency + первая RPC |
| `009_record_payment_no_overpay.sql` | запрет переплаты сверх остатка |
| `010_repair_payment_schema.sql` | **рекомендуемый единый идемпотентный прогон** |

Если `010` уже выполнен и check вернул 3×`true` — прод-схема должна быть консистентна.

---

## Тесты

`src/lib/finance.test.ts` — 38 тестов, все зелёные:

- график/округление
- down / earned / capital invariants
- allocate / reject overpay
- paid start reject
- overdue 0–4 и кейс 25→29
- investor split

---

## РЕШЕНИЯ, КОТОРЫЕ НУЖНЫ ОТ ВЛАДЕЛЬЦА

Только если хотите менять поведение дальше:

1. **Оплата не с первой неоплаченной строки (H1):** разрешить / запретить / всегда форсить earliest unpaid?  
2. **Прибыль за 30 дней (H2):** включать ли прибыль от down_payment в `profit30d`?

Без этих решений система уже математически согласована по зафиксированной модели для долга, платежей, капитала и earnedProfit.

---

## Рекомендуемый следующий шаг (не сделан)

1. Подтвердить H1/H2.  
2. При желании — поправить только их.  
3. Опционально: smoke-тест живой оплаты в UI после `010`.
