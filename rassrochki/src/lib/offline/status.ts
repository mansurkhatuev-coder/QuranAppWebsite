export type OfflineStatusInput = {
  online: boolean | null;
  syncing: boolean;
  cachedAt: string | null;
  pendingCount: number;
  conflictCount: number;
  hasError?: boolean;
};

export type OfflineStatus = {
  label: string;
  tone: "success" | "warning" | "danger" | "muted";
};

export function getOfflineStatus(input: OfflineStatusInput): OfflineStatus {
  if (input.syncing) {
    return {
      label: input.pendingCount > 0 ? "Отправляем изменения…" : "Обновляем копию…",
      tone: "muted",
    };
  }

  if (input.conflictCount > 0) {
    return { label: `Нужно проверить: ${input.conflictCount}`, tone: "danger" };
  }

  if (input.pendingCount > 0) {
    return {
      label: input.online === false
        ? `Нет сети · ждут отправки: ${input.pendingCount}`
        : `Ждут отправки: ${input.pendingCount}`,
      tone: "warning",
    };
  }

  if (input.online === false) {
    return input.cachedAt
      ? { label: "Нет сети · данные сохранены", tone: "warning" }
      : { label: "Нет сети · копии нет", tone: "danger" };
  }

  if (input.hasError) {
    return { label: "Копия не обновлена", tone: "warning" };
  }

  if (!input.cachedAt) {
    return { label: "Сохраняем данные на устройстве…", tone: "muted" };
  }

  return { label: "Копия на устройстве обновлена", tone: "success" };
}
