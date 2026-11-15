"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getOfflineStore } from "@/lib/offline/db";
import { applyPendingOperations } from "@/lib/offline/model";
import { parseSnapshotEnvelope } from "@/lib/offline/snapshot";
import { getOfflineStatus } from "@/lib/offline/status";
import { syncOfflineQueue } from "@/lib/offline/sync";
import { createClient } from "@/lib/supabase/client";
import type { OfflineCommand, OfflineOperation, OfflineSnapshot } from "@/lib/offline/types";

const ACTIVE_ACCOUNT_KEY = "rassrochki:offline-account";

type OfflineBootstrapProps = {
  userId: string;
  organizationId: string;
  children: React.ReactNode;
};

type OfflineEnqueueOptions = {
  id?: string;
  receipt?: File;
};

type OfflineWorkspaceValue = {
  userId: string;
  organizationId: string;
  snapshot: OfflineSnapshot | null;
  baseSnapshot: OfflineSnapshot | null;
  operations: OfflineOperation[];
  loaded: boolean;
  online: boolean | null;
  syncing: boolean;
  pendingCount: number;
  conflictCount: number;
  error: string | null;
  storageMessage: string | null;
  cachedAt: string | null;
  refreshSnapshot: () => Promise<void>;
  prepareOfflineAccess: () => Promise<void>;
  enqueueCommand: (
    command: OfflineCommand,
    dependsOn?: string[],
    options?: OfflineEnqueueOptions
  ) => Promise<OfflineOperation>;
};

const OfflineWorkspaceContext = createContext<OfflineWorkspaceValue | null>(null);

export function useOfflineWorkspace(): OfflineWorkspaceValue {
  const value = useContext(OfflineWorkspaceContext);
  if (!value) throw new Error("useOfflineWorkspace must be used inside OfflineBootstrap");
  return value;
}

export function OfflineBootstrap({ userId, organizationId, children }: OfflineBootstrapProps) {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [baseSnapshot, setBaseSnapshot] = useState<OfflineSnapshot | null>(null);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const locked = useRef(false);
  const queueSyncing = useRef(false);
  const requestController = useRef<AbortController | null>(null);

  const refreshLocalState = useCallback(async () => {
    const store = getOfflineStore();
    const [snapshot, operations] = await Promise.all([
      store.getSnapshot(userId, organizationId),
      store.listOperations(userId, organizationId),
    ]);
    const accountSnapshot =
      snapshot?.userId === userId && snapshot.organizationId === organizationId ? snapshot : null;
    const accountOperations = operations.filter(
      (item) => item.userId === userId && item.organizationId === organizationId
    );
    setBaseSnapshot(accountSnapshot);
    setSnapshot(accountSnapshot ? applyPendingOperations(accountSnapshot, accountOperations) : null);
    setOperations(accountOperations);
    setLoaded(true);
    setCachedAt(accountSnapshot?.syncedAt ?? null);
    setPendingCount(accountOperations.filter((item) => item.state !== "conflict").length);
    setConflictCount(accountOperations.filter((item) => item.state === "conflict").length);
  }, [organizationId, userId]);

  const refreshSnapshot = useCallback(async () => {
    if (locked.current) return;
    if (queueSyncing.current) return;
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
    queueSyncing.current = true;
    try {
      const store = getOfflineStore();
      const queued = await store.listOperations(userId, organizationId);
      if (queued.some((operation) => operation.state !== "conflict")) {
        const supabase = createClient();
        await syncOfflineQueue({
          store,
          userId,
          organizationId,
          fetcher: (input, init) => fetch(input, { ...init, signal: controller.signal }),
          uploadReceipt: async (receipt, path) => {
            const { error: uploadError } = await supabase.storage
              .from("payment-receipts")
              .upload(path, receipt.blob, {
                upsert: true,
                contentType: receipt.mimeType,
              });
            if (uploadError) throw uploadError;
          },
        });
      } else {
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
        await store.putSnapshot(snapshot);
      }
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
        queueSyncing.current = false;
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

  const prepareOfflineAccess = useCallback(async () => {
    setStorageMessage(null);
    try {
      if (!navigator.storage?.persist) {
        setStorageMessage("Браузер не поддерживает постоянное хранилище.");
      } else {
        const persistent = await navigator.storage.persist();
        setStorageMessage(
          persistent
            ? "Хранилище браузера закреплено."
            : "Браузер может очистить копию — синхронизируйте её при подключении."
        );
      }
    } catch {
      setStorageMessage("Не удалось закрепить хранилище браузера.");
    }
    await refreshSnapshot();
  }, [refreshSnapshot]);

  const enqueueCommand = useCallback(
    async (
      command: OfflineCommand,
      dependsOn: string[] = [],
      options: OfflineEnqueueOptions = {}
    ) => {
      const operation: OfflineOperation = {
        id: options.id ?? crypto.randomUUID(),
        userId,
        organizationId,
        createdAt: new Date().toISOString(),
        dependsOn,
        command,
        state: "pending",
        attempts: 0,
        lastError: null,
      };
      const store = getOfflineStore();
      await store.enqueue(operation);
      if (options.receipt) {
        try {
          await store.putReceipt(
            operation.id,
            userId,
            organizationId,
            options.receipt,
            options.receipt.name || "receipt.jpg"
          );
        } catch (receiptError) {
          await store.removeOperation(operation.id, userId, organizationId);
          throw receiptError;
        }
      }
      window.dispatchEvent(new Event("rassrochki:offline-queue-changed"));
      await refreshLocalState();
      if (navigator.onLine) void refreshSnapshot();
      return operation;
    },
    [organizationId, refreshLocalState, refreshSnapshot, userId]
  );

  const value: OfflineWorkspaceValue = {
    userId,
    organizationId,
    snapshot,
    baseSnapshot,
    operations,
    loaded,
    online,
    syncing,
    pendingCount,
    conflictCount,
    error,
    storageMessage,
    cachedAt,
    refreshSnapshot,
    prepareOfflineAccess,
    enqueueCommand,
  };

  return <OfflineWorkspaceContext.Provider value={value}>{children}</OfflineWorkspaceContext.Provider>;
}

export function OfflineStatus() {
  const {
    online,
    syncing,
    cachedAt,
    pendingCount,
    conflictCount,
    error,
    storageMessage,
    prepareOfflineAccess,
  } = useOfflineWorkspace();

  const status = getOfflineStatus({
    online,
    syncing,
    cachedAt,
    pendingCount,
    conflictCount,
    hasError: Boolean(error),
  });
  const statusClass =
    status.tone === "success"
      ? "badge-green"
      : status.tone === "danger"
        ? "badge-red"
        : status.tone === "warning"
          ? "badge-yellow"
          : "bg-slate-100 text-slate-600";
  const actionLabel = pendingCount > 0 ? "Отправить изменения" : "Обновить копию";

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] sm:text-xs" aria-live="polite">
      <span
        className={`${statusClass} max-w-[10rem] truncate sm:max-w-none`}
        title={cachedAt ? `${status.label}. Последняя копия: ${new Date(cachedAt).toLocaleString("ru-RU")}` : status.label}
      >
        {status.label}
      </span>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={prepareOfflineAccess}
        disabled={online !== true || syncing}
        title={actionLabel}
        aria-label={actionLabel}
      >
        {syncing ? "…" : "↻"}
      </button>
      {(error || storageMessage) && (
        <details className="shrink-0 text-xs text-[var(--muted)]">
          <summary className="cursor-pointer rounded px-1 py-1">Подробнее</summary>
          <p className="absolute z-30 mt-1 max-w-xs rounded-lg border border-[var(--border)] bg-white p-2 shadow-lg">
            {error || storageMessage}
          </p>
        </details>
      )}
    </div>
  );
}
