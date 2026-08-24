"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DraftStatus = "idle" | "saved" | "saving";

export function useDraft<T>(key: string, initial: T, onAutoSave?: (value: T) => Promise<void> | void) {
  const [value, setValue] = useState<T>(initial);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        setValue(JSON.parse(raw) as T);
      } catch {
        // ignore broken draft
      }
    }
    hydrated.current = true;
  }, [key]);

  const persistLocal = useCallback(
    (next: T) => {
      if (typeof window === "undefined") return;
      localStorage.setItem(key, JSON.stringify(next));
    },
    [key]
  );

  const update = useCallback(
    (next: T) => {
      setValue(next);
      if (!hydrated.current) return;

      persistLocal(next);
      setStatus("saving");

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          if (onAutoSave) await onAutoSave(next);
          setStatus("saved");
        } catch {
          setStatus("idle");
        }
      }, 800);
    },
    [onAutoSave, persistLocal]
  );

  const clearDraft = useCallback(() => {
    if (typeof window !== "undefined") localStorage.removeItem(key);
    setStatus("idle");
  }, [key]);

  return { value, setValue: update, status, clearDraft };
}
