# Финансовая модель после технических фиксов (только анализ)

Код не менялся. Ниже — текущее поведение и целевые варианты для решения владельца.

---

## 1. DOWN_PAYMENT

### Где взнос влияет сейчас

| Область | Файл / место | Что делает |
|---|---|---|
| Задолженность клиента | `calcFinancedAmount`, `loans/new`, `LoanDetail`, RPC `record_payment` | `financed = max(0, principal − down_payment)`; график строится от `financed` |
| `collectionProgress` | `finance.ts` | `(down_payment + paidScheduleTotal) / principal` |
| `capitalReturned` | `projectedRemaining` | `investor_amount × progress` → взнос сразу «возвращает» часть капитала |
| Прибыль (ожидаемая) | `dealTotals` | `profit = principal − cost` — **не зависит** от взноса |
| Прибыль (заработанная) | `projectedRemaining` | `earnedProfit = profit × progress` — **зависит**: взнос сразу «зарабатывает» долю прибыли |
| Cash | `dashboard` (`cashThisMonth`) | только `payments.amount` → **взнос НЕ входит** |
| Dashboard investor analytics | `projectedRemaining` на активных займах | через `progress` влияет на «ещё получить» инвестору/вам |
| Payment history | таблица `payments` | взнос **не создаёт** запись payment |
| Создание займа | `loans/new` | сохраняется в `loans.down_payment`, уменьшает график |
| Договор | `LoanDetail` / template | показывается как отдельная строка |

### Суть текущей модели

Взнос:
- **да** уменьшает долг клиента;
- **да** сразу двигает progress/прибыль/капитал;
- **нет** в кассе и истории платежей.

Это внутренне противоречиво: аналитика считает взнос «полученным», касса — нет.

### Целевая модель (предложение)

1. Взнос = полноценное денежное поступление клиента.
2. Взнос уменьшает задолженность (`financed`).
3. Взнос **не** является автоматическим возвратом капитала инвестору.
4. Возврат капитала считается только из явно определённого потока (см. раздел 2).

Рекомендуемые правила:

```text
client_debt        = principal − down_payment
cash_in            += down_payment          # как факт денег
earned_profit      = profit × (collected_for_profit / principal)
capital_returned   = f(только schedule payments или отдельное правило)
```

Для `collected_for_profit` два чистых варианта (нужен выбор владельца):

- **P1:** взнос участвует в прибыли пропорционально (`down + schedulePaid`);
- **P2:** прибыль признаётся только по платежам графика.

Для капитала инвестора в целевой модели:

```text
capital_returned ≠ down_payment автоматически
```

---

## 2. INVESTOR CAPITAL

### Текущие формулы

```text
investor_amount          = ввод при создании сделки (сколько вложил)
investor_share%          = сохранённые income_share_*
                         или auto: investor_amount / cost × 100
profit                   = principal − cost
investor_profit_total    = profit × investor_share% / (manager% + investor%)
owner_profit_total       = profit − investor_profit_total

progress                 = (down_payment + sumSchedulePaid) / principal
capitalReturned          = investor_amount × progress
capitalLeft              = investor_amount − capitalReturned
earnedInvestorProfit     = investor_profit_total × progress
investorStillToReceive   = capitalLeft + (investor_profit_total − earnedInvestorProfit)
```

### Числовой пример

```text
cost             = 2 000 000
principal        = 2 500 000
down_payment     = 500 000
investor_amount  = 2 000 000
profit           = 500 000
```

При авто-доле: `2000000 / 2000000 = 100%` инвестору.

Сразу после создания (ещё 0 платежей по графику):

```text
financed                 = 2 000 000
progress                 = 500000 / 2500000 = 0.20
capitalReturned          = 2 000 000 × 0.20 = 400 000
capitalLeft              = 1 600 000
earnedProfit             = 500 000 × 0.20 = 100 000
earnedInvestorProfit     = 100 000   (если доля 100%)
investorStillToReceive   = 1 600 000 + 400 000 = 2 000 000
```

То есть при взносе 500 000 приложение уже считает, что инвестору «вернулось» 400 000 капитала, хотя деньги взноса не помечены как выплата инвестору.

После полной оплаты графика (ещё +2 000 000):

```text
progress = 1
capitalReturned = 2 000 000
investorProfit = 500 000
investorStillToReceive = 0
```

### Предлагаемая однозначная модель (без внедрения)

Разделить 4 потока:

1. **Деньги от клиента (cash in)**  
   `cash_in = down_payment + sum(payments)`

2. **Задолженность клиента**  
   `client_debt = principal − down_payment − applied_to_schedule`

3. **Возврат капитала инвестору**  
   отдельный учёт (не через общий progress):
   ```text
   capital_returned = min(investor_amount, allocated_to_capital)
   capital_left     = investor_amount − capital_returned
   ```
   где `allocated_to_capital` задаётся правилом (см. решения владельца).

4. **Прибыль**  
   ```text
   profit_total        = principal − cost
   investor_profit     = profit_total × investor_share
   org_profit          = profit_total − investor_profit
   ```
   Признание «заработанной» прибыли — отдельно от возврата капитала.

Рекомендуемый простой и прозрачный вариант:

```text
# Капитал возвращается только после/вместе с платежами графика
# (down_payment не трогает capitalReturned)

progress_capital = sumSchedulePaid / financed
capitalReturned  = investor_amount × progress_capital

# Прибыль можно признавать по полному сбору principal
progress_profit  = (down_payment + sumSchedulePaid) / principal
earnedProfit     = profit × progress_profit
```

Или ещё жёстче (максимально бухгалтерия-подобно):

```text
capitalReturned увеличивается только ручным/явным событием "выплата инвестору"
```

---

## 3. CASH / ANALYTICS — модель событий

Предложение типов событий (без внедрения):

| Событие | cash | задолженность клиента | прибыль (признание) | возврат капитала | investor profit |
|---|---|---|---|---|---|
| `down_payment` | **да** (+) | **да** (−) | опционально (P1/P2) | **нет** (в целевой модели) | через правило прибыли |
| `scheduled_payment` | **да** (+) | **да** (−) | **да** (пропорционально) | **да** (по правилу капитала) | **да** |
| `partial_payment` | **да** (+) | **да** (− на paid часть) | **да** | **да** | **да** |
| `overpayment` | **да** (+) | зависит от модели A/B/C | обычно нет, пока не зачтено | нет, пока не зачтено | нет, пока не зачтено |
| `refund` | **да** (−) | обычно нет / или + если отмена зачёта | откат при необходимости | откат при необходимости | откат |

### Итоговые формулы (целевые)

```text
cash_balance_delta =
  + down_payment
  + scheduled/partial/overpayment
  − refund

client_remaining =
  principal
  − down_payment
  − sum(applied_to_schedules)
  − sum(client_advance_applied)   # только если модель B

profit_total = principal − cost

earned_profit =
  profit_total × recognized_collection_ratio

investor_profit_earned =
  earned_profit × investor_share

org_profit_earned =
  earned_profit − investor_profit_earned

capital_returned =
  rule_capital(applied_payments)   # НЕ равен down_payment автоматически

investor_still_to_receive =
  (investor_amount − capital_returned)
  + (investor_profit_total − investor_profit_earned)
```

---

## 4. SURPLUS / OVERPAYMENT

### Что сейчас при `payment = 25 000`, `remaining schedule = 20 000`

Текущий `record_payment` / allocate:

1. В `payments` создаётся запись на **25 000**.
2. На текущий schedule зачисляется **20 000**, статус `paid`.
3. Оставшиеся **5 000** идут на следующие schedule (если есть).
4. Если следующих нет — это `surplus`:
   - в график не попадает;
   - в UI показывается как «сверх суммы по графику»;
   - в dashboard cash всё равно учитывается полный `payments.amount` (включая 5 000);
   - в `sumSchedulePaid` / remaining по графику эти 5 000 не уменьшают долг дальше нуля;
   - отдельного баланса «аванс клиента» нет;
   - автоматического refund нет.

Если есть следующий schedule на 20 000:

```text
#1: +20 000 → paid
#2: +5 000  → pending, paid_amount=5000, remaining=15000
surplus = 0
```

### Возможные модели

#### A. Запрет переплаты
- UI/RPC отклоняет `amount > dueRemaining(+допустимый перенос?)`.
- Плюсы: простая бухгалтерия, нет orphan surplus.
- Минусы: неудобно, если клиент реально платит больше.
- Сложность: низкая.

#### B. Аванс клиента (рекомендуемый компромисс)
- `overpayment` создаёт `client_credit` / `advance`.
- Cash увеличивается.
- Долг графика не уходит в минус.
- Следующие платежи сначала списывают аванс.
- Плюсы: отражает реальность; чистый remaining.
- Минусы: нужна сущность кредита/аванса.
- Сложность: средняя.

#### C. Возврат переплаты
- Surplus сразу как `refund_due` или обязательный refund.
- Cash временно +, потом −.
- Плюсы: нет «висящих» денег клиента.
- Минусы: операционно тяжелее, нужны статусы возврата.
- Сложность: средняя/высокая.

Практичная рекомендация: **B (аванс)** + опциональный ручной refund из аванса.

---

## 5. OVERDUE_DAYS

Текущая семантика (сохранена как есть):

```text
cutoff = today − overdue_days
overdue если due_date < cutoff   # строго меньше
```

Пример: `due_date = 25`, `overdue_days = 3`

| Сегодня | cutoff | due 25 vs cutoff | статус |
|---|---|---|---|
| 25 | 22 | 25 < 22? нет | pending |
| 26 | 23 | нет | pending |
| 27 | 24 | нет | pending |
| 28 | 25 | 25 < 25? нет | pending |
| 29 | 26 | 25 < 26? да | **overdue** |

Итого при `overdue_days = 3` просрочка начинается на **29-е** (через 4 календарных дня после due).

### Предложение однозначного правила для UI

Самое понятное для настройки:

> «Считать просроченным через N полных дней после даты платежа»

Тогда при N=3:
- 25,26,27,28 — ещё не overdue;
- 29 — overdue.

Это совпадает с текущим кодом, но подпись в UI сейчас может читаться иначе («льготный период N дней»).

Альтернатива (если нужна более строгая):

> «На N-й день после due уже overdue»

Тогда при N=3 overdue с 28-го. Это потребует смены семантики (H4) — только после решения владельца.

Рекомендация для подписи настройки:

```text
«Через сколько полных дней после даты платежа считать просрочкой»
подсказка: при 3 — просрочка на 4-й день после due
```

---

## РЕШЕНИЯ, КОТОРЫЕ НУЖНЫ ОТ ВЛАДЕЛЬЦА

Без этих ответов нельзя безопасно продолжать модельную часть:

1. **Взнос и капитал инвестора:**  
   `down_payment` не должен автоматически уменьшать `capitalReturned`? (рекомендация: не должен)

2. **Взнос и признание прибыли:**  
   прибыль от взноса признавать сразу (пропорционально) или только по платежам графика?

3. **Как возвращается капитал инвестору:**  
   пропорционально платежам графика / вручную отдельными выплатами / другим правилом?

4. **Переплата:**  
   выбрать A (запрет), B (аванс клиента) или C (возврат). Рекомендация: B.

5. **Overdue UI-смысл:**  
   оставить текущую семантику («через N полных дней», overdue на N+1 день) и только поправить текст настройки,  
   или менять правило на «overdue начиная с N-го дня»?
