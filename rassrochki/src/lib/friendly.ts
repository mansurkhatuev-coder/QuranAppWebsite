/** Короткие русские сообщения вместо сырых ошибок API. */
export function friendlyError(
  fallback: string,
  err?: unknown
): string {
  const raw =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "";

  const lower = raw.toLowerCase();
  if (!raw) return fallback;

  // Понятные финансовые ошибки RPC/валидации — показываем как есть.
  if (
    raw.includes("Сначала оплатите более ранний") ||
    raw.includes("Оплата только с ближайшего платежа") ||
    raw.includes("Сначала внесите") ||
    raw.includes("превышает остаток рассрочки") ||
    raw.includes("уже полностью оплачен") ||
    raw.includes("Нечего оплачивать") ||
    raw.includes("Не удалось распределить")
  ) {
    return raw;
  }

  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "Неверный email или пароль";
  }
  if (lower.includes("email not confirmed")) {
    return "Подтвердите email по ссылке из письма, затем войдите";
  }
  if (lower.includes("user already registered") || lower.includes("already been registered")) {
    return "Такой email уже зарегистрирован";
  }
  if (lower.includes("password")) {
    return "Пароль слишком короткий или не подходит";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Нет связи. Проверьте интернет и попробуйте ещё раз";
  }

  return fallback;
}

export function statusLabelRu(status: string): string {
  switch (status) {
    case "paid":
      return "Оплачен";
    case "overdue":
      return "Просрочен";
    case "pending":
      return "Ожидает";
    case "active":
      return "Активна";
    case "closed":
      return "Закрыта";
    case "cancelled":
      return "Отменена";
    default:
      return "—";
  }
}
