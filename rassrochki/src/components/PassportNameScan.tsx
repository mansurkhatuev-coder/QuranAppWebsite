"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { extractPassportFullName } from "@/lib/passport-ocr";
import { Spinner } from "@/components/Spinner";

type PassportNameScanProps = {
  onUseName: (name: string) => void;
};

const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

export function PassportNameScan({ onUseName }: PassportNameScanProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recognizedName, setRecognizedName] = useState<string | null>(null);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setError(null);
    setRecognizedName(null);

    if (!file.type.startsWith("image/")) {
      setError("Выберите изображение паспорта.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError("Файл слишком большой. Выберите изображение размером до 15 МБ.");
      return;
    }

    setBusy(true);
    setProgress(null);
    setStage("Подготавливаем распознавание…");

    let terminateWorker: (() => Promise<unknown>) | undefined;
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("rus", undefined, {
        logger: ({ status, progress: nextProgress }) => {
          if (status.includes("language")) setStage("Загружаем языковую модель…");
          else if (status.includes("recognizing")) setStage("Распознаём текст на устройстве…");
          else setStage("Подготавливаем распознавание…");
          if (Number.isFinite(nextProgress)) setProgress(Math.round(nextProgress * 100));
        },
      });
      terminateWorker = () => worker.terminate();
      const {
        data: { text },
      } = await worker.recognize(file);
      const name = extractPassportFullName(text);
      if (!name) {
        setError("Не удалось распознать ФИО. Сделайте более чёткое фото или введите данные вручную.");
      } else {
        setRecognizedName(name);
      }
    } catch {
      setError("Распознавание не запустилось. Попробуйте ещё раз или введите ФИО вручную.");
    } finally {
      await terminateWorker?.().catch(() => undefined);
      setBusy(false);
      setStage("");
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        tabIndex={-1}
        aria-label="Выбрать фото страницы паспорта"
      />
      <button
        type="button"
        className="btn-secondary text-sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Spinner label="Распознаём…" /> : "Сканировать паспорт"}
      </button>
      <p className="text-xs text-[var(--muted)]">
        Фото обрабатывается в браузере и не сохраняется. После сканирования проверьте ФИО.
      </p>
      {busy && (
        <p className="text-xs text-[var(--muted)]" aria-live="polite">
          {stage}
          {progress !== null ? ` ${progress}%` : ""}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-700" role="status">
          {error}
        </p>
      )}
      {recognizedName && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-sm">
            Распознано: <span className="font-semibold">{recognizedName}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={() => {
                onUseName(recognizedName);
                setRecognizedName(null);
                setError(null);
              }}
            >
              Использовать ФИО
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => setRecognizedName(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
