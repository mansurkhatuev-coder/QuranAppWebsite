"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getOfflineStore } from "@/lib/offline/db";
import { parseSnapshotEnvelope } from "@/lib/offline/snapshot";

const ACTIVE_ACCOUNT_KEY = "rassrochki:offline-account";

type OfflineBootstrapProps = {
  userId: string;
  organizationId: string;
};

export function OfflineBootstrap({ userId, organizationId }: OfflineBootstrapProps) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const locked = useRef(false);
  const requestController = useRef<AbortController | null>(null);

  const refreshLocalState = useCallback(async () => {
    const store = getOfflineStore();
    const [snapshot, operations] = await Promise.all([
      store.getSnapshot(userId, organizationId),
      store.listOperations(userId, organizationId),
    ]);
    setCachedAt(snapshot?.syncedAt ?? null);
    setPendingCount(operations.filter((item) => item.state !== "conflict").length);
    setConflictCount(operations.filter((item) => item.state === "conflict").length);
  }, [organizationId, userId]);

  const refreshSnapshot = useCallback(async () => {
    if (locked.current) return;
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }

    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setOnline(true);
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/offline/snapshot", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Не удалось загрузить полный снимок данных");
      const envelope: unknown = await response.json();
      if (locked.current || controller.signal.aborted) return;
      const snapshot = parseSnapshotEnvelope(envelope, userId, organizationId);
      await getOfflineStore().putSnapshot(snapshot);
      if (locked.current || controller.signal.aborted) return;
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify({ userId, organizationId }));
      await refreshLocalState();
    } catch {
      if (locked.current || controller.signal.aborted) return;
      setError(
        navigator.onLine
          ? "Не удалось обновить офлайн-данные. Последняя сохранённая копия не изменена."
          : "Сеть пропала. Будет доступна последняя сохранённая копия."
      );
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setSyncing(false);
      }
    }
  }, [organizationId, refreshLocalState, userId]);

  useEffect(() => {
    let active = true;
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify({ userId, organizationId }));

    void refreshLocalState().catch(() => {
      if (active) setError("Локальное хранилище недоступно в этом браузере.");
    });

    const onOnline = () => {
      setOnline(true);
      void refreshSnapshot();
    };
    const onOffline = () => setOnline(false);
    const onFocus = () => {
      if (navigator.onLine) void refreshSnapshot();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refreshSnapshot();
      }
    };
    const onQueueChanged = () => void refreshLocalState();
    const onLock = () => {
      locked.current = true;
      requestController.current?.abort();
    };
    const onUnlock = () => {
      locked.current = false;
      if (navigator.onLine) void refreshSnapshot();
    };

    setOnline(navigator.onLine);
    if (navigator.onLine) void refreshSnapshot();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("rassrochki:offline-queue-changed", onQueueChanged);
    window.addEventListener("rassrochki:offline-lock", onLock);
    window.addEventListener("rassrochki:offline-unlock", onUnlock);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      requestController.current?.abort();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("rassrochki:offline-queue-changed", onQueueChanged);
      window.removeEventListener("rassrochki:offline-lock", onLock);
      window.removeEventListener("rassrochki:offline-unlock", onUnlock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [organizationId, refreshLocalState, refreshSnapshot, userId]);

  async function prepareOfflineAccess() {
    setStorageMessage(null);
    try {
      if (!navigator.storage?.persist) {
        setStorageMessage("Браузер не поддерживает постоянное хранилище.");
      } else {
        const persistent = await navigator.storage.persist();
        setStorageMessage(
          persistent
            ? "Браузер разрешил постоянное хранилище. Очистка браузера всё равно удалит данные."
            : "Браузер может удалить данные устройства. Синхронизируйте их при первой возможности."
        );
      }
    } catch {
      setStorageMessage("Не удалось запросить постоянное хранилище браузера.");
    }
    await refreshSnapshot();
  }

  const summary =
    online === false
      ? "Офлайн"
      : syncing
        ? "Обновляем данные…"
        : online === true
          ? "На связи"
          : "Проверяем сеть…";

  return (
    <section
      className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs text-slate-700"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {summary}
            {cachedAt ? ` · копия от ${new Date(cachedAt).toLocaleString("ru-RU")}` : " · копии пока нет"}
          </p>
          {(pendingCount > 0 || conflictCount > 0) && (
            <p className="mt-0.5">
              {pendingCount > 0 && `Ожидают отправки: ${pendingCount}`}
              {pendingCount > 0 && conflictCount > 0 ? " · " : ""}
              {conflictCount > 0 && `Конфликты: ${conflictCount}`}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn-secondary px-2.5 py-1.5 text-xs"
          onClick={prepareOfflineAccess}
          disabled={online === false || syncing}
        >
          {syncing ? "Синхронизация…" : "Подготовить офлайн-доступ"}
        </button>
      </div>
      {error && <p className="mt-1 text-amber-800">{error}</p>}
      {storageMessage && <p className="mt-1 text-[var(--muted)]">{storageMessage}</p>}
    </section>
  );
}
