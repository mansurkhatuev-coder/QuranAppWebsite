# Биллинг семейных древ

Модель: **30 дней trial → 790 ₽ / 6 месяцев**. Сейчас оплата через **WhatsApp**, в API уже заложены поля под **СБП**.

## Роли

| Кто | Где | Задача |
|---|---|---|
| Разработчик | `/trees/` | Продлить / trial / отключить / удалить |
| Семья | страница древа | Смотреть всегда; править при активном доступе; «Продлить в WhatsApp» при истечении |

`/trees/` — админка платформы, не кабинет покупателя.

## Тариф

- Trial: 30 дней с момента создания (ownership = `customer`)
- Продление: 790 ₽ за 6 месяцев (`priceRub` + `periodMonths` в `access.json`)
- `priceLocked: true` — цена этого древа не поднимается автоматически при общем повышении
- Свои древа (`ownership: mine`) по умолчанию `status: exempt` (без оплаты)

## Жизненный цикл (`access.json` → `billing`)

```
exempt | trial | active | expired | disabled
```

- **expired / disabled** → правки закрыты (как lock), **просмотр остаётся**
- Удаление: сначала **Отключить**, потом подтверждение названием + чекбокс → soft-delete (реестр + invite stub; файлы древа остаются)

## WhatsApp

1. Впишите номер в `trees/billing-config.js` → `whatsappPhone` (например `79001234567`)
2. Кнопка в админке и баннер на древе собирают текст с названием, кодом и ценой

## СБП (задел)

В `billing` есть:

- `paymentMethod`: `manual_whatsapp` | `sbp`
- `lastPaymentId`, `lastPaymentAt`, `lastPaymentAmount`
- `sbp.customerId` / `subscriptionId` / `lastPaymentUrl` / `lastQrId` / `lastProviderStatus`

В `billing-config.js`: `sbpEnabled` + `sbpCheckoutUrl` — когда будет checkout, баннер покажет кнопку «Оплатить по СБП».

API уже принимает `paymentMethod: "sbp"` в `set-billing` / `extend`.

## Edge Function

`publish-drewo`:

- `create-tree` — customer → trial
- `set-billing` — `extend` | `activate_trial` | `deactivate` | `set_exempt` (нужен вход Trees)
- `soft-delete-tree` — только после `disabled`
- `status` / `hub-overview` / `auth` — отдают `billing` и эффективный `locked`

После правок функции — **задеплоить** `publish-drewo` в Supabase.

## Текст для семьи

> Оплата нужна на развитие и поддержку проекта. Ваша цена фиксируется для этого древа.
