/** Только цифры, нормализация РФ: 8… → 7…, макс. 11 цифр. */
export function phoneDigitsOnly(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  } else if (!digits.startsWith("7")) {
    digits = `7${digits}`;
  }

  return digits.slice(0, 11);
}

/** Формат ввода: +7 (999) 123-45-67 (частично при наборе). */
export function formatPhoneRu(value: string): string {
  const digits = phoneDigitsOnly(value);
  if (!digits) return "";

  const national = digits.startsWith("7") ? digits.slice(1) : digits;
  let out = "+7";

  if (national.length === 0) return out;
  if (national.length <= 3) return `${out} (${national}`;
  if (national.length <= 6) {
    return `${out} (${national.slice(0, 3)}) ${national.slice(3)}`;
  }
  if (national.length <= 8) {
    return `${out} (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return `${out} (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8, 10)}`;
}

/** Для отображения уже сохранённого номера (если в БД без маски). */
export function formatPhoneRuDisplay(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return formatPhoneRu(value);
}
