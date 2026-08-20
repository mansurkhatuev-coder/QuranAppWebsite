export type AppleSyncStatus = 'ok' | 'waiting' | 'error' | 'needs_secrets' | 'empty';

export type AppleProgressStep = {
  id: 'key' | 'request' | 'files' | 'numbers';
  label: string;
  done: boolean;
  detail: string;
};

export type AppleProgress = {
  percent: number;
  current: number;
  total: number;
  hint: string;
  button: string;
  steps: AppleProgressStep[];
};

function hoursBetween(fromIso: string | null | undefined, nowMs: number): number | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (nowMs - t) / (60 * 60 * 1000));
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} мин`;
  const rounded = Math.round(hours);
  if (rounded === 1) return '1 ч';
  return `${rounded} ч`;
}

export function formatCheckedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildAppleProgress(input: {
  status: AppleSyncStatus;
  requestedAt?: string | null;
  lastCheckedAt?: string | null;
  dayCount?: number;
  message?: string;
  nowMs?: number;
}): AppleProgress {
  const nowMs = input.nowMs ?? Date.now();
  const dayCount = input.dayCount ?? 0;
  const status = input.status || 'empty';
  const waited = hoursBetween(input.requestedAt, nowMs);
  const checked = formatCheckedAt(input.lastCheckedAt);

  const keyDone = status !== 'needs_secrets' && status !== 'empty';
  const requestDone = keyDone && status !== 'error';
  const filesDone = status === 'ok' || dayCount > 0;
  const numbersDone = dayCount > 0;

  const steps: AppleProgressStep[] = [
    {
      id: 'key',
      label: 'Ключ App Store Connect',
      done: keyDone,
      detail: status === 'needs_secrets'
        ? 'Положите ISSUER_ID, KEY_ID и текст .p8 в секреты Supabase.'
        : 'Ключ принят.',
    },
    {
      id: 'request',
      label: 'Заказ отчётов Apple',
      done: requestDone && Boolean(input.requestedAt || status === 'ok' || status === 'waiting'),
      detail: input.requestedAt
        ? `Заказан ${formatCheckedAt(input.requestedAt)} (текущие + история).`
        : status === 'error'
          ? input.message || 'Apple отклонил запрос.'
          : 'Ещё не заказывали. Нажмите «Проверить App Store».',
    },
    {
      id: 'files',
      label: 'Файлы скачиваний',
      done: filesDone,
      detail: filesDone
        ? 'Файлы уже есть (текущие и/или история).'
        : waited == null
          ? 'Apple отдаёт файлы через 24–48 часов после заказа. История (snapshot) может прийти позже текущих дней.'
          : waited < 24
            ? `Прошло ${formatHours(waited)} из 24–48 ч. Пока рано, но проверить можно.`
            : waited < 48
              ? `Прошло ${formatHours(waited)}. Уже можно ловить файлы — нажмите «Проверить».`
              : `Прошло ${formatHours(waited)}. Если пусто — проверьте роль ключа (Admin) или нажмите ещё раз.`,
    },
    {
      id: 'numbers',
      label: 'Цифры в админке',
      done: numbersDone,
      detail: numbersDone
        ? `${dayCount} дн. в таблице (first-time downloads).`
        : 'Появятся, когда файлы разберём.',
    },
  ];

  if (status === 'error') {
    steps[1].done = false;
    steps[1].detail = input.message || 'Ошибка Apple.';
  }

  const current = steps.filter((step) => step.done).length;
  const percent = Math.round((current / steps.length) * 100);

  let hint = input.message || '';
  let button = 'Проверить App Store';
  if (status === 'needs_secrets') {
    hint = 'Без секретов кнопка только проверит, что ключа нет. Сначала секреты, потом эта кнопка.';
    button = 'Проверить ключ';
  } else if (status === 'ok' && numbersDone) {
    hint = checked ? `Цифры на месте. Последняя проверка ${checked}.` : 'Цифры на месте.';
    button = 'Обновить цифры';
  } else if (status === 'waiting') {
    hint = steps[2].detail + (checked ? ` Проверяли ${checked}.` : '');
    button = waited != null && waited >= 24 ? 'Проверить, готов ли отчёт' : 'Проверить статус';
  } else if (status === 'error') {
    hint = input.message || 'Ошибка Apple.';
    button = 'Повторить';
  } else {
    hint = 'Нажмите кнопку — закажем отчёт у Apple. Готовые файлы приходят не сразу, обычно сутки–двое.';
  }

  return { percent, current, total: steps.length, hint, button, steps };
}
