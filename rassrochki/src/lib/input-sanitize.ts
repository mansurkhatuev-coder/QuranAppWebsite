/** Только целые числа (строка). */
export function sanitizeIntegerInput(value: string): string {
  return value.replace(/\D/g, "");
}

/** Деньги и проценты: цифры и одна десятичная точка. */
export function sanitizeDecimalInput(value: string): string {
  let v = value.replace(/[^\d.,]/g, "").replace(",", ".");
  const dot = v.indexOf(".");
  if (dot >= 0) {
    v = `${v.slice(0, dot + 1)}${v.slice(dot + 1).replace(/\./g, "")}`;
  }
  return v;
}

/** ФИО / имя человека — без цифр. */
export function sanitizePersonName(value: string): string {
  return value.replace(/\d/g, "");
}
