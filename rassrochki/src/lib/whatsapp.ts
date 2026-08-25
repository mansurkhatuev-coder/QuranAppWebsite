/**
 * Нормализация телефона для wa.me (международный формат без +).
 * РФ/Чечня: 8XXXXXXXXXX / +7... → 7XXXXXXXXXX
 */
export function normalizePhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith("9")) {
    digits = `7${digits}`;
  }
  if (digits.length < 10) return null;
  return digits;
}

export function buildWhatsAppUrl(phone: string | null | undefined, text?: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const base = `https://wa.me/${normalized}`;
  if (!text?.trim()) return base;
  return `${base}?text=${encodeURIComponent(text.trim())}`;
}

export function defaultPaymentReminderText(opts: {
  clientName?: string | null;
  productName?: string | null;
  amount?: number | null;
  dueDate?: string | null;
  orgName?: string | null;
}) {
  const parts = ["Ассаламу алейкум"];
  if (opts.clientName) parts[0] += `, ${opts.clientName}`;
  parts[0] += "!";

  const product = opts.productName?.trim();
  if (opts.amount != null && opts.dueDate) {
    parts.push(
      product
        ? `Напоминаем о платеже по рассрочке «${product}»: ${opts.amount.toLocaleString("ru-RU")} ₽ до ${opts.dueDate}.`
        : `Напоминаем о платеже по рассрочке: ${opts.amount.toLocaleString("ru-RU")} ₽ до ${opts.dueDate}.`
    );
  } else if (opts.amount != null) {
    parts.push(
      product
        ? `Напоминаем о платеже по рассрочке «${product}»: ${opts.amount.toLocaleString("ru-RU")} ₽.`
        : `Напоминаем о платеже по рассрочке: ${opts.amount.toLocaleString("ru-RU")} ₽.`
    );
  } else {
    parts.push(
      product
        ? `Напоминаем о платеже по рассрочке «${product}».`
        : "Напоминаем о платеже по рассрочке."
    );
  }
  if (opts.orgName) parts.push(`— ${opts.orgName}`);
  return parts.join("\n");
}

/** @deprecated alias — то же, что defaultPaymentReminderText */
export const buildPaymentReminderText = defaultPaymentReminderText;
